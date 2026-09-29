from datetime import date, timedelta
from typing import Any

from fusion.fusion import (
    MELTED_OUT_SWE_IN,
    MIN_ZERO_RUN_DAYS,
    SNOWLINE_RISE_FT_PER_DAY,
    _melt_out_date,
)
from fusion.season import (
    DISAGREE_DAYS,
    FAST_RISE_FT_PER_DAY,
    LINGER_MAX_DAYS,
    MAX_PLAUSIBLE_SWE_IN,
    MAX_STEP_IN_PER_DAY,
    MIN_EARLIER_SEASONS,
    THIN_PACK_IN,
    WANDER_MAX_RISES,
    WINDOW_MAX_GAP_FT,
    WINDOW_PAD_DAYS,
    pass_season,
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
    assert MAX_PLAUSIBLE_SWE_IN == 150.0
    assert MAX_STEP_IN_PER_DAY == 10.0
    assert THIN_PACK_IN == 3.0
    assert LINGER_MAX_DAYS == 28
    assert WANDER_MAX_RISES == 8


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


def test_a_noisy_residual_is_not_snow_either() -> None:
    rows = curve(2026, "04-22", floor=2.0)
    rows = [
        {**r, "value": 2.0 + 0.7 * ((i * 7) % 5 - 2) / 2} if r["value"] == 2.0 else r
        for i, r in enumerate(rows)
    ]
    s = station_season(rows, 2026, TODAY)
    assert (s["status"], s["reason"]) == ("unusable", "residual")


def test_a_thin_pack_that_takes_four_weeks_to_go_is_still_snow() -> None:
    rows = curve(2026, "04-29", peak=2.9)
    assert station_season(rows, 2026, TODAY)["melt_out"] == "2026-04-29"


def test_a_pillow_drifting_up_and_down_on_bare_ground_is_unusable() -> None:
    rows = curve(2026, "05-20", peak=24.0)
    drift = {"2026-05-20": 1.5, "2026-05-21": 0.2}
    for week in range(1, 10):
        day = date(2026, 5, 21) + timedelta(days=7 * week)
        drift[(day - timedelta(days=1)).isoformat()] = 0.4
        drift[day.isoformat()] = 1.3
    rows = [{**r, "value": drift.get(r["observed_date"], r["value"])} for r in rows]
    s = station_season(rows, 2026, TODAY)
    assert (s["status"], s["reason"]) == ("unusable", "wandering")


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


# ---- the pass ---------------------------------------------------------------

PASS = {"slug": "test", "name": "Test Pass", "elevation_ft": 9000}
DASHES = (chr(0x2014), chr(0x2013))
BANNED = ("normal", "average", "typical", "usual", "snotel", "cdec", "nrcs", *DASHES)


def station(
    name: str,
    elevation_ft: float,
    melt: dict[int, str | None],
    km: float = 5.0,
    peaks: dict[int, float] | None = None,
    lonlat: tuple[float, float] | None = None,
    end: dict[int, str] | None = None,
    network: str = "test",
) -> list[dict[str, Any]]:
    """Store rows for one station as pipeline.export hands them to fusion.
    `melt` maps a year to its melt-out month-day, to None for a pack that
    holds to the end, or to "bare" for a station with no snow at all."""
    prov = f"{network}:{name.lower().replace(' ', '-')}"
    lonlat = lonlat or (-119.0 - elevation_ft / 1e4, 37.0 + km / 10)
    rows: list[dict[str, Any]] = []
    for year, when in melt.items():
        peak = (peaks or {}).get(year, 30.0)
        last = (end or {}).get(year, "09-28" if year == 2026 else "08-31")
        if when == "bare":
            rows += curve(year, "04-01", peak=0.0, end=last)
        else:
            rows += curve(year, when, peak=peak, end=last)
    return [
        {
            **r,
            "provenance": prov,
            "id": i,
            "geom": {"type": "Point", "coordinates": list(lonlat)},
            "meta": {
                "station_name": name,
                "station_elevation_ft": elevation_ft,
                "distance_km": km,
            },
        }
        for i, r in enumerate(rows)
    ]


def texts(season: dict[str, Any] | None) -> str:
    assert season is not None
    return " ".join(f["text"] for f in season["facts"])


def fact(season: dict[str, Any] | None, kind: str) -> dict[str, Any]:
    assert season is not None
    found = [f for f in season["facts"] if f["kind"] == kind]
    assert len(found) == 1, [f["kind"] for f in season["facts"]]
    return found[0]


LATE = {2023: "07-10", 2024: "06-01", 2025: "06-05", 2026: "06-24"}
LATE_TOO = {2023: "07-01", 2024: "05-20", 2025: "05-28", 2026: "06-09"}


def test_the_thresholds_for_the_pass_are_the_documented_ones() -> None:
    assert DISAGREE_DAYS == 21
    assert WINDOW_PAD_DAYS == 21
    assert FAST_RISE_FT_PER_DAY == 100.0
    assert SNOWLINE_RISE_FT_PER_DAY == 40.0
    assert WINDOW_MAX_GAP_FT == 2500.0
    assert MIN_EARLIER_SEASONS == 2


def test_days_later_than_the_median_of_the_earlier_seasons() -> None:
    obs = station("Alder Flat", 8600, LATE)
    s = pass_season(PASS, obs, TODAY)
    f = fact(s, "melt_out")
    assert f["text"] == (
        "Snow left Alder Flat (8,600 ft) 19 days later this year than the median of "
        "the three earlier seasons on file (2023 to 2025)."
    )
    assert f["estimate"] is False
    assert [e["name"] for e in f["evidence"]] == ["Alder Flat"]
    assert f["evidence"][0]["elevation_ft"] == 8600
    assert "June 24" in f["evidence"][0]["detail"]
    assert s is not None
    st = s["stations"][0]
    assert st["days_vs_earlier"] == 19
    assert st["earlier_years"] == [2023, 2024, 2025]
    assert st["earlier_median_day"] == 65


def test_stations_that_agree_are_given_as_a_range_not_an_average() -> None:
    obs = station("Alder Flat", 8600, LATE) + station("Birch Camp", 8100, LATE_TOO, km=9.0)
    f = fact(pass_season(PASS, obs, TODAY), "melt_out")
    assert f["text"] == (
        "Snow left Alder Flat (8,600 ft) and Birch Camp (8,100 ft) 12 to 19 days later "
        "this year than the median of the three earlier seasons on file (2023 to 2025)."
    )
    assert len(f["evidence"]) == 2


def test_three_stations_are_counted_not_listed() -> None:
    obs = (
        station("Alder Flat", 8600, LATE)
        + station("Birch Camp", 8100, LATE_TOO, km=9.0)
        + station("Cedar Bench", 7900, LATE_TOO, km=14.0)
    )
    f = fact(pass_season(PASS, obs, TODAY), "melt_out")
    assert f["text"].startswith("Snow left 3 nearby stations 12 to 19 days later this year")
    assert [e["name"] for e in f["evidence"]] == ["Alder Flat", "Birch Camp", "Cedar Bench"]


def test_stations_that_disagree_are_said_to_disagree() -> None:
    early = {2023: "07-01", 2024: "05-20", 2025: "05-28", 2026: "05-18"}
    obs = station("Alder Flat", 8600, LATE) + station("Birch Camp", 8100, early, km=9.0)
    s = pass_season(PASS, obs, TODAY)
    f = fact(s, "melt_out")
    assert f["text"] == (
        "The nearby stations disagree about this year: snow left Alder Flat (8,600 ft) "
        "19 days later and Birch Camp (8,100 ft) 10 days earlier than the median of "
        "the three earlier seasons on file (2023 to 2025)."
    )
    assert s is not None
    assert s["melt_out"]["agree"] is False
    assert s["melt_out"]["spread_days"] == 29


def test_a_spread_of_exactly_three_weeks_is_still_agreement() -> None:
    other = {2023: "07-01", 2024: "05-20", 2025: "05-28", 2026: "05-26"}
    obs = station("Alder Flat", 8600, LATE) + station("Birch Camp", 8100, other, km=9.0)
    s = pass_season(PASS, obs, TODAY)
    assert s is not None
    assert s["melt_out"]["agree"] is True
    assert "between 2 days earlier and 19 days later" in fact(s, "melt_out")["text"]


def test_fewer_than_two_earlier_seasons_is_no_comparison_at_all() -> None:
    obs = station("Alder Flat", 8600, {2025: "06-05", 2026: "06-24"})
    assert pass_season(PASS, obs, TODAY) is None


def test_a_pass_with_no_stations_says_nothing() -> None:
    assert pass_season(PASS, [], TODAY) is None


def test_two_earlier_seasons_are_named_as_two() -> None:
    obs = station("Alder Flat", 8600, {2024: "06-01", 2025: "06-05", 2026: "06-24"})
    f = fact(pass_season(PASS, obs, TODAY), "melt_out")
    assert f["text"] == (
        "Snow left Alder Flat (8,600 ft) 21 days later this year than the midpoint of "
        "the two earlier seasons on file (2024 and 2025)."
    )


def test_an_unusable_earlier_season_is_left_out_by_name() -> None:
    obs = station("Alder Flat", 8600, LATE, end={2023: "06-01"})
    f = fact(pass_season(PASS, obs, TODAY), "melt_out")
    assert "the midpoint of two of the three earlier seasons on file (2024 and 2025)" in f["text"]
    assert "2023: stopped reporting before melt-out" in f["evidence"][0]["detail"]


def test_a_season_already_bare_on_april_1_counts_as_the_earliest() -> None:
    melt = {2023: "06-01", 2024: "bare", 2025: "05-10", 2026: "05-20"}
    s = pass_season(PASS, station("Alder Flat", 8600, melt), TODAY)
    assert s is not None
    assert s["stations"][0]["earlier_median_day"] == 39
    assert s["stations"][0]["days_vs_earlier"] == 10


def test_a_median_that_falls_before_the_record_is_no_number() -> None:
    melt = {2023: "06-01", 2024: "bare", 2025: "bare", 2026: "05-20"}
    s = pass_season(PASS, station("Alder Flat", 8600, melt), TODAY)
    assert s is None or not [f for f in s["facts"] if f["kind"] == "melt_out"]


def test_bare_before_the_record_this_year_is_a_bound_not_a_date() -> None:
    melt = {2023: "05-20", 2024: "05-06", 2025: "04-28", 2026: "bare"}
    s = pass_season(PASS, station("Alder Flat", 6500, melt), TODAY)
    f = fact(s, "melt_out")
    assert f["text"] == (
        "Snow had already left Alder Flat (6,500 ft) when this year's record begins on "
        "April 1, at least 36 days earlier than the median of the three earlier seasons "
        "on file (2023 to 2025)."
    )


def test_snow_still_on_the_ground_in_season_is_described_not_forecast() -> None:
    today = date(2026, 6, 15)
    s = pass_season(PASS, station("Alder Flat", 8600, {**LATE, 2026: None}), today)
    f = fact(s, "still_snow")
    assert f["text"] == (
        "Snow was still on the ground at Alder Flat (8,600 ft) on June 15, 10 days past "
        "the median melt-out date of the three earlier seasons on file (2023 to 2025)."
    )
    assert "30.0 in of snow water on June 15" in f["evidence"][0]["detail"]
    assert s is not None
    assert s["pass_window"] is None
    assert s["melt_out"] is None


def test_snow_on_the_ground_before_the_median_date_gives_the_date() -> None:
    today = date(2026, 5, 20)
    s = pass_season(PASS, station("Alder Flat", 8600, {**LATE, 2026: None}), today)
    assert fact(s, "still_snow")["text"] == (
        "Snow was still on the ground at Alder Flat (8,600 ft) on May 20. The median "
        "melt-out date of the three earlier seasons on file (2023 to 2025) there is June 5."
    )


def test_peak_rank_among_the_seasons_on_file() -> None:
    peaks = {2023: 77.5, 2024: 40.3, 2025: 33.9, 2026: 4.0}
    melt = {**LATE, 2026: "04-25"}
    s = pass_season(PASS, station("Alder Flat", 8600, melt, peaks=peaks), TODAY)
    f = fact(s, "peak")
    assert f["text"] == (
        "At Alder Flat (8,600 ft), this year's highest snow water on or after April 1 was "
        "4.0 in, the lowest of the four seasons on file (2023 to 2026)."
    )
    assert s is not None
    assert s["stations"][0]["peak_rank"] == 4
    assert s["stations"][0]["peak_of"] == 4


def test_peak_ranks_that_differ_between_stations_are_listed() -> None:
    a = station("Alder Flat", 8600, LATE, peaks={2023: 70, 2024: 40, 2025: 30, 2026: 50})
    b = station(
        "Birch Camp", 8100, LATE_TOO, km=9.0, peaks={2023: 60, 2024: 20, 2025: 35, 2026: 25}
    )
    f = fact(pass_season(PASS, a + b, TODAY), "peak")
    assert f["text"] == (
        "This year's highest snow water on or after April 1 was the second highest of the "
        "four seasons on file (2023 to 2026) at Alder Flat (8,600 ft) and the third highest "
        "at Birch Camp (8,100 ft)."
    )


def test_peak_ranks_that_match_are_said_once() -> None:
    a = station("Alder Flat", 8600, LATE, peaks={2023: 70, 2024: 40, 2025: 30, 2026: 80})
    b = station(
        "Birch Camp", 8100, LATE_TOO, km=9.0, peaks={2023: 60, 2024: 20, 2025: 35, 2026: 65}
    )
    f = fact(pass_season(PASS, a + b, TODAY), "peak")
    assert f["text"] == (
        "This year's highest snow water on or after April 1 was the highest of the four "
        "seasons on file (2023 to 2026) at Alder Flat (8,600 ft) and Birch Camp (8,100 ft)."
    )


def test_the_pass_window_is_a_range_labelled_an_estimate() -> None:
    # 400 ft below the pass, melted out June 24: 4 days at 100 ft a day,
    # 10 at 40, three weeks either side.
    s = pass_season(PASS, station("Alder Flat", 8600, LATE), TODAY)
    assert s is not None
    w = s["pass_window"]
    assert w["state"] == "melted"
    assert (w["from"], w["through"]) == ("2026-06-07", "2026-07-25")
    f = fact(s, "pass_window")
    assert f["estimate"] is True
    assert f["text"] == (
        "An estimate: snow left the pass itself between June 7 and July 25, carried "
        "from the melt-out date at Alder Flat (8,600 ft) to the pass elevation."
    )
    assert "400 ft below the pass" in f["evidence"][0]["detail"]


def test_a_window_is_underway_until_its_last_day_has_passed() -> None:
    low = {2023: "06-10", 2024: "05-20", 2025: "05-22", 2026: "06-01"}
    s = pass_season(PASS, station("Alder Flat", 7000, low), date(2026, 6, 12))
    assert s is not None
    w = s["pass_window"]
    # 2,000 ft below, melted out June 1: 20 days at 100 ft a day, 50 at 40.
    assert (w["from"], w["through"]) == ("2026-05-31", "2026-08-11")
    assert w["state"] == "underway"
    for today, state in ((date(2026, 8, 11), "underway"), (date(2026, 8, 12), "melted")):
        later = pass_season(PASS, station("Alder Flat", 7000, low), today)
        assert later is not None
        assert later["pass_window"]["state"] == state


def test_a_window_open_today_says_so() -> None:
    today = date(2026, 7, 1)
    s = pass_season(PASS, station("Alder Flat", 8600, LATE), today)
    assert s is not None
    assert s["pass_window"]["state"] == "underway"
    assert fact(s, "pass_window")["text"] == (
        "An estimate: snow leaves the pass itself between June 7 and July 25, carried "
        "from the melt-out date at Alder Flat (8,600 ft) to the pass elevation. "
        "Today falls inside that window."
    )


def test_a_station_above_the_pass_brings_the_window_earlier() -> None:
    s = pass_season(PASS, station("Alder Flat", 10000, LATE), TODAY)
    assert s is not None
    # 1,000 ft above: 25 days earlier at 40 ft a day, 10 at 100.
    assert (s["pass_window"]["from"], s["pass_window"]["through"]) == ("2026-05-09", "2026-07-05")
    assert "1,000 ft above the pass" in fact(s, "pass_window")["evidence"][0]["detail"]


def test_two_stations_give_the_middle_of_their_windows() -> None:
    obs = station("Alder Flat", 8600, LATE) + station("Birch Camp", 8100, LATE_TOO, km=9.0)
    s = pass_season(PASS, obs, TODAY)
    assert s is not None
    # Alder: Jun 7 to Jul 25. Birch, 900 ft below, melted Jun 9: May 28 to Jul 23.
    assert (s["pass_window"]["from"], s["pass_window"]["through"]) == ("2026-06-02", "2026-07-24")
    assert len(fact(s, "pass_window")["evidence"]) == 2


def test_station_windows_that_do_not_overlap_give_no_window() -> None:
    early = {2023: "06-01", 2024: "05-01", 2025: "05-05", 2026: "04-20"}
    obs = station("Alder Flat", 8800, LATE) + station("Birch Camp", 8900, early, km=9.0)
    s = pass_season(PASS, obs, TODAY)
    assert s is not None
    assert s["pass_window"] is None
    f = fact(s, "pass_window")
    assert f["text"].startswith(
        "The nearby stations disagree about when snow left the pass itself, so no window "
        "is given:"
    )
    assert "Alder Flat (8,800 ft)" in f["text"] and "Birch Camp (8,900 ft)" in f["text"]


def test_no_window_from_a_station_too_far_below() -> None:
    s = pass_season(PASS, station("Alder Flat", 6400, LATE), TODAY)
    assert s is not None
    assert s["pass_window"] is None
    assert not [f for f in s["facts"] if f["kind"] == "pass_window"]


def test_no_window_that_runs_into_the_autumn() -> None:
    late = {2023: "08-20", 2024: "07-20", 2025: "07-25", 2026: "08-10"}
    s = pass_season(PASS, station("Alder Flat", 6600, late), TODAY)
    assert s is not None
    assert s["pass_window"] is None


def test_snow_at_a_station_below_the_pass_holds_the_window_open() -> None:
    today = date(2026, 6, 20)
    low = {2023: "06-10", 2024: "05-20", 2025: "05-22", 2026: "05-10"}
    obs = station("Alder Flat", 7600, low) + station(
        "Birch Camp", 8800, {**LATE, 2026: None}, km=9.0
    )
    s = pass_season(PASS, obs, today)
    assert s is not None
    # Alder alone says May 3 to Jul 5; Birch still holds snow on June 20.
    assert s["pass_window"]["from"] == "2026-06-20"
    assert s["pass_window"]["through"] == "2026-07-05"
    assert s["pass_window"]["state"] == "underway"


def test_the_same_site_through_two_networks_counts_once() -> None:
    a = station("Css Lab", 6890, LATE, km=4.1, lonlat=(-120.3679, 39.3257))
    b = station(
        "Cent Sierra Snow Lab", 6900, LATE, km=4.0, lonlat=(-120.3680, 39.3250), network="b"
    )
    s = pass_season(PASS, a + b, TODAY)
    assert s is not None
    assert len(s["stations"]) == 1
    assert " and " not in fact(s, "melt_out")["text"].split(" this year")[0]
    assert len(fact(s, "pass_window")["evidence"]) == 1


def test_the_networks_list_one_site_a_mile_and_400_ft_apart() -> None:
    a = station("Big Meadow", 8240, LATE, km=6.0, lonlat=(-119.945, 39.455))
    b = station(
        "Big Meadows", 8700, LATE, km=6.4, lonlat=(-119.930, 39.452), network="b"
    )
    s = pass_season(PASS, a + b, TODAY)
    assert s is not None
    assert len(s["stations"]) == 1


def test_two_sites_in_one_network_are_never_merged() -> None:
    a = station("Alpha", 7600, LATE, km=6.0, lonlat=(-120.2, 38.8))
    b = station("Forni Ridge", 7600, LATE_TOO, km=6.0, lonlat=(-120.2, 38.8))
    s = pass_season(PASS, a + b, TODAY)
    assert s is not None
    assert len(s["stations"]) == 2


def test_of_two_records_for_one_site_the_fuller_one_is_kept() -> None:
    a = station("Css Lab", 6890, LATE, km=4.1, lonlat=(-120.3679, 39.3257))
    b = station(
        "Cent Sierra Snow Lab", 6900, LATE, km=4.0, lonlat=(-120.3680, 39.3250),
        end={2023: "05-01", 2025: "05-01"}, network="b",
    )
    s = pass_season(PASS, a + b, TODAY)
    assert s is not None
    assert [st["name"] for st in s["stations"]] == ["Css Lab"]


def test_a_season_with_a_sensor_fault_has_no_peak_to_rank() -> None:
    rows = [
        {**r, "value": 1.6}
        if "2024-06-01" <= r["observed_date"] <= "2024-08-19"
        else r
        for r in station("Alder Flat", 8600, LATE)
    ]
    s = pass_season(PASS, rows, TODAY)
    assert s is not None
    assert "three of the four seasons on file (2023, 2025 and 2026)" in fact(s, "peak")["text"]


def test_a_station_bare_on_april_1_has_no_peak_to_rank() -> None:
    melt = {2023: "05-06", 2024: "bare", 2025: "bare", 2026: "04-20"}
    assert pass_season(PASS, station("Alder Flat", 2930, melt), TODAY) is None


def test_in_winter_the_last_season_is_named_by_its_year() -> None:
    s = pass_season(PASS, station("Alder Flat", 8600, LATE), date(2027, 1, 14))
    assert s is not None
    assert s["year"] == 2026
    assert fact(s, "melt_out")["text"] == (
        "Snow left Alder Flat (8,600 ft) 19 days later in 2026 than the median of "
        "the three earlier seasons on file (2023 to 2025)."
    )
    assert "this year" not in texts(s)
    assert "in 2026" in fact(s, "pass_window")["text"]


def test_the_chart_is_the_nearest_station_with_its_melt_out_marks() -> None:
    obs = station("Alder Flat", 8600, LATE, km=12.0) + station(
        "Birch Camp", 8100, LATE_TOO, km=9.0
    )
    s = pass_season(PASS, obs, TODAY)
    assert s is not None
    chart = s["chart"]
    assert chart["name"] == "Birch Camp"
    assert chart["provenance"] == "test:birch-camp"
    assert chart["seasons"] == [
        {"year": 2023, "melt_out": "2023-07-01"},
        {"year": 2024, "melt_out": "2024-05-20"},
        {"year": 2025, "melt_out": "2025-05-28"},
        {"year": 2026, "melt_out": "2026-06-09"},
    ]
    assert chart["max_swe_in"] == MAX_PLAUSIBLE_SWE_IN


def test_an_erratic_season_is_not_drawn() -> None:
    rows = station("Alder Flat", 8600, LATE)
    rows = [
        {**r, "value": 67.55 if r["observed_date"] < "2023-07-10" else 0.0}
        if r["observed_date"][:4] == "2023"
        else r
        for r in rows
    ]
    s = pass_season(PASS, rows, TODAY)
    assert s is not None
    assert [y["year"] for y in s["chart"]["seasons"]] == [2024, 2025, 2026]


def test_copy_never_claims_a_norm_names_an_agency_or_uses_a_dash() -> None:
    scenarios = [
        (station("Alder Flat", 8600, LATE), TODAY),
        (station("Alder Flat", 8600, LATE) + station("Birch Camp", 8100, LATE_TOO, km=9), TODAY),
        (station("Alder Flat", 8600, {**LATE, 2026: None}), date(2026, 6, 15)),
        (station("Alder Flat", 6500, {**LATE, 2026: "bare"}), TODAY),
        (station("Alder Flat", 8600, LATE, end={2023: "06-01"}), date(2027, 1, 14)),
    ]
    for obs, today in scenarios:
        s = pass_season(PASS, obs, today)
        assert s is not None
        copy = texts(s) + " ".join(e["detail"] for f in s["facts"] for e in f["evidence"])
        for word in BANNED:
            assert word not in copy.lower(), (word, copy)


def test_every_statement_carries_the_stations_it_rests_on() -> None:
    obs = station("Alder Flat", 8600, LATE) + station("Birch Camp", 8100, LATE_TOO, km=9.0)
    s = pass_season(PASS, obs, TODAY)
    assert s is not None
    assert {f["kind"] for f in s["facts"]} == {"melt_out", "peak", "pass_window"}
    for f in s["facts"]:
        assert f["evidence"]
        for e in f["evidence"]:
            assert e["name"] and e["elevation_ft"] and e["provenance"] and e["detail"]


def test_a_pass_without_an_elevation_gets_the_comparison_but_no_window() -> None:
    s = pass_season({"slug": "x", "name": "X"}, station("Alder Flat", 8600, LATE), TODAY)
    assert s is not None
    assert s["pass_window"] is None
    assert fact(s, "melt_out")
