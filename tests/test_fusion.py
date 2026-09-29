from typing import Any

from fusion import fuse

PASS = {"slug": "glen", "name": "Glen Pass", "elevation_ft": 11926, "creek": "Bubbs Creek"}
DATE = "2023-06-15"


def sensor(swe: float, day: str = "2023-06-14", station: str = "cdec:CRL") -> dict[str, Any]:
    return {
        "metric": "swe_in",
        "observed_date": day,
        "value": swe,
        "provenance": station,
        "meta": {"distance_km": 1.2},
    }


def sat(frac: float, day: str = "2023-06-13") -> dict[str, Any]:
    return {
        "metric": "snow_cover_frac",
        "observed_date": day,
        "value": frac,
        "provenance": "satellite:modeled",
        "meta": {"modeled": True},
    }


def gauge(cfs: float, day: str, swing: float | None = None) -> list[dict[str, Any]]:
    rows = [
        {
            "metric": "discharge_cfs",
            "observed_date": day,
            "value": cfs,
            "provenance": "usgs:1",
            "meta": {},
        }
    ]
    if swing is not None:
        rows.append(
            {
                "metric": "diurnal_swing_pct",
                "observed_date": day,
                "value": swing,
                "provenance": "usgs:1",
                "meta": {},
            }
        )
    return rows


def report(
    snow: str | None = "continuous",
    traction: str | None = "microspikes",
    comfort: str | None = "cautious",
    register: str = "experienced",
    crossing: str | None = None,
    day: str = "2023-06-14",
    pid: str = "p1",
) -> dict[str, Any]:
    return {
        "extraction": {
            "location": "Glen Pass",
            "date_observed": day,
            "snow_condition": snow,
            "traction_used": traction,
            "crossing_condition": crossing,
            "exposure_comfort": comfort,
            "reporter_register": register,
            "quote_span": "quote",
        },
        "post_meta": {"id": pid, "posted_date": day},
    }


def test_empty_evidence_is_unknown() -> None:
    result = fuse(PASS, DATE, [], [], [], [])
    assert result["status"] == "unknown"
    assert result["confidence"] == "low"


def test_agreeing_dense_evidence_is_high_confidence() -> None:
    result = fuse(
        PASS,
        DATE,
        [sensor(12.0)],
        [sat(0.8)],
        gauge(300, "2023-06-14", swing=45),
        [report(pid="p1"), report(pid="p2", day="2023-06-13"), report(pid="p3")],
    )
    assert result["status"] in ("traction_advised", "not_recommended")
    assert result["confidence"] == "high"
    assert result["conflicts"] == []
    streams = {f["stream"] for f in result["facts"]}
    assert {"sensor", "satellite", "report", "gauge"} <= streams


def test_modeled_cover_never_reads_as_a_satellite_look() -> None:
    result = fuse(PASS, DATE, [sensor(12.0)], [sat(0.8)], [], [])
    fact = next(f for f in result["facts"] if f["stream"] == "satellite")
    assert "satellite" not in fact["text"].lower().replace("no satellite", "")
    assert fact["text"].startswith("Modeled snow cover is 80%")
    assert "no satellite saw the pass" in fact["text"]


def test_a_real_scene_still_reads_as_one() -> None:
    scene = {**sat(0.8), "provenance": "satellite:viirs", "meta": {}}
    result = fuse(PASS, DATE, [sensor(12.0)], [scene], [], [])
    fact = next(f for f in result["facts"] if f["stream"] == "satellite")
    assert fact["text"] == (
        "Satellite shows 80% snow cover in the pass bowl, last clear look 2d ago."
    )


def test_conflicts_name_modeled_cover_for_what_it_is() -> None:
    modeled = fuse(PASS, DATE, [sensor(1.0)], [sat(0.9)], [], [])
    assert modeled["conflicts"] == [
        "Modeled snow cover suggests more snow than sensors do (severity 2.7 vs 0.2)."
    ]
    scene = {**sat(0.9), "provenance": "satellite:viirs", "meta": {}}
    real = fuse(PASS, DATE, [sensor(1.0)], [scene], [], [])
    assert real["conflicts"] == [
        "Satellite suggests more snow than sensors do (severity 2.7 vs 0.2)."
    ]
    flipped = fuse(PASS, DATE, [sensor(14.0)], [{**scene, "value": 0.1}], [], [])
    assert flipped["conflicts"] == [
        "Sensors suggest more snow than satellite does (severity 2.8 vs 0.3)."
    ]


