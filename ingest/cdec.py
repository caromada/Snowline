"""CDEC snow sensor ingest (California Data Exchange Center).

NRCS SNOTEL barely reaches the southern Sierra: exactly one station links to
one of our fifteen passes. California's own CDEC network is what actually
instruments this crest (Charlotte Lake sits in the Glen/Kearsarge basin at
10,400 ft), so CDEC is the primary snow telemetry stream here and SNOTEL is
the supplement. Both land as stream="snotel-class" sensor evidence.

Station metadata comes from the staMeta page (no JSON endpoint exists);
candidates that fail to parse or sit out of range are skipped, never guessed.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from config import DIRECTORY_TIMEOUT_S, REGION
from gazetteer import load_passes
from ingest.directory import station_directory
from ingest.geo import haversine_km
from ingest.http import fetch_text
from store import Store

log = logging.getLogger(__name__)

SEARCH_URL = "https://cdec.water.ca.gov/dynamicapp/staSearch"
DATA_URL = "https://cdec.water.ca.gov/dynamicapp/req/JSONDataServlet"

# Every active station reporting daily snow water content (sensor 3), from
# CDEC's station search: one call returns ID, name, coordinates and
# elevation for the whole state, Trinity Alps to the San Bernardinos.
SEARCH_PARAMS = {
    "sensor_chk": "on",
    "sensor": "3",
    "dur_chk": "on",
    "dur": "D",
    "active_chk": "on",
    "active": "Y",
    "display": "sta",
}
MAX_STATION_KM = 45.0
MAX_STATIONS_PER_PASS = 3
SENSORS = {"3": "swe_in", "18": "snow_depth_in"}
MISSING = -9000.0  # CDEC uses -9999 for missing


def _cell(html: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>|&nbsp;", " ", html)).strip()


def parse_station_search(html: str) -> list[dict[str, Any]]:
    """Rows of the staSearch table: ID, name, basin, county, lon, lat, elev, operator."""
    stations: list[dict[str, Any]] = []
    for row in re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.S | re.I):
        cells = [_cell(c) for c in re.findall(r"<td[^>]*>(.*?)</td>", row, re.S | re.I)]
        if len(cells) < 7 or not re.fullmatch(r"[A-Z0-9]{3}", cells[0]):
            continue
        try:
            stations.append(
                {
                    "station_id": cells[0],
                    "name": cells[1].title(),
                    "lon": float(cells[4]),
                    "lat": float(cells[5]),
                    "elevation_ft": int(cells[6].replace(",", "")) if cells[6] else None,
                }
            )
        except ValueError:
            continue
    return stations


def discover_stations(store: Store) -> list[dict[str, Any]]:
    """Active daily-SWE stations statewide, via the snapshotted directory."""
    return station_directory(f"cdec-{REGION}", lambda: _fetch_stations(store))


def _fetch_stations(store: Store) -> list[dict[str, Any]]:
    html, cached = fetch_text(SEARCH_URL, SEARCH_PARAMS, timeout=DIRECTORY_TIMEOUT_S)
    if not cached:
        store.record_raw("cdec", f"{SEARCH_URL}?sensor=3&dur=D&active=Y", html)
    return parse_station_search(html)


def link_stations(stations: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    links: dict[str, list[dict[str, Any]]] = {}
    for p in load_passes():
        ranked = sorted(
            (
                {**s, "distance_km": round(haversine_km(p["lat"], p["lon"], s["lat"], s["lon"]), 1)}
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
                "provenance": f"cdec:{s['station_id']}",
                "name": s["name"],
                "elevation_ft": s["elevation_ft"],
                "distance_km": s["distance_km"],
            }
            for s in linked
        ]
        for slug, linked in link_stations(discover_stations(store)).items()
    }


def ingest_daily(store: Store, begin: str, end: str) -> int:
    """One observation row per station per day, keyed "@cdec:ID".

    Stations are stored once, not copied per pass: with hundreds of passes
    the old fan-out multiplied every series by every nearby pass.
    """
    links = link_stations(discover_stations(store))
    stations = {s["station_id"]: s for linked in links.values() for s in linked}
    station_ids = sorted(stations)
    count = 0
    for sensor_num, metric in SENSORS.items():
        params = {
            "Stations": ",".join(station_ids),
            "SensorNums": sensor_num,
            "dur_code": "D",
            "Start": begin,
            "End": end,
        }
        try:
            raw, cached = fetch_text(DATA_URL, params)
        except Exception as exc:  # noqa: BLE001 - degrade, don't crash
            log.warning("cdec data fetch failed for sensor %s: %s", sensor_num, exc)
            continue
        raw_id = None
        if not cached:
            raw_id = store.record_raw(
                "cdec", f"{DATA_URL}?sensor={sensor_num}&{begin}..{end}", raw
            )
        try:
            rows = json.loads(raw)
        except json.JSONDecodeError:
            log.warning("cdec returned non-JSON for sensor %s", sensor_num)
            continue
        # station -> date -> value, then fan out to linked passes.
        values: dict[str, dict[str, float]] = {}
        for r in rows if isinstance(rows, list) else []:
            v = r.get("value")
            if v is None:
                continue
            v = float(v)
            if v <= MISSING or v < 0:
                continue
            date = r["date"].split(" ")[0]
            parts = date.split("-")
            date = f"{parts[0]}-{int(parts[1]):02d}-{int(parts[2]):02d}"
            values.setdefault(r["stationId"], {})[date] = v
        for sid, st in stations.items():
            for date, v in values.get(sid, {}).items():
                store.add_observation(
                    f"@cdec:{sid}", "cdec", metric, date, v, "in",
                    f"cdec:{sid}", raw_id,
                    {"type": "Point", "coordinates": [st["lon"], st["lat"]]},
                    {
                        "station_name": st["name"],
                        "station_elevation_ft": st["elevation_ft"],
                    },
                )
                count += 1
    log.info("cdec: %d observations from %d stations", count, len(station_ids))
    return count


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    s = Store(":memory:")
    linked = link_stations(discover_stations(s))
    print(
        json.dumps(
            {
                slug: [
                    f"{x['name']} ({x['station_id']}, {x['distance_km']}km)" for x in st
                ]
                for slug, st in linked.items()
            },
            indent=1,
        )
    )
