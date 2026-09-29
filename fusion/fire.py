"""Active fire perimeters and satellite-mapped smoke, linked to passes.

Pure logic, no I/O: interagency perimeter records and a smoke KML document
in, simplified geometry and per-pass facts out. The facts describe where the
fire and the smoke are; they say nothing about what anyone does about it.
"""

from __future__ import annotations

import math
import re
from datetime import UTC, datetime, timedelta
from typing import Any
from xml.etree import ElementTree
from zoneinfo import ZoneInfo

from ingest.geo import point_in_ring

PACIFIC = ZoneInfo("America/Los_Angeles")

KM_PER_MI = 1.609344
KM_PER_DEG_LAT = 110.574
KM_PER_DEG_LON = 111.320
M_PER_DEG_LAT = KM_PER_DEG_LAT * 1000

FIRE_RADIUS_KM = 50.0
DENSITY_RANK = {"light": 1, "medium": 2, "heavy": 3}
DIRECTIONS = (
    "north", "northeast", "east", "southeast", "south", "southwest", "west", "northwest",
)

# Wildfires and complexes. Prescribed burns share the service but are not
# what a reader means by an active fire.
ACTIVE_CATEGORIES = {"WF", "CX"}

FIRE_COORD_DECIMALS = 4
SMOKE_COORD_DECIMALS = 3

Point = tuple[float, float]
Ring = list[list[float]]
Polygon = list[Ring]


# Simplification


def douglas_peucker(points: list[Point], tolerance: float) -> list[Point]:
    """Drop every point that sits within the tolerance of the simplified line.

    Iterative, because a large perimeter has tens of thousands of vertices
    and the recursive form runs out of stack on a long gentle curve.
    """
    n = len(points)
    if n < 3:
        return list(points)
    keep = [False] * n
    keep[0] = keep[-1] = True
    stack = [(0, n - 1)]
    while stack:
        lo, hi = stack.pop()
        if hi - lo < 2:
            continue
        ax, ay = points[lo]
        bx, by = points[hi]
        dx, dy = bx - ax, by - ay
        length_sq = dx * dx + dy * dy
        worst, worst_d = -1, -1.0
        for i in range(lo + 1, hi):
            px, py = points[i]
            if length_sq == 0.0:
                d = (px - ax) ** 2 + (py - ay) ** 2
            else:
                t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / length_sq))
                d = (px - (ax + t * dx)) ** 2 + (py - (ay + t * dy)) ** 2
            if d > worst_d:
                worst, worst_d = i, d
        if worst_d > tolerance * tolerance:
            keep[worst] = True
            stack.append((lo, worst))
            stack.append((worst, hi))
    return [p for p, k in zip(points, keep, strict=True) if k]


def ring_area_m2(ring: Ring) -> float:
    """Unsigned area of a closed [lon, lat] ring, on a local flat plane."""
    if len(ring) < 4:
        return 0.0
    lat0 = sum(p[1] for p in ring) / len(ring)
    kx = KM_PER_DEG_LON * 1000 * math.cos(math.radians(lat0))
    total = 0.0
    for (x1, y1), (x2, y2) in zip(ring, ring[1:], strict=False):
        total += (x1 * kx) * (y2 * M_PER_DEG_LAT) - (x2 * kx) * (y1 * M_PER_DEG_LAT)
    return abs(total) / 2


def simplify_ring(
    ring: Ring, tolerance_m: float, decimals: int = FIRE_COORD_DECIMALS
) -> Ring | None:
    """A closed ring simplified to a tolerance in metres, or None when what
    is left no longer encloses anything."""
    pts = [(float(p[0]), float(p[1])) for p in ring]
    if len(pts) >= 2 and pts[0] != pts[-1]:
        pts.append(pts[0])
    if len(pts) < 4:
        return None
    lat0 = sum(p[1] for p in pts) / len(pts)
    # A degree of longitude is shorter than a degree of latitude; squash x
    # so the tolerance means the same distance in every direction.
    squash = math.cos(math.radians(lat0))
    flat = [(x * squash, y) for x, y in pts]
    tolerance = tolerance_m / M_PER_DEG_LAT

    # A closed ring has no chord to measure against, so split it at the
    # vertex farthest from the start and simplify the two halves.
    x0, y0 = flat[0]
    far = max(range(len(flat)), key=lambda i: (flat[i][0] - x0) ** 2 + (flat[i][1] - y0) ** 2)
    if far == 0:
        return None
    first = douglas_peucker(flat[: far + 1], tolerance)
    second = douglas_peucker(flat[far:], tolerance)
    joined = first + second[1:]

    out: Ring = []
    for x, y in joined:
        pt = [round(x / squash, decimals), round(y, decimals)]
        if not out or out[-1] != pt:
            out.append(pt)
    if len(out) < 4 or out[0] != out[-1]:
        return None
    if ring_area_m2(out) == 0.0:
        return None
    return out


