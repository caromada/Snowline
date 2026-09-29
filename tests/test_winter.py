import json
import logging
from datetime import date
from pathlib import Path
from typing import Any

import pytest

import ingest.caltrans as caltrans
import ingest.tripcheck as tripcheck
import ingest.winter as winter_ingest
import ingest.wsdot as wsdot
from fusion.avalanche import parse_zones
from fusion.winter import load_winter, pass_winter
from ingest.http import FetchError
from store import Store

TODAY = date(2027, 1, 14)
FIXTURE = json.loads((Path(__file__).parent / "fixtures" / "avalanche_map_layer.json").read_text())
ZONES = parse_zones(FIXTURE)

DONNER = {"slug": "donner", "name": "Donner Pass", "lat": 39.315978, "lon": -120.321572,
          "elevation_ft": 7057}
GLEN = {"slug": "glen", "name": "Glen Pass", "lat": 36.7854, "lon": -118.4166,
        "elevation_ft": 11926}

ROAD = {
    "agency": "Caltrans", "agency_link": "https://roads.dot.ca.gov/", "road": "I-80",
    "location": "Castle Peak", "lat": 39.34256, "lon": -120.33873, "active": True,
    "updated": "2027-01-14T05:12:40",
    "lines": [{"label": "East", "code": "R-2", "text": "Chains are required."}],
}


def test_pass_record_carries_the_official_rating_roads_and_snow() -> None:
    station = {
        "provenance": "cdec:CSL", "name": "Central Sierra Snow Lab", "elevation_ft": 6900,
        "distance_km": 2.0,
        "rows": [
            {"metric": "swe_in", "observed_date": "2027-01-13", "value": 10.0},
            {"metric": "swe_in", "observed_date": "2027-01-14", "value": 11.0},
            {"metric": "snow_depth_in", "observed_date": "2027-01-13", "value": 40},
            {"metric": "snow_depth_in", "observed_date": "2027-01-14", "value": 50},
        ],
    }
    w = pass_winter(DONNER, ZONES, [ROAD], [station], TODAY, None)
    assert w is not None
    assert w["avalanche"]["rating"] == "Considerable" and w["avalanche"]["level"] == 3
    assert w["avalanche"]["center"] == "Sierra Avalanche Center"
    assert w["roads"][0]["location"] == "Castle Peak"
    assert w["fresh_snow"]["stations"][0]["swe_24h_in"] == 1.0


def test_pass_outside_every_zone_says_so_with_an_explicit_null() -> None:
    w = pass_winter(GLEN, ZONES, [], [], TODAY, None)
    assert w == {"avalanche": None}


def test_layer_being_down_leaves_avalanche_out_instead_of_claiming_no_zone() -> None:
    w = pass_winter(DONNER, None, [ROAD], [], TODAY, None)
    assert w is not None
    assert "avalanche" not in w
    assert "fresh_snow" not in w
    assert len(w["roads"]) == 1


def test_a_pass_with_nothing_to_show_has_no_record() -> None:
    assert pass_winter(GLEN, None, [], [], TODAY, None) is None


def _doc(issued_for: str) -> dict[str, Any]:
    return {
        "generated_at": f"{issued_for}T14:05:00+00:00",
        "issued_for": issued_for,
        "passes": {"glen": {"avalanche": None}},
    }


def test_load_winter_merges_a_fresh_file(tmp_path: Path) -> None:
    path = tmp_path / "passes.json"
    path.write_text(json.dumps(_doc("2027-01-14")))
    assert load_winter("2027-01-14", path) == {
        "glen": {
            "avalanche": None,
            "issued_for": "2027-01-14",
            "fetched_at": "2027-01-14T14:05:00+00:00",
        }
    }
    # Yesterday's file still counts, the same rule forecasts follow.
    assert "glen" in load_winter("2027-01-15", path)


def test_load_winter_omits_stale_missing_and_broken_files(tmp_path: Path) -> None:
    path = tmp_path / "passes.json"
    assert load_winter("2027-01-14", path) == {}
    path.write_text(json.dumps(_doc("2027-01-12")))
    assert load_winter("2027-01-14", path) == {}
    path.write_text("{not json")
    assert load_winter("2027-01-14", path) == {}
    path.write_text(json.dumps({"passes": {"glen": {}}}))
    assert load_winter("2027-01-14", path) == {}


