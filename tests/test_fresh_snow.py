from datetime import date, timedelta

from fusion.fresh_snow import (
    DEPTH_MIN_IN,
    FORECAST_MIN_IN,
    MAX_AGE_DAYS,
    SWE_MIN_IN,
    forecast_snow,
    fresh_snow,
    station_change,
)

TODAY = date(2027, 1, 14)


def day(back: int) -> str:
    return (TODAY - timedelta(days=back)).isoformat()


def rows(
    swe: dict[int, float], depth: dict[int, float] | None = None
) -> list[dict]:
    """Synthetic store rows; keys are days before TODAY."""
    out = [
        {"metric": "swe_in", "observed_date": day(back), "value": v}
        for back, v in sorted(swe.items(), reverse=True)
    ]
    out += [
        {"metric": "snow_depth_in", "observed_date": day(back), "value": v}
        for back, v in sorted((depth or {}).items(), reverse=True)
    ]
    return out


def station(name: str, data: list[dict], km: float = 6.0, ft: int | None = 9604) -> dict:
    return {
        "provenance": f"cdec:{name[:3].upper()}",
        "name": name,
        "elevation_ft": ft,
        "distance_km": km,
        "rows": data,
    }


def test_thresholds_are_the_documented_ones() -> None:
    assert SWE_MIN_IN == 0.3
    assert DEPTH_MIN_IN == 2.0
    assert FORECAST_MIN_IN == 0.5
    assert MAX_AGE_DAYS == 2


def test_change_over_24_and_72_hours() -> None:
    c = station_change(
        rows({0: 12.4, 1: 11.6, 2: 10.9, 3: 10.3}, {0: 61, 1: 52, 2: 45, 3: 39}), TODAY
    )
    assert c is not None
    assert c["as_of"] == day(0)
    assert c["swe_in"] == 12.4
    assert c["swe_24h_in"] == 0.8
    assert c["swe_72h_in"] == 2.1
    assert c["depth_24h_in"] == 9
    assert c["depth_72h_in"] == 22


def test_windows_count_back_from_the_latest_reading_not_from_today() -> None:
    c = station_change(rows({1: 5.0, 2: 4.0, 4: 3.0}), TODAY)
    assert c is not None
    assert c["as_of"] == day(1)
    assert c["swe_24h_in"] == 1.0
    assert c["swe_72h_in"] == 2.0


def test_a_missing_day_leaves_that_window_empty_instead_of_borrowing_a_neighbour() -> None:
    c = station_change(rows({0: 5.0, 2: 4.0, 3: 3.0}), TODAY)
    assert c is not None
    assert c["swe_24h_in"] is None
    assert c["swe_72h_in"] == 2.0


def test_a_station_silent_for_more_than_two_days_is_not_current() -> None:
    assert station_change(rows({3: 5.0, 4: 4.0}), TODAY) is None
    assert station_change([], TODAY) is None


def test_readings_dated_after_today_are_ignored() -> None:
    c = station_change(rows({-1: 9.0, 0: 5.0, 1: 4.0}), TODAY)
    assert c is not None and c["as_of"] == day(0) and c["swe_24h_in"] == 1.0


def test_the_later_row_wins_when_a_day_was_ingested_twice() -> None:
    data = rows({1: 4.0}) + rows({0: 1.0}) + rows({0: 5.0})
    c = station_change(data, TODAY)
    assert c is not None and c["swe_24h_in"] == 1.0


def test_slightly_negative_pillow_readings_count_as_bare_ground() -> None:
    # A drifting pillow reads -0.2 on bare ground; the rise to 0.15 is not 0.35 in of snow.
    c = station_change(rows({0: 0.15, 1: -0.2}), TODAY)
    assert c is not None and c["swe_24h_in"] == 0.15


def test_real_storm_is_reported_with_depth_agreeing() -> None:
    out = fresh_snow(
        [station("Leavitt Lake", rows({0: 12.4, 1: 11.6, 2: 10.9, 3: 10.3},
                                      {0: 61, 1: 52, 2: 45, 3: 39}), km=6.76)],
        TODAY,
    )
    assert out is not None
    assert out["as_of"] == day(0)
    assert out["stations_checked"] == 1
    [s] = out["stations"]
    assert s["name"] == "Leavitt Lake"
    assert s["distance_mi"] == 4.2
    assert s["swe_24h_in"] == 0.8 and s["swe_72h_in"] == 2.1
    assert s["confirmed_by"] == "depth"
    assert out["facts"] == [
        "Leavitt Lake (9,604 ft, 4.2 mi away) gained 0.8 in of snow water and 9 in of snow "
        "depth in the 24 hours to Jan 14; 2.1 in of water and 22 in of depth over 72 hours."
    ]


