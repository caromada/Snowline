"""National Park Service trail pages where each report opens with its date.

Sequoia and Kings Canyon writes a heading for the place and a line under it
("09/21/2026 - Copper Creek is still running"). North Cascades keeps a table
of trails and stacks dated lines in one cell, newest first, most of them
with no year ("9/29-The entirety of the Cascade Pass Trail").

The year of a yearless date is taken from the date at the top of the page.
That is wrong for a line written last year and never given its year, if its
month and day also fall inside the window the app shows. North Cascades
does add the year to lines it carries over ("7/24/25:"), which is the only
reason this source is read at all.
"""

from __future__ import annotations

from datetime import date, datetime

from ingest.official.client import Client
from ingest.official.dates import leading_date, parse_date
from ingest.official.markup import ACCORDION, Item, items, tables, updated_on
from ingest.official.report import NPS, Page, Report, make_report

PAGES = {
    "nps-seki-trails": Page(
        "nps-seki-trails", NPS, "Sequoia and Kings Canyon National Parks",
        "https://www.nps.gov/seki/planyourvisit/trailcond.htm",
        (36.25, -119.0, 37.25, -118.15),
    ),
    "nps-noca-trails": Page(
        "nps-noca-trails", NPS, "North Cascades National Park Service Complex",
        "https://www.nps.gov/noca/planyourvisit/trail-conditions.htm",
        (48.20, -121.75, 49.01, -120.55),
    ),
}
# A line this short with no full stop is read as the name of a place.
NAME_MAX_CHARS = 80
_NAME_COLUMN = "trail name"
_REPORT_COLUMN = "reported conditions"


def _names_a_place(text: str) -> bool:
    return len(text) <= NAME_MAX_CHARS and not text.endswith((".", ":", ","))


def parse_headed(html: str, page: Page, fetched_at: datetime) -> list[Report]:
    """A dated line belongs to the heading or short bold line right above
    it. Prose in between breaks the tie, and the dated line is dropped."""
    out: list[Report] = []
    section, place = "", None
    for item in items(html):
        if item.kind == "heading":
            if item.level == ACCORDION:
                section = item.text
            place = item.text if 4 <= item.level <= 6 else None
        elif item.kind == "line":
            dated = leading_date(item.text)
            if dated is None:
                place = item.text if _names_a_place(item.text) else None
            elif place:
                report = make_report(page, place, [dated[1]], dated[0], fetched_at, section)
                if report:
                    out.append(report)
    return out


def _page_date(stream: list[Item]) -> date | None:
    for item in stream:
        if item.kind == "line" and (found := parse_date(item.text)):
            return found
    return updated_on(stream)


def parse_table_lines(html: str, page: Page, fetched_at: datetime) -> list[Report]:
    stream = items(html)
    page_date = _page_date(stream)
    if page_date is None:
        return []
    out: list[Report] = []
    for table in tables(stream):
        if not table.rows:
            continue
        header = [" ".join(cell).lower() for cell in table.rows[0]]
        if _NAME_COLUMN not in header or _REPORT_COLUMN not in header:
            continue
        name_at, report_at = header.index(_NAME_COLUMN), header.index(_REPORT_COLUMN)
        for row in table.rows[1:]:
            if len(row) != len(header):
                continue
            place = " ".join(row[name_at])
            for line in table.words(row[report_at]):
                dated = leading_date(line, page_date)
                if dated is None:
                    continue
                report = make_report(
                    page, place, [dated[1]], dated[0], fetched_at, table.heading
                )
                if report:
                    out.append(report)
    return out


def fetch(client: Client) -> list[Report] | None:
    """Reports from both parks; None when neither page could be read."""
    found: list[Report] = []
    answered = False
    for source, parse in (
        ("nps-seki-trails", parse_headed),
        ("nps-noca-trails", parse_table_lines),
    ):
        page = PAGES[source]
        got = client.get(source, page.url)
        if got is None:
            continue
        answered = True
        found.extend(parse(got.text, page, got.fetched_at))
    return found if answered else None
