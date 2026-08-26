"""Backfill sensor observations for the demo seasons.

Usage: python -m scripts.backfill [begin] [end]
Defaults to the 2023 melt season plus the trailing week from today.
"""

from __future__ import annotations

import logging
import sys
from datetime import UTC, datetime, timedelta

from config import DB_PATH
from ingest import cdec, snotel, usgs
from store import Store

log = logging.getLogger(__name__)


def run(begin: str, end: str, store: Store | None = None) -> dict[str, int]:
    store = store or Store(DB_PATH)
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
    if len(sys.argv) == 3:
        windows = [(sys.argv[1], sys.argv[2])]
    else:
        today = datetime.now(UTC).date()
        windows = [
            ("2023-04-15", "2023-08-01"),
            ((today - timedelta(days=8)).isoformat(), today.isoformat()),
        ]
    for begin, end in windows:
        counts = run(begin, end, store)
        print(f"{begin}..{end}: {counts}")


if __name__ == "__main__":
    main()