def simplify_polygons(
    polygons: list[Polygon],
    tolerance_m: float,
    min_area_m2: float = 0.0,
    decimals: int = FIRE_COORD_DECIMALS,
) -> list[Polygon]:
    """Simplify every ring and drop parts and holes smaller than the floor.

    The largest part always survives, so a one-acre fire still draws.
    """
    out: list[Polygon] = []
    best: tuple[float, Polygon] | None = None
    for polygon in polygons:
        if not polygon:
            continue
        outer = simplify_ring(polygon[0], tolerance_m, decimals)
        if outer is None:
            continue
        area = ring_area_m2(outer)
        holes = [
            h
            for h in (simplify_ring(r, tolerance_m, decimals) for r in polygon[1:])
            if h is not None and ring_area_m2(h) >= min_area_m2
        ]
        simplified = [outer, *holes]
        if best is None or area > best[0]:
            best = (area, simplified)
        if area >= min_area_m2:
            out.append(simplified)
    if not out and best is not None:
        out.append(best[1])
    if not out:
        # Smaller than the tolerance itself: draw it as mapped.
        rings = [polygon[0] for polygon in polygons if polygon and len(polygon[0]) >= 4]
        if rings:
            largest = max(rings, key=ring_area_m2)
            out.append([[[round(p[0], decimals), round(p[1], decimals)] for p in largest]])
    return out


# Perimeter records


def fire_name(raw: str) -> str:
    """'THREE QUEENS' -> 'Three Queens Fire'. Words with digits or mixed
    case (MP18, McCully) are already written the way the agency wants."""
    words = [
        w.capitalize() if w.isalpha() and (w.isupper() or w.islower()) else w
        for w in raw.split()
    ]
    name = " ".join(words)
    if not re.search(r"\b(fire|complex)$", name, re.IGNORECASE):
        name += " Fire"
    return name


def _local_date(epoch_ms: Any) -> str | None:
    if not isinstance(epoch_ms, int | float):
        return None
    return datetime.fromtimestamp(epoch_ms / 1000, UTC).astimezone(PACIFIC).date().isoformat()


def _public_link(props: dict[str, Any]) -> str | None:
    for key, value in props.items():
        if (
            isinstance(value, str)
            and re.search(r"url|link|web", key, re.IGNORECASE)
            and re.match(r"https?://\S+$", value.strip())
        ):
            return value.strip()
    return None


def parse_perimeter(feature: dict[str, Any]) -> dict[str, Any] | None:
    """One interagency perimeter feature as a compact record, or None if it
    is not an active wildfire or carries no shape."""
    props = feature.get("properties") or {}
    geometry = feature.get("geometry") or {}
    if props.get("attr_FireOutDateTime") is not None:
        return None
    category = props.get("attr_IncidentTypeCategory")
    if category is not None and category not in ACTIVE_CATEGORIES:
        return None
    if geometry.get("type") == "Polygon":
        polygons = [geometry.get("coordinates") or []]
    elif geometry.get("type") == "MultiPolygon":
        polygons = list(geometry.get("coordinates") or [])
    else:
        return None
    polygons = [
        [[[float(p[0]), float(p[1])] for p in ring] for ring in polygon if len(ring) >= 4]
        for polygon in polygons
    ]
    polygons = [p for p in polygons if p]
    if not polygons:
        return None
    raw_name = props.get("poly_IncidentName") or props.get("attr_IncidentName")
    if not raw_name or not str(raw_name).strip():
        return None
    size = props.get("attr_IncidentSize")
    if not isinstance(size, int | float):
        size = props.get("poly_GISAcres")
    contained = props.get("attr_PercentContained")
    updated = max(
        (
            v
            for v in (props.get("poly_DateCurrent"), props.get("attr_ModifiedOnDateTime_dt"))
            if isinstance(v, int | float)
        ),
        default=None,
    )
    return {
        "name": fire_name(str(raw_name)),
        "acres": round(size) if isinstance(size, int | float) else None,
        "percent_contained": (
            round(contained) if isinstance(contained, int | float) else None
        ),
        "discovered": _local_date(props.get("attr_FireDiscoveryDateTime")),
        "updated": _local_date(updated),
        "url": _public_link(props),
        "polygons": polygons,
        "bounds": bounds([polygon[0] for polygon in polygons]),
    }


# Smoke


