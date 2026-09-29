"""How you reach a pass: the trailheads, parking and campgrounds around it.

Pure functions over OpenStreetMap elements. Distances are straight lines,
which is the honest thing a point database can offer; the app labels them
that way and hands the driving to a maps app.
"""

from __future__ import annotations

import json
import math
from functools import lru_cache
from pathlib import Path
from typing import Any

from ingest.geo import haversine_km

ACCESS_PATH = Path(__file__).resolve().parent / "osm_access.json"

KM_PER_MI = 1.609344
FT_PER_M = 3.28084
TRAILHEAD_RADIUS_KM = 20.0
CAMPGROUND_RADIUS_KM = 32.0
PARKING_RADIUS_KM = 0.35
LIMIT = 4

_CLOSED = {"private", "no", "customers", "permit"}
_YES_NO = {"yes": True, "no": False}


def _int(value: str | None) -> int | None:
    try:
        return int(float(value)) if value else None
    except ValueError:
        return None


def parse_element(element: dict[str, Any], kind: str) -> dict[str, Any] | None:
    """One Overpass element as a compact record, or None if it is unusable:
    closed to the public, without a position, or a campground with no name."""
    tags = element.get("tags", {})
    if tags.get("access") in _CLOSED:
        return None
    point = element if "lat" in element else element.get("center")
    if not point:
        return None
    name = tags.get("name")
    if kind == "campground" and not name:
        return None

    rec: dict[str, Any] = {"kind": kind, "osm_id": element["id"]}
    if kind == "trailhead":
        rec["name"] = name or "Trailhead"
    elif name:
        rec["name"] = name
    rec["lat"] = point["lat"]
    rec["lon"] = point["lon"]

    ele = tags.get("ele")
    if ele:
        try:
            rec["elevation_ft"] = round(float(ele) * FT_PER_M)
        except ValueError:
            pass
    if tags.get("fee") in _YES_NO:
        rec["fee"] = _YES_NO[tags["fee"]]
    for key in ("website", "operator"):
        if tags.get(key):
            rec[key] = tags[key]

    if kind == "campground":
        if tags.get("reservation"):
            rec["reservation"] = tags["reservation"]
        if (sites := _int(tags.get("capacity"))) is not None:
            rec["sites"] = sites
        if tags.get("tents") in _YES_NO:
            rec["tents"] = _YES_NO[tags["tents"]]
        if tags.get("backcountry") == "yes":
            rec["backcountry"] = True
    if kind == "parking":
        if (spaces := _int(tags.get("capacity"))) is not None:
            rec["spaces"] = spaces
        if tags.get("surface"):
            rec["surface"] = tags["surface"]
    return rec


def _within(
    lat: float, lon: float, places: list[dict[str, Any]], radius_km: float
) -> list[tuple[float, dict[str, Any]]]:
    """Places inside the radius, nearest first. A latitude band rejects most
    of the West Coast before any trigonometry runs."""
    band = radius_km / 110.0
    lon_band = band / max(0.2, math.cos(math.radians(lat)))
    hits = []
    for place in places:
        if abs(place["lat"] - lat) > band or abs(place["lon"] - lon) > lon_band:
            continue
        km = haversine_km(lat, lon, place["lat"], place["lon"])
        if km <= radius_km:
            hits.append((km, place))
    hits.sort(key=lambda hit: hit[0])
    return hits


def _public(place: dict[str, Any], km: float) -> dict[str, Any]:
    out = {k: v for k, v in place.items() if k not in ("kind", "osm_id")}
    out["distance_mi"] = round(km / KM_PER_MI, 1)
    return out


def link_access(
    pass_: dict[str, Any],
    trailheads: list[dict[str, Any]],
    campgrounds: list[dict[str, Any]],
    parking: list[dict[str, Any]],
    limit: int = LIMIT,
) -> dict[str, list[dict[str, Any]]]:
    """The nearest trailheads (each with the parking beside it) and
    campgrounds for one pass."""
    lat, lon = pass_["lat"], pass_["lon"]
    heads = []
    for km, th in _within(lat, lon, trailheads, TRAILHEAD_RADIUS_KM)[:limit]:
        out = _public(th, km)
        if th.get("elevation_ft") is not None:
            out["gain_ft"] = pass_["elevation_ft"] - th["elevation_ft"]
        else:
            out.pop("elevation_ft", None)
        lots = _within(th["lat"], th["lon"], parking, PARKING_RADIUS_KM)
        if lots:
            lot = lots[0][1]
            out["parking"] = {k: lot[k] for k in ("spaces", "fee", "surface") if k in lot}
        heads.append(out)
    nearby = _within(lat, lon, campgrounds, CAMPGROUND_RADIUS_KM)[:limit]
    camps = [_public(camp, km) for km, camp in nearby]
    return {"trailheads": heads, "campgrounds": camps}


@lru_cache(maxsize=1)
def load_access() -> dict[str, list[dict[str, Any]]]:
    """The committed snapshot, or empty lists before the first fetch."""
    if not ACCESS_PATH.exists():
        return {"trailheads": [], "campgrounds": [], "parking": []}
    doc = json.loads(ACCESS_PATH.read_text())
    return {k: doc.get(k, []) for k in ("trailheads", "campgrounds", "parking")}
