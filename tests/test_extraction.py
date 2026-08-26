from extraction.calibrate import calibrated_severity
from extraction.resolve import resolve_post
from extraction.schema import validate


def _valid_record() -> dict:
    return {
        "location": "Glen Pass",
        "date_observed": "2023-06-13",
        "snow_condition": "continuous",
        "traction_used": "ice_axe",
        "crossing_condition": "knee_high",
        "exposure_comfort": "sketchy",
        "reporter_register": "first_timer",
        "quote_span": "it was terrifying",
    }


def test_valid_record_passes() -> None:
    assert validate(_valid_record()) == []


def test_null_heavy_record_passes() -> None:
    record = dict.fromkeys(_valid_record(), None)
    record["reporter_register"] = "unknown"
    assert validate(record) == []


def test_bad_enum_and_date_fail() -> None:
    record = _valid_record()
    record["snow_condition"] = "icy"
    record["date_observed"] = "June 13"
    problems = validate(record)
    assert any("snow_condition" in p for p in problems)
    assert any("date_observed" in p for p in problems)


def test_missing_and_extra_fields_fail() -> None:
    record = _valid_record()
    del record["quote_span"]
    record["vibes"] = "good"
    problems = validate(record)
    assert any("missing field: quote_span" in p for p in problems)
    assert any("unexpected fields" in p for p in problems)


def test_resolve_prefers_location_then_title_then_text() -> None:
    post = {"title": "Trip report", "text": "we hiked a lot"}
    assert resolve_post({"location": "the pass after Rae Lakes"}, post) == "glen"
    post = {"title": "Bishop Pass conditions", "text": "snowy"}
    assert resolve_post({"location": None}, post) == "bishop"
    post = {"title": "Big day", "text": "went over kearsarge at dawn"}
    assert resolve_post({"location": None}, post) == "kearsarge"
    post = {"title": "Desert trip", "text": "saguaros everywhere"}
    assert resolve_post({"location": None}, post) is None


def test_calibration_orders_registers() -> None:
    # Same adjective, different reporters: first-timer damped, thru-hiker boosted.
    ft = calibrated_severity("terrifying", "first_timer")
    un = calibrated_severity("terrifying", "unknown")
    th = calibrated_severity("terrifying", "thru_hiker")
    assert ft is not None and un is not None and th is not None
    assert ft < un <= th


def test_calibration_relaxed_stays_relaxed() -> None:
    assert calibrated_severity("relaxed", "thru_hiker") == 0.0
    assert calibrated_severity(None, "experienced") is None


def test_calibration_clamps() -> None:
    th = calibrated_severity("terrifying", "thru_hiker")
    assert th is not None and th <= 3.0
