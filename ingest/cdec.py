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

from gazetteer import load_passes
from ingest.geo import haversine_km
from ingest.http import fetch_text
from store import Store

log = logging.getLogger(__name__)

STA_META_URL = "https://cdec.water.ca.gov/dynamicapp/staMeta"
DATA_URL = "https://cdec.water.ca.gov/dynamicapp/req/JSONDataServlet"

# High Sierra snow sensor candidates, roughly south to north. The module
# verifies each against live metadata; wrong or dead IDs drop out on their own.
CANDIDATE_STATIONS = [
    "CRL", "BSH", "UBC", "BGP", "SWM", "BCB", "MHP", "GEM", "AGP",
    "DAN", "TUM", "VLC", "STL", "TNY", "SLI", "VRG",
]
MAX_STATION_KM = 45.0
MAX_STATIONS_PER_PASS = 3
SENSORS = {"3": "swe_in", "18": "snow_depth_in"}
MISSING = -9000.0  # CDEC uses -9999 for missing


def _parse_sta_meta(html: str) -> dict[str, Any] | None:
    text = re.sub(r"<[^>]+>", "|", html)
    text = re.sub(r"\s+", " ", text)
    name_m = re.search(r"defaultMainList[^|]*[|\s]+([A-Z][A-Z0-9 .'-]{2,40})\|", text)
    elev_m = re.search(r"Elevation\|+\s*([\d,]+) ?ft", text)
    lat_m = re.search(r"Latitude\|+\s*(-?[\d.]+)", text)
    lon_m = re.search(r"Longitude\|+\s*(-?[\d.]+)", text)
    if not (lat_m and lon_m):
        return None
    return {
        "name": (name_m.group(1).strip().title() if name_m else "station"),
        "elevation_ft": int(elev_m.group(1).replace(",", "")) if elev_m else None,
        "lat": float(lat_m.group(1)),
        "lon": float(lon_m.group(1)),
    }


def discover_stations(store: Store) -> list[dict[str, Any]]:
    stations: list[dict[str, Any]] = []
    for sid in CANDIDATE_STATIONS:
        try:
            html, cached = fetch_text(STA_META_URL, {"station_id": sid})
        except Exception as exc:  # noqa: BLE001 - one bad station must not kill ingest
            log.warning("cdec station %s metadata fetch failed: %s", sid, exc)
            continue
        meta = _parse_sta_meta(html)
        if not meta:
            log.info("cdec station %s: no parseable metadata, skipping", sid)
            continue
        if not cached:
            store.record_raw("cdec", f"{STA_META_URL}?station_id={sid}", html)
        stations.append({"station_id": sid, **meta})
    return stations


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


def ingest_daily(store: Store, begin: str, end: str) -> int:
    links = link_stations(discover_stations(store))
    station_ids = sorted({s["station_id"] for linked in links.values() for s in linked})
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
        for slug, linked in links.items():
            for st in linked:
                for date, v in values.get(st["station_id"], {}).items():
                    store.add_observation(
                        slug, "cdec", metric, date, v, "in",
                        f"cdec:{st['station_id']}", raw_id,
                        {"type": "Point", "coordinates": [st["lon"], st["lat"]]},
                        {
                            "station_name": st["name"],
                            "station_elevation_ft": st["elevation_ft"],
                            "distance_km": st["distance_km"],
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
