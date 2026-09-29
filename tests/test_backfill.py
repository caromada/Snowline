from datetime import date
from pathlib import Path

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


def _flaky(stream: str, failures: int, calls: list[str]):  # noqa: ANN202 - test helper factory
    """Fails the first `failures` calls, then writes like a healthy upstream."""

    def step(store: Store, begin: str, end: str) -> int:
        calls.append(begin)
        if len(calls) <= failures:
            raise FetchError("503")
        _obs(store, stream, begin, 9.0)
        return 1

    return step


def test_a_failed_stream_is_retried_after_a_pause(monkeypatch: pytest.MonkeyPatch) -> None:
    s = Store(":memory:")
    usgs_calls: list[str] = []
    cdec_calls: list[str] = []
    monkeypatch.setattr(
        backfill,
        "STREAMS",
        [
            ("usgs", "usgs", [_flaky("usgs", 2, usgs_calls)]),
            ("cdec", "cdec", [_flaky("cdec", 0, cdec_calls)]),
        ],
    )
    naps: list[float] = []
    ok, failures = backfill.ingest_windows(
        s, [("2026-04-01", "2026-09-29", None)], sleep=naps.append, pauses=(60, 180, 300)
    )
    assert failures == []
    assert ok == {"usgs", "cdec"}
    assert naps == [60, 180]  # recovered on the second retry; the third pause never ran
    assert len(usgs_calls) == 3
    assert len(cdec_calls) == 1  # a healthy stream is never pulled twice
    assert _values(s, "usgs") == [9.0]


def test_retries_give_up_and_name_what_is_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    s = Store(":memory:")
    monkeypatch.setattr(backfill, "STREAMS", [("usgs", "usgs", [_failing("usgs")])])
    ok, failures = backfill.ingest_windows(
        s,
        [("2025-04-01", "2025-08-31", None), ("2026-04-01", "2026-09-29", None)],
        sleep=lambda _: None,
        pauses=(1, 1),
    )
    assert ok == set()
    assert failures == [("2025-04-01", "2025-08-31", "usgs"), ("2026-04-01", "2026-09-29", "usgs")]
    assert _values(s, "usgs") == []  # every partial write was rolled back


def test_pending_windows_round_trip(tmp_path: Path) -> None:
    path = tmp_path / "rebuild_pending.json"
    assert backfill.load_pending(path) == []
    backfill.save_pending(path, [("2026-04-01", "2026-09-29", "usgs")])
    assert backfill.load_pending(path) == [("2026-04-01", "2026-09-29", "usgs")]
    backfill.save_pending(path, [])
    assert not path.exists()  # nothing pending leaves no file behind


def test_a_failed_rebuild_resumes_with_only_what_was_missing(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    s = Store(":memory:")
    path = tmp_path / "rebuild_pending.json"
    today = date(2026, 9, 30)
    for stream in ("snotel", "cdec", "usgs"):
        _obs(s, stream, "2023-06-15", 1.0)
    for stream in ("snotel", "cdec"):
        _obs(s, stream, "2026-09-29", 1.0)
    backfill.save_pending(path, [("2026-04-01", "2026-09-29", "usgs")])

    mode, windows = backfill.plan(s, path, today)
    assert mode == "resume"
    assert windows == [("2026-04-01", "2026-09-29", {"usgs"})]

    # With nothing pending the same store is an ordinary daily run.
    backfill.save_pending(path, [])
    mode, windows = backfill.plan(s, path, today)
    assert mode == "daily"
    assert windows[0][2] is None

    # And an empty store is a rebuild of every season.
    mode, windows = backfill.plan(Store(":memory:"), path, today)
    assert mode == "rebuild"
    assert [w[0] for w in windows] == ["2023-04-01", "2024-04-01", "2025-04-01", "2026-04-01"]
