"""Official avalanche forecast zones from the avalanche.org map layer.

One public GeoJSON document carries every US forecast zone with the danger
rating its avalanche center issued. It is fetched whole and never cached: a
rating from an earlier day must not stand in for today's.
"""

from __future__ import annotations

import logging
from typing import Any

from fusion.avalanche import parse_zones
from ingest.http import FetchError, fetch_json

log = logging.getLogger(__name__)

MAP_LAYER_URL = "https://api.avalanche.org/v2/public/products/map-layer"
TIMEOUT_S = 60


def fetch_zones() -> list[dict[str, Any]] | None:
    """Zones touching the region, or None when the layer is unavailable."""
    try:
        parsed, _, _ = fetch_json(MAP_LAYER_URL, timeout=TIMEOUT_S, cache=False)
    except (FetchError, ValueError) as exc:
        log.warning("avalanche map layer unavailable: %s", exc)
        return None
    zones = parse_zones(parsed)
    if not zones:
        log.warning("avalanche map layer held no zones in the region; treating it as down")
        return None
    rated = sum(1 for z in zones if z["properties"].get("danger_level") in (1, 2, 3, 4, 5))
    log.info("avalanche: %d zones in the region, %d with a rating", len(zones), rated)
    return zones
