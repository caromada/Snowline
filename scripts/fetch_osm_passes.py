"""Fetch every named mountain pass and saddle in the Sierra Nevada from
OpenStreetMap, with elevations filled from the USGS point-query service
where OSM lacks them.

Results are cached to gazetteer/osm_passes.json (committed), so the build
is reproducible without hammering Overpass.

Usage: python -m scripts.fetch_osm_passes [--refresh]
"""

from __future__ import annotations

import json
import logging
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import requests

log = logging.getLogger(__name__)

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
EPQS_URL = "https://epqs.nationalmap.gov/v1/json"
# The Sierra Nevada, southern Kern country to the Tahoe rim.
BBOX = "35.4,-120.8,39.8,-117.8"
OUT_PATH = Path(__file__).resolve().parent.parent / "gazetteer" / "osm_passes.json"

QUERY = f"""[out:json][timeout:120];
(
  node["mountain_pass"="yes"]["name"]({BBOX});
  node["natural"="saddle"]["name"]({BBOX});
);
out body;"""


def fetch_overpass() -> list[dict]:
    resp = requests.post(
        OVERPASS_URL,
        data={"data": QUERY},
        headers={"User-Agent": "sierra-pass-report/1.0 (github.com/caromada/Snowline)"},
        timeout=180,
    )
    resp.raise_for_status()
    return resp.json()["elements"]


def epqs_elevation_ft(lat: float, lon: float) -> int | None:
    for attempt in range(2):
        try:
            resp = requests.get(
                EPQS_URL,
                params={"x": f"{lon}", "y": f"{lat}", "units": "Feet", "wkid": "4326"},
                timeout=20,
            )
            resp.raise_for_status()
            value = resp.json().get("value")
            if value is not None:
                return round(float(value))
        except (requests.RequestException, ValueError, KeyError):
            if attempt == 0:
                time.sleep(1.5)
    return None


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    if OUT_PATH.exists() and "--refresh" not in sys.argv:
        print(f"{OUT_PATH} exists; pass --refresh to refetch")
        return
    elements = fetch_overpass()
    log.info("overpass returned %d named passes/saddles", len(elements))

    nodes = []
    for e in elements:
        tags = e.get("tags", {})
        elevation = None
        ele = tags.get("ele")
        if ele:
            try:
                elevation = round(float(ele) * 3.28084)
            except ValueError:
                elevation = None
        nodes.append(
            {
                "osm_id": e["id"],
                "name": tags["name"],
                "lat": e["lat"],
                "lon": e["lon"],
                "elevation_ft": elevation,
            }
        )

    missing = [n for n in nodes if n["elevation_ft"] is None]
    log.info("filling %d elevations from USGS EPQS", len(missing))
    with ThreadPoolExecutor(max_workers=8) as pool:
        for node, elevation in zip(
            missing,
            pool.map(lambda n: epqs_elevation_ft(n["lat"], n["lon"]), missing),
            strict=True,
        ):
            node["elevation_ft"] = elevation

    OUT_PATH.write_text(json.dumps({"bbox": BBOX, "nodes": nodes}, indent=0) + "\n")
    filled = sum(1 for n in nodes if n["elevation_ft"] is not None)
    print(f"wrote {OUT_PATH}: {len(nodes)} nodes, {filled} with elevation")


if __name__ == "__main__":
    main()
