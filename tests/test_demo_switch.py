"""The demo switch: sample reports and modeled cover stay out unless asked for."""

import json
from pathlib import Path
from typing import Any

import pytest

import config
import pipeline
from extraction.extractor import post_hash
from fusion import fuse
from gazetteer import get_pass
from store import Store

DAY = "2023-06-15"
STATION = "cdec:CRL"
GAUGE = "usgs:11000000"

REAL_POST = {
    "id": "app-1",
    "provenance": "app:report",
    "source": "snowline",
    "url": "https://snowline.app/reports/app-1",
    "author": "a walker",
    "posted_date": "2023-06-14",
    "title": "Glen Pass, north side",
    "text": "Glen Pass this morning. Continuous snow from Rae Lakes to the top, axe out.",
}
REAL_EXTRACTION = {
    "location": "Glen Pass",
    "date_observed": "2023-06-14",
    "snow_condition": "continuous",
    "traction_used": "ice_axe",
    "crossing_condition": None,
    "exposure_comfort": "cautious",
    "reporter_register": "experienced",
    "quote_span": "Continuous snow from Rae Lakes to the top",
}


def _glen() -> dict[str, Any]:
    glen = get_pass("glen")
    assert glen is not None
    return glen


def _seed(store: Store) -> None:
    """Twenty days of deep snow at one station and a running creek at one gauge."""
    for i in range(20):
        day = f"2023-06-{i + 1:02d}"
        store.add_observation(
            f"@{STATION}", "cdec", "swe_in", day, 48.0 - i * 0.4, "in", STATION, None, None,
            {"station_name": "Charlotte Lake", "station_elevation_ft": 10400},
        )
        store.add_observation(
            f"@{GAUGE}", "usgs", "discharge_cfs", day, 300.0 + i, "cfs", GAUGE, None, None,
            {"site_name": "Bubbs Creek"},
        )


