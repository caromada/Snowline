from datetime import date

import pytest

from ingest.http import FetchError
from scripts import backfill
from store import Store


def _obs(store: Store, stream: str, day: str, value: float) -> None:
    store.add_observation(
        f"@{stream}:X", stream, "swe_in", day, value, "in", f"{stream}:X", None, None, {}
    )


def _writer(stream: str, value: float):  # noqa: ANN202 - test helper factory
    def step(store: Store, begin: str, end: str) -> int:
        _obs(store, stream, begin, value)
        return 1

    return step


def _failing(stream: str):  # noqa: ANN202 - test helper factory
    def step(store: Store, begin: str, end: str) -> int:
        _obs(store, stream, begin, -1.0)  # partial write before the upstream dies
        raise FetchError("503")

    return step


def _values(store: Store, stream: str) -> list[float]:
    return sorted(r["value"] for r in store.observations(f"@{stream}:X", stream=stream))


def test_success_replaces_the_window(monkeypatch: pytest.MonkeyPatch) -> None:
    s = Store(":memory:")
    _obs(s, "snotel", "2026-09-20", 1.0)
    monkeypatch.setattr(backfill, "STREAMS", [("snotel", "snotel", [_writer("snotel", 2.0)])])
    counts, failed = backfill.run("2026-09-20", "2026-09-28", s)
    assert counts == {"snotel": 1} and failed == []
    assert _values(s, "snotel") == [2.0]


def test_one_stream_down_keeps_its_rows_and_others_proceed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    s = Store(":memory:")
    _obs(s, "usgs", "2026-09-20", 7.0)
    monkeypatch.setattr(
        backfill,
        "STREAMS",
        [
            ("usgs", "usgs", [_failing("usgs")]),
            ("cdec", "cdec", [_writer("cdec", 3.0)]),
        ],
    )
    counts, failed = backfill.run("2026-09-20", "2026-09-28", s)
    assert failed == ["usgs"]
    assert counts == {"cdec": 1}
    assert _values(s, "usgs") == [7.0]  # old row kept, partial write rolled back
    assert _values(s, "cdec") == [3.0]


def test_empty_answer_is_not_evidence(monkeypatch: pytest.MonkeyPatch) -> None:
    s = Store(":memory:")
    _obs(s, "cdec", "2026-09-20", 5.0)
    monkeypatch.setattr(backfill, "STREAMS", [("cdec", "cdec", [lambda st, b, e: 0])])
    _, failed = backfill.run("2026-09-20", "2026-09-28", s)
    assert failed == ["cdec"]
    assert _values(s, "cdec") == [5.0]


def test_daily_window_needs_history_and_covers_outages() -> None:
    s = Store(":memory:")
    today = date(2026, 9, 28)
    assert backfill.daily_window(s, today) is None  # empty store means full rebuild
    for stream in ("snotel", "cdec", "usgs"):
        _obs(s, stream, "2023-06-15", 1.0)
        _obs(s, stream, "2026-09-27", 1.0)
    assert backfill.daily_window(s, today) == ("2026-09-18", "2026-09-28")
    # A two-week outage on one stream stretches the window to cover the gap.
    s.delete_observations("usgs", "2026-09-01", "2026-09-30")
    _obs(s, "usgs", "2026-09-10", 1.0)
    assert backfill.daily_window(s, today) == ("2026-09-07", "2026-09-28")
