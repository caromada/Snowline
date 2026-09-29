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

A stream that fails is retried after a pause, since most upstream outages
last a minute or two. If a rebuild still ends with holes, the windows that
are missing are written beside the store; the next run pulls only those
instead of starting over.

Exit status: 1 if a rebuild still has holes (publishing would bake them into
every export), or if every stream failed. A daily run with some streams down
exits 0 with a warning per stream.
"""

from __future__ import annotations

import json
import logging
import sys
import time
from collections.abc import Callable
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

from config import DATA_DIR, DB_PATH
from ingest import cdec, snotel, usgs
from ingest.http import FetchError
from store import Store

log = logging.getLogger(__name__)

FIRST_SEASON_YEAR = 2023
SEASON_START = "04-01"
SEASON_END = "08-31"
DAILY_LOOKBACK_DAYS = 10

# Pauses before each retry of a failed stream, in seconds.
RETRY_PAUSES_S = (60, 180, 300)
PENDING_PATH = DATA_DIR / "rebuild_pending.json"

IngestFn = Callable[[Store, str, str], int]
# (begin, end, streams to pull or None for all)
Window = tuple[str, str, set[str] | None]
# (begin, end, stream label) that could not be pulled
Failure = tuple[str, str, str]

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


def run(
    begin: str, end: str, store: Store | None = None, only: set[str] | None = None
) -> tuple[dict[str, int], list[str]]:
    """Ingest one window, for every stream or only the named ones.
    Returns (row counts, failed streams)."""
    store = store or Store(DB_PATH)
    counts: dict[str, int] = {}
    failed: list[str] = []
    for label, stream, steps in STREAMS:
        if only is not None and label not in only:
            continue
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


def ingest_windows(
    store: Store,
    windows: list[Window],
    sleep: Callable[[float], None] = time.sleep,
    pauses: tuple[float, ...] = RETRY_PAUSES_S,
) -> tuple[set[str], list[Failure]]:
    """Pull every window, then retry whatever failed after each pause.
    Returns (streams that landed at least once, what is still missing)."""
    ok: set[str] = set()
    failures: list[Failure] = []
    for begin, end, only in windows:
        counts, failed = run(begin, end, store, only)
        ok.update(counts)
        failures.extend((begin, end, label) for label in failed)
        print(f"{begin}..{end}: {counts}" + (f" failed: {failed}" if failed else ""))
    for pause in pauses:
        if not failures:
            break
        log.warning("%d pulls failed; retrying in %.0fs", len(failures), pause)
        sleep(pause)
        still: list[Failure] = []
        for begin, end, label in failures:
            counts, failed = run(begin, end, store, {label})
            ok.update(counts)
            if failed:
                still.append((begin, end, label))
            else:
                print(f"{begin}..{end}: {counts} recovered on retry")
        failures = still
    return ok, failures


def load_pending(path: Path = PENDING_PATH) -> list[Failure]:
    """Windows a previous rebuild could not fill."""
    if not path.exists():
        return []
    return [(b, e, label) for b, e, label in json.loads(path.read_text())]


def save_pending(path: Path, failures: list[Failure]) -> None:
    if failures:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(failures))
    else:
        path.unlink(missing_ok=True)


def plan(
    store: Store, pending_path: Path = PENDING_PATH, today: date | None = None
) -> tuple[str, list[Window]]:
    """What a --daily run should do: finish an interrupted rebuild, pull the
    trailing window, or rebuild every season from an empty store."""
    pending = load_pending(pending_path)
    if pending:
        return "resume", [(b, e, {label}) for b, e, label in pending]
    window = daily_window(store, today)
    if window:
        return "daily", [(window[0], window[1], None)]
    return "rebuild", [(b, e, None) for b, e in season_windows(today)]


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    store = Store(DB_PATH)
    args = sys.argv[1:]
    mode = "rebuild"
    if len(args) == 2:
        mode, windows = "window", [(args[0], args[1], None)]
    elif args == ["--daily"]:
        mode, windows = plan(store)
        print("mode:", mode, *(f"{b}..{e}" for b, e, _ in windows))
    else:
        windows = [(b, e, None) for b, e in season_windows()]

    streams_ok, failures = ingest_windows(store, windows)
    rebuilding = mode in ("rebuild", "resume")
    if rebuilding:
        save_pending(PENDING_PATH, failures)
    if mode == "resume" and not failures:
        # The holes are filled; bring the store up to today like any other day.
        window = daily_window(store)
        if window:
            ok, late = ingest_windows(store, [(window[0], window[1], None)])
            streams_ok |= ok
            failures = late
            rebuilding = False

    for label in sorted({label for _, _, label in failures}):
        # GitHub Actions renders these as yellow annotations on the run.
        print(f"::warning::{label} upstream unavailable; its previous rows were kept")
    if rebuilding and failures:
        missing = sorted({label for _, _, label in failures})
        print(
            f"::error::rebuild incomplete, missing {missing}; not publishing. "
            "The next run resumes with only what is missing."
        )
        sys.exit(1)
    if not streams_ok:
        print("::error::every sensor stream failed")
        sys.exit(1)


if __name__ == "__main__":
    main()
