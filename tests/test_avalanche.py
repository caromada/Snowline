import json
from pathlib import Path

from fusion.avalanche import (
    DANGER_SCALE,
    contains,
    in_region,
    official_rating,
    parse_zones,
    zone_at,
)

# Zone outlines, names, centers and links are the live avalanche.org map layer
# of 2026-09-29, thinned. Every zone was off-season that day, so the in-season
# fields on three zones follow the live field shapes with the published North
# American danger scale wording.
FIXTURE = json.loads((Path(__file__).parent / "fixtures" / "avalanche_map_layer.json").read_text())

DONNER = (-120.321572, 39.315978)
STEVENS = (-121.089171, 47.745635)
SNOQUALMIE = (-121.412071, 47.425224)
SANTIAM = (-121.845523, 44.424754)
GLEN = (-118.4166, 36.7854)

SQUARE = [[0.0, 0.0], [10.0, 0.0], [10.0, 10.0], [0.0, 10.0], [0.0, 0.0]]
HOLE = [[4.0, 4.0], [6.0, 4.0], [6.0, 6.0], [4.0, 6.0], [4.0, 4.0]]
ISLAND = [[20.0, 20.0], [22.0, 20.0], [22.0, 22.0], [20.0, 22.0], [20.0, 20.0]]


def _props(**over: object) -> dict:
    return {
        "name": "Central Sierra Nevada",
        "center": "Sierra Avalanche Center",
        "center_link": "https://www.sierraavalanchecenter.org/",
        "timezone": "America/Los_Angeles",
        "off_season": False,
        "travel_advice": "Dangerous avalanche conditions. Careful snowpack evaluation, "
        "cautious route-finding, and conservative decision-making essential.",
        "danger": "considerable",
        "danger_level": 3,
        "link": "https://www.sierraavalanchecenter.org/forecasts/avalanche/central-sierra-nevada",
        "start_date": "2027-01-14T07:00:00",
        "end_date": "2027-01-15T07:00:00",
        "warning": {"product": None},
        **over,
    }


def test_polygon_with_a_hole_excludes_the_hole() -> None:
    geom = {"type": "Polygon", "coordinates": [SQUARE, HOLE]}
    assert contains(geom, 2.0, 2.0)
    assert not contains(geom, 5.0, 5.0)
    assert not contains(geom, 11.0, 5.0)


def test_multipolygon_checks_every_part_and_its_own_holes() -> None:
    geom = {"type": "MultiPolygon", "coordinates": [[SQUARE, HOLE], [ISLAND]]}
    assert contains(geom, 21.0, 21.0)
    assert contains(geom, 1.0, 9.0)
    assert not contains(geom, 5.0, 5.0)
    assert not contains(geom, 15.0, 15.0)


def test_unknown_or_empty_geometry_contains_nothing() -> None:
    assert not contains({"type": "Point", "coordinates": [1.0, 1.0]}, 1.0, 1.0)
    assert not contains({"type": "Polygon", "coordinates": []}, 1.0, 1.0)
    assert not contains(None, 1.0, 1.0)


def test_region_filter_keeps_the_west_coast_and_drops_new_hampshire() -> None:
    states = [f["properties"]["state"] for f in FIXTURE["features"] if in_region(f)]
    assert sorted(states) == ["CA", "CA", "OR", "WA", "WA"]
    assert len(parse_zones(FIXTURE)) == 5


def test_region_filter_goes_by_geometry_not_the_state_label() -> None:
    nevada_side = {
        "type": "Feature",
        "properties": {"state": "NV", "name": "Straddles the state line"},
        "geometry": {"type": "Polygon", "coordinates": [[
            [-120.2, 39.0], [-119.7, 39.0], [-119.7, 39.5], [-120.2, 39.5], [-120.2, 39.0],
        ]]},
    }
    assert in_region(nevada_side)


def test_each_road_pass_lands_in_its_own_zone() -> None:
    zones = parse_zones(FIXTURE)
    assert zone_at(zones, *DONNER)["properties"]["name"] == "Central Sierra Nevada"
    assert zone_at(zones, *STEVENS)["properties"]["name"] == "Stevens Pass"
    assert zone_at(zones, *SNOQUALMIE)["properties"]["name"] == "Snoqualmie Pass"
    assert zone_at(zones, *SANTIAM)["properties"]["name"] == "Central Cascades"


