"""The winter layer: official avalanche ratings, new snow, and road status.

Writes data/winter/passes.json for the pipeline to merge. Every source
stands alone: an avalanche layer outage, a Caltrans district answering 500,
a missing API key or a parser meeting a shape it never saw each cost only
their own part of the record. The run fails only when nothing at all came
back, and then it writes no file, so the export shows no winter layer
instead of an empty one.

Usage: python -m ingest.winter [--db PATH]
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from collections.abc import Callable
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any

from config import DATA_DIR, DB_PATH
from fusion.forecast import PACIFIC
from fusion.fresh_snow import WINDOWS, forecast_snow
from fusion.winter import WINTER_PATH, pass_winter
from gazetteer import load_passes
from ingest import avalanche, caltrans, tripcheck, wsdot
from ingest.raw import Recorder, collector, store_payloads
from store import Store

log = logging.getLogger(__name__)

FORECAST_PATH = DATA_DIR / "forecast" / "passes.json"
ROAD_SOURCES = ("caltrans", "wsdot", "tripcheck")
SOURCES: dict[str, Callable[[Recorder], list[dict[str, Any]] | None]] = {
    "avalanche": avalanche.fetch_zones,
    "caltrans": caltrans.fetch_statuses,
    "wsdot": wsdot.fetch_statuses,
    "tripcheck": tripcheck.fetch_statuses,
}
# Rows older than the longest window plus the age a reading may have.
SENSOR_LOOKBACK_DAYS = max(days for _, days in WINDOWS) + 3


class NothingFetched(RuntimeError):
    """No source produced anything; there is no winter layer to write."""


def _fetch(
    name: str, results: dict[str, str], record: Recorder
) -> list[dict[str, Any]] | None:
    try:
        found = SOURCES[name](record)
    except Exception:  # one source's bug must not cost the other three
        log.exception("%s failed", name)
        results[name] = "failed"
        return None
    results[name] = "ok" if found is not None else "unavailable"
    return found


def station_links(store: Store) -> dict[str, dict[str, list[dict[str, Any]]]]:
    from ingest import cdec, snotel

    return {"cdec": cdec.pass_links(store), "snotel": snotel.pass_links(store)}


def _stations_by_pass(db_path: Path, today: date) -> dict[str, list[dict[str, Any]]] | None:
    """slug -> linked stations with their recent rows, or None without a store."""
    if not db_path.exists():
        log.warning("no sensor store at %s; skipping new snow", db_path)
        return None
    store = Store(db_path)
    try:
        links = station_links(store)
        start = (today - timedelta(days=SENSOR_LOOKBACK_DAYS)).isoformat()
        rows: dict[str, list[dict[str, Any]]] = {}
        out: dict[str, list[dict[str, Any]]] = {}
        for stream, by_pass in links.items():
            for slug, linked in by_pass.items():
                for link in linked:
                    prov = link["provenance"]
                    if prov not in rows:
                        rows[prov] = store.observations(f"@{prov}", stream=stream, start=start)
                    out.setdefault(slug, []).append({**link, "rows": rows[prov]})
        return out
    finally:
        store.close()


def _forecasts(path: Path) -> tuple[dict[str, Any], str | None]:
    if not path.exists():
        return {}, None
    try:
        doc = json.loads(path.read_text())
        return doc["passes"], doc["issued_for"]
    except (ValueError, KeyError, TypeError) as exc:
        log.warning("unreadable forecast file %s: %s", path, exc)
        return {}, None


def run(
    today: date | None = None,
    out_path: Path = WINTER_PATH,
    db_path: Path = DB_PATH,
    forecast_path: Path = FORECAST_PATH,
) -> dict[str, Any]:
    today = today or datetime.now(PACIFIC).date()
    results: dict[str, str] = {}
    record, payloads = collector()
    zones = _fetch("avalanche", results, record)
    roads = [s for name in ROAD_SOURCES for s in _fetch(name, results, record) or []]

    try:
        store_payloads(db_path, payloads)
    except Exception:  # losing the audit copy must not lose the layer
        log.exception("raw payloads could not be stored")
    try:
        stations = _stations_by_pass(db_path, today)
    except Exception:  # the store is one more source that may fail alone
        log.exception("snow sensors failed")
        stations = None
    results["snow_sensors"] = "ok" if stations is not None else "unavailable"
    forecasts, issued_for = _forecasts(forecast_path)
    results["forecast"] = "ok" if forecasts else "unavailable"

    if zones is None and not roads and not stations and not forecasts:
        raise NothingFetched("every winter source was unavailable")

    passes: dict[str, Any] = {}
    for p in load_passes():
        record = pass_winter(
            p,
            zones,
            roads,
            (stations or {}).get(p["slug"], []),
            today,
            forecast_snow(forecasts.get(p["slug"]), issued_for, today),
        )
        if record is not None:
            passes[p["slug"]] = record

    doc = {
        "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "issued_for": today.isoformat(),
        "sources": results,
        "passes": passes,
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(doc, separators=(",", ":")))
    log.info(
        "winter: %d passes; %d in a forecast zone, %d rated, %d with road reports, "
        "%d with new snow measured; sources %s",
        len(passes),
        sum(1 for r in passes.values() if r.get("avalanche")),
        sum(1 for r in passes.values() if (r.get("avalanche") or {}).get("level")),
        sum(1 for r in passes.values() if r.get("roads")),
        sum(1 for r in passes.values() if (r.get("fresh_snow") or {}).get("stations")),
        results,
    )
    return doc


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--db", type=Path, default=DB_PATH, help="sensor store to read")
    args = parser.parse_args()
    try:
        written = run(db_path=args.db)
    except NothingFetched as exc:
        log.error("%s", exc)
        sys.exit(1)
    print(f"winter layer for {len(written['passes'])} passes, issued for {written['issued_for']}")