def test_a_rise_below_the_noise_threshold_is_not_new_snow() -> None:
    out = fresh_snow(
        [station("Tunnel Guard", rows({0: 3.2, 1: 3.0, 2: 3.0, 3: 3.0},
                                      {0: 20, 1: 18, 2: 18, 3: 18}))],
        TODAY,
    )
    assert out is not None
    assert out["stations"] == []
    assert out["facts"] == [
        "No new snow measured at the 1 nearby station in the 72 hours to Jan 14."
    ]


def test_snow_water_rising_while_depth_does_not_is_not_called_new_snow() -> None:
    # Rain soaking into the pack, or a pillow glitch: water up, depth flat.
    out = fresh_snow(
        [station("Horse Meadow", rows({0: 8.6, 1: 8.0, 2: 8.0, 3: 8.0},
                                      {0: 30, 1: 30, 2: 31, 3: 31}))],
        TODAY,
    )
    assert out is not None and out["stations"] == []


def test_depth_rising_by_sensor_jitter_alone_does_not_confirm() -> None:
    # Live on 2026-09-27: Pepper Creek, 2,140 ft, Washington. Rain and a jittery depth sensor.
    out = fresh_snow(
        [station("Pepper Creek", rows({0: 0.3, 1: 0.3, 2: 0.1, 3: 0.0},
                                      {0: 1, 1: 1, 2: 0, 3: 0}), ft=2140)],
        TODAY,
    )
    assert out is not None and out["stations"] == []


def test_a_station_without_depth_needs_a_neighbour_to_agree() -> None:
    alone = fresh_snow([station("Farewell Gap", rows({0: 1.0, 1: 0.2}))], TODAY)
    assert alone is not None and alone["stations"] == []

    agreed = fresh_snow(
        [
            station("Farewell Gap", rows({0: 1.0, 1: 0.2}), km=3.0),
            station("Mineral King", rows({0: 2.0, 1: 1.4}, {0: 14, 1: 8}), km=5.0),
        ],
        TODAY,
    )
    assert agreed is not None
    assert [(s["name"], s["confirmed_by"]) for s in agreed["stations"]] == [
        ("Farewell Gap", "nearby station"),
        ("Mineral King", "depth"),
    ]
    assert agreed["facts"][0] == (
        "Farewell Gap (9,604 ft, 1.9 mi away) gained 0.8 in of snow water "
        "in the 24 hours to Jan 14."
    )


def test_two_stations_without_depth_confirm_each_other() -> None:
    out = fresh_snow(
        [
            station("A", rows({0: 1.0, 1: 0.2})),
            station("B", rows({0: 2.0, 1: 1.4})),
        ],
        TODAY,
    )
    assert out is not None and len(out["stations"]) == 2


def test_a_neighbour_whose_own_depth_disagrees_confirms_nothing() -> None:
    out = fresh_snow(
        [
            station("No depth", rows({0: 1.0, 1: 0.2})),
            station("Flat depth", rows({0: 2.0, 1: 1.4}, {0: 8, 1: 8})),
        ],
        TODAY,
    )
    assert out is not None and out["stations"] == []


def test_only_the_72_hour_window_qualifying_reads_as_72_hours() -> None:
    out = fresh_snow(
        [station("Slow Storm", rows({0: 5.5, 1: 5.3, 2: 5.1, 3: 4.9},
                                    {0: 40, 1: 38, 2: 36, 3: 34}), ft=None)],
        TODAY,
    )
    assert out is not None
    [s] = out["stations"]
    assert s["swe_24h_in"] is None and s["swe_72h_in"] == 0.6
    assert out["facts"] == [
        "Slow Storm (3.7 mi away) gained 0.6 in of snow water and 6 in of snow depth "
        "in the 72 hours to Jan 14."
    ]


