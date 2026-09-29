"""Official avalanche danger ratings, located at each pass. Pure logic, no I/O.

Snowline never makes its own avalanche assessment. Everything here either
finds which forecast zone a pass sits in or copies what the avalanche center
issued: the level, the travel advice word for word, the center's name, the
valid dates and the link. A zone with no rating stays "No rating"; nothing is
inferred from snow, weather or a neighbouring zone.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any
from zoneinfo import ZoneInfo

from ingest.geo import point_in_ring

log = logging.getLogger(__name__)

# North American Public Avalanche Danger Scale. The words are the scale's
# own and must never be reworded or extended.
DANGER_SCALE: dict[int, str] = {
    1: "Low",
    2: "Moderate",
    3: "Considerable",
    4: "High",
    5: "Extreme",
}
NO_RATING = "No rating"
WARNING_PRODUCTS = ("warning", "watch", "special")

# lon_min, lat_min, lon_max, lat_max around Washington, Oregon and
# California. A zone is kept when its own bounding box touches this one. The
# box also takes in strips of Idaho and Nevada; that costs a few unused zones
# and nothing else, because a pass only ever reads the zone that contains it.
REGION_BBOX = (-124.9, 32.4, -114.0, 49.1)

Ring = list[list[float]]
BBox = tuple[float, float, float, float]


def polygons(geometry: dict[str, Any] | None) -> list[list[Ring]]:
    """A Polygon or MultiPolygon as a list of polygons, each [outer, *holes]."""
    if not geometry:
        return []
    coords = geometry.get("coordinates") or []
    if geometry.get("type") == "Polygon":
        parts = [coords]
    elif geometry.get("type") == "MultiPolygon":
        parts = coords
    else:
        return []
    return [p for p in parts if p and len(p[0]) >= 4]


def bbox(geometry: dict[str, Any] | None) -> BBox | None:
    points = [pt for poly in polygons(geometry) for pt in poly[0]]
    if not points:
        return None
    lons = [pt[0] for pt in points]
    lats = [pt[1] for pt in points]
    return (min(lons), min(lats), max(lons), max(lats))


def contains(geometry: dict[str, Any] | None, lon: float, lat: float) -> bool:
    """Inside any polygon's outer ring and outside all of that polygon's holes."""
    for outer, *holes in polygons(geometry):
        if point_in_ring(lon, lat, outer) and not any(
            point_in_ring(lon, lat, hole) for hole in holes if len(hole) >= 4
        ):
            return True
    return False


def in_region(feature: dict[str, Any]) -> bool:
    box = bbox(feature.get("geometry"))
    if box is None:
        return False
    return not (
        box[2] < REGION_BBOX[0]
        or box[0] > REGION_BBOX[2]
        or box[3] < REGION_BBOX[1]
        or box[1] > REGION_BBOX[3]
    )


def parse_zones(doc: object) -> list[dict[str, Any]]:
    """The map layer's zones that touch the region, each with its bounding box."""
    features = doc.get("features") if isinstance(doc, dict) else None
    zones = []
    for feature in features if isinstance(features, list) else []:
        if not isinstance(feature, dict) or not isinstance(feature.get("properties"), dict):
            continue
        if in_region(feature):
            zones.append({**feature, "bbox": bbox(feature["geometry"])})
    return zones


def zone_at(zones: list[dict[str, Any]], lon: float, lat: float) -> dict[str, Any] | None:
    """The zone containing the point. Where centers overlap, the smaller zone
    wins: a pass corridor drawn inside a range forecast is the closer match."""
    hits = []
    for zone in zones:
        x0, y0, x1, y1 = zone["bbox"]
        if x0 <= lon <= x1 and y0 <= lat <= y1 and contains(zone["geometry"], lon, lat):
            hits.append(((x1 - x0) * (y1 - y0), zone))
    if not hits:
        return None
    return min(hits, key=lambda hit: hit[0])[1]


def _text(value: object) -> str | None:
    return value.strip() or None if isinstance(value, str) else None


def _local_to_utc(local: str | None, timezone: str | None) -> str | None:
    if not local or not timezone:
        return None
    try:
        stamp = datetime.fromisoformat(local)
        if stamp.tzinfo is None:
            stamp = stamp.replace(tzinfo=ZoneInfo(timezone))
    except (ValueError, KeyError, OSError):
        return None
    return stamp.astimezone(UTC).isoformat(timespec="seconds")


def _level(props: dict[str, Any]) -> int | None:
    level = props.get("danger_level")
    if isinstance(level, bool) or not isinstance(level, int) or level not in DANGER_SCALE:
        return None
    word = _text(props.get("danger"))
    if word and word.lower() != DANGER_SCALE[level].lower():
        log.warning(
            "avalanche zone %r: level %s and word %r disagree; showing no rating",
            props.get("name"), level, word,
        )
        return None
    return level


def official_rating(props: dict[str, Any]) -> dict[str, Any]:
    """One zone's rating as issued, ready for a pass record."""
    level = _level(props)
    timezone = _text(props.get("timezone"))
    valid_from = _text(props.get("start_date"))
    valid_until = _text(props.get("end_date"))
    until_utc = _local_to_utc(valid_until, timezone)
    if valid_until and not until_utc:
        valid_until = None
    if valid_from and not _local_to_utc(valid_from, timezone):
        valid_from = None
    warning = props.get("warning")
    product = warning.get("product") if isinstance(warning, dict) else None
    return {
        "zone": _text(props.get("name")),
        "center": _text(props.get("center")),
        "center_link": _text(props.get("center_link")),
        "link": _text(props.get("link")) or _text(props.get("center_link")),
        "level": level,
        "rating": DANGER_SCALE[level] if level else NO_RATING,
        "travel_advice": _text(props.get("travel_advice")),
        "valid_from": valid_from,
        "valid_until": valid_until,
        "valid_until_utc": until_utc,
        "timezone": timezone,
        "off_season": props.get("off_season") is True,
        "warning": product if product in WARNING_PRODUCTS else None,
    }
