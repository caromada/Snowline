"""Station directories with a committed snapshot behind them.

Which gauges and snow sensors exist changes on the scale of years, but the
directory services are the slowest and flakiest endpoints we call: the USGS
site query routinely takes a minute and sometimes several, then 503s. One
bad directory call used to take down the whole daily run.

So each directory is resolved once per process and backed by a snapshot in
data/stations/<name>.json:
- snapshot younger than DIRECTORY_MAX_AGE_DAYS: used as is, no network
- older or missing: refreshed live; the snapshot is rewritten on success
- live call fails, or comes back suspiciously short (a partial CDEC sweep,
  a truncated USGS response): the snapshot is served and a warning logged
"""

from __future__ import annotations

import json
import logging
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from config import DIRECTORY_MAX_AGE_DAYS, DIRECTORY_MIN_KEEP_FRAC, STATIONS_DIR
from ingest.http import FetchError

log = logging.getLogger(__name__)

_memo: dict[tuple[str, Path], list[dict[str, Any]]] = {}


def _load(path: Path) -> tuple[list[dict[str, Any]], datetime | None]:
    if not path.exists():
        return [], None
    try:
        doc = json.loads(path.read_text())
        return doc["stations"], datetime.fromisoformat(doc["fetched_at"])
    except (ValueError, KeyError, TypeError) as exc:
        log.warning("unreadable station snapshot %s: %s", path, exc)
        return [], None


def _save(path: Path, stations: list[dict[str, Any]], now: datetime) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    doc = {"fetched_at": now.isoformat(timespec="seconds"), "stations": stations}
    path.write_text(json.dumps(doc, indent=0, sort_keys=True) + "\n")


def station_directory(
    name: str,
    fetch_live: Callable[[], list[dict[str, Any]]],
    snapshot_dir: Path = STATIONS_DIR,
    now: datetime | None = None,
) -> list[dict[str, Any]]:
    """Resolve a station directory: memo, then fresh snapshot, then live."""
    key = (name, snapshot_dir)
    if key in _memo:
        return _memo[key]

    now = now or datetime.now(UTC)
    path = snapshot_dir / f"{name}.json"
    snapshot, fetched_at = _load(path)

    if snapshot and fetched_at and now - fetched_at < timedelta(days=DIRECTORY_MAX_AGE_DAYS):
        _memo[key] = snapshot
        return snapshot

    try:
        live = fetch_live()
    except FetchError as exc:
        if not snapshot:
            raise
        log.warning("%s directory unavailable (%s); using snapshot from %s", name, exc, fetched_at)
        _memo[key] = snapshot
        return snapshot

    if snapshot and len(live) < DIRECTORY_MIN_KEEP_FRAC * len(snapshot):
        log.warning(
            "%s directory returned %d stations vs %d in snapshot; keeping snapshot",
            name,
            len(live),
            len(snapshot),
        )
        _memo[key] = snapshot
        return snapshot

    if not live:
        raise FetchError(f"{name} directory returned no stations and no snapshot exists")

    _save(path, live, now)
    _memo[key] = live
    return live


def reset_memo() -> None:
    _memo.clear()