def test_an_impossible_jump_is_a_sensor_fault_not_a_storm() -> None:
    out = fresh_snow(
        [station("Spike", rows({0: 40.0, 1: 2.0}, {0: 200, 1: 10}))], TODAY
    )
    assert out is not None and out["stations"] == []


def test_melt_is_never_reported_as_anything() -> None:
    out = fresh_snow(
        [station("Melting", rows({0: 9.0, 1: 9.6, 2: 10.2, 3: 11.0},
                                 {0: 30, 1: 33, 2: 36, 3: 40}))],
        TODAY,
    )
    assert out is not None and out["stations"] == []
    assert "No new snow measured" in out["facts"][0]


def test_no_current_station_and_no_forecast_is_nothing_at_all() -> None:
    assert fresh_snow([], TODAY) is None
    assert fresh_snow([station("Silent", rows({5: 1.0}))], TODAY) is None


def test_stations_report_nearest_first_and_stale_ones_are_not_counted() -> None:
    storm = {0: 3.0, 1: 2.0}
    depth = {0: 20, 1: 10}
    out = fresh_snow(
        [
            station("Far", rows(storm, depth), km=30.0),
            station("Near", rows(storm, depth), km=2.0),
            station("Silent", rows({6: 1.0}), km=1.0),
        ],
        TODAY,
    )
    assert out is not None
    assert out["stations_checked"] == 2
    assert [s["name"] for s in out["stations"]] == ["Near", "Far"]


def _forecast(*snow: float, start: date = TODAY) -> dict:
    return {
        "days": [
            {"date": (start + timedelta(days=i)).isoformat(), "snowfall_in": s}
            for i, s in enumerate(snow)
        ],
        "source": "https://forecast.weather.gov/MapClick.php?lat=38.3279&lon=-119.6372",
    }


def test_forecast_snowfall_sums_today_and_the_next_two_days() -> None:
    f = forecast_snow(_forecast(0.4, 1.2, 0.7, 5.0), TODAY.isoformat(), TODAY)
    assert f == {
        "from": "2027-01-14",
        "through": "2027-01-16",
        "total_in": 2.3,
        "source": "https://forecast.weather.gov/MapClick.php?lat=38.3279&lon=-119.6372",
    }


def test_forecast_issued_yesterday_skips_the_day_that_already_passed() -> None:
    yesterday = TODAY - timedelta(days=1)
    f = forecast_snow(_forecast(9.0, 0.4, 1.2, 0.7, start=yesterday), yesterday.isoformat(), TODAY)
    assert f is not None and f["total_in"] == 2.3 and f["from"] == "2027-01-14"


def test_stale_missing_or_snowless_forecasts_say_nothing() -> None:
    old = (TODAY - timedelta(days=2)).isoformat()
    assert forecast_snow(_forecast(1.0, 1.0, 1.0), old, TODAY) is None
    assert forecast_snow(None, TODAY.isoformat(), TODAY) is None
    assert forecast_snow(_forecast(0.0, 0.0, 0.0), TODAY.isoformat(), TODAY) is None
    assert forecast_snow(_forecast(0.1, 0.2, 0.1), TODAY.isoformat(), TODAY) is None
    assert forecast_snow({"days": [{"date": day(0), "snowfall_in": None}]},
                         TODAY.isoformat(), TODAY) is None
    assert forecast_snow(_forecast(1.0), "not a date", TODAY) is None


def test_forecast_rides_along_with_the_measurements() -> None:
    out = fresh_snow(
        [station("Tunnel Guard", rows({0: 3.0, 1: 3.0, 3: 3.0}))],
        TODAY,
        forecast_snow(_forecast(0.4, 1.2, 0.7), TODAY.isoformat(), TODAY),
    )
    assert out is not None
    assert out["forecast"]["total_in"] == 2.3
    assert out["facts"] == [
        "No new snow measured at the 1 nearby station in the 72 hours to Jan 14.",
        "Forecast: 2.3 in of snow from Jan 14 through Jan 16.",
    ]


def test_forecast_alone_is_enough_for_a_pass_with_no_station() -> None:
    out = fresh_snow([], TODAY, forecast_snow(_forecast(3.0), TODAY.isoformat(), TODAY))
    assert out is not None
    assert out["stations_checked"] == 0 and out["as_of"] is None
    assert out["facts"] == [
        "Forecast: 3.0 in of snow on Jan 14."
    ]
