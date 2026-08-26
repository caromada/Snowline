from store import Store


def test_raw_first_round_trip() -> None:
    s = Store(":memory:")
    raw_id = s.record_raw("snotel", "https://example/api", '{"x":1}')
    assert raw_id == 1
    obs_id = s.add_observation(
        pass_slug="glen",
        stream="snotel",
        metric="swe_in",
        observed_date="2023-06-15",
        value=31.2,
        unit="in",
        provenance="station:356:CA:SNTL",
        raw_fetch_id=raw_id,
        geom={"type": "Point", "coordinates": [-118.4, 36.78]},
        meta={"station_name": "Test"},
    )
    assert obs_id == 1
    rows = s.observations(pass_slug="glen", stream="snotel")
    assert len(rows) == 1
    r = rows[0]
    assert r["value"] == 31.2
    assert r["raw_fetch_id"] == raw_id
    assert r["geom"]["coordinates"] == [-118.4, 36.78]
    assert r["meta"]["station_name"] == "Test"


def test_observation_date_filtering() -> None:
    s = Store(":memory:")
    for d in ("2023-05-01", "2023-06-01", "2023-07-01"):
        s.add_observation("glen", "usgs", "discharge_cfs", d, 100.0, "cfs", "site:1")
    assert len(s.observations(start="2023-05-15", end="2023-06-15")) == 1


def test_extraction_cache_round_trip() -> None:
    s = Store(":memory:")
    assert s.get_extraction("abc") is None
    s.put_extraction("abc", {"url": "u"}, {"location": "glen"}, "claude-haiku-4-5", 100, 50)
    got = s.get_extraction("abc")
    assert got is not None
    assert got["extraction"]["location"] == "glen"
    assert got["tokens_in"] == 100


def test_fused_round_trip() -> None:
    s = Store(":memory:")
    s.put_fused("glen", "2023-06-15", {"status": "traction_advised"})
    assert s.get_fused("glen", "2023-06-15") == {"status": "traction_advised"}
    assert s.get_fused("glen", "2023-06-16") is None
