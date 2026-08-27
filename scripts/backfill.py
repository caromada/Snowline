"""Backfill sensor observations.

Usage:
  python -m scripts.backfill                 all melt seasons 2023..now, through today
  python -m scripts.backfill BEGIN END       one explicit window

Each window deletes then re-ingests its date range per stream, so overlapping
runs (like the daily cron re-covering the trailing week) never duplicate rows.
"""

from __future__ import annotations

import logging
import sys
from datetime import UTC, datetime

from config import DB_PATH
from ingest import cdec, snotel, usgs
from store import Store

log = logging.getLogger(__name__)

FIRST_SEASON_YEAR = 2023
SEASON_START = "04-01"
SEASON_END = "08-31"


def season_windows() -> list[tuple[str, str]]:
    """One window per melt season from 2023 through today."""
    today = datetime.now(UTC).date()
    windows: list[tuple[str, str]] = []
    for year in range(FIRST_SEASON_YEAR, today.year + 1):
        begin = f"{year}-{SEASON_START}"
        end = f"{year}-{SEASON_END}"
        if year == today.year:
            # The current year always runs through today, even outside the
            # melt season, so "now" is never stale.
            end = today.isoformat()
            if end < begin:
                begin = f"{year}-01-01"
        windows.append((begin, end))
    return windows


def run(begin: str, end: str, store: Store | None = None) -> dict[str, int]:
    store = store or Store(DB_PATH)
    for stream in ("snotel", "cdec", "usgs"):
        removed = store.delete_observations(stream, begin, end)
        if removed:
            log.info("%s: cleared %d rows in %s..%s before re-ingest", stream, removed, begin, end)
    counts = {
        "snotel": snotel.ingest_daily(store, begin, end),
        "cdec": cdec.ingest_daily(store, begin, end),
        "usgs": usgs.ingest_daily(store, begin, end),
        "usgs_iv": usgs.ingest_diurnal(store, begin, end),
    }
    return counts


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    store = Store(DB_PATH)
    windows = [(sys.argv[1], sys.argv[2])] if len(sys.argv) == 3 else season_windows()
    for begin, end in windows:
        counts = run(begin, end, store)
        print(f"{begin}..{end}: {counts}")


if __name__ == "__main__":
    main()
