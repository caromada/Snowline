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