def _no_network(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    """Replace every fetcher; returns the list that records what was called."""
    calls: list[str] = []

    def fetcher(name: str, result: object):  # noqa: ANN202 - test helper factory
        def fetch(record: object) -> object:
            calls.append(name)
            if isinstance(result, Exception):
                raise result
            return result

        return fetch

    monkeypatch.setattr(winter_ingest, "SOURCES", {
        "avalanche": fetcher("avalanche", ZONES),
        "caltrans": fetcher("caltrans", [ROAD]),
        "wsdot": fetcher("wsdot", None),
        "tripcheck": fetcher("tripcheck", RuntimeError("parser met a shape it never saw")),
    })
    monkeypatch.setattr(winter_ingest, "load_passes", lambda: [DONNER, GLEN])
    return calls


def test_run_writes_the_file_and_survives_any_one_source_failing(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    calls = _no_network(monkeypatch)
    out = tmp_path / "winter" / "passes.json"
    doc = winter_ingest.run(
        today=TODAY, out_path=out, db_path=tmp_path / "absent.sqlite",
        forecast_path=tmp_path / "absent.json",
    )
    assert sorted(calls) == ["avalanche", "caltrans", "tripcheck", "wsdot"]
    assert doc["issued_for"] == "2027-01-14"
    assert doc["sources"] == {
        "avalanche": "ok", "caltrans": "ok", "wsdot": "unavailable",
        "tripcheck": "failed", "snow_sensors": "unavailable", "forecast": "unavailable",
    }
    assert doc["passes"]["donner"]["avalanche"]["rating"] == "Considerable"
    assert doc["passes"]["donner"]["roads"][0]["lines"][0]["text"] == "Chains are required."
    assert doc["passes"]["glen"] == {"avalanche": None}
    assert json.loads(out.read_text()) == doc
    assert not (tmp_path / "absent.sqlite").exists()  # a missing store is never created


def test_run_with_every_source_down_writes_nothing_and_reports_failure(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    _no_network(monkeypatch)
    monkeypatch.setattr(winter_ingest, "SOURCES", {
        name: (lambda record: None)
        for name in ("avalanche", "caltrans", "wsdot", "tripcheck")
    })
    out = tmp_path / "winter" / "passes.json"
    with pytest.raises(winter_ingest.NothingFetched):
        winter_ingest.run(
            today=TODAY, out_path=out, db_path=tmp_path / "absent.sqlite",
            forecast_path=tmp_path / "absent.json",
        )
    assert not out.exists()


def test_run_reads_fresh_snow_from_the_store_and_the_forecast_file(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    _no_network(monkeypatch)
    db = tmp_path / "sierra.sqlite"
    store = Store(db)
    for day, swe, depth in (("2027-01-13", 10.0, 40.0), ("2027-01-14", 11.0, 50.0)):
        for metric, value in (("swe_in", swe), ("snow_depth_in", depth)):
            store.add_observation("@cdec:CSL", "cdec", metric, day, value, "in", "cdec:CSL")
    store.close()
    link = {"provenance": "cdec:CSL", "name": "Central Sierra Snow Lab",
            "elevation_ft": 6900, "distance_km": 2.0}
    monkeypatch.setattr(
        winter_ingest, "station_links", lambda store: {"cdec": {"donner": [link]}, "snotel": {}}
    )
    forecast = tmp_path / "forecast.json"
    forecast.write_text(json.dumps({
        "issued_for": "2027-01-14",
        "passes": {"glen": {"days": [{"date": "2027-01-14", "snowfall_in": 2.0}],
                            "source": "https://forecast.weather.gov/"}},
    }))
    doc = winter_ingest.run(
        today=TODAY, out_path=tmp_path / "out.json", db_path=db, forecast_path=forecast
    )
    assert doc["sources"]["snow_sensors"] == "ok"
    assert doc["sources"]["forecast"] == "ok"
    assert doc["passes"]["donner"]["fresh_snow"]["facts"] == [
        "Central Sierra Snow Lab (6,900 ft, 1.2 mi away) gained 1.0 in of snow water and "
        "10 in of snow depth in the 24 hours to Jan 14."
    ]
    assert doc["passes"]["glen"]["fresh_snow"]["facts"] == [
        "Forecast: 2.0 in of snow on Jan 14."
    ]


def test_keyed_sources_skip_quietly_without_a_key(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    def boom(*args: object, **kwargs: object) -> None:
        raise AssertionError("no request may be made without a key")

    monkeypatch.setattr(wsdot, "fetch_json", boom)
    monkeypatch.setattr(tripcheck, "fetch_json", boom)
    monkeypatch.delenv("WSDOT_ACCESS_CODE", raising=False)
    monkeypatch.setenv("TRIPCHECK_API_KEY", "  ")
    with caplog.at_level(logging.INFO):
        assert wsdot.fetch_statuses() is None
        assert tripcheck.fetch_statuses() is None
    assert "WSDOT_ACCESS_CODE is not set" in caplog.text
    assert "TRIPCHECK_API_KEY is not set" in caplog.text


def test_a_failing_keyed_request_never_logs_the_key(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    def denied(url: str, params: dict[str, str], **kwargs: object) -> None:
        secret = next(iter(params.values()))
        raise FetchError(f"401 Client Error for url: {url}?AccessCode={secret}")

    monkeypatch.setattr(wsdot, "fetch_json", denied)
    monkeypatch.setattr(tripcheck, "fetch_json", denied)
    monkeypatch.setenv("WSDOT_ACCESS_CODE", "test-code-123")
    monkeypatch.setenv("TRIPCHECK_API_KEY", "test-key-456")
    with caplog.at_level(logging.INFO):
        assert wsdot.fetch_statuses() is None
        assert tripcheck.fetch_statuses() is None
    assert "unavailable" in caplog.text
    assert "test-code-123" not in caplog.text
    assert "test-key-456" not in caplog.text


def test_keyed_requests_send_the_key_uncached(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: list[tuple[str, dict[str, str], object]] = []

    def fake(url: str, params: dict[str, str], **kwargs: object) -> tuple[object, str, bool]:
        seen.append((url, params, kwargs.get("cache")))
        return [], "[]", False

    monkeypatch.setattr(wsdot, "fetch_json", fake)
    monkeypatch.setenv("WSDOT_ACCESS_CODE", "test-code-123")
    assert wsdot.fetch_statuses() is None  # an empty answer is not a report
    assert seen == [(wsdot.URL, {"AccessCode": "test-code-123"}, False)]


def test_each_caltrans_district_fails_alone(monkeypatch: pytest.MonkeyPatch) -> None:
    def fake(url: str, **kwargs: object) -> tuple[object, str, bool]:
        assert kwargs.get("cache") is False
        if "ccStatusD10" not in url:
            raise FetchError(f"500 Server Error for url: {url}")
        record = {
            "cc": {
                "location": {"locationName": "KIRKWOOD", "route": "SR-88", "direction": "West",
                             "latitude": "38.699970", "longitude": "-120.080170"},
                "inService": "true",
                "statusData": {
                    "statusTimestamp": {"statusDate": "2026-09-25", "statusTime": "08:03:46"},
                    "status": "R-0",
                    "statusDescription": "No chain controls are in effect at this time.",
                },
            }
        }
        return {"data": [record]}, "", False

    monkeypatch.setattr(caltrans, "fetch_json", fake)
    statuses = caltrans.fetch_statuses()
    assert statuses is not None and [s["location"] for s in statuses] == ["KIRKWOOD"]

    def all_down(url: str, **kwargs: object) -> tuple[object, str, bool]:
        raise FetchError("500")

    monkeypatch.setattr(caltrans, "fetch_json", all_down)
    assert caltrans.fetch_statuses() is None


def test_district_urls_pad_the_file_name_but_not_the_folder() -> None:
    assert caltrans.district_url(3) == "https://cwwp2.dot.ca.gov/data/d3/cc/ccStatusD03.json"
    assert caltrans.district_url(10) == "https://cwwp2.dot.ca.gov/data/d10/cc/ccStatusD10.json"


def test_raw_payloads_are_kept_as_fetched_and_without_the_key(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    layer = json.dumps(FIXTURE)
    passes = json.dumps(
        [{"MountainPassName": "Stevens Pass US 2", "Latitude": 47.7462, "Longitude": -121.0859,
          "RoadCondition": "Bare and dry."}]
    )

    def fake(url: str, params: dict[str, str] | None = None, **kwargs: object):  # noqa: ANN202
        if "avalanche.org" in url:
            return json.loads(layer), layer, False
        if "wsdot" in url:
            return json.loads(passes), passes, False
        raise FetchError("500")

    for module in (winter_ingest.avalanche, caltrans, wsdot, tripcheck):
        monkeypatch.setattr(module, "fetch_json", fake)
    monkeypatch.setenv("WSDOT_ACCESS_CODE", "test-code-123")
    monkeypatch.delenv("TRIPCHECK_API_KEY", raising=False)
    monkeypatch.setattr(winter_ingest, "load_passes", lambda: [DONNER])
    monkeypatch.setattr(winter_ingest, "station_links", lambda store: {"cdec": {}, "snotel": {}})
    db = tmp_path / "sierra.sqlite"
    Store(db).close()

    doc = winter_ingest.run(
        today=TODAY, out_path=tmp_path / "out.json", db_path=db,
        forecast_path=tmp_path / "absent.json",
    )
    assert doc["sources"]["avalanche"] == "ok" and doc["sources"]["caltrans"] == "unavailable"

    store = Store(db)
    rows = store.conn.execute("SELECT source, url, payload FROM raw_fetches ORDER BY id").fetchall()
    store.close()
    assert [(r["source"], r["url"]) for r in rows] == [
        ("avalanche", winter_ingest.avalanche.MAP_LAYER_URL),
        ("wsdot", wsdot.URL),
    ]
    assert rows[0]["payload"] == layer
    assert rows[1]["payload"] == passes
    assert all("test-code-123" not in r["url"] + r["payload"] for r in rows)
