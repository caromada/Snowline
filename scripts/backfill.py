"""Backfill sensor observations.

Usage:
  python -m scripts.backfill                 all melt seasons 2023..now, through today
  python -m scripts.backfill --daily         trailing window if the store already
                                             holds past seasons, else a full rebuild
  python -m scripts.backfill BEGIN END       one explicit window

Each stream (SNOTEL, CDEC, USGS) is ingested as its own unit: new rows are
appended first and the rows they supersede are dropped only once the stream
succeeds. A stream whose upstream is down keeps its previous rows and the
others carry on, so one flaky server degrades the report instead of killing
the run. Overlapping runs never duplicate rows.

Exit status: 1 if a full rebuild lost any stream (the result would have
holes that persist until the next rebuild), or if every stream failed.
A daily run with some streams down exits 0 with a warning per stream.
"""

from __future__ import annotations

import logging
import sys
from collections.abc import Callable
from datetime import UTC, date, datetime, timedelta

from config import DB_PATH
from ingest import cdec, snotel, usgs
from ingest.http import FetchError
from store import Store

log = logging.getLogger(__name__)

FIRST_SEASON_YEAR = 2023
SEASON_START = "04-01"
SEASON_END = "08-31"
DAILY_LOOKBACK_DAYS = 10

IngestFn = Callable[[Store, str, str], int]

# (label, stream column, ingest steps). The USGS daily and 15-minute pulls
# both write stream "usgs", so they succeed or roll back together.
STREAMS: list[tuple[str, str, list[IngestFn]]] = [
    ("snotel", "snotel", [snotel.ingest_daily]),
    ("cdec", "cdec", [cdec.ingest_daily]),
    ("usgs", "usgs", [usgs.ingest_daily, usgs.ingest_diurnal]),
]


def season_windows(today: date | None = None) -> list[tuple[str, str]]:
    """One window per melt season from 2023 through today."""
    today = today or datetime.now(UTC).date()
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


def daily_window(store: Store, today: date | None = None) -> tuple[str, str] | None:
    """Trailing window for a store that already holds past seasons, else None.

    Reaches back past the default lookback when earlier runs failed, so a
    multi-day outage never leaves a gap.
    """
    today = today or datetime.now(UTC).date()
    first_season_over = f"{FIRST_SEASON_YEAR}-12-31"
    streams = [stream for _, stream, _ in STREAMS]
    if not all(store.has_observations_before(s, first_season_over) for s in streams):
        return None
    begin = today - timedelta(days=DAILY_LOOKBACK_DAYS)
    for s in streams:
        latest = store.latest_observed_date(s)
        if latest:
            begin = min(begin, date.fromisoformat(latest[:10]) - timedelta(days=3))
    return begin.isoformat(), today.isoformat()


def run(begin: str, end: str, store: Store | None = None) -> tuple[dict[str, int], list[str]]:
    """Ingest one window for every stream. Returns (row counts, failed streams)."""
    store = store or Store(DB_PATH)
    counts: dict[str, int] = {}
    failed: list[str] = []
    for label, stream, steps in STREAMS:
        mark = store.max_observation_id()
        try:
            total = sum(step(store, begin, end) for step in steps)
        except (FetchError, ValueError) as exc:
            store.delete_observations_after(stream, mark)
            log.warning(
                "%s unavailable for %s..%s, keeping previous rows: %s", label, begin, end, exc
            )
            failed.append(label)
            continue
        if total == 0:
            # An empty answer is not evidence the snow vanished; keep what we had.
            log.warning("%s returned no rows for %s..%s, keeping previous rows", label, begin, end)
            failed.append(label)
            continue
        replaced = store.delete_observations(stream, begin, end, up_to_id=mark)
        if replaced:
            log.info("%s: replaced %d older rows in %s..%s", label, replaced, begin, end)
        counts[label] = total
    return counts, failed


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    store = Store(DB_PATH)
    args = sys.argv[1:]
    full = True
    if len(args) == 2:
        windows = [(args[0], args[1])]
        full = False
    elif args == ["--daily"]:
        window = daily_window(store)
        windows = [window] if window else season_windows()
        full = window is None
        print("mode:", "full rebuild" if full else f"daily {window[0]}..{window[1]}")
    else:
        windows = season_windows()

    all_failed: set[str] = set()
    streams_ok: set[str] = set()
    for begin, end in windows:
        counts, failed = run(begin, end, store)
        all_failed.update(failed)
        streams_ok.update(counts)
        print(f"{begin}..{end}: {counts}" + (f" failed: {failed}" if failed else ""))

    for label in sorted(all_failed):
        # GitHub Actions renders these as yellow annotations on the run.
        print(f"::warning::{label} upstream unavailable; its previous rows were kept")
    if full and all_failed:
        print(f"::error::full rebuild incomplete, missing {sorted(all_failed)}; not publishing")
        sys.exit(1)
    if not streams_ok:
        print("::error::every sensor stream failed")
        sys.exit(1)


if __name__ == "__main__":
    main()
