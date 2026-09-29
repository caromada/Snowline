"""Fetch every official source, link the reports to passes, write the file.

Writes data/official/passes.json for the pipeline to merge. Every source
stands alone: a park page that moved, a host whose robots.txt cannot be
read, a missing API key or a parser meeting a shape it never saw each cost
only their own reports. The run fails only when no source answered at all,
and then it writes no file, so the export shows no official reports instead
of an empty list.

A source that answers and yields no report at all is marked "empty" and
logged as a warning: on these pages that means the layout changed.
"""

from __future__ import annotations

import json
import logging
from collections.abc import Callable
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

from config import DB_PATH
from fusion.forecast import PACIFIC
from fusion.official import MAX_AGE_DAYS, OFFICIAL_PATH, is_current, link_reports
from gazetteer import load_passes
from ingest.official import (
    caltrans_roads,
    nps_alerts,
    nps_bulletins,
    nps_dated,
    nps_roads,
    nps_tables,
)
from ingest.official.client import Client
from ingest.official.report import Report
from ingest.raw import Recorder, collector, store_payloads

log = logging.getLogger(__name__)

Fetcher = Callable[[Client], dict[str, list[Report] | None]]
# family -> (the sources it answers for, its fetcher). The names are what a
# family is charged with when it raises before it can say anything.
FAMILIES: dict[str, tuple[tuple[str, ...], Fetcher]] = {
    "nps-dated": (tuple(nps_dated.PAGES), nps_dated.fetch),
    "nps-tables": (tuple(nps_tables.PAGES), nps_tables.fetch),
    "nps-bulletins": (tuple(nps_bulletins.PAGES), nps_bulletins.fetch),
    "nps-roads": (tuple(nps_roads.PAGES), nps_roads.fetch),
    "caltrans": ((caltrans_roads.PAGE.source,), caltrans_roads.fetch),
    "nps-alerts": ((nps_alerts.SOURCE,), nps_alerts.fetch),
}


class NothingFetched(RuntimeError):
    """No source answered; there are no official reports to write."""


def make_client(record: Recorder) -> Client:
    return Client(record=record)


def run(
    today: date | None = None,
    out_path: Path = OFFICIAL_PATH,
    db_path: Path = DB_PATH,
) -> dict[str, Any]:
    today = today or datetime.now(PACIFIC).date()
    record, payloads = collector()
    client = make_client(record)
    results: dict[str, str] = {}
    counts: dict[str, dict[str, int]] = {}
    reports: list[Report] = []
    for family, (sources, fetch) in FAMILIES.items():
        try:
            found = fetch(client)
        except Exception:  # one family's bug must not cost the others
            log.exception("%s failed", family)
            results.update({source: "failed" for source in sources})
            continue
        for source in sources:
            got = found.get(source)
            if got is None:
                results[source] = "unavailable"
                continue
            results[source] = "ok" if got else "empty"
            if not got:
                log.warning("%s answered but no report could be read from it", source)
            counts[source] = {
                "reports": len(got),
                "current": sum(1 for r in got if is_current(r, today)),
            }
            reports.extend(got)

    try:
        store_payloads(db_path, payloads)
    except Exception:  # losing the audit copy must not lose the reports
        log.exception("raw payloads could not be stored")

    if not counts:
        raise NothingFetched("every official source was unavailable")

    linked = link_reports(load_passes(), reports, today)
    doc = {
        "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "issued_for": today.isoformat(),
        "sources": results,
        "counts": counts,
        "passes": {slug: {"reports": rows} for slug, rows in sorted(linked.items())},
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(doc, separators=(",", ":")))
    log.info(
        "official: %d reports read, %d inside %d days, %d passes with a report; sources %s",
        len(reports),
        sum(c["current"] for c in counts.values()),
        MAX_AGE_DAYS,
        len(linked),
        results,
    )
    return doc
