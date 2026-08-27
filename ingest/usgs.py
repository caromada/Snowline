"""USGS stream gauge ingest via the NWIS Daily Values API.

Daily mean discharge answers the crossing question; the spread between the
daily max and min (the diurnal swing) is the melt proxy: actively melting
snow drives an afternoon pulse through the gauges below it.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from gazetteer import load_passes
from ingest.geo import haversine_km
from ingest.http import fetch_json, fetch_text
from store import Store

log = logging.getLogger(__name__)

NWIS_SITE_URL = "https://waterservices.usgs.gov/nwis/site/"
NWIS_DV_URL = "https://waterservices.usgs.gov/nwis/dv/"
NWIS_IV_URL = "https://waterservices.usgs.gov/nwis/iv/"
BBOX = "-120.800000,35.400000,-117.800000,39.800000"
MAX_SITE_KM = 30.0
MAX_SITES_PER_PASS = 2
# Skip conveyance infrastructure; we want creeks, not ditches.
NAME_EXCLUDE = ("DITCH", "CONDUIT", "DIV DAM", "INTAKE", "FLUME", "CANAL", "PP NO")


def discover_sites(store: Store) -> list[dict[str, Any]]:
    params = {
        "format": "rdb",
        "bBox": BBOX,
        "parameterCd": "00060",
        "siteStatus": "active",
        "siteType": "ST",
    }
    text, cached = fetch_text(NWIS_SITE_URL, params)
    if not cached:
        store.record_raw("usgs", f"{NWIS_SITE_URL}?bbox={BBOX}", text)
    sites: list[dict[str, Any]] = []
    header: list[str] = []
    for line in text.splitlines():
        if line.startswith("#"):
            continue
        cols = line.split("\t")
        if not header:
            header = cols
            continue
        if cols[0] != "USGS" or len(cols) < len(header):
            continue
        row = dict(zip(header, cols, strict=False))
        name = row.get("station_nm", "")
        if any(tok in name for tok in NAME_EXCLUDE):
            continue
        try:
            sites.append(
                {
                    "site_no": row["site_no"],
                    "name": name.title(),
                    "lat": float(row["dec_lat_va"]),
                    "lon": float(row["dec_long_va"]),
                }
            )
        except (KeyError, ValueError):
            continue
    return sites


def link_sites(sites: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    links: dict[str, list[dict[str, Any]]] = {}
    for p in load_passes():
        ranked = sorted(
            (
                {**s, "distance_km": round(haversine_km(p["lat"], p["lon"], s["lat"], s["lon"]), 1)}
                for s in sites
            ),
            key=lambda s: s["distance_km"],
        )
        links[p["slug"]] = [s for s in ranked if s["distance_km"] <= MAX_SITE_KM][
            :MAX_SITES_PER_PASS
        ]
    return links


def pass_links(store: Store) -> dict[str, list[dict[str, Any]]]:
    """slug -> linked gauges with provenance keys, for read-time joins."""
    return {
        slug: [
            {
                "provenance": f"usgs:{s['site_no']}",
                "name": s["name"],
                "distance_km": s["distance_km"],
            }
            for s in linked
        ]
        for slug, linked in link_sites(discover_sites(store)).items()
    }


def ingest_daily(store: Store, begin: str, end: str) -> int:
    """Daily discharge, one row per gauge per day, keyed "@usgs:SITE"."""
    links = link_sites(discover_sites(store))
    sites = {s["site_no"]: s for linked in links.values() for s in linked}
    site_nos = sorted(sites)
    if not site_nos:
        log.warning("no USGS sites in range of any pass")
        return 0

    params = {
        "format": "json",
        "sites": ",".join(site_nos),
        "startDT": begin,
        "endDT": end,
        "parameterCd": "00060",
        "statCd": "00003,00001,00002",  # mean, max, min
    }
    parsed, raw, cached = fetch_json(NWIS_DV_URL, params)
    raw_id = None
    if not cached:
        raw_id = store.record_raw("usgs", f"{NWIS_DV_URL}?{begin}..{end}", raw)

    # site_no -> date -> {mean, max, min}
    daily: dict[str, dict[str, dict[str, float]]] = {}
    ts = parsed.get("value", {}).get("timeSeries", []) if isinstance(parsed, dict) else []
    stat_by_code = {"00003": "mean", "00001": "max", "00002": "min"}
    for s in ts:
        site_no = s["sourceInfo"]["siteCode"][0]["value"]
        stat_code = s["variable"]["options"]["option"][0].get("optionCode", "00003")
        stat = stat_by_code.get(stat_code, "mean")
        for block in s.get("values", []):
            for v in block.get("value", []):
                if v["value"] in ("", None) or float(v["value"]) < 0:
                    continue
                date = v["dateTime"][:10]
                daily.setdefault(site_no, {}).setdefault(date, {})[stat] = float(v["value"])

    count = 0
    for site_no, site in sites.items():
        for date, stats in daily.get(site_no, {}).items():
            geom = {"type": "Point", "coordinates": [site["lon"], site["lat"]]}
            meta = {"site_name": site["name"]}
            if "mean" in stats:
                store.add_observation(
                    f"@usgs:{site_no}", "usgs", "discharge_cfs", date, stats["mean"], "cfs",
                    f"usgs:{site_no}", raw_id, geom, meta,
                )
                count += 1
            if "max" in stats and "min" in stats and stats.get("mean", 0) > 0:
                swing = (stats["max"] - stats["min"]) / stats["mean"] * 100.0
                store.add_observation(
                    f"@usgs:{site_no}", "usgs", "diurnal_swing_pct", date, round(swing, 1), "%",
                    f"usgs:{site_no}", raw_id, geom, meta,
                )
                count += 1
    log.info("usgs: %d observations from %d sites", count, len(site_nos))
    return count


def ingest_diurnal(store: Store, begin: str, end: str) -> int:
    """Diurnal swing from 15-minute instantaneous values, nearest gauge per pass.

    These gauges publish only mean daily values, so the melt pulse has to come
    from the IV service. Raw payloads are large; they are preserved gzipped
    under data/raw/ and the store row carries a pointer plus checksum.
    """
    import gzip
    import hashlib

    from config import RAW_DIR
    from gazetteer import load_passes

    # The 15-minute pulls are heavy, so only featured passes' nearest gauges
    # get the melt-pulse treatment; every pass still gets daily discharge.
    featured = {p["slug"] for p in load_passes() if p.get("tier", "featured") == "featured"}
    links = link_sites(discover_sites(store))
    nearest: dict[str, dict[str, Any]] = {}
    for slug, linked in links.items():
        if slug in featured and linked:
            site = linked[0]
            nearest[site["site_no"]] = site
    count = 0
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    for site_no, site in sorted(nearest.items()):
        params = {
            "format": "json",
            "sites": site_no,
            "startDT": begin,
            "endDT": end,
            "parameterCd": "00060",
        }
        try:
            parsed, raw, cached = fetch_json(NWIS_IV_URL, params)
        except Exception as exc:  # noqa: BLE001 - degrade per site, don't crash the run
            log.warning("usgs iv fetch failed for %s: %s", site_no, exc)
            continue
        raw_id = None
        if not cached:
            fname = f"usgs_iv_{site_no}_{begin}_{end}.json.gz"
            path = RAW_DIR / fname
            with gzip.open(path, "wt") as f:
                f.write(raw)
            pointer = {
                "file": f"data/raw/{fname}",
                "sha256": hashlib.sha256(raw.encode()).hexdigest(),
                "bytes": len(raw),
            }
            raw_id = store.record_raw("usgs-iv", f"{NWIS_IV_URL}?{site_no}&{begin}..{end}",
                                      json.dumps(pointer))
        daily: dict[str, list[float]] = {}
        ts = parsed.get("value", {}).get("timeSeries", []) if isinstance(parsed, dict) else []
        for s in ts:
            for block in s.get("values", []):
                for v in block.get("value", []):
                    try:
                        val = float(v["value"])
                    except (KeyError, ValueError):
                        continue
                    if val < 0:
                        continue
                    daily.setdefault(v["dateTime"][:10], []).append(val)
        for date, vals in sorted(daily.items()):
            if len(vals) < 24:
                continue
            mean = sum(vals) / len(vals)
            if mean <= 0:
                continue
            swing = (max(vals) - min(vals)) / mean * 100.0
            store.add_observation(
                f"@usgs:{site_no}", "usgs", "diurnal_swing_pct", date, round(swing, 1), "%",
                f"usgs:{site_no}", raw_id,
                {"type": "Point", "coordinates": [site["lon"], site["lat"]]},
                {"site_name": site["name"], "readings": len(vals)},
            )
            count += 1
    log.info("usgs iv: %d diurnal swing observations from %d sites", count, len(nearest))
    return count
