from datetime import date, timedelta
from typing import Any

from fusion.plausibility import screen_swe


def daily(values: list[float], first_day: str, station: str = "cdec:STL") -> list[dict[str, Any]]:
    """One station's readings, one a day from first_day, oldest first."""
    start = date.fromisoformat(first_day)
    return [
        {
            "metric": "swe_in",
            "observed_date": (start + timedelta(days=i)).isoformat(),
            "value": v,
            "provenance": station,
            "meta": {},
        }
        for i, v in enumerate(values)
    ]


def believed_days(series: list[dict[str, Any]]) -> list[str]:
    return [o["observed_date"] for o in screen_swe(series)[0]]


def reasons(series: list[dict[str, Any]]) -> list[str]:
    return [r["reason"] for r in screen_swe(series)[1]]


# -- ceiling -----------------------------------------------------------------


def test_a_reading_no_snowpack_could_hold_is_rejected() -> None:
    series = daily([391.82], "2026-08-12")
    believed, rejected = screen_swe(series)
    assert believed == []
    assert rejected == [{"reading": series[0], "reason": "ceiling", "since": "2026-08-12"}]


def test_the_deepest_pack_of_a_record_year_is_believed() -> None:
    # Farewell Gap, April 2023: the deepest reading in four seasons of data.
    assert believed_days(daily([135.38], "2023-04-10")) == ["2023-04-10"]


def test_a_one_day_spike_costs_only_that_day() -> None:
    series = daily([14.2, 32767.0, 13.1], "2025-06-17")
    assert believed_days(series) == ["2025-06-17", "2025-06-19"]
    assert reasons(series) == ["ceiling"]


# -- flatline ----------------------------------------------------------------


def test_a_week_without_movement_in_melt_season_is_a_stuck_sensor() -> None:
    series = daily([67.55] * 7, "2023-06-10")
    believed, rejected = screen_swe(series)
    assert believed == []
    assert [r["reason"] for r in rejected] == ["flatline"] * 7
    assert {r["since"] for r in rejected} == {"2023-06-10"}


def test_six_flat_days_are_not_yet_a_verdict_on_the_sensor() -> None:
    assert len(believed_days(daily([67.55] * 6, "2023-06-10"))) == 6


def test_a_melting_pack_is_believed() -> None:
    series = daily([9.1, 8.6, 8.0, 7.7, 7.1, 6.6, 6.0, 5.2], "2023-06-10")
    assert len(believed_days(series)) == 8


def test_bare_ground_reads_zero_for_weeks_and_is_believed() -> None:
    assert len(believed_days(daily([0.0] * 30, "2023-07-01"))) == 30


def test_a_trace_under_an_inch_is_never_called_stuck() -> None:
    assert len(believed_days(daily([0.6] * 14, "2023-07-01"))) == 14


def test_a_midwinter_pack_flat_between_storms_is_believed() -> None:
    assert len(believed_days(daily([21.4] * 12, "2024-01-08"))) == 12


def test_a_spring_plateau_at_peak_is_believed() -> None:
    # Leavitt Lake held 117.3 in for twenty days in April 2023.
    assert len(believed_days(daily([117.3] * 20, "2023-04-12"))) == 20


def test_a_week_needs_all_seven_readings_inside_melt_season() -> None:
    # Flat since late May: only six of these readings fall in June.
    series = daily([67.55] * 12, "2023-05-26")
    assert len(believed_days(series)) == 12
    # One more day makes a full week of melt season, and the whole run goes.
    assert believed_days(daily([67.55] * 13, "2023-05-26")) == []


def test_a_dead_sensor_flickering_by_one_count_is_still_stuck() -> None:
    # As cdec:GNL did in 2023: the encoder toggles between two adjacent counts.
    series = daily([79.08, 78.96, 78.96, 79.08, 78.96, 79.08, 79.08], "2023-07-01")
    assert believed_days(series) == []


def test_a_dead_sensor_wandering_over_three_counts_is_still_stuck() -> None:
    # As cdec:GRV did in 2024, and as a SNOTEL pillow does at +/- 0.1 in.
    series = daily([4.44, 4.56, 4.44, 4.32, 4.32, 4.44, 4.56, 4.44], "2024-06-14")
    assert believed_days(series) == []


def test_a_slow_real_melt_is_not_mistaken_for_a_flicker() -> None:
    series = daily([3.0, 2.95, 2.9, 2.85, 2.8, 2.75, 2.7, 2.65], "2023-07-01")
    assert len(believed_days(series)) == 8


def test_a_stuck_run_stays_rejected_until_the_reading_moves() -> None:
    # Stuck through September and still on the same value in October.
    series = daily([7.95] * 30, "2026-09-10")
    assert believed_days(series) == []
    moved = series + daily([9.4, 10.1], "2026-10-10")
    assert believed_days(moved) == ["2026-10-10", "2026-10-11"]


def test_a_stuck_stretch_in_the_past_does_not_taint_what_came_after() -> None:
    # State Lakes, 2023: melting, then stuck for weeks, then reset to zero.
    series = daily([70.1, 69.2, 68.4] + [67.55] * 20 + [0.0] * 5, "2023-06-01")
    assert believed_days(series) == [
        "2023-06-01", "2023-06-02", "2023-06-03",
        "2023-06-24", "2023-06-25", "2023-06-26", "2023-06-27", "2023-06-28",
    ]
    assert reasons(series) == ["flatline"] * 20


def test_readings_over_the_ceiling_are_reported_as_ceiling_not_flatline() -> None:
    assert reasons(daily([388.69] * 10, "2024-08-20")) == ["ceiling"] * 10


def test_an_empty_series_is_fine() -> None:
    assert screen_swe([]) == ([], [])
