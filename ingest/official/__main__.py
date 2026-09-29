from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

from config import DB_PATH
from ingest.official.runner import NothingFetched, run

log = logging.getLogger("ingest.official")

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser(
        description="Fetch official conditions reports and link them to passes."
    )
    parser.add_argument("--db", type=Path, default=DB_PATH, help="store for the raw payloads")
    args = parser.parse_args()
    try:
        written = run(db_path=args.db)
    except NothingFetched as exc:
        log.error("%s", exc)
        sys.exit(1)
    print(
        f"official reports for {len(written['passes'])} passes, "
        f"issued for {written['issued_for']}"
    )