def test_sensors_alone_give_a_plain_verdict_without_borrowed_streams() -> None:
    result = fuse(PASS, DATE, [sensor(48.0)], [], gauge(300, "2023-06-14"), [])
    assert result["status"] == "not_recommended"
    assert result["confidence"] == "moderate"
    assert result["conflicts"] == []
    assert [f["stream"] for f in result["facts"]] == ["sensor", "gauge"]
    assert result["components"]["satellite"] is None
    assert result["components"]["reports"] is None
    # One stream cannot disagree with itself, and cannot reach "high" alone.
    assert result["confidence_score"] == 3.0


def test_bare_summer_pass_is_open() -> None:
    result = fuse(
        PASS,
        DATE,
        [sensor(0.0)],
        [sat(0.02)],
        gauge(40, "2023-06-14"),
        [report(snow="none", traction="none", comfort="relaxed")],
    )
    assert result["status"] == "open"


def test_conflict_is_surfaced_and_costs_confidence() -> None:
    # Satellite sees cover; two parties report an easy boot path.
    calm = fuse(
        PASS,
        DATE,
        [],
        [sat(0.9)],
        [],
        [
            report(snow="patchy", traction="none", comfort="relaxed", pid="p1"),
            report(snow="patchy", traction="none", comfort="relaxed", pid="p2"),
        ],
    )
    assert len(calm["conflicts"]) == 1
    agree = fuse(
        PASS,
        DATE,
        [],
        [sat(0.4)],
        [],
        [
            report(snow="patchy", traction="none", comfort="relaxed", pid="p1"),
            report(snow="patchy", traction="none", comfort="relaxed", pid="p2"),
        ],
    )
    assert calm["confidence_score"] < agree["confidence_score"]


def test_dangerous_crossing_forces_not_recommended() -> None:
    result = fuse(
        PASS,
        DATE,
        [sensor(2.0)],
        [],
        [],
        [report(snow="patchy", traction="none", comfort="relaxed", crossing="dangerous")],
    )
    assert result["status"] == "not_recommended"


def test_stale_evidence_decays_out_of_window() -> None:
    result = fuse(PASS, DATE, [sensor(20.0, day="2023-05-01")], [], [], [])
    assert result["status"] == "unknown"


def test_recency_decay_weights_fresh_over_stale() -> None:
    fresh = fuse(PASS, DATE, [sensor(10.0, day="2023-06-14")], [], [], [])
    stale = fuse(PASS, DATE, [sensor(10.0, day="2023-06-06")], [], [], [])
    fresh_w = fresh["components"]["sensor"]["weight"]
    stale_w = stale["components"]["sensor"]["weight"]
    assert fresh_w > stale_w


def test_first_timer_terror_scores_below_thru_hiker_terror() -> None:
    ft = fuse(
        PASS, DATE, [], [], [],
        [report(snow=None, traction=None, comfort="terrifying", register="first_timer")],
    )
    th = fuse(
        PASS, DATE, [], [], [],
        [report(snow=None, traction=None, comfort="terrifying", register="thru_hiker")],
    )
    assert ft["severity"] < th["severity"]


def test_active_melt_flag_from_diurnal_swing() -> None:
    result = fuse(PASS, DATE, [], [], gauge(500, "2023-06-14", swing=50), [report()])
    assert result["crossing"]["active_melt"] is True
    assert any("cross early" in f["text"].lower() for f in result["facts"])


AASGARD = {"slug": "aasgard", "name": "Aasgard Pass", "elevation_ft": 7841, "creek": ""}


def station_at(swe: float, elev_ft: float, station: str, km: float = 8.0) -> dict[str, Any]:
    return {
        "metric": "swe_in",
        "observed_date": "2023-06-14",
        "value": swe,
        "provenance": station,
        "meta": {"distance_km": km, "station_elevation_ft": elev_ft, "station_name": station},
    }


