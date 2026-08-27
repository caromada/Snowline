"""SNOTEL ingest via the NRCS AWDB REST API.

Stations are discovered from the live network and linked to passes by
proximity, because SNOTEL sits in flats and valleys, not on passes. Passes
with no station in range simply carry no snotel stream; fusion treats that
honestly instead of inventing data.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from config import AWDB_BASE
from gazetteer import load_passes
from ingest.geo import haversine_km
from ingest.http import fetch_json
from store import Store

log = logging.getLogger(__name__)

MAX_STATION_KM = 55.0
MAX_STATIONS_PER_PASS = 3
# AWDB element codes: WTEQ = snow water equivalent, SNWD = snow depth.
ELEMENTS = "WTEQ,SNWD"
METRIC_BY_ELEMENT = {"WTEQ": "swe_in", "SNWD": "snow_depth_in"}


def discover_stations(store: Store) -> list[dict[str, Any]]:
    """All active CA/NV SNOTEL stations, raw-first."""
    stations: list[dict[str, Any]] = []
    for state in ("CA", "NV"):
        url = f"{AWDB_BASE}/stations"
        params = {"stationTriplets": f"*:{state}:SNTL", "activeOnly": "true"}
        parsed, raw, cached = fetch_json(url, params)
        if not cached:
            store.record_raw("snotel", f"{url}?state={state}", raw)
        stations.extend(parsed if isinstance(parsed, list) else [])
    return stations


def link_stations(stations: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    """pass_slug -> nearest stations within range, closest first."""
    links: dict[str, list[dict[str, Any]]] = {}
    for p in load_passes():
        ranked = sorted(
            (
                {
                    **s,
                    "distance_km": round(
                        haversine_km(p["lat"], p["lon"], s["latitude"], s["longitude"]), 1
                    ),
                }
                for s in stations
            ),
            key=lambda s: s["distance_km"],
        )
        links[p["slug"]] = [s for s in ranked if s["distance_km"] <= MAX_STATION_KM][
            :MAX_STATIONS_PER_PASS
        ]
    return links


def pass_links(store: Store) -> dict[str, list[dict[str, Any]]]:
    """slug -> linked stations with provenance keys, for read-time joins."""
    return {
        slug: [
            {
                "provenance": f"snotel:{s['stationTriplet']}",
                "name": s["name"],
                "elevation_ft": s.get("elevation"),
                "distance_km": s["distance_km"],
            }
            for s in linked
        ]
        for slug, linked in link_stations(discover_stations(store)).items()
    }


def ingest_daily(store: Store, begin: str, end: str) -> int:
    """Daily SWE/depth, one row per station per day, keyed "@snotel:TRIPLET"."""
    links = link_stations(discover_stations(store))
    stations = {s["stationTriplet"]: s for linked in links.values() for s in linked}
    triplets = sorted(stations)
    if not triplets:
        log.warning("no SNOTEL stations in range of any pass")
        return 0

    url = f"{AWDB_BASE}/data"
    params = {
        "stationTriplets": ",".join(triplets),
        "elements": ELEMENTS,
        "duration": "DAILY",
        "beginDate": begin,
        "endDate": end,
    }
    parsed, raw, cached = fetch_json(url, params)
    raw_id = store.record_raw("snotel", f"{url}?{begin}..{end}", raw) if not cached else None

    # Index series by triplet so each pass can pull from its linked stations.
    series: dict[str, list[dict[str, Any]]] = {}
    for entry in parsed if isinstance(parsed, list) else []:
        series[entry["stationTriplet"]] = entry.get("data", [])

    count = 0
    for triplet, st in stations.items():
        for element in series.get(triplet, []):
            code = element.get("stationElement", {}).get("elementCode")
            metric = METRIC_BY_ELEMENT.get(code)
            if not metric:
                continue
            for v in element.get("values", []):
                if v.get("value") is None:
                    continue
                store.add_observation(
                    pass_slug=f"@snotel:{triplet}",
                    stream="snotel",
                    metric=metric,
                    observed_date=v["date"],
                    value=float(v["value"]),
                    unit="in",
                    provenance=f"snotel:{triplet}",
                    raw_fetch_id=raw_id,
                    geom={
                        "type": "Point",
                        "coordinates": [st["longitude"], st["latitude"]],
                    },
                    meta={
                        "station_name": st["name"],
                        "station_elevation_ft": st.get("elevation"),
                    },
                )
                count += 1
    log.info("snotel: %d observations from %d stations", count, len(triplets))
    return count


def station_links_summary() -> dict[str, list[str]]:
    """For diagnostics: which stations back each pass."""
    store = Store(":memory:")
    links = link_stations(discover_stations(store))
    return {
        slug: [f"{s['name']} ({s['stationTriplet']}, {s['distance_km']}km)" for s in linked]
        for slug, linked in links.items()
    }


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    print(json.dumps(station_links_summary(), indent=2))