@pytest.fixture
def world(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Store:
    """One pass, one station, one gauge, exported into a temp directory."""
    from ingest import cdec, satellite, snotel, usgs

    glen = _glen()
    monkeypatch.setattr(pipeline, "WEB_DATA_DIR", tmp_path / "web")
    monkeypatch.setattr(pipeline, "load_passes", lambda: [glen])
    monkeypatch.setattr(satellite, "load_passes", lambda: [glen])
    monkeypatch.setattr(pipeline, "FORECAST_PATH", tmp_path / "no-forecast.json")
    monkeypatch.setattr(pipeline, "FIRE_PATH", tmp_path / "no-fire.json")
    monkeypatch.setattr(pipeline, "load_winter", lambda today: {})
    link = {
        "provenance": STATION,
        "name": "Charlotte Lake",
        "elevation_ft": 10400,
        "distance_km": 1.2,
    }
    monkeypatch.setattr(cdec, "pass_links", lambda store: {"glen": [link]})
    monkeypatch.setattr(snotel, "pass_links", lambda store: {})
    monkeypatch.setattr(
        usgs,
        "pass_links",
        lambda store: {"glen": [{"provenance": GAUGE, "name": "Bubbs Creek", "distance_km": 3.0}]},
    )
    store = Store(tmp_path / "store.sqlite")
    _seed(store)
    return store


def _detail(tmp_path: Path) -> dict[str, Any]:
    return json.loads((tmp_path / "web" / "pass" / "glen.json").read_text())


def _sensor_only(store: Store) -> dict[str, Any]:
    """What fusion says from the sensor and the gauge alone."""
    sensor = [
        {**o, "meta": {**o["meta"], "distance_km": 1.2}}
        for o in store.observations(f"@{STATION}", stream="cdec")
    ]
    gauge = [
        {**o, "meta": {**o["meta"], "distance_km": 3.0}}
        for o in store.observations(f"@{GAUGE}", stream="usgs")
    ]
    return fuse(_glen(), DAY, sensor, [], gauge, [])


def test_the_switch_is_off_unless_the_environment_says_one(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("SNOWLINE_DEMO_STREAMS", raising=False)
    assert config.demo_streams() is False
    for value in ("", "0", "true", "yes", "on", " 1"):
        monkeypatch.setenv("SNOWLINE_DEMO_STREAMS", value)
        assert config.demo_streams() is False, value
    monkeypatch.setenv("SNOWLINE_DEMO_STREAMS", "1")
    assert config.demo_streams() is True


def test_demo_streams_on_feed_the_verdict_as_before(
    world: Store, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("SNOWLINE_DEMO_STREAMS", "1")
    pipeline.export(world)
    detail = _detail(tmp_path)
    status = detail["statuses"][DAY]
    streams = {f["stream"] for f in status["facts"]}
    assert {"sensor", "satellite", "report", "gauge"} <= streams
    assert {e["source"] for e in detail["ledger"]} == {"sensor", "satellite", "report", "gauge"}
    assert detail["curves"]["snow_cover_frac"]
    assert world.observations("glen", stream="satellite")

    # Unchanged: exactly what fusing the stored rows and the corpus gives.
    fused = world.get_fused("glen", DAY)
    assert fused is not None
    assert fused["components"]["satellite"] is not None
    assert fused["components"]["reports"]["n_reports"] >= 1
    assert fused["confidence_score"] > _sensor_only(world)["confidence_score"]


def test_demo_streams_off_leave_no_trace_on_the_verdict(
    world: Store, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    # A store carried over from a demo run still holds modeled rows.
    world.add_observation(
        "glen", "satellite", "snow_cover_frac", "2023-06-13", 1.0, "frac",
        "satellite:modeled", None, None, {"modeled": True},
    )
    monkeypatch.delenv("SNOWLINE_DEMO_STREAMS", raising=False)
    pipeline.export(world)
    detail = _detail(tmp_path)

    assert world.observations(stream="satellite") == []
    assert detail["curves"] == {"snow_cover_frac": []}
    assert {e["source"] for e in detail["ledger"]} == {"sensor", "gauge"}

    expected = _sensor_only(world)
    fused = world.get_fused("glen", DAY)
    assert fused is not None
    assert fused["components"]["satellite"] is None
    assert fused["components"]["reports"] is None
    assert fused["crossing"]["worst_reported"] is None
    for key in ("status", "severity", "confidence", "confidence_score", "conflicts", "facts"):
        assert fused[key] == expected[key], key
        assert detail["statuses"][DAY][key] == expected[key], key

    for status in detail["statuses"].values():
        assert {f["stream"] for f in status["facts"]} <= {"sensor", "gauge", "none"}
        text = " ".join(f["text"] for f in status["facts"]).lower()
        for word in ("satellite", "party", "parties", "reported"):
            assert word not in text


def test_the_switch_changes_the_verdict_inputs_not_the_sensor_story(
    world: Store, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("SNOWLINE_DEMO_STREAMS", "1")
    pipeline.export(world)
    on = _detail(tmp_path)["statuses"][DAY]
    monkeypatch.delenv("SNOWLINE_DEMO_STREAMS")
    pipeline.export(world)
    off = _detail(tmp_path)["statuses"][DAY]

    assert off["confidence_score"] < on["confidence_score"]
    sensor_fact = next(f for f in off["facts"] if f["stream"] == "sensor")
    assert sensor_fact in on["facts"]
    # 40 in of water in the snowpack is deep snow with or without the samples.
    assert on["status"] == off["status"] == "not_recommended"


def test_a_real_report_flows_through_with_the_switch_off(
    world: Store, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    sample = {
        **REAL_POST,
        "id": "p-sample",
        "provenance": "corpus:curated",
        "url": "https://example-forum.test/topix/t/1",
        "text": "Glen Pass yesterday, sample text written for the demo, deep snow all the way.",
    }
    for post in (REAL_POST, sample):
        world.put_extraction(
            post_hash(post["text"]),
            {k: post[k] for k in ("id", "source", "url", "author", "posted_date", "title")},
            REAL_EXTRACTION,
            "test-model",
        )
    monkeypatch.setattr(pipeline, "load_corpus", lambda: [sample, REAL_POST])
    monkeypatch.delenv("SNOWLINE_DEMO_STREAMS", raising=False)
    pipeline.export(world)
    detail = _detail(tmp_path)

    reports = [e for e in detail["ledger"] if e["source"] == "report"]
    assert [e["detail"]["url"] for e in reports] == [REAL_POST["url"]]
    fused = world.get_fused("glen", DAY)
    assert fused is not None
    assert fused["components"]["reports"]["n_reports"] == 1
    assert fused["components"]["satellite"] is None


def test_the_vignette_draws_from_sensors_when_nothing_else_sees_the_pass() -> None:
    sensor = [
        {
            "metric": "swe_in", "observed_date": "2023-06-14", "value": 48.0,
            "provenance": STATION, "meta": {"distance_km": 1.2},
        }
    ]
    deep = fuse(_glen(), DAY, sensor, [], [], [])
    scene = pipeline._vignette_params(deep, _glen())
    assert scene["snow_cover"] == 1.0
    assert scene["sky_fresh"] is True

    bare = fuse(_glen(), DAY, [{**sensor[0], "value": 0.0}], [], [], [])
    scene = pipeline._vignette_params(bare, _glen())
    assert scene["snow_cover"] == 0.0
    assert scene["snowline_frac"] == 1.0

    stale = fuse(_glen(), DAY, [{**sensor[0], "observed_date": "2023-06-07"}], [], [], [])
    assert pipeline._vignette_params(stale, _glen())["sky_fresh"] is False


def test_the_vignette_follows_the_snowline_estimate_when_sensors_are_blind() -> None:
    # A station that melted out far below the pass: no sensor component, only
    # the snowline estimate. The scene must not draw a bare pass under a
    # status that says snow is likely.
    from tests.test_fusion import AASGARD, season

    result = fuse(AASGARD, DAY, season(4240, "2023-05-01", DAY), [], [], [])
    assert result["components"]["sensor"] is None
    assert result["components"]["snowline"]["severity"] > 0.5
    scene = pipeline._vignette_params(result, AASGARD)
    assert 0.0 < scene["snow_cover"] < 1.0

    unknown = fuse(AASGARD, DAY, [], [], [], [])
    scene = pipeline._vignette_params(unknown, AASGARD)
    assert scene["snow_cover"] == 0.0
    assert scene["sky_fresh"] is False


def test_landing_counts_what_the_product_really_has(
    world: Store, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    from datetime import UTC, datetime

    today = datetime.now(UTC).date().isoformat()
    monkeypatch.setattr(
        pipeline,
        "load_access",
        lambda: {
            "trailheads": [{"name": "a"}, {"name": "b"}, {"name": "c"}],
            "campgrounds": [{"name": "d"}, {"name": "e"}],
            "parking": [{"name": "f"}],
        },
    )
    monkeypatch.setattr(
        pipeline, "link_access", lambda *args: {"trailheads": [], "campgrounds": []}
    )
    fire = tmp_path / "web" / "fire.json"
    fire.parent.mkdir(parents=True)
    fire.write_text(
        json.dumps(
            {
                "issued_for": today,
                "fires_available": True,
                "fire_labels": {"type": "FeatureCollection", "features": [{}, {}, {}, {}]},
            }
        )
    )
    pipeline.export(world)
    counts = json.loads((tmp_path / "web" / "landing.json").read_text())["counts"]
    assert counts["trailheads"] == 3
    assert counts["campgrounds"] == 2
    assert counts["fires"] == 4
    assert counts["snow_stations"] == 1 and counts["stream_gauges"] == 1


def test_fire_count_is_zero_when_the_file_is_absent_stale_or_unavailable(
    tmp_path: Path,
) -> None:
    assert pipeline._fire_count("2026-09-29", tmp_path / "absent.json") == 0
    path = tmp_path / "fire.json"
    labels = {"type": "FeatureCollection", "features": [{}, {}]}
    path.write_text(json.dumps({"issued_for": "2026-09-27", "fire_labels": labels}))
    assert pipeline._fire_count("2026-09-29", path) == 0
    path.write_text(json.dumps({"issued_for": "2026-09-28", "fire_labels": labels}))
    assert pipeline._fire_count("2026-09-29", path) == 2
    path.write_text(
        json.dumps({"issued_for": "2026-09-29", "fires_available": False, "fire_labels": labels})
    )
    assert pipeline._fire_count("2026-09-29", path) == 0
    path.write_text("not json")
    assert pipeline._fire_count("2026-09-29", path) == 0