def test_a_pass_outside_every_zone_has_no_zone() -> None:
    assert zone_at(parse_zones(FIXTURE), *GLEN) is None


def test_overlapping_zones_resolve_to_the_smaller_one() -> None:
    def zone(name: str, ring: list) -> dict:
        return {
            "type": "Feature",
            "properties": {"name": name, "state": "CA"},
            "geometry": {"type": "Polygon", "coordinates": [ring]},
        }

    big = [[-121.0, 38.0], [-119.0, 38.0], [-119.0, 40.0], [-121.0, 40.0], [-121.0, 38.0]]
    small = [[-120.5, 39.0], [-120.0, 39.0], [-120.0, 39.5], [-120.5, 39.5], [-120.5, 39.0]]
    doc = {"features": [zone("Range", big), zone("Pass corridor", small)]}
    assert zone_at(parse_zones(doc), *DONNER)["properties"]["name"] == "Pass corridor"


def test_rating_is_passed_through_exactly_as_issued() -> None:
    r = official_rating(_props())
    assert r["level"] == 3
    assert r["rating"] == "Considerable"
    assert r["travel_advice"] == (
        "Dangerous avalanche conditions. Careful snowpack evaluation, "
        "cautious route-finding, and conservative decision-making essential."
    )
    assert r["center"] == "Sierra Avalanche Center"
    assert r["zone"] == "Central Sierra Nevada"
    assert r["link"].startswith("https://www.sierraavalanchecenter.org/forecasts/")
    assert r["valid_from"] == "2027-01-14T07:00:00"
    assert r["valid_until"] == "2027-01-15T07:00:00"
    assert r["timezone"] == "America/Los_Angeles"


def test_valid_until_is_also_given_in_utc_for_the_expiry_check() -> None:
    # 07:00 Pacific Standard Time is 15:00 UTC.
    assert official_rating(_props())["valid_until_utc"] == "2027-01-15T15:00:00+00:00"
    mountain = official_rating(_props(timezone="America/Denver"))
    assert mountain["valid_until_utc"] == "2027-01-15T14:00:00+00:00"


def test_the_scale_has_exactly_the_five_official_words() -> None:
    assert DANGER_SCALE == {
        1: "Low", 2: "Moderate", 3: "Considerable", 4: "High", 5: "Extreme",
    }
    for level, word in DANGER_SCALE.items():
        r = official_rating(_props(danger_level=level, danger=word.lower()))
        assert (r["level"], r["rating"]) == (level, word)


def test_off_season_zone_carries_no_rating_and_no_guess() -> None:
    live = next(f for f in FIXTURE["features"] if f["properties"]["name"] == "Central Cascades")
    r = official_rating(live["properties"])
    assert r["level"] is None
    assert r["rating"] == "No rating"
    assert r["valid_until"] is None and r["valid_until_utc"] is None
    assert r["link"] == "https://coavalanche.org/pages/forecasts/#/central-cascades"
    assert r["center"] == "Central Oregon Avalanche Center"


def test_levels_outside_the_scale_are_no_rating() -> None:
    for bad in (-1, 0, 6, None, "3", 2.5, True):
        r = official_rating(_props(danger_level=bad, danger="no rating"))
        assert r["level"] is None and r["rating"] == "No rating"


def test_a_level_that_contradicts_its_own_word_is_not_shown_as_a_rating() -> None:
    r = official_rating(_props(danger_level=2, danger="high"))
    assert r["level"] is None and r["rating"] == "No rating"


def test_warning_product_is_carried_only_when_the_center_issued_one() -> None:
    assert official_rating(_props())["warning"] is None
    assert official_rating(_props(warning={"product": "warning"}))["warning"] == "warning"
    assert official_rating(_props(warning=None))["warning"] is None
    assert official_rating(_props(warning={"product": 7}))["warning"] is None


def test_unparseable_dates_are_dropped_not_invented() -> None:
    r = official_rating(_props(end_date="soon", timezone="Mars/Olympus"))
    assert r["valid_until"] is None and r["valid_until_utc"] is None


def test_zone_without_a_forecast_link_falls_back_to_the_center_link() -> None:
    r = official_rating(_props(link=None))
    assert r["link"] == "https://www.sierraavalanchecenter.org/"
