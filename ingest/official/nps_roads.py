"""National Park Service road status tables, dated by the page they are on.

Yosemite, Mount Rainier and Crater Lake each keep a table of park roads
with OPEN or CLOSED beside each. No row has a date of its own; the page
has one, and every row takes it. A page edited for some other reason gets a
new date without anyone having looked at the roads, so these reports are
the weakest dated of all the sources. They are kept because the parks
change these tables the day a road opens or closes.

The status is put first and the notes after it. The words are the park's;
only that order is ours, so that a long description cannot push OPEN or
CLOSED past the point where the app stops quoting.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from ingest.official.client import Client
from ingest.official.markup import items, tables, updated_on
from ingest.official.report import NPS, Page, Report, make_report

_COLUMN_TITLES = {"status", "current status"}


@dataclass(frozen=True)
class RoadPage(Page):
    """heading is the heading the road table sits under, which is what
    tells it from the other tables on the page."""

    heading: str = "Road Status"


PAGES = {
    "nps-yose-roads": RoadPage(
        "nps-yose-roads", NPS, "Yosemite National Park",
        "https://www.nps.gov/yose/planyourvisit/conditions.htm",
        (37.45, -119.95, 38.25, -119.15),
    ),
    "nps-mora-roads": RoadPage(
        "nps-mora-roads", NPS, "Mount Rainier National Park",
        "https://www.nps.gov/mora/planyourvisit/road-status.htm",
        (46.70, -122.0, 47.05, -121.40),
    ),
    "nps-crla-roads": RoadPage(
        "nps-crla-roads", NPS, "Crater Lake National Park",
        "https://www.nps.gov/crla/planyourvisit/conditions.htm",
        (42.75, -122.35, 43.10, -121.90),
        heading="Status of Park Roads",
    ),
}


def parse(html: str, page: RoadPage, fetched_at: datetime) -> list[Report]:
    stream = items(html)
    issued = updated_on(stream)
    if issued is None:
        return []
    out: list[Report] = []
    for table in tables(stream):
        if table.heading.lower() != page.heading.lower():
            continue
        for row in table.rows:
            if len(row) < 2 or not row[0] or not row[-1]:
                continue
            if " ".join(row[-1]).lower() in _COLUMN_TITLES:
                continue
            status = table.words(row[-1])
            if not status:
                continue
            if len(row) == 2:
                place, notes = row[0][0], table.words(row[0][1:])
            else:
                place = " ".join(row[0])
                notes = [line for cell in row[1:-1] for line in table.words(cell)]
            report = make_report(
                page, place, [status[0], *notes, *status[1:]], issued, fetched_at,
                table.heading,
            )
            if report:
                out.append(report)
    return out


def fetch(client: Client) -> dict[str, list[Report] | None]:
    """source -> its reports, or None for a page that could not be read."""
    found: dict[str, list[Report] | None] = {}
    for source, page in PAGES.items():
        got = client.get(source, page.url)
        found[source] = parse(got.text, page, got.fetched_at) if got else None
    return found
