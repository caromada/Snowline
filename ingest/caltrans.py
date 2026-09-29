"""California chain controls from the Caltrans district feeds.

Each of the twelve districts publishes its own file. Districts with no
mountain roads answer HTTP 500 instead of an empty list (4, 5 and 12 did on
2026-09-29), so a district failing is routine: it is logged and the others
carry on. Nothing is cached, since yesterday's chain control is not today's.
"""

from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor
from typing import Any

from fusion.roads import parse_caltrans
from ingest.http import FetchError, fetch_json

log = logging.getLogger(__name__)

DISTRICTS = tuple(range(1, 13))
CONCURRENCY = 4
TIMEOUT_S = 45


def district_url(district: int) -> str:
    return f"https://cwwp2.dot.ca.gov/data/d{district}/cc/ccStatusD{district:02d}.json"


def fetch_district(district: int) -> list[dict[str, Any]] | None:
    """One district's control points, or None when its feed is down."""
    try:
        parsed, _, _ = fetch_json(district_url(district), timeout=TIMEOUT_S, cache=False)
    except (FetchError, ValueError) as exc:
        log.info("caltrans district %d unavailable: %s", district, exc)
        return None
    return parse_caltrans(parsed)


def fetch_statuses() -> list[dict[str, Any]] | None:
    """Every reachable district's control points; None when none answered."""
    with ThreadPoolExecutor(max_workers=CONCURRENCY) as pool:
        results = list(pool.map(fetch_district, DISTRICTS))
    down = [d for d, r in zip(DISTRICTS, results, strict=True) if r is None]
    statuses = [s for r in results if r for s in r]
    if len(down) == len(DISTRICTS):
        log.warning("caltrans: no district feed answered")
        return None
    log.info(
        "caltrans: %d control points, %d with controls in effect, districts down: %s",
        len(statuses),
        sum(1 for s in statuses if s["active"]),
        ", ".join(map(str, down)) or "none",
    )
    return statuses
