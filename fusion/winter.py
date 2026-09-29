"""The winter layer for one pass: the official avalanche rating, new snow,
and the road reports on or near it. Assembly only; each part has its own
module and its own rules.
"""

from __future__ import annotations

import json
import logging
from datetime import date
from pathlib import Path
from typing import Any

from config import DATA_DIR
from fusion.avalanche import official_rating, zone_at
from fusion.fresh_snow import fresh_snow
from fusion.roads import link_roads

log = logging.getLogger(__name__)

WINTER_PATH = DATA_DIR / "winter" / "passes.json"
# Same rule as forecasts: issued today or yesterday, or not shown.
MAX_AGE_DAYS = 1


def pass_winter(
    pass_: dict[str, Any],
    zones: list[dict[str, Any]] | None,
    roads: list[dict[str, Any]],
    stations: list[dict[str, Any]],
    today: date,
    forecast: dict[str, Any] | None,
) -> dict[str, Any] | None:
    """One pass's winter record, or None when there is nothing to show.

    "avalanche" is None when the pass lies outside every forecast zone and
    absent when the zones could not be fetched. The two must stay distinct:
    the first is a fact about the pass, the second is a gap in today's data.
    """
    out: dict[str, Any] = {}
    if zones is not None:
        zone = zone_at(zones, pass_["lon"], pass_["lat"])
        out["avalanche"] = official_rating(zone["properties"]) if zone else None
    snow = fresh_snow(stations, today, forecast)
    if snow:
        out["fresh_snow"] = snow
    linked = link_roads(pass_, roads)
    if linked:
        out["roads"] = linked
    return out or None


def load_winter(today: str, path: Path = WINTER_PATH) -> dict[str, Any]:
    """Per-pass winter records from ingest.winter for the export, or {} when
    the file is missing, unreadable or older than MAX_AGE_DAYS. A stale
    avalanche rating or chain control is worse than none."""
    if not path.exists():
        return {}
    try:
        doc = json.loads(path.read_text())
        issued = date.fromisoformat(doc["issued_for"])
        passes = doc["passes"]
    except (ValueError, KeyError, TypeError) as exc:
        log.warning("unreadable winter file %s: %s", path, exc)
        return {}
    if (date.fromisoformat(today) - issued).days > MAX_AGE_DAYS:
        log.warning("winter file issued %s is stale; skipping the winter layer", issued)
        return {}
    stamp = {"issued_for": doc["issued_for"], "fetched_at": doc.get("generated_at")}
    return {slug: {**record, **stamp} for slug, record in passes.items()}
