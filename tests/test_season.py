from datetime import date, timedelta
from typing import Any

from fusion.fusion import MELTED_OUT_SWE_IN, MIN_ZERO_RUN_DAYS, _melt_out_date
from fusion.season import (
    FLAT_MIN_DAYS,
    MAX_PLAUSIBLE_SWE_IN,
    MAX_STEP_IN_PER_DAY,
    season_of,
    station_season,
)

TODAY = date(2026, 9, 29)


def curve(
    year: int,
    melt_out: str | None,
    peak: float = 30.0,
    start: str = "04-01",
    end: str = "08-31",
    floor: float = 0.0,
) -> list[dict[str, Any]]:
    """Daily snow water for one season: `peak` on the first day, falling in a
    straight line to `floor` on the `melt_out` day (month-day) and staying
    there. With no melt-out the pack holds at `peak` to the end."""
    first = date.fromisoformat(f"{year}-{start}")
    last = date.fromisoformat(f"{year}-{end}")
    melt = date.fromisoformat(f"{year}-{melt_out}") if melt_out else None
    rows = []
    d = first
    while d <= last:
        if melt is None:
            value = peak
        elif d >= melt:
            value = floor
        else:
            span = (melt - first).days
            value = max(floor + 0.6, peak * (1 - (d - first).days / span))
        rows.append({"metric": "swe_in", "observed_date": d.isoformat(), "value": round(value, 2)})
        d += timedelta(days=1)
    return rows


def put(rows: list[dict[str, Any]], day: str, value: float) -> list[dict[str, Any]]:
    return [{**r, "value": value} if r["observed_date"] == day else r for r in rows]


def test_the_thresholds_are_the_documented_ones() -> None:
    assert MELTED_OUT_SWE_IN == 0.5
    assert MIN_ZERO_RUN_DAYS == 7
    assert MAX_PLAUSIBLE_SWE_IN == 200.0
    assert MAX_STEP_IN_PER_DAY == 10.0
    assert FLAT_MIN_DAYS == 21


def test_the_season_is_the_latest_one_whose_window_has_opened() -> None:
    assert season_of(date(2026, 9, 29)) == 2026
    assert season_of(date(2026, 4, 1)) == 2026
    assert season_of(date(2027, 3, 31)) == 2026


def test_melt_out_is_the_date_the_fusion_engine_reports() -> None:
    rows = curve(2024, "06-10")
    s = station_season(rows, 2024, TODAY)
    assert s["status"] == "melted"
    assert s["melt_out"] == "2024-06-10"
    assert (s["melt_out"], True) == _melt_out_date(rows)


def test_melt_out_day_counts_from_april_1_so_leap_years_line_up() -> None:
    assert station_season(curve(2024, "06-10"), 2024, TODAY)["melt_out_day"] == 70
    assert station_season(curve(2025, "06-10"), 2025, TODAY)["melt_out_day"] == 70


def test_a_blip_after_a_week_bare_does_not_move_the_melt_out() -> None:
    rows = put(curve(2026, "05-09"), "2026-06-25", 0.6)
    assert station_season(rows, 2026, TODAY)["melt_out"] == "2026-05-09"


def test_snow_back_within_the_week_does_move_it() -> None:
    rows = put(put(curve(2026, "05-09"), "2026-05-13", 1.4), "2026-05-14", 0.9)
    assert station_season(rows, 2026, TODAY)["melt_out"] == "2026-05-15"


def test_a_station_bare_when_the_record_begins_has_no_melt_out_date() -> None:
    rows = curve(2025, "04-01", peak=0.0)
    s = station_season(rows, 2025, TODAY)
    assert s["status"] == "bare_at_start"
    assert s["melt_out"] is None


def test_an_april_storm_on_bare_ground_does_not_become_the_melt_out() -> None:
    rows = curve(2026, "04-01", peak=0.0)
    for day, value in (("2026-04-12", 1.9), ("2026-04-13", 1.2), ("2026-04-14", 0.6)):
        rows = put(rows, day, value)
    assert station_season(rows, 2026, TODAY)["status"] == "bare_at_start"


def test_snow_still_there_on_august_31_is_not_given_a_date() -> None:
    s = station_season(curve(2023, None, peak=12.0), 2023, TODAY)
    assert s["status"] == "snow"
    assert s["melt_out"] is None


def test_autumn_snow_belongs_to_the_next_winter() -> None:
    rows = curve(2026, "06-10", end="09-28")
    rows = put(put(rows, "2026-09-27", 2.0), "2026-09-28", 3.1)
    s = station_season(rows, 2026, TODAY)
    assert s["melt_out"] == "2026-06-10"
    assert s["last_reading"] == "2026-08-31"