def test_melted_out_sensor_far_below_the_pass_is_blind() -> None:
    # Two low SNOTELs have melted out 3,500 ft below a high pass: that says
    # the snowline is above them, not that the pass is clear. One reading
    # cannot date the melt-out, so no snowline can be inferred either.
    obs = [station_at(0.0, 4270, "snotel:blewett"), station_at(0.0, 3370, "snotel:fish")]
    r = fuse(AASGARD, DATE, obs, [], [], [])
    assert r["status"] == "unknown"
    assert r["confidence"] == "low"
    text = " ".join(f["text"] for f in r["facts"])
    assert "below" in text and "4,270" in text


def test_snow_at_a_lower_sensor_still_counts() -> None:
    # Snow lingering at 4,300 ft means more of it higher up.
    r = fuse(AASGARD, DATE, [station_at(18.0, 4300, "snotel:low")], [], [], [])
    assert r["status"] in ("traction_advised", "not_recommended")


def test_melted_out_sensor_above_the_pass_is_evidence_of_clear() -> None:
    r = fuse(AASGARD, DATE, [station_at(0.0, 8200, "snotel:high")], [], [], [])
    assert r["status"] == "open"


def season(
    elev_ft: float, melt_out: str, eval_date: str, station: str = "snotel:blewett"
) -> list[dict[str, Any]]:
    """Daily readings from April 1: 12 in of SWE until melt-out, zero after."""
    from datetime import date, timedelta

    rows = []
    d = date(int(eval_date[:4]), 4, 1)
    end = date.fromisoformat(eval_date)
    while d <= end:
        swe = 12.0 if d.isoformat() < melt_out else 0.0
        rows.append(
            {
                "metric": "swe_in",
                "observed_date": d.isoformat(),
                "value": swe,
                "provenance": station,
                "id": d.toordinal(),
                "meta": {"distance_km": 8.0, "station_elevation_ft": elev_ft,
                         "station_name": "Blewett Pass"},
            }
        )
        d += timedelta(days=1)
    return rows


def test_recent_melt_out_far_below_implies_snow_at_the_pass() -> None:
    # Melted out at 4,240 ft on May 1; by mid-June the snowline has only
    # climbed to about 6,000 ft, still well under a 7,841 ft pass.
    r = fuse(AASGARD, DATE, season(4240, "2023-05-01", DATE), [], [], [])
    assert r["status"] in ("snow_caution", "traction_advised")
    assert r["confidence"] == "low"
    text = " ".join(f["text"] for f in r["facts"])
    assert "snowline" in text and "estimate" in text


def test_long_ago_melt_out_implies_clear_by_late_season() -> None:
    late = "2023-09-28"
    r = fuse(AASGARD, late, season(4240, "2023-05-01", late), [], [], [])
    assert r["status"] == "open"
    assert r["confidence"] == "low"


BISHOP = {"slug": "bishop", "name": "Bishop Pass", "elevation_ft": 11972, "creek": ""}


def quiet_pillow(eval_date: str) -> list[dict[str, Any]]:
    """A CDEC pillow at 11,200 ft: snow until May 20, zeros to May 30, then silence."""
    rows = season(11200, "2026-05-21", "2026-05-30", station="cdec:BSH")
    for r in rows:
        r["meta"]["station_name"] = "Bishop Pass"
    return rows


def test_pillow_that_went_quiet_after_melt_out_still_informs() -> None:
    r = fuse(BISHOP, "2026-09-28", quiet_pillow("2026-09-28"), [], [], [])
    assert r["status"] == "open"
    assert r["confidence"] == "low"
    assert "quiet" in " ".join(f["text"] for f in r["facts"])


def test_quiet_pillow_says_nothing_once_fall_storms_can_arrive() -> None:
    r = fuse(BISHOP, "2026-11-20", quiet_pillow("2026-11-20"), [], [], [])
    assert r["status"] == "unknown"


PANHANDLE = {"slug": "panhandle-gap", "name": "Panhandle Gap", "elevation_ft": 6719, "creek": ""}


