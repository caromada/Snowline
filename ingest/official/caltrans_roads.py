"""Caltrans highway conditions, the text service behind 1-800-427-7623.

One request names every mountain highway; the answer is a heading for each
and a paragraph for each closure, control or roadwork on it, under one
timestamp for the whole page. This is where a winter closure is written
down ("IS CLOSED FROM ... /SONORA PASS/ ... FOR THE WINTER"), which the
chain control feed in ingest/caltrans.py never says.

Caltrans terms: information on its sites is in the public domain unless
marked otherwise. The host serves no robots.txt (404).
"""

from __future__ import annotations

import re
from datetime import datetime

from ingest.official.client import Client
from ingest.official.dates import find_date
from ingest.official.markup import items
from ingest.official.report import Page, Report, make_report

URL = "https://roads.dot.ca.gov/roadscell.php"
# The highways that cross or climb the Sierra Nevada, the southern Cascades
# and the Klamath and Trinity country.
HIGHWAYS = (
    "3", "4", "20", "36", "44", "49", "50", "70", "80", "88", "89", "96", "108", "120",
    "158", "168", "178", "180", "190", "203", "299", "395",
)
PAGE = Page(
    "caltrans-highways", "Caltrans", "California state highways", URL,
    (32.5, -124.5, 42.05, -114.0),
)
_STAMPED = "latest reported as of"
_HIGHWAY = re.compile(r"(?:SR|US|I)[ -]?(\d+)", re.IGNORECASE)
_AREA = re.compile(r"\[(.+)\]")
# Lines the service prints when it has nothing to report, or to send the
# caller to somebody else's telephone line.
_NO_CONDITION = re.compile(
    r"no traffic restrictions are reported|for .{0,40}road information,? call",
    re.IGNORECASE,
)


def parse(html: str, fetched_at: datetime) -> list[Report]:
    stream = items(html)
    stamp = next(
        (i.text for i in stream if i.kind == "line" and _STAMPED in i.text.lower()), None
    )
    issued = find_date(stamp) if stamp else None
    if issued is None:
        return []
    out: list[Report] = []
    highway, number, area = None, None, ""
    for item in stream:
        if item.kind == "heading":
            m = _HIGHWAY.fullmatch(item.text)
            highway, number, area = (item.text, m.group(1), "") if m else (None, None, "")
        elif item.kind == "line" and highway:
            label = _AREA.fullmatch(item.text)
            if label:
                area = label.group(1)
            elif not _NO_CONDITION.match(item.text):
                report = make_report(
                    PAGE, highway, [item.text], issued, fetched_at, area,
                    url=f"{URL}?roadnumber={number}",
                )
                if report:
                    out.append(report)
    return out


def fetch(client: Client) -> dict[str, list[Report] | None]:
    got = client.get(PAGE.source, URL, {"roadnumber": ",".join(HIGHWAYS)})
    return {PAGE.source: parse(got.text, got.fetched_at) if got else None}
