"""Active fire perimeters and smoke over the West Coast.

Perimeters come from the National Interagency Fire Center's current
interagency perimeter service; smoke from NOAA's Hazard Mapping System daily
analysis. Each run writes data/fire/passes.json (facts per pass, for the
pipeline to merge) and web/public/data/fire.json (shapes for the map).

The two sources fail independently. A source that is down today is recorded
as unavailable and its facts are left out; nothing here falls back to an
older copy, because an old perimeter drawn as current is worse than none.

Usage: python -m ingest.fire
"""

from __future__ import annotations

import json
import logging
from collections.abc import Callable
from datetime import UTC, date, datetime, timedelta
from typing import Any

from config import DATA_DIR, WEB_DATA_DIR
from fusion.fire import (
    PACIFIC,
    fire_labels_geojson,
    fires_geojson,
    in_region,
    link_pass,
    parse_perimeter,
    parse_smoke_kml,
    smoke_geojson,
)
from gazetteer import load_passes
from ingest.http import FetchError, fetch_json, fetch_text

log = logging.getLogger(__name__)

PERIMETERS_URL = (
    "https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/"
    "WFIGS_Interagency_Perimeters_Current/FeatureServer/0/query"
)
PERIMETERS_ABOUT = (
    "https://data-nifc.opendata.arcgis.com/datasets/"
    "nifc::wfigs-current-interagency-fire-perimeters/about"
)
SMOKE_BASE = "https://satepsanone.nesdis.noaa.gov/pub/FIRE/web/HMS/Smoke_Polygons/KML"
SMOKE_ABOUT = "https://www.ospo.noaa.gov/products/land/hms.html"

FIRE_PATH = DATA_DIR / "fire" / "passes.json"
MAP_PATH = WEB_DATA_DIR / "fire.json"

# Washington, Oregon and California, with a margin so a fire just across a
# state line still counts for the passes beside it: (west, south, east, north).
REGION = (-125.0, 32.0, -113.5, 49.5)

PERIMETER_FIELDS = (
    "OBJECTID,poly_IncidentName,attr_IncidentName,poly_GISAcres,attr_IncidentSize,"
    "attr_PercentContained,attr_FireDiscoveryDateTime,poly_DateCurrent,"
    "attr_ModifiedOnDateTime_dt,attr_IncidentTypeCategory,attr_FireOutDateTime"
)
PAGE_SIZE = 25
MAX_PAGES = 40
# Full-detail perimeters for the region run past 20 MB. The service thins
# them to about 30 m before sending, which is finer than anything measured
# here and keeps each page small enough to arrive inside the timeout.
SERVER_OFFSET_DEG = "0.0003"
PERIMETER_TIMEOUT_S = 60

MAP_TOLERANCE_M = 60.0
MAP_MIN_AREA_M2 = 40_000.0


class SmokeUnavailable(RuntimeError):
    """A day's smoke file could not be read."""


def collect_pages(
    fetch_page: Callable[[int], dict[str, Any]], max_pages: int = MAX_PAGES
) -> list[Any]:
    """Every feature from a paged feature service.

    The service flags a short page with exceededTransferLimit, at the top
    level or under properties depending on the output format.
    """
    features: list[Any] = []
    for _ in range(max_pages):
        page = fetch_page(len(features))
        got = page.get("features") or []
        features.extend(got)
        more = page.get("exceededTransferLimit") or (page.get("properties") or {}).get(
            "exceededTransferLimit"
        )
        if not got or not more:
            break
    return features


def _perimeter_page(offset: int) -> dict[str, Any]:
    params = {
        "where": "1=1",
        "geometry": ",".join(str(v) for v in REGION),
        "geometryType": "esriGeometryEnvelope",
        "inSR": "4326",
        "spatialRel": "esriSpatialRelIntersects",
        "outFields": PERIMETER_FIELDS,
        "outSR": "4326",
        "orderByFields": "OBJECTID",
        "maxAllowableOffset": SERVER_OFFSET_DEG,
        "geometryPrecision": "5",
        "resultOffset": str(offset),
        "resultRecordCount": str(PAGE_SIZE),
        "f": "geojson",
    }
    parsed, _, _ = fetch_json(PERIMETERS_URL, params, timeout=PERIMETER_TIMEOUT_S, cache=False)
    # ArcGIS reports its own failures as a 200 with an error body.
    if not isinstance(parsed, dict) or "error" in parsed or "features" not in parsed:
        raise FetchError(f"perimeter service answered without features: {str(parsed)[:200]}")
    return parsed


