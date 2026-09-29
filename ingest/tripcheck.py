"""Oregon road and weather reports from the ODOT TripCheck API.

Needs a free subscription key in TRIPCHECK_API_KEY (sign up at
https://apiportal.odot.state.or.us/ and subscribe to the TripCheck Data
API). Without one the module logs a line and returns nothing.

Reports carry numeric ids; ODOT's own words for them come from the metadata
endpoint. If the metadata cannot be fetched the reports are not shown at
all, because an id without its description would have to be guessed.
"""

from __future__ import annotations

import logging
import os
from typing import Any

from fusion.roads import parse_tripcheck
from ingest.http import FetchError, fetch_json
from ingest.raw import Recorder
from ingest.wsdot import redact

log = logging.getLogger(__name__)

ENV_KEY = "TRIPCHECK_API_KEY"
BASE = "https://api.odot.state.or.us/tripcheck"
TIMEOUT_S = 45


def fetch_statuses(record: Recorder | None = None) -> list[dict[str, Any]] | None:
    key = os.environ.get(ENV_KEY, "").strip()
    if not key:
        log.info("tripcheck: %s is not set; skipping Oregon road reports", ENV_KEY)
        return None
    # The gateway takes the key as a query parameter as well as a header,
    # and ingest.http sends no custom headers.
    params = {"subscription-key": key}
    found = []
    try:
        for path in ("/RW/Metadata", "/RW/Reports"):
            parsed, raw, _ = fetch_json(BASE + path, params, timeout=TIMEOUT_S, cache=False)
            found.append((path, parsed, raw))
    except (FetchError, ValueError) as exc:
        log.warning("tripcheck road reports unavailable: %s", redact(exc, key))
        return None
    if record:
        for path, _, raw in found:
            record("tripcheck", BASE + path, raw)
    meta, reports = found[0][1], found[1][1]
    statuses = parse_tripcheck(reports, meta)
    if not statuses:
        log.warning("tripcheck answered without any readable road report")
        return None
    log.info(
        "tripcheck: %d road reports, %d with a driving restriction",
        len(statuses),
        sum(1 for s in statuses if s["active"]),
    )
    return statuses
