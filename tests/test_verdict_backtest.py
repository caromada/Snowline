from typing import Any

import pytest

from eval.verdict_backtest import (
    MIN_CELL,
    backtest_pass,
    classify,
    confidence_finding,
    held_out,
    is_demonstration_post,
    observed_step,
    rate_cell,
    report_date,
    reports_needed,
    season_of,
    sensor_near_pass_elevation,
    summarize,
    verdict_step,
    wilson_interval,
)

PASS = {
    "slug": "glen",
    "name": "Glen Pass",
    "elevation_ft": 11926,
    "creek": "Bubbs Creek",
    "state": "CA",
    "lat": 36.789,
    "lon": -118.412,
}


def sensor(
    swe: float, day: str, elev_ft: float = 11800, station: str = "cdec:CRL"
) -> dict[str, Any]:
    return {
        "metric": "swe_in",
        "observed_date": day,
        "value": swe,
        "provenance": station,
        "meta": {"distance_km": 1.2, "station_elevation_ft": elev_ft},
    }


def sat(frac: float, day: str) -> dict[str, Any]:
    return {
        "metric": "snow_cover_frac",
        "observed_date": day,
        "value": frac,
        "provenance": "satellite:modeled",
        "meta": {"modeled": True},
    }


def report(
    pid: str,
    snow: str | None = "continuous",
    traction: str | None = "microspikes",
    day: str | None = "2023-06-14",
    author: str = "a",
    posted: str = "2023-06-16",
    quote: str | None = "snow to the top",
    url: str = "https://forum.example.org/t/1",
) -> dict[str, Any]:
    return {
        "extraction": {
            "location": "Glen Pass",
            "date_observed": day,
            "snow_condition": snow,
            "traction_used": traction,
            "crossing_condition": None,
            "exposure_comfort": None,
            "reporter_register": "experienced",
            "quote_span": quote,
        },
        "post_meta": {"id": pid, "posted_date": posted, "author": author, "url": url},
    }


# -- Wilson interval ---------------------------------------------------------


def test_wilson_matches_known_values() -> None:
    low, high = wilson_interval(5, 10)
    assert low == pytest.approx(0.2366, abs=5e-4)
    assert high == pytest.approx(0.7634, abs=5e-4)
    # Newcombe's worked example: 81 of 263.
    low, high = wilson_interval(81, 263)
    assert low == pytest.approx(0.2553, abs=5e-4)
    assert high == pytest.approx(0.3662, abs=5e-4)


def test_wilson_at_the_edges_stays_inside_zero_and_one() -> None:
    low, high = wilson_interval(0, 10)
    assert low == 0.0
    assert high == pytest.approx(0.2775, abs=5e-4)
    low, high = wilson_interval(10, 10)
    assert low == pytest.approx(0.7225, abs=5e-4)
    assert high == 1.0


def test_wilson_rejects_impossible_counts() -> None:
    with pytest.raises(ValueError):
        wilson_interval(1, 0)
    with pytest.raises(ValueError):
        wilson_interval(11, 10)
    with pytest.raises(ValueError):
        wilson_interval(-1, 10)


