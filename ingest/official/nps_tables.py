"""National Park Service trail tables with a date in a column of its own.

Mount Rainier and Olympic list every trail as a row: name, conditions, and
the date the row was last updated. A row the park marks as having no recent
report is dropped whole, because its date is then the date somebody looked
at the row, not the date of any report.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime

from ingest.official.client import Client
from ingest.official.dates import parse_date
from ingest.official.markup import items, tables
from ingest.official.report import NPS, Bounds, Page, Report, make_report


@dataclass(frozen=True)
class TablePage(Page):
    """Column titles are matched as lowercase fragments of the header cell.
    extras are columns quoted ahead of the report as "Title: value"."""

    name: str = "trail name"
    text: str = "conditions"
    date: str = "update"
    extras: tuple[str, ...] = ()


def _page(
    source: str, unit: str, url: str, bounds: Bounds, extras: tuple[str, ...] = ()
) -> TablePage:
    return TablePage(source, NPS, unit, url, bounds, extras=extras)


PAGES = {
    "nps-mora-trails": _page(
        "nps-mora-trails", "Mount Rainier National Park",
        "https://www.nps.gov/mora/planyourvisit/trails-and-backcountry-camp-conditions.htm",
        (46.70, -122.0, 47.05, -121.40),
        extras=("snow cover",),
    ),
    "nps-olym-trails": _page(
        "nps-olym-trails", "Olympic National Park",
        "https://www.nps.gov/olym/planyourvisit/wilderness-trail-conditions.htm",
        (47.3, -124.8, 48.4, -122.9),
    ),
}
_NOTHING_REPORTED = re.compile(r"no (recent|current) reports?\.?", re.IGNORECASE)
_SUMMARY = "summary"


def _column(header: list[str], fragment: str) -> int | None:
    for at, title in enumerate(header):
        if fragment in title.lower():
            return at
    return None


def parse(html: str, page: TablePage, fetched_at: datetime) -> list[Report]:
    out: list[Report] = []
    for table in tables(items(html)):
        if not table.rows:
            continue
        header = [" ".join(cell) for cell in table.rows[0]]
        name_at = _column(header, page.name)
        text_at = _column(header, page.text)
        date_at = _column(header, page.date)
        if name_at is None or text_at is None or date_at is None:
            continue
        extras = [at for f in page.extras if (at := _column(header, f)) is not None]
        for row in table.rows[1:]:
            if len(row) != len(header):
                continue
            lines = table.words(row[text_at])
            if any(_NOTHING_REPORTED.fullmatch(line) for line in lines):
                continue
            quoted = [
                f"{header[at]}: {' '.join(row[at])}" for at in extras if row[at]
            ]
            place = " ".join(row[name_at])
            if place.lower() == _SUMMARY:
                place = table.heading
            report = make_report(
                page, place, quoted + lines, parse_date(" ".join(row[date_at])),
                fetched_at, table.heading,
            )
            if report:
                out.append(report)
    return out


def fetch(client: Client) -> list[Report] | None:
    """Reports from both parks; None when neither page could be read."""
    found: list[Report] = []
    answered = False
    for source, page in PAGES.items():
        got = client.get(source, page.url)
        if got is None:
            continue
        answered = True
        found.extend(parse(got.text, page, got.fetched_at))
    return found if answered else None
