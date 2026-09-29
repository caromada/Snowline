"""Fetch the trailheads, the parking beside them, and the campgrounds of
Washington, Oregon and California from OpenStreetMap.

Only places within reach of a pass are kept, and trailheads that OSM gives
no elevation get one from the terrain tiles the map is drawn from. The result is cached
to gazetteer/osm_access.json (committed), so the daily build never touches
Overpass.

Usage: python -m scripts.fetch_osm_access [--refresh]
"""

from __future__ import annotations

import json
import logging
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Any

import requests

from config import CACHE_DIR
from gazetteer import load_passes
from gazetteer.access import (
    ACCESS_PATH,
    CAMPGROUND_RADIUS_KM,
    TRAILHEAD_RADIUS_KM,
    _within,
    parse_element,
)
from ingest.terrain import elevation_ft
from scripts.fetch_osm_passes import STATES, USER_AGENT

log = logging.getLogger(__name__)

# Overpass sheds load freely; the mirrors take turns.
OVERPASS_URLS = (
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
)
# Each answer is kept as it lands, so a rerun resumes instead of starting over.
SCRATCH = CACHE_DIR / "overpass"

QUERIES = {
    "trailhead": 'node["highway"="trailhead"](area.s);',
    "campground": 'nwr["tourism"="camp_site"]["name"](area.s);',
    # Statewide parking is mostly city lots; only what sits beside a
    # trailhead is of any use here.
    "parking": 'node["highway"="trailhead"](area.s)->.th; nwr["amenity"="parking"](around.th:350);',
}


def _query(state: str, kind: str) -> str:
    return f"""[out:json][timeout:240];
area["ISO3166-2"="US-{state}"]->.s;
(
  {QUERIES[kind]}
);
out center tags;"""


def fetch(state: str, kind: str) -> list[dict[str, Any]]:
    SCRATCH.mkdir(parents=True, exist_ok=True)
    kept = SCRATCH / f"access-{state}-{kind}.json"
    if kept.exists():
        return json.loads(kept.read_text())
    last: Exception | None = None
    for attempt in range(9):
        url = OVERPASS_URLS[attempt % len(OVERPASS_URLS)]
        try:
            resp = requests.post(
                url,
                data={"data": _query(state, kind)},
                headers={"User-Agent": USER_AGENT},
                timeout=300,
            )
            resp.raise_for_status()
            elements = resp.json()["elements"]
            kept.write_text(json.dumps(elements))
            return elements
        except (requests.RequestException, ValueError, KeyError) as exc:
            last = exc
            log.warning("overpass %s %s via %s failed: %s", state, kind, url, exc)
            time.sleep(10 * (attempt + 1))
    raise RuntimeError(f"overpass failed for {state} {kind}: {last}")


def _near_a_pass(
    places: list[dict[str, Any]], passes: list[dict[str, Any]], radius_km: float
) -> list[dict[str, Any]]:
    keep: dict[int, dict[str, Any]] = {}
    for p in passes:
        for _, place in _within(p["lat"], p["lon"], places, radius_km):
            keep[place["osm_id"]] = place
    return list(keep.values())


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    if ACCESS_PATH.exists() and "--refresh" not in sys.argv:
        print(f"{ACCESS_PATH} exists; pass --refresh to refetch")
        return
    passes = load_passes()
    found: dict[str, dict[int, dict[str, Any]]] = {k: {} for k in QUERIES}
    for state in STATES:
        for kind in QUERIES:
            elements = fetch(state, kind)
            for e in elements:
                rec = parse_element(e, kind)
                if rec is not None:
                    found[kind][rec["osm_id"]] = rec
            log.info("overpass %s %s: %d elements", state, kind, len(elements))
            time.sleep(5)

    trailheads = _near_a_pass(list(found["trailhead"].values()), passes, TRAILHEAD_RADIUS_KM)
    campgrounds = _near_a_pass(list(found["campground"].values()), passes, CAMPGROUND_RADIUS_KM)
    # Parking is kept only beside a trailhead that was itself kept.
    lots = list(found["parking"].values())
    parking: dict[int, dict[str, Any]] = {}
    for th in trailheads:
        for _, lot in _within(th["lat"], th["lon"], lots, 0.35)[:1]:
            parking[lot["osm_id"]] = lot

    missing = [t for t in trailheads if "elevation_ft" not in t]
    log.info("filling %d trailhead elevations", len(missing))
    with ThreadPoolExecutor(max_workers=8) as pool:
        for th, ft in zip(
            missing, pool.map(lambda t: elevation_ft(t["lat"], t["lon"]), missing), strict=True
        ):
            if ft is not None:
                th["elevation_ft"] = ft

    doc = {
        "states": list(STATES),
        "trailheads": sorted(trailheads, key=lambda r: r["osm_id"]),
        "campgrounds": sorted(campgrounds, key=lambda r: r["osm_id"]),
        "parking": sorted(parking.values(), key=lambda r: r["osm_id"]),
    }
    ACCESS_PATH.write_text(json.dumps(doc, indent=0) + "\n")
    print(
        f"wrote {ACCESS_PATH}: {len(trailheads)} trailheads, "
        f"{len(campgrounds)} campgrounds, {len(parking)} parking lots"
    )


if __name__ == "__main__":
    main()