def test_reports_needed_for_ten_points_either_way() -> None:
    n = reports_needed(0.10)
    low, high = wilson_interval(n // 2, n)
    assert (high - low) / 2 <= 0.10
    low, high = wilson_interval((n - 2) // 2, n - 2)
    assert (high - low) / 2 > 0.10
    assert 85 <= n <= 100


# -- mapping -----------------------------------------------------------------


def test_snow_words_map_onto_the_verdict_scale_one_to_one() -> None:
    assert observed_step("none", None) == 0
    assert observed_step("patchy", None) == 1
    assert observed_step("continuous", None) == 2
    assert observed_step("deep", None) == 3
    assert [verdict_step(s) for s in
            ("open", "snow_caution", "traction_advised", "not_recommended")] == [0, 1, 2, 3]


def test_no_snow_word_means_no_ground_truth() -> None:
    assert observed_step(None, "microspikes") is None
    assert observed_step("slushy", None) is None


def test_unknown_verdict_has_no_step() -> None:
    assert verdict_step("unknown") is None


def test_traction_raises_by_one_step_at_most_and_never_lowers() -> None:
    assert observed_step("none", "microspikes") == 1
    assert observed_step("patchy", "microspikes") == 2
    assert observed_step("continuous", "microspikes") == 2
    assert observed_step("patchy", "ice_axe") == 2
    assert observed_step("continuous", "crampons") == 3
    assert observed_step("continuous", "spikes_and_axe") == 3
    assert observed_step("deep", "none") == 3
    assert observed_step("continuous", "none") == 2
    assert observed_step("deep", "spikes_and_axe") == 3


def test_snow_only_mapping_ignores_traction() -> None:
    assert observed_step("patchy", "ice_axe", use_traction=False) == 1


# -- outcomes ----------------------------------------------------------------


def test_classify_exact_and_distance() -> None:
    assert classify(2, 2) == ("exact", None)
    assert classify(1, 2) == ("off_by_one", "engine_less")
    assert classify(3, 2) == ("off_by_one", "engine_more")
    assert classify(0, 2) == ("off_by_more", "engine_less")
    assert classify(3, 0) == ("off_by_more", "engine_more")


def test_classify_without_a_verdict() -> None:
    assert classify(None, 2) == ("no_verdict", None)


# -- leave one out -----------------------------------------------------------


def test_report_date_prefers_the_observed_day() -> None:
    assert report_date(report("p1", day="2023-06-14")) == ("2023-06-14", "observed")
    assert report_date(report("p1", day=None, posted="2023-06-16")) == ("2023-06-16", "posted")
    bare = report("p1", day=None)
    bare["post_meta"].pop("posted_date")
    assert report_date(bare) is None


def test_held_out_drops_the_report_and_the_same_party_that_day() -> None:
    target = report("p1", author="Ann", day="2023-06-14")
    same_party = report("p2", author="ann ", day="2023-06-14")
    same_party_other_day = report("p3", author="Ann", day="2023-06-12")
    other_party = report("p4", author="Bo", day="2023-06-14")
    kept = held_out(target, [target, same_party, same_party_other_day, other_party])
    assert [r["post_meta"]["id"] for r in kept] == ["p3", "p4"]


def test_held_out_without_an_author_drops_only_the_report() -> None:
    target = report("p1", author="", day="2023-06-14")
    other = report("p2", author="", day="2023-06-14")
    kept = held_out(target, [target, other])
    assert [r["post_meta"]["id"] for r in kept] == ["p2"]


def test_a_lone_report_cannot_grade_itself() -> None:
    # The only evidence is the report being tested, so nothing is left.
    rows = backtest_pass(PASS, [], [], [], [report("p1")])
    assert len(rows) == 1
    assert rows[0]["engine"]["status"] == "unknown"
    assert rows[0]["outcome"] == "no_verdict"


def test_the_report_under_test_does_not_vote() -> None:
    # Sensors and satellite both say bare ground. The report says deep snow.
    # If the report leaked into its own verdict the engine would not say open.
    rows = backtest_pass(
        PASS,
        [sensor(0.0, "2023-06-14")],
        [sat(0.0, "2023-06-13")],
        [],
        [report("p1", snow="deep", traction="spikes_and_axe")],
    )
    row = rows[0]
    assert row["engine"]["status"] == "open"
    assert row["engine"]["other_reports"] == 0
    assert row["outcome"] == "off_by_more"
    assert row["direction"] == "engine_less"


def test_other_parties_still_vote() -> None:
    rows = backtest_pass(
        PASS,
        [],
        [],
        [],
        [
            report("p1", author="Ann", snow="continuous", traction="microspikes"),
            report("p2", author="Bo", snow="continuous", traction="microspikes",
                   day="2023-06-13"),
        ],
    )
    by_id = {r["post_id"]: r for r in rows}
    assert by_id["p1"]["engine"]["other_reports"] == 1
    assert by_id["p1"]["engine"]["status"] == "traction_advised"
    assert by_id["p1"]["outcome"] == "exact"
    # Bo walked the pass first, so Ann's later report cannot inform his day.
    assert by_id["p2"]["engine"]["status"] == "unknown"


def test_reports_without_a_snow_word_are_not_scored() -> None:
    rows = backtest_pass(PASS, [sensor(9.0, "2023-06-14")], [], [], [report("p1", snow=None)])
    assert rows == []


def test_row_carries_the_quote_but_never_the_author() -> None:
    rows = backtest_pass(PASS, [sensor(9.0, "2023-06-14")], [], [], [report("p1", author="Ann")])
    row = rows[0]
    assert row["quote"] == "snow to the top"
    assert "Ann" not in repr(row)
    assert "example.org" not in repr(row)


def test_evidence_flags() -> None:
    rows = backtest_pass(
        PASS,
        [sensor(9.0, "2023-06-14", elev_ft=11800)],
        [sat(0.6, "2023-06-13")],
        [],
        [report("p1")],
    )
    assert rows[0]["evidence"] == {
        "sensor_near_pass": True,
        "satellite": True,
        "other_reports": False,
    }


def test_sensor_near_pass_elevation_needs_a_fresh_reading_within_300_ft() -> None:
    day = "2023-06-15"
    assert sensor_near_pass_elevation([sensor(3.0, "2023-06-14", 11700)], day, 11926)
    assert sensor_near_pass_elevation([sensor(3.0, "2023-06-14", 12200)], day, 11926)
    assert not sensor_near_pass_elevation([sensor(3.0, "2023-06-14", 11500)], day, 11926)
    assert not sensor_near_pass_elevation([sensor(3.0, "2023-05-20", 11800)], day, 11926)
    assert not sensor_near_pass_elevation([sensor(3.0, "2023-06-16", 11800)], day, 11926)
    assert not sensor_near_pass_elevation([], day, 11926)


def test_season_of() -> None:
    assert season_of("2023-04-01") == "early"
    assert season_of("2023-06-30") == "early"
    assert season_of("2023-07-01") == "midsummer"
    assert season_of("2026-08-22") == "midsummer"
    assert season_of("2024-09-15") == "fall"
    assert season_of("2024-10-31") == "fall"
    assert season_of("2024-11-01") == "winter"
    assert season_of("2025-03-31") == "winter"


def test_demonstration_posts_are_recognized_by_reserved_hosts() -> None:
    assert is_demonstration_post({"url": "https://example-forum.test/t/1"})
    assert is_demonstration_post({"url": "https://forum.example/t/1"})
    assert is_demonstration_post({"url": "https://www.example.com/t/1"})
    assert not is_demonstration_post({"url": "https://hikers.somewhere.org/t/1"})
    assert not is_demonstration_post({})


# -- rates and summaries -----------------------------------------------------


def test_rate_cell_reports_count_rate_and_interval() -> None:
    cell = rate_cell(5, 10)
    assert cell["count"] == 5 and cell["n"] == 10
    assert cell["thin"] is False
    assert cell["rate"] == pytest.approx(0.5)
    assert cell["low"] == pytest.approx(0.2366, abs=5e-4)
    assert cell["high"] == pytest.approx(0.7634, abs=5e-4)


def test_rate_cell_under_the_minimum_prints_no_percentage() -> None:
    cell = rate_cell(3, MIN_CELL - 1)
    assert cell["thin"] is True
    assert cell["rate"] is None and cell["low"] is None and cell["high"] is None
    assert cell["count"] == 3 and cell["n"] == MIN_CELL - 1
    empty = rate_cell(0, 0)
    assert empty["thin"] is True and empty["rate"] is None


def row(
    outcome: str,
    direction: str | None = None,
    confidence: str = "moderate",
    season: str = "early",
    sensor_near: bool = True,
    satellite: bool = True,
    others: bool = True,
    engine_step: int | None = 2,
    observed: int = 2,
    observed_snow_only: int = 2,
) -> dict[str, Any]:
    return {
        "post_id": "p",
        "pass_slug": "glen",
        "state": "CA",
        "region": "Sierra Nevada",
        "date": "2023-06-14",
        "season": season,
        "year": "2023",
        "outcome": outcome,
        "direction": direction,
        "outcome_snow_only": outcome,
        "direction_snow_only": direction,
        "observed": {"step": observed, "step_snow_only": observed_snow_only},
        "engine": {"step": engine_step, "confidence": confidence},
        "evidence": {
            "sensor_near_pass": sensor_near,
            "satellite": satellite,
            "other_reports": others,
        },
        "demonstration": False,
    }


def test_summary_counts_outcomes_and_directions() -> None:
    rows = (
        [row("exact") for _ in range(6)]
        + [row("off_by_one", "engine_less", engine_step=1) for _ in range(2)]
        + [row("off_by_one", "engine_more", engine_step=3)]
        + [row("off_by_more", "engine_less", engine_step=0)]
        + [row("no_verdict", engine_step=None) for _ in range(3)]
    )
    out = summarize(rows)
    overall = out["overall"]
    assert overall["reports"] == 13
    assert overall["no_verdict"] == 3
    assert overall["n"] == 10
    assert overall["exact"]["count"] == 6
    assert overall["exact"]["rate"] == pytest.approx(0.6)
    assert overall["within_one"]["count"] == 9
    assert overall["off_by_one"]["count"] == 3
    assert overall["off_by_more"]["count"] == 1
    assert overall["engine_less"]["count"] == 3
    assert overall["engine_more"]["count"] == 1


def test_summary_splits_by_confidence_and_flags_thin_cells() -> None:
    rows = [row("exact", confidence="high") for _ in range(12)] + [
        row("off_by_one", "engine_more", confidence="low", engine_step=3) for _ in range(4)
    ]
    out = summarize(rows)
    high = out["by_confidence"]["high"]
    low = out["by_confidence"]["low"]
    assert high["n"] == 12 and high["exact"]["thin"] is False
    assert low["n"] == 4 and low["exact"]["thin"] is True and low["exact"]["rate"] is None
    assert out["by_confidence"]["moderate"]["n"] == 0
    assert "by_confidence.low" in out["thin_cells"]
    assert "by_confidence.high" not in out["thin_cells"]


def test_summary_splits_by_season_and_evidence() -> None:
    rows = [row("exact", season="early", sensor_near=True, satellite=False) for _ in range(10)] + [
        row("off_by_one", "engine_less", season="midsummer", sensor_near=False,
            satellite=True, engine_step=1)
        for _ in range(10)
    ]
    out = summarize(rows)
    assert out["by_season"]["early"]["exact"]["rate"] == pytest.approx(1.0)
    assert out["by_season"]["midsummer"]["exact"]["rate"] == pytest.approx(0.0)
    assert out["by_evidence"]["sensor_near_pass"]["yes"]["n"] == 10
    assert out["by_evidence"]["sensor_near_pass"]["no"]["exact"]["count"] == 0
    assert out["by_evidence"]["satellite"]["yes"]["engine_less"]["count"] == 10


def test_confidence_that_tracks_accuracy() -> None:
    rows = [row("exact", confidence="high") for _ in range(30)] + [
        row("off_by_one", "engine_more", confidence="low", engine_step=3) for _ in range(30)
    ]
    finding = confidence_finding(summarize(rows)["by_confidence"])
    assert finding["verdict"] == "tracks"


def test_confidence_in_the_right_order_but_not_separable() -> None:
    rows = (
        [row("exact", confidence="high") for _ in range(7)]
        + [row("off_by_one", "engine_more", confidence="high", engine_step=3) for _ in range(3)]
        + [row("exact", confidence="low") for _ in range(5)]
        + [row("off_by_one", "engine_more", confidence="low", engine_step=3) for _ in range(5)]
    )
    finding = confidence_finding(summarize(rows)["by_confidence"])
    assert finding["verdict"] == "ordered_but_unproven"


def test_confidence_that_runs_backwards_is_a_finding() -> None:
    rows = (
        [row("exact", confidence="low") for _ in range(9)]
        + [row("off_by_one", "engine_more", confidence="low", engine_step=3)]
        + [row("exact", confidence="high") for _ in range(4)]
        + [row("off_by_one", "engine_more", confidence="high", engine_step=3) for _ in range(6)]
    )
    finding = confidence_finding(summarize(rows)["by_confidence"])
    assert finding["verdict"] == "does_not_track"
    assert finding["grades_compared"] == ["low", "high"]


def test_confidence_with_too_few_reports_to_tell() -> None:
    rows = [row("exact", confidence="high") for _ in range(12)] + [
        row("exact", confidence="low") for _ in range(3)
    ]
    finding = confidence_finding(summarize(rows)["by_confidence"])
    assert finding["verdict"] == "too_thin"
