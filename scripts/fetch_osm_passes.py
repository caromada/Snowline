"""Fetch every named mountain pass and saddle in Washington, Oregon, and
California from OpenStreetMap, with elevations filled from the USGS
point-query service where OSM lacks them.

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
STATES = ("CA", "OR", "WA")
OUT_PATH = Path(__file__).resolve().parent.parent / "gazetteer" / "osm_passes.json"
USER_AGENT = "sierra-pass-report/1.0 (github.com/caromada/Snowline)"


def _query(state: str) -> str:
    # State boundaries, not a bounding box: a box around the West Coast
    # would drag in half of Nevada and Idaho.
    return f"""[out:json][timeout:170];
area["ISO3166-2"="US-{state}"]->.s;
(
  node["mountain_pass"="yes"]["name"](area.s);
  node["natural"="saddle"]["name"](area.s);
);
out body;"""


def fetch_overpass(state: str) -> list[dict]:
    """One state's named passes. Overpass sheds load with 429/504 and empty
    bodies, so back off and retry a few times before giving up."""
    last: Exception | None = None
    for attempt in range(4):
        try:
            resp = requests.post(
                OVERPASS_URL,
                data={"data": _query(state)},
                headers={"User-Agent": USER_AGENT},
                timeout=240,
            )
            resp.raise_for_status()
            return resp.json()["elements"]
        except (requests.RequestException, ValueError, KeyError) as exc:
            last = exc
            log.warning("overpass %s attempt %d failed: %s", state, attempt + 1, exc)
            time.sleep(10 * (attempt + 1))
    raise RuntimeError(f"overpass failed for {state}: {last}")


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
    tagged: list[tuple[str, dict]] = []
    for state in STATES:
        elements = fetch_overpass(state)
        log.info("overpass %s: %d named passes/saddles", state, len(elements))
        tagged.extend((state, e) for e in elements)
        time.sleep(3)

    nodes = []
    seen: set[int] = set()
    for state, e in tagged:
        if e["id"] in seen:  # a node on a state line comes back twice
            continue
        seen.add(e["id"])
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
                "state": state,
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

    OUT_PATH.write_text(json.dumps({"states": list(STATES), "nodes": nodes}, indent=0) + "\n")
    filled = sum(1 for n in nodes if n["elevation_ft"] is not None)
    print(f"wrote {OUT_PATH}: {len(nodes)} nodes, {filled} with elevation")


if __name__ == "__main__":
    main()