def test_modest_gap_melt_out_still_implies_lingering_snow() -> None:
    # A sensor only 1,300 ft down melted out five weeks ago: the snowline has
    # climbed about 1,400 ft since, to roughly the pass. Not a clean "open".
    rows = season(5400, "2023-06-10", "2023-07-15", station="snotel:morse")
    r = fuse(PANHANDLE, "2023-07-15", rows, [], [], [])
    assert r["status"] != "open"


def test_melted_out_sensor_just_below_the_pass_votes_through_the_snowline() -> None:
    # 200 ft below and long bare: within tolerance, a direct "clear" vote.
    rows = season(6519, "2023-05-01", "2023-07-15", station="snotel:near")
    assert fuse(PANHANDLE, "2023-07-15", rows, [], [], [])["status"] == "open"


# -- readings that cannot be believed ----------------------------------------


KEARSARGE = {"slug": "kearsarge", "name": "Kearsarge Pass", "elevation_ft": 11709, "creek": ""}


def run_of(
    values: list[float],
    last_day: str,
    station: str = "cdec:CRL",
    name: str = "Charlotte Lake",
    elev_ft: float = 10400,
    km: float = 4.0,
) -> list[dict[str, Any]]:
    """One station's daily readings ending on last_day, oldest first."""
    from datetime import date, timedelta

    end = date.fromisoformat(last_day)
    return [
        {
            "metric": "swe_in",
            "observed_date": (end - timedelta(days=len(values) - 1 - i)).isoformat(),
            "value": v,
            "provenance": station,
            "id": f"{station}:{i}",
            "meta": {"distance_km": km, "station_elevation_ft": elev_ft, "station_name": name},
        }
        for i, v in enumerate(values)
    ]


def fact_text(result: dict[str, Any]) -> str:
    return " ".join(f["text"] for f in result["facts"])


def test_an_impossible_reading_does_not_vote() -> None:
    # Charlotte Lake, August 2026: 391.82 in of water at 10,400 ft.
    r = fuse(KEARSARGE, "2026-08-18", run_of([391.82] * 6, "2026-08-12"), [], [], [])
    assert r["components"]["sensor"] is None
    assert r["status"] == "unknown"


def test_an_impossible_reading_is_named_in_the_facts() -> None:
    r = fuse(KEARSARGE, "2026-08-18", run_of([391.82] * 6, "2026-08-12"), [], [], [])
    text = fact_text(r)
    assert "Charlotte Lake" in text and "391.8" in text and "left out" in text
    assert chr(0x2014) not in text  # house style: no em dashes in copy


def test_a_stuck_sensor_does_not_vote_beside_a_live_one() -> None:
    stuck = run_of([67.55] * 10, "2023-07-08", station="cdec:STL", name="State Lakes")
    live = run_of([6.1, 5.4, 4.8, 4.0, 3.1, 2.5], "2023-07-08", station="cdec:BSH", name="Bishop")
    r = fuse(KEARSARGE, "2023-07-08", stuck + live, [], [], [])
    assert r["components"]["sensor"]["stations"] == ["cdec:BSH"]
    assert r["components"]["sensor"]["swe_in"] == 2.5
    assert "State Lakes" in fact_text(r) and "2023-06-29" in fact_text(r)


def test_a_sensor_stuck_today_does_not_vote_with_last_weeks_reading() -> None:
    # Real readings until a week ago, then stuck. Every station counts in
    # full in the average, so an old reading from a broken one must not.
    series = run_of([30.2, 29.1, 28.0] + [27.4] * 7, "2023-07-08", station="cdec:STL")
    r = fuse(KEARSARGE, "2023-07-08", series, [], [], [])
    assert r["components"]["sensor"] is None


def test_a_spike_today_silences_the_station_for_today_only() -> None:
    series = run_of([14.2, 13.6, 32767.0], "2025-06-18")
    assert fuse(KEARSARGE, "2025-06-18", series, [], [], [])["components"]["sensor"] is None
    back = run_of([14.2, 13.6, 32767.0, 12.1], "2025-06-19")
    r = fuse(KEARSARGE, "2025-06-19", back, [], [], [])
    assert r["components"]["sensor"]["swe_in"] == 12.1
    assert "left out" not in fact_text(r)


