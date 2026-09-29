"""National Weather Service forecasts at every pass.

Each pass resolves once to its NWS forecast grid cell (/points), snapshotted
in data/stations like the sensor directories and refreshed quarterly. Each
run then fetches every unique cell's raw grid (/gridpoints, ~9 KB gzipped)
and writes data/forecast/passes.json for the pipeline to merge.

A cell that fails simply has no forecast today; the pass panel says so.

Usage: python -m ingest.nws
"""

from __future__ import annotations

import json
import logging
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from typing import Any

from config import DATA_DIR, REGION
from fusion.forecast import PACIFIC, headline, summarize
from gazetteer import load_passes
from ingest.directory import station_directory
from ingest.http import FetchError, fetch_json

log = logging.getLogger(__name__)

API = "https://api.weather.gov"
FORECAST_PATH = DATA_DIR / "forecast" / "passes.json"
POINTS_MAX_AGE_DAYS = 90
CONCURRENCY = 6
# The whole grid pass normally takes about two minutes. If the NWS is
# throttling, stop at the budget rather than hold up the daily run; cells are
# fetched most important first, so what is left out is the least visited.
GRID_BUDGET_S = 15 * 60
BATCH = 60


def _point(p: dict[str, Any]) -> dict[str, Any] | None:
    try:
        parsed, _, _ = fetch_json(f"{API}/points/{p['lat']:.4f},{p['lon']:.4f}", cache=False)
    except (FetchError, ValueError) as exc:
        log.warning("nws points failed for %s: %s", p["slug"], exc)
        return None
    props = (parsed or {}).get("properties", {}) if isinstance(parsed, dict) else {}
    if not props.get("gridId"):
        return None
    return {"slug": p["slug"], "wfo": props["gridId"], "x": props["gridX"], "y": props["gridY"]}


def _fetch_points() -> list[dict[str, Any]]:
    with ThreadPoolExecutor(max_workers=CONCURRENCY) as pool:
        return [r for r in pool.map(_point, load_passes()) if r]


def grid_points() -> dict[str, dict[str, Any]]:
    """slug -> {wfo, x, y}, via the snapshotted directory."""
    rows = station_directory(
        f"nws-points-{REGION}", _fetch_points, max_age_days=POINTS_MAX_AGE_DAYS
    )
    return {r["slug"]: r for r in rows}


def _grid(cell: tuple[str, int, int]) -> tuple[tuple[str, int, int], dict[str, Any] | None]:
    wfo, x, y = cell
    try:
        parsed, _, _ = fetch_json(f"{API}/gridpoints/{wfo}/{x},{y}", timeout=45, cache=False)
    except (FetchError, ValueError) as exc:
        log.warning("nws grid %s/%s,%s failed: %s", wfo, x, y, exc)
        return cell, None
    props = parsed.get("properties") if isinstance(parsed, dict) else None
    return cell, props


def _priority(points: dict[str, dict[str, Any]]) -> list[tuple[str, int, int]]:
    """Cells ordered featured-first, then by the highest pass they hold."""
    rank: dict[tuple[str, int, int], tuple[int, int]] = {}
    for p in load_passes():
        pt = points.get(p["slug"])
        if not pt:
            continue
        cell = (pt["wfo"], pt["x"], pt["y"])
        score = (1 if p.get("tier") == "featured" else 0, p["elevation_ft"])
        rank[cell] = max(rank.get(cell, (0, 0)), score)
    return sorted(rank, key=lambda c: rank[c], reverse=True)


def run() -> dict[str, Any]:
    points = grid_points()
    cells = _priority(points)
    log.info("nws: %d passes on %d grid cells", len(points), len(cells))
    grids: dict[tuple[str, int, int], dict[str, Any] | None] = {}
    started = time.monotonic()
    with ThreadPoolExecutor(max_workers=CONCURRENCY) as pool:
        for i in range(0, len(cells), BATCH):
            if time.monotonic() - started > GRID_BUDGET_S:
                log.warning("nws: time budget spent, %d cells left for tomorrow", len(cells) - i)
                break
            grids.update(pool.map(_grid, cells[i : i + BATCH]))
    today = datetime.now(PACIFIC).date()
    out: dict[str, Any] = {}
    for p in load_passes():
        pt = points.get(p["slug"])
        grid = grids.get((pt["wfo"], pt["x"], pt["y"])) if pt else None
        if not grid:
            continue
        days = summarize(grid, p["elevation_ft"], today)
        out[p["slug"]] = {
            "days": days,
            "facts": headline(days, p["elevation_ft"], today),
            "source": (
                f"https://forecast.weather.gov/MapClick.php?lat={p['lat']:.4f}&lon={p['lon']:.4f}"
            ),
            "grid_elevation_ft": round(
                float((grid.get("elevation") or {}).get("value") or 0) * 3.28084
            ),
        }
    doc = {
        "generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
        "issued_for": today.isoformat(),
        "passes": out,
    }
    FORECAST_PATH.parent.mkdir(parents=True, exist_ok=True)
    FORECAST_PATH.write_text(json.dumps(doc, separators=(",", ":")))
    failed = sum(1 for g in grids.values() if g is None)
    log.info("nws: forecasts for %d passes, %d of %d cells failed", len(out), failed, len(cells))
    return doc


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    doc = run()
    print(f"forecasts for {len(doc['passes'])} passes, issued for {doc['issued_for']}")