_DENSITY = re.compile(r"Density:\s*(\w+)", re.IGNORECASE)
_TIME = re.compile(r"(Start|End) Time:\s*(\d{4})(\d{3})\s+(\d{2})(\d{2})\s*UTC", re.IGNORECASE)
_STYLE = re.compile(r"Smoke_(Light|Medium|Heavy)", re.IGNORECASE)


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _ring_from_text(text: str, decimals: int) -> Ring:
    ring: Ring = []
    for token in text.split():
        parts = token.split(",")
        if len(parts) < 2:
            continue
        try:
            ring.append([round(float(parts[0]), decimals), round(float(parts[1]), decimals)])
        except ValueError:
            continue
    if len(ring) >= 3 and ring[0] != ring[-1]:
        ring.append(ring[0])
    return ring


def parse_smoke_kml(text: str, decimals: int = SMOKE_COORD_DECIMALS) -> list[dict[str, Any]]:
    """Hazard Mapping System smoke polygons: density, analysis window, ring."""
    # The standard library parser expands entities; a smoke file has no
    # reason to declare any, so a document that does is not parsed at all.
    if "<!DOCTYPE" in text or "<!ENTITY" in text:
        raise ValueError("smoke KML declares a DOCTYPE; refusing to parse it")
    root = ElementTree.fromstring(text.encode("utf-8"))
    plumes: list[dict[str, Any]] = []
    for placemark in root.iter():
        if _local(placemark.tag) != "Placemark":
            continue
        description = ""
        style = ""
        rings: list[str] = []
        for node in placemark.iter():
            name = _local(node.tag)
            if name == "description":
                description = node.text or ""
            elif name == "styleUrl":
                style = node.text or ""
            elif name == "outerBoundaryIs":
                rings.extend(
                    c.text or "" for c in node.iter() if _local(c.tag) == "coordinates"
                )
        match = _DENSITY.search(description) or _STYLE.search(style)
        density = match.group(1).lower() if match else ""
        if density not in DENSITY_RANK:
            continue
        times: dict[str, str] = {}
        for which, year, doy, hour, minute in _TIME.findall(description):
            moment = datetime(int(year), 1, 1, int(hour), int(minute), tzinfo=UTC) + timedelta(
                days=int(doy) - 1
            )
            times[which.lower()] = moment.strftime("%Y-%m-%dT%H:%MZ")
        for coords in rings:
            ring = _ring_from_text(coords, decimals)
            if len(ring) < 4:
                continue
            plumes.append(
                {
                    "density": density,
                    "start": times.get("start"),
                    "end": times.get("end"),
                    "ring": ring,
                }
            )
    return plumes


# Linking


def compass(bearing_deg: float) -> str:
    return DIRECTIONS[round((bearing_deg % 360) / 45) % 8]


def bounds(rings: list[Ring]) -> tuple[float, float, float, float]:
    """(west, south, east, north) of a set of rings."""
    lons = [p[0] for ring in rings for p in ring]
    lats = [p[1] for ring in rings for p in ring]
    return min(lons), min(lats), max(lons), max(lats)


def _fire_bounds(fire: dict[str, Any]) -> tuple[float, float, float, float]:
    return fire.get("bounds") or bounds([polygon[0] for polygon in fire["polygons"]])


def _nearest_on_ring(ring: Ring, lat: float, lon: float) -> tuple[float, float, float]:
    """(km, km east, km north) from the point to the nearest spot on a ring."""
    kx = KM_PER_DEG_LON * math.cos(math.radians(lat))
    best = (math.inf, 0.0, 0.0)
    prev_x = (ring[0][0] - lon) * kx
    prev_y = (ring[0][1] - lat) * KM_PER_DEG_LAT
    for p in ring[1:]:
        x = (p[0] - lon) * kx
        y = (p[1] - lat) * KM_PER_DEG_LAT
        dx, dy = x - prev_x, y - prev_y
        length_sq = dx * dx + dy * dy
        t = 0.0
        if length_sq > 0.0:
            t = max(0.0, min(1.0, -(prev_x * dx + prev_y * dy) / length_sq))
        nx, ny = prev_x + t * dx, prev_y + t * dy
        d = math.hypot(nx, ny)
        if d < best[0]:
            best = (d, nx, ny)
        prev_x, prev_y = x, y
    return best


def _inside(polygon: Polygon, lat: float, lon: float) -> bool:
    if not point_in_ring(lon, lat, polygon[0]):
        return False
    return not any(point_in_ring(lon, lat, hole) for hole in polygon[1:])


