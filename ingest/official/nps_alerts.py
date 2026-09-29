"""National Park Service alerts: closures, cautions and conditions notices.

The alerts a park shows at the top of its pages are loaded by script and
are not in the page. They come from the official developer API, which
needs a free key in NPS_API_KEY (register at
https://www.nps.gov/subjects/developer/get-started.htm). Without one the
module logs a line and returns nothing.

The only date the API gives an alert is lastIndexedDate. Whether that is
the day the park posted it or the day the index last touched it could not
be checked without a key, so it is the first thing to look at once one is
registered.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime

from ingest.official.client import Client
from ingest.official.dates import parse_date
from ingest.official.report import NPS, Page, Report, make_report

log = logging.getLogger(__name__)

ENV_KEY = "NPS_API_KEY"
URL = "https://developer.nps.gov/api/v1/alerts"
LIMIT = 200
SOURCE = "nps-alerts"

PARKS = {
    "yose": Page(
        SOURCE, NPS, "Yosemite National Park",
        "https://www.nps.gov/yose/planyourvisit/conditions.htm",
        (37.45, -119.95, 38.25, -119.15),
    ),
    "seki": Page(
        SOURCE, NPS, "Sequoia and Kings Canyon National Parks",
        "https://www.nps.gov/seki/planyourvisit/conditions.htm",
        (36.25, -119.0, 37.25, -118.15),
    ),
    "depo": Page(
        SOURCE, NPS, "Devils Postpile National Monument",
        "https://www.nps.gov/depo/planyourvisit/conditions.htm",
        (37.55, -119.15, 37.70, -119.02),
    ),
    "lavo": Page(
        SOURCE, NPS, "Lassen Volcanic National Park",
        "https://www.nps.gov/lavo/planyourvisit/conditions.htm",
        (40.33, -121.70, 40.65, -121.10),
    ),
    "crla": Page(
        SOURCE, NPS, "Crater Lake National Park",
        "https://www.nps.gov/crla/planyourvisit/conditions.htm",
        (42.75, -122.35, 43.10, -121.90),
    ),
    "mora": Page(
        SOURCE, NPS, "Mount Rainier National Park",
        "https://www.nps.gov/mora/planyourvisit/conditions.htm",
        (46.70, -122.0, 47.05, -121.40),
    ),
    "noca": Page(
        SOURCE, NPS, "North Cascades National Park Service Complex",
        "https://www.nps.gov/noca/planyourvisit/conditions.htm",
        (48.20, -121.75, 49.01, -120.55),
    ),
    "olym": Page(
        SOURCE, NPS, "Olympic National Park",
        "https://www.nps.gov/olym/planyourvisit/conditions.htm",
        (47.3, -124.8, 48.4, -122.9),
    ),
}


def _words(value: object) -> str:
    return value.strip() if isinstance(value, str) else ""


def parse(doc: object, fetched_at: datetime) -> list[Report]:
    rows = doc.get("data") if isinstance(doc, dict) else None
    out: list[Report] = []
    for row in rows if isinstance(rows, list) else []:
        if not isinstance(row, dict):
            continue
        park = PARKS.get(_words(row.get("parkCode")).lower())
        if park is None:
            continue
        link = _words(row.get("url"))
        report = make_report(
            park,
            _words(row.get("title")),
            [_words(row.get("description"))],
            parse_date(_words(row.get("lastIndexedDate"))),
            fetched_at,
            _words(row.get("category")),
            url=link if link.startswith("https://www.nps.gov/") else None,
        )
        if report:
            out.append(report)
    return out


def fetch(client: Client) -> list[Report] | None:
    key = os.environ.get(ENV_KEY, "").strip()
    if not key:
        log.info("nps alerts: %s is not set; skipping park alerts", ENV_KEY)
        return None
    # The gateway takes the key as a query parameter as well as a header,
    # and ingest.http sends no custom headers.
    params = {"parkCode": ",".join(PARKS), "limit": str(LIMIT), "api_key": key}
    got = client.get_json(SOURCE, URL, params, secret=key)
    if got is None:
        return None
    return parse(got.parsed, got.fetched_at)