def test_nothing_dated_after_today_is_read() -> None:
    rows = curve(2026, "06-10")
    s = station_season(rows, 2026, date(2026, 5, 20))
    assert s["status"] == "snow"
    assert s["last_reading"] == "2026-05-20"


def test_bare_for_under_a_week_is_not_yet_a_melt_out() -> None:
    s = station_season(curve(2026, "06-10"), 2026, date(2026, 6, 13))
    assert s["status"] == "unusable"
    assert s["reason"] == "unconfirmed"


def test_a_pillow_that_goes_quiet_after_melting_out_keeps_its_date() -> None:
    rows = curve(2025, "05-21", end="06-02")
    assert station_season(rows, 2025, TODAY)["melt_out"] == "2025-05-21"


def test_a_pillow_that_goes_quiet_under_snow_is_unusable() -> None:
    s = station_season(curve(2025, None, peak=20.0, end="06-16"), 2025, TODAY)
    assert s["status"] == "unusable"
    assert s["reason"] == "quiet"


def test_a_season_with_no_rows_is_unusable() -> None:
    s = station_season(curve(2024, "06-10"), 2025, TODAY)
    assert s["status"] == "unusable"
    assert s["reason"] == "no data"
    assert s["peak_swe_in"] is None


def test_a_flat_residual_on_bare_ground_is_not_snow() -> None:
    # The pillow rests at 1.6 in from late May until it is re-zeroed in
    # August: the August step is maintenance, not melt.
    rows = [
        {**r, "value": 0.0} if r["observed_date"] >= "2024-08-20" else r
        for r in curve(2024, "05-27", floor=1.6)
    ]
    s = station_season(rows, 2024, TODAY)
    assert s["status"] == "unusable"
    assert s["reason"] == "residual"
    assert s["melt_out"] is None


def test_a_deep_pack_holding_steady_is_not_a_residual() -> None:
    rows = curve(2023, None, peak=60.0, end="04-30")
    rows += curve(2023, "07-20", peak=60.0, start="05-01")
    assert station_season(rows, 2023, TODAY)["status"] == "melted"


def test_a_stuck_sensor_dropping_to_zero_in_a_day_is_unusable() -> None:
    rows = [
        {**r, "value": 67.55} if r["observed_date"] < "2023-07-20" else {**r, "value": 0.0}
        for r in curve(2023, "07-20")
    ]
    s = station_season(rows, 2023, TODAY)
    assert s["status"] == "unusable"
    assert s["reason"] == "erratic"
    assert s["peak_swe_in"] is None


def test_one_stray_reading_is_dropped_and_the_season_kept() -> None:
    rows = put(curve(2023, "06-15", peak=50.0), "2023-04-20", 3.0)
    s = station_season(rows, 2023, TODAY)
    assert s["status"] == "melted"
    assert s["melt_out"] == "2023-06-15"
    assert s["peak_swe_in"] == 50.0


def test_an_impossible_reading_never_becomes_the_peak() -> None:
    rows = put(curve(2026, "06-10"), "2026-04-15", 32767.0)
    rows = put(rows, "2026-04-16", 391.82)
    s = station_season(rows, 2026, TODAY)
    assert s["peak_swe_in"] == 30.0
    assert s["peak_date"] == "2026-04-01"
    assert s["melt_out"] == "2026-06-10"


def test_a_record_that_starts_late_has_no_peak() -> None:
    s = station_season(curve(2026, "06-10", start="05-02"), 2026, TODAY)
    assert s["melt_out"] == "2026-06-10"
    assert s["peak_swe_in"] is None


def test_other_metrics_and_empty_values_are_ignored() -> None:
    rows = curve(2026, "06-10")
    rows.append({"metric": "snow_depth_in", "observed_date": "2026-07-01", "value": 40.0})
    rows.append({"metric": "swe_in", "observed_date": "2026-07-02", "value": None})
    assert station_season(rows, 2026, TODAY)["melt_out"] == "2026-06-10"


def test_a_melt_out_hidden_in_a_hole_in_the_record_is_not_dated() -> None:
    rows = [
        r
        for r in curve(2024, "06-10")
        if not "2024-05-15" <= r["observed_date"] <= "2024-06-20"
    ]
    s = station_season(rows, 2024, TODAY)
    assert s["status"] == "unusable"
    assert s["reason"] == "gap"