def nearest_fire(
    pass_: dict[str, Any], fires: list[dict[str, Any]], radius_km: float = FIRE_RADIUS_KM
) -> dict[str, Any] | None:
    """The closest active fire to a pass, measured to the perimeter's edge."""
    lat, lon = pass_["lat"], pass_["lon"]
    band = radius_km / KM_PER_DEG_LAT
    lon_band = radius_km / (KM_PER_DEG_LON * max(0.2, math.cos(math.radians(lat))))
    best: tuple[float, float, float, bool, dict[str, Any]] | None = None
    for fire in fires:
        west, south, east, north = _fire_bounds(fire)
        if (
            lat < south - band or lat > north + band
            or lon < west - lon_band or lon > east + lon_band
        ):
            continue
        inside = any(_inside(polygon, lat, lon) for polygon in fire["polygons"])
        if inside:
            hit = (0.0, 0.0, 0.0)
        else:
            rings = (ring for polygon in fire["polygons"] for ring in polygon)
            hit = min((_nearest_on_ring(ring, lat, lon) for ring in rings), key=lambda h: h[0])
        if hit[0] > radius_km:
            continue
        if best is None or hit[0] < best[0]:
            best = (hit[0], hit[1], hit[2], inside, fire)
    if best is None:
        return None
    km, east_km, north_km, inside, fire = best
    out = {k: fire.get(k) for k in ("name", "acres", "percent_contained", "discovered", "updated")}
    if fire.get("url"):
        out["url"] = fire["url"]
    out["distance_mi"] = 0 if inside else round(km / KM_PER_MI, 1)
    out["direction"] = (
        None if inside else compass(math.degrees(math.atan2(east_km, north_km)))
    )
    out["inside"] = inside
    return out


def smoke_over(pass_: dict[str, Any], plumes: list[dict[str, Any]]) -> str | None:
    """The heaviest smoke density mapped over the pass, if any."""
    lat, lon = pass_["lat"], pass_["lon"]
    heaviest: str | None = None
    for plume in plumes:
        if heaviest and DENSITY_RANK[plume["density"]] <= DENSITY_RANK[heaviest]:
            continue
        if point_in_ring(lon, lat, plume["ring"]):
            heaviest = plume["density"]
    return heaviest


def link_pass(
    pass_: dict[str, Any],
    fires: list[dict[str, Any]] | None,
    plumes: list[dict[str, Any]] | None,
) -> dict[str, Any] | None:
    """Fire and smoke facts for one pass, or None when it has neither.

    A source passed as None failed upstream today: its key is left out, which
    reads as "no data", never as "no fire".
    """
    out: dict[str, Any] = {}
    fire = nearest_fire(pass_, fires) if fires else None
    if fire:
        out["fire"] = fire
    density = smoke_over(pass_, plumes) if plumes else None
    if density:
        out["smoke"] = density
    return out or None


# Export


def fires_geojson(
    fires: list[dict[str, Any]], tolerance_m: float, min_area_m2: float
) -> dict[str, Any]:
    features = []
    for fire in fires:
        polygons = simplify_polygons(fire["polygons"], tolerance_m, min_area_m2)
        if not polygons:
            continue
        props = {
            k: fire[k]
            for k in ("name", "acres", "percent_contained", "discovered", "updated", "url")
            if fire.get(k) is not None
        }
        features.append(
            {
                "type": "Feature",
                "properties": props,
                "geometry": {"type": "MultiPolygon", "coordinates": polygons},
            }
        )
    return {"type": "FeatureCollection", "features": features}


def fire_labels_geojson(fires: list[dict[str, Any]]) -> dict[str, Any]:
    """One point per fire, in the middle of its largest part, for its name."""
    features = []
    for fire in fires:
        outer = max((polygon[0] for polygon in fire["polygons"]), key=ring_area_m2)
        west, south, east, north = bounds([outer])
        features.append(
            {
                "type": "Feature",
                "properties": {"name": fire["name"]},
                "geometry": {
                    "type": "Point",
                    "coordinates": [round((west + east) / 2, 3), round((south + north) / 2, 3)],
                },
            }
        )
    return {"type": "FeatureCollection", "features": features}


def smoke_geojson(plumes: list[dict[str, Any]]) -> dict[str, Any]:
    order = sorted(plumes, key=lambda p: DENSITY_RANK[p["density"]])
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "properties": {"density": p["density"]},
                "geometry": {"type": "Polygon", "coordinates": [p["ring"]]},
            }
            for p in order
        ],
    }


def in_region(ring: Ring, region: tuple[float, float, float, float]) -> bool:
    """Whether a ring's bounding box touches (west, south, east, north)."""
    west, south, east, north = bounds([ring])
    return not (east < region[0] or west > region[2] or north < region[1] or south > region[3])
