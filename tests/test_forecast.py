from datetime import date

from fusion.forecast import headline, parse_interval, summarize

TODAY = date(2026, 10, 1)


def layer(*vals: tuple[str, float]) -> dict:
    return {"values": [{"validTime": t, "value": v} for t, v in vals]}


def grid(**layers: dict) -> dict:
    return {"elevation": {"value": 2438.4}, **layers}  # 8,000 ft grid cell


def test_parse_interval_handles_days_and_hours() -> None:
    s, e = parse_interval("2026-10-01T12:00:00+00:00/P1DT6H")
    assert (e - s).total_seconds() == 30 * 3600


def test_temperatures_lapse_to_pass_elevation() -> None:
    # 10 C on an 8,000 ft grid cell, read at a 10,000 ft pass: 2 x 3.5 F colder.
    g = grid(temperature=layer(("2026-10-01T19:00:00+00:00/PT1H", 10.0)))
    day = summarize(g, 10000, TODAY)[0]
    assert day["high_f"] == round(50 - 7)


def test_snowfall_splits_across_local_midnight() -> None:
    # 06:00 to 12:00 UTC is 23:00 to 05:00 Pacific: 1/6 today, 5/6 tomorrow.
    g = grid(snowfallAmount=layer(("2026-10-02T06:00:00+00:00/PT6H", 60.0)))
    days = summarize(g, 9000, TODAY)
    assert days[0]["snowfall_in"] == round(10 / 25.4, 1)
    assert days[1]["snowfall_in"] == round(50 / 25.4, 1)


def test_snow_level_below_the_pass_headlines_new_snow() -> None:
    g = grid(
        snowLevel=layer(("2026-10-03T12:00:00+00:00/PT12H", 2133.6)),  # 7,000 ft
        probabilityOfPrecipitation=layer(("2026-10-03T12:00:00+00:00/PT12H", 60)),
    )
    facts = headline(summarize(g, 11926, TODAY), 11926, TODAY)
    assert facts and facts[0].startswith("New snow possible Saturday")
    assert "7,000 ft" in facts[0]


def test_snow_level_above_the_pass_is_not_snow_at_the_pass() -> None:
    g = grid(
        snowLevel=layer(("2026-10-03T12:00:00+00:00/PT12H", 4000.0)),  # 13,100 ft
        probabilityOfPrecipitation=layer(("2026-10-03T12:00:00+00:00/PT12H", 80)),
        temperature=layer(("2026-10-03T20:00:00+00:00/PT1H", 12.0)),
    )
    facts = headline(summarize(g, 11926, TODAY), 11926, TODAY)
    assert not any("New snow" in f for f in facts)


def test_thunder_is_reported() -> None:
    g = grid(probabilityOfThunder=layer(("2026-10-02T21:00:00+00:00/PT3H", 40)))
    facts = headline(summarize(g, 9000, TODAY), 9000, TODAY)
    assert any("Thunderstorms possible tomorrow (40% chance)" in f for f in facts)


def test_quiet_week_says_so() -> None:
    g = grid(temperature=layer(("2026-10-01T20:00:00+00:00/P7D", 15.0)))
    facts = headline(summarize(g, 8000, TODAY), 8000, TODAY)
    assert facts == [
        "No snow or storms in the forecast this week; highs near 59°F at pass elevation."
    ]
