"""Yosemite's wilderness conditions update: one date, then prose by area.

The rangers date the bulletin once, under its first heading, and write a
few sentences for each part of the park. Every paragraph becomes a report
for its area, carrying the bulletin's date. The "Last updated" line at the
foot of the page is the web editor's and can be newer than the bulletin; it
is not used.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from ingest.official.client import Client
from ingest.official.dates import parse_date
from ingest.official.markup import items
from ingest.official.report import NPS, Page, Report, make_report

_AREA_LEVEL = 3


@dataclass(frozen=True)
class BulletinPage(Page):
    """opens_with is the heading the dated bulletin sits under. standing
    names the sections that never change and report nothing."""

    opens_with: str = "General Conditions"
    standing: tuple[str, ...] = ()


PAGES = {
    "nps-yose-wilderness": BulletinPage(
        "nps-yose-wilderness", NPS, "Yosemite National Park",
        "https://www.nps.gov/yose/planyourvisit/wildcond.htm",
        (37.45, -119.95, 38.25, -119.15),
        standing=("Outside of Yosemite", "Current Closures", "General Conditions by Season"),
    ),
}


def parse(html: str, page: BulletinPage, fetched_at: datetime) -> list[Report]:
    stream = items(html)
    opening = next(
        (
            at for at, item in enumerate(stream)
            if item.kind == "heading" and item.text == page.opens_with
        ),
        None,
    )
    if opening is None or opening + 1 >= len(stream):
        return []
    dateline = stream[opening + 1]
    issued = parse_date(dateline.text) if dateline.kind == "line" else None
    if issued is None:
        return []
    out: list[Report] = []
    area = None
    for item in stream[opening + 2:]:
        if item.kind == "heading":
            if item.level < _AREA_LEVEL:
                break
            named = item.level == _AREA_LEVEL and item.text not in page.standing
            area = item.text if named else None
        elif item.kind == "line" and area:
            report = make_report(page, area, [item.text], issued, fetched_at, page.opens_with)
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