def fetch_fires() -> list[dict[str, Any]]:
    records = (parse_perimeter(f) for f in collect_pages(_perimeter_page))
    return [r for r in records if r is not None]


def smoke_url(day: date) -> str:
    return f"{SMOKE_BASE}/{day:%Y}/{day:%m}/hms_smoke{day:%Y%m%d}.kml"


def _smoke_text(day: date) -> str:
    try:
        text, _ = fetch_text(smoke_url(day), timeout=60, cache=False)
    except FetchError as exc:
        raise SmokeUnavailable(str(exc)) from exc
    return text


def load_smoke(
    today: date, fetch: Callable[[date], str] = _smoke_text
) -> tuple[date, list[dict[str, Any]]]:
    """(date used, smoke polygons), preferring today and then yesterday.

    Analysts publish through the day, so early on today's file is missing or
    holds no polygons yet; either way yesterday's analysis is the latest.
    """
    last_error: Exception | None = None
    for day in (today, today - timedelta(days=1)):
        try:
            plumes = parse_smoke_kml(fetch(day))
        except (SmokeUnavailable, ValueError) as exc:
            last_error = exc
            continue
        if plumes:
            return day, plumes
        last_error = SmokeUnavailable(f"no smoke polygons in the file for {day}")
    raise SmokeUnavailable(f"no smoke analysis for {today} or the day before: {last_error}")


def run() -> dict[str, Any]:
    now = datetime.now(UTC)
    today = now.astimezone(PACIFIC).date()

    fires: list[dict[str, Any]] | None
    try:
        fires = fetch_fires()
        log.info("fire: %d active perimeters in the region", len(fires))
    except (FetchError, ValueError) as exc:
        log.warning("fire perimeters unavailable: %s", exc)
        fires = None

    plumes: list[dict[str, Any]] | None
    smoke_date: date | None = None
    try:
        # Smoke files are named for the UTC day of the analysis.
        smoke_date, everywhere = load_smoke(now.date())
        plumes = [p for p in everywhere if in_region(p["ring"], REGION)]
        log.info("smoke: %d polygons in the region, analysed %s", len(plumes), smoke_date)
    except SmokeUnavailable as exc:
        log.warning("smoke unavailable: %s", exc)
        plumes = None

    if fires is None and plumes is None:
        raise FetchError("neither fire perimeters nor smoke could be fetched")

    linked: dict[str, Any] = {}
    for p in load_passes():
        facts = link_pass(p, fires, plumes)
        if facts:
            linked[p["slug"]] = facts

    stamp = {
        "generated_at": now.isoformat(timespec="seconds"),
        "issued_for": today.isoformat(),
        "smoke_date": smoke_date.isoformat() if smoke_date else None,
        "fires_available": fires is not None,
        "smoke_available": plumes is not None,
    }
    doc = {**stamp, "passes": linked}
    FIRE_PATH.parent.mkdir(parents=True, exist_ok=True)
    FIRE_PATH.write_text(json.dumps(doc, separators=(",", ":")))

    map_doc = {
        **stamp,
        "sources": {"fires": PERIMETERS_ABOUT, "smoke": SMOKE_ABOUT},
        "fires": fires_geojson(fires or [], MAP_TOLERANCE_M, MAP_MIN_AREA_M2),
        "fire_labels": fire_labels_geojson(fires or []),
        "smoke": smoke_geojson(plumes or []),
    }
    MAP_PATH.parent.mkdir(parents=True, exist_ok=True)
    MAP_PATH.write_text(json.dumps(map_doc, separators=(",", ":")))
    return {**doc, "fires": len(fires or []), "plumes": len(plumes or [])}


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    result = run()
    print(
        f"{result['fires']} fires, {result['plumes']} smoke polygons "
        f"(analysed {result['smoke_date']}), {len(result['passes'])} passes linked, "
        f"issued for {result['issued_for']}"
    )
