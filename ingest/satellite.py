"""Satellite fractional snow cover over pass polygons.

Two halves:

1. The real sampling logic (`sample_snow_cover`): given per-pixel NDSI and
   cloud flags for points falling in a pass polygon, produce a fractional
   snow cover observation, or nothing when cloud cover eats the scene. This
   is the part that runs against VIIRS/MODIS or Sentinel-2 NDSI once an
   Earthdata token is configured, and it is unit tested.

2. The modeled demo generator (`ingest_modeled`): NSIDC needs authenticated
   downloads this public demo cannot assume, so demo satellite observations
   are derived from the nearest snow sensor's SWE curve plus an elevation
   adjustment, on a 3-day revisit cycle with deterministic cloud gaps.
   Every such row carries provenance "satellite:modeled" and the UI labels
   it modeled cover. Nothing pretends to be a real scene.
"""

from __future__ import annotations

import hashlib
import logging
from typing import Any

from gazetteer import load_passes
from ingest.geo import point_in_ring
from store import Store

log = logging.getLogger(__name__)

NDSI_SNOW_THRESHOLD = 0.4
MAX_CLOUD_FRACTION = 0.4
REVISIT_DAYS = 3
# Snow persists longer above the sensor: treat every 1000 ft of elevation
# gain as roughly 4 in of extra SWE on the melt curve.
SWE_PER_1000FT = 4.0
SWE_FULL_COVER_IN = 20.0


def sample_snow_cover(
    polygon: dict[str, Any],
    samples: list[tuple[float, float, float, bool]],
) -> dict[str, float] | None:
    """Fractional snow cover from (lon, lat, ndsi, is_cloud) samples.

    Returns {"snow_cover_frac", "cloud_frac", "n"} or None when the scene is
    unusable (no samples inside, or too cloudy to trust).
    """
    ring = polygon["coordinates"][0]
    inside = [(ndsi, cloud) for lon, lat, ndsi, cloud in samples if point_in_ring(lon, lat, ring)]
    if not inside:
        return None
    cloud_frac = sum(1 for _, c in inside if c) / len(inside)
    if cloud_frac > MAX_CLOUD_FRACTION:
        return None
    clear = [(ndsi, c) for ndsi, c in inside if not c]
    snow = sum(1 for ndsi, _ in clear if ndsi >= NDSI_SNOW_THRESHOLD)
    return {
        "snow_cover_frac": round(snow / len(clear), 3),
        "cloud_frac": round(cloud_frac, 3),
        "n": float(len(inside)),
    }


def _cloudy(slug: str, date: str) -> bool:
    """Deterministic pseudo-weather: ~30% of revisits are cloud-masked."""
    digest = hashlib.sha256(f"{slug}:{date}".encode()).digest()
    return digest[0] % 10 < 3


def modeled_cover_frac(swe_in: float, pass_elev_ft: float, station_elev_ft: float) -> float:
    """Fractional cover from sensor SWE, adjusted for elevation difference."""
    bonus = max(0.0, (pass_elev_ft - station_elev_ft) / 1000.0) * SWE_PER_1000FT
    effective = swe_in + (bonus if swe_in > 0.5 else bonus * swe_in / 0.5 if swe_in > 0 else 0.0)
    return round(min(1.0, max(0.0, effective / SWE_FULL_COVER_IN)), 3)


def ingest_modeled(store: Store, begin: str, end: str) -> int:
    """Demo observations on the revisit cycle, derived from sensor SWE.

    Sensor rows are stored once per station; each pass reads its nearest
    linked snow station's curve here.
    """
    from ingest.cdec import pass_links

    links = pass_links(store)
    count = 0
    for p in load_passes():
        linked = links.get(p["slug"], [])
        if not linked:
            continue
        nearest = linked[0]
        swe_rows = [
            r
            for r in store.observations(
                f"@{nearest['provenance']}", stream="cdec", start=begin, end=end
            )
            if r["metric"] == "swe_in"
        ]
        if not swe_rows:
            continue
        curve = {r["observed_date"]: r for r in swe_rows}
        dates = sorted(curve)
        for i, date in enumerate(dates):
            if i % REVISIT_DAYS != 0:
                continue
            if _cloudy(p["slug"], date):
                continue
            row = curve[date]
            elev = row["meta"].get("station_elevation_ft") or p["elevation_ft"]
            frac = modeled_cover_frac(row["value"], p["elevation_ft"], elev)
            store.add_observation(
                p["slug"], "satellite", "snow_cover_frac", date, frac, "frac",
                "satellite:modeled", None,
                {"type": "Point", "coordinates": [p["lon"], p["lat"]]},
                {
                    "modeled": True,
                    "from_station": row["provenance"],
                    "station_swe_in": row["value"],
                    "note": "demo cover derived from sensor SWE, not a real scene",
                },
            )
            count += 1
    log.info("satellite: %d modeled cover observations", count)
    return count