def test_a_rejected_reading_is_kept_out_of_the_melt_trend() -> None:
    # The trend starts from the oldest reading in the window: here a fault.
    series = run_of([900.0, 9.5, 9.0, 8.5, 8.0], "2023-07-08")
    sensor_part = fuse(KEARSARGE, "2023-07-08", series, [], [], [])["components"]["sensor"]
    assert sensor_part["trend_in_per_day"] == -0.5


def test_a_melted_out_sensor_reading_zero_for_weeks_still_votes() -> None:
    near = run_of([0.0] * 21, "2023-08-01", elev_ft=11600)
    r = fuse(KEARSARGE, "2023-08-01", near, [], [], [])
    assert r["components"]["sensor"]["swe_in"] == 0.0
    assert r["status"] == "open"


def test_a_midwinter_pack_flat_for_a_week_still_votes() -> None:
    r = fuse(KEARSARGE, "2024-01-20", run_of([21.4] * 9, "2024-01-20"), [], [], [])
    assert r["components"]["sensor"]["swe_in"] == 21.4
    assert r["status"] == "not_recommended"


def test_judgement_uses_only_what_was_known_on_the_day() -> None:
    # The run is obvious by July 8, but on July 3 it was four days old.
    series = run_of([31.0, 29.5] + [27.4] * 9, "2023-07-08", station="cdec:STL")
    early = fuse(KEARSARGE, "2023-07-03", series, [], [], [])
    assert early["components"]["sensor"]["swe_in"] == 27.4
    late = fuse(KEARSARGE, "2023-07-08", series, [], [], [])
    assert late["components"]["sensor"] is None


def test_a_stuck_stretch_cannot_date_a_melt_out() -> None:
    # Stuck on 27.4 in for weeks, then reset to zero: the day of the reset
    # is when the sensor was fixed, not when the snow went.
    high = {"slug": "high", "name": "High Pass", "elevation_ft": 13000, "creek": ""}
    series = run_of([27.4] * 30 + [0.0] * 10, "2023-08-01", station="cdec:STL", name="State Lakes")
    r = fuse(high, "2023-08-01", series, [], [], [])
    snowline = r["components"]["snowline"]
    assert snowline is not None
    assert snowline["melt_observed"] is False
    assert "melted out by 2023-07-23" in fact_text(r)


def test_modeled_satellite_from_a_rejected_reading_does_not_vote() -> None:
    stuck = run_of([67.55] * 10, "2023-07-08", station="cdec:STL", name="State Lakes")
    scene = sat(1.0, day="2023-07-06")
    scene["meta"] = {"modeled": True, "from_station": "cdec:STL", "station_swe_in": 67.55}
    r = fuse(KEARSARGE, "2023-07-08", stuck, [scene], [], [])
    assert r["components"]["satellite"] is None
    assert r["status"] == "unknown"


def test_modeled_satellite_from_a_believed_reading_still_votes() -> None:
    live = run_of([6.1, 5.4, 4.8, 4.0, 3.1, 2.5], "2023-07-08", station="cdec:BSH")
    scene = sat(0.4, day="2023-07-06")
    scene["meta"] = {"modeled": True, "from_station": "cdec:BSH", "station_swe_in": 4.0}
    r = fuse(KEARSARGE, "2023-07-08", live, [scene], [], [])
    assert r["components"]["satellite"]["cover_frac"] == 0.4


def test_latest_per_station_leaves_out_stations_that_cannot_be_believed() -> None:
    # The verdict backtest reads the voting stations through this helper.
    from fusion.fusion import _latest_per_station

    stuck = run_of([67.55] * 10, "2023-07-08", station="cdec:STL")
    live = run_of([6.1, 5.4, 4.8, 4.0, 3.1, 2.5], "2023-07-08", station="cdec:BSH")
    faulty = run_of([391.82] * 3, "2023-07-08", station="cdec:CRL")
    assert sorted(_latest_per_station(stuck + live + faulty, "2023-07-08")) == ["cdec:BSH"]
