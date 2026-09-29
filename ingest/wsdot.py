"""Washington mountain pass reports from the WSDOT Traveler Information API.

Needs a free access code in WSDOT_ACCESS_CODE (register an email address at
https://wsdot.wa.gov/traffic/api/). Without one the module logs a line and
returns nothing; Washington passes then simply carry no road status.
"""

from __future__ import annotations

import logging
import os
from typing import Any

from fusion.roads import parse_wsdot
from ingest.http import FetchError, fetch_json

log = logging.getLogger(__name__)

ENV_KEY = "WSDOT_ACCESS_CODE"
URL = (
    "https://wsdot.wa.gov/Traffic/api/MountainPassConditions/"
    "MountainPassConditionsREST.svc/GetMountainPassConditionsAsJson"
)
TIMEOUT_S = 45


def redact(message: object, secret: str) -> str:
    """The access code travels in the query string, and requests quotes the
    full URL in its errors. It must never reach a log."""
    return str(message).replace(secret, "[redacted]") if secret else str(message)


def fetch_statuses() -> list[dict[str, Any]] | None:
    code = os.environ.get(ENV_KEY, "").strip()
    if not code:
        log.info("wsdot: %s is not set; skipping Washington pass reports", ENV_KEY)
        return None
    try:
        parsed, _, _ = fetch_json(URL, {"AccessCode": code}, timeout=TIMEOUT_S, cache=False)
    except (FetchError, ValueError) as exc:
        log.warning("wsdot pass reports unavailable: %s", redact(exc, code))
        return None
    statuses = parse_wsdot(parsed)
    if not statuses:
        log.warning("wsdot answered without any readable pass report")
        return None
    log.info(
        "wsdot: %d pass reports, %d with a restriction or advisory",
        len(statuses),
        sum(1 for s in statuses if s["active"]),
    )
    return statuses
