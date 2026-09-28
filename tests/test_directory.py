import json
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from ingest.directory import reset_memo, station_directory
from ingest.http import FetchError

NOW = datetime(2026, 9, 28, tzinfo=UTC)
STATIONS = [{"id": str(i)} for i in range(10)]


@pytest.fixture(autouse=True)
def _fresh_memo() -> None:
    reset_memo()


def _snapshot(tmp: Path, stations: list[dict], age_days: float) -> None:
    doc = {"fetched_at": (NOW - timedelta(days=age_days)).isoformat(), "stations": stations}
    (tmp / "usgs.json").write_text(json.dumps(doc))


def _boom() -> list[dict]:
    raise FetchError("503 from upstream")


def test_fresh_snapshot_skips_the_network(tmp_path: Path) -> None:
    _snapshot(tmp_path, STATIONS, age_days=2)
    assert station_directory("usgs", _boom, tmp_path, NOW) == STATIONS


def test_stale_snapshot_refreshes_and_rewrites(tmp_path: Path) -> None:
    _snapshot(tmp_path, STATIONS, age_days=30)
    live = [*STATIONS, {"id": "new"}]
    assert station_directory("usgs", lambda: live, tmp_path, NOW) == live
    saved = json.loads((tmp_path / "usgs.json").read_text())
    assert saved["stations"] == live
    assert saved["fetched_at"].startswith("2026-09-28")


def test_outage_falls_back_to_snapshot(tmp_path: Path) -> None:
    _snapshot(tmp_path, STATIONS, age_days=30)
    assert station_directory("usgs", _boom, tmp_path, NOW) == STATIONS


def test_outage_without_snapshot_raises(tmp_path: Path) -> None:
    with pytest.raises(FetchError):
        station_directory("usgs", _boom, tmp_path, NOW)


def test_short_live_answer_keeps_snapshot(tmp_path: Path) -> None:
    _snapshot(tmp_path, STATIONS, age_days=30)
    truncated = STATIONS[:3]
    assert station_directory("usgs", lambda: truncated, tmp_path, NOW) == STATIONS
    assert json.loads((tmp_path / "usgs.json").read_text())["stations"] == STATIONS


def test_resolved_once_per_process(tmp_path: Path) -> None:
    calls = []

    def live() -> list[dict]:
        calls.append(1)
        return STATIONS

    for _ in range(9):
        station_directory("usgs", live, tmp_path, NOW)
    assert len(calls) == 1
