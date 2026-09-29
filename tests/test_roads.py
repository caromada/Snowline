from fusion.roads import (
    MAX_ROADS,
    NAMED_KM,
    NEAR_KM,
    link_roads,
    parse_caltrans,
    parse_tripcheck,
    parse_wsdot,
)

CARSON = {"slug": "carson", "name": "Carson Pass", "lat": 38.694261, "lon": -119.988638}
SONORA = {"slug": "sonora", "name": "Sonora Pass", "lat": 38.327927, "lon": -119.637181}
SNOQUALMIE = {
    "slug": "snoqualmie", "name": "Snoqualmie Pass", "lat": 47.425224, "lon": -121.412071,
}
SANTIAM = {"slug": "santiam", "name": "Santiam Pass", "lat": 44.424754, "lon": -121.845523}
GLEN = {"slug": "glen", "name": "Glen Pass", "lat": 36.7854, "lon": -118.4166}

R0 = "No chain controls are in effect at this time."
# Caltrans' published wording for R-2. The live feed was all R-0 on the day
# these records were captured (2026-09-29), so the in-season status is set here.
R2 = (
    "Chains or traction devices are required on all vehicles except four wheel/ all wheel "
    "drive vehicles with snow-tread tires on all four wheels."
)


def cc(
    name: str, route: str, lat: str, lon: str, direction: str = "West",
    status: str = "R-0", text: str = R0, stamp: tuple[str, str] = ("2026-02-16", "23:51:28"),
    in_service: str = "true",
) -> dict:
    """One record in the shape of the live ccStatusD10.json feed."""
    return {
        "cc": {
            "index": f"10-ALP-{route}-{name}",
            "recordTimestamp": {"recordDate": "2026-09-29", "recordTime": "12:28:02"},
            "location": {
                "district": "10", "locationName": name, "nearbyPlace": "Markleeville",
                "longitude": lon, "latitude": lat, "elevation": "7457",
                "direction": direction, "county": "Alpine", "route": route,
                "routeSuffix": "", "postmilePrefix": "", "postmile": "8.11",
                "alignment": "", "milepost": "",
            },
            "inService": in_service,
            "statusData": {
                "statusTimestamp": {"statusDate": stamp[0], "statusTime": stamp[1]},
                "status": status,
                "statusDescription": text,
            },
        }
    }


def feed(*records: dict) -> dict:
    return {"data": list(records)}


def test_caltrans_record_is_copied_word_for_word() -> None:
    [s] = parse_caltrans(
        feed(cc("RED LAKE CREEK - CARSON PASS", "SR-88", "38.713630", "-119.955220",
                status="R-2", text=R2, stamp=("2027-01-14", "05:12:40")))
    )
    assert s == {
        "agency": "Caltrans",
        "agency_link": "https://roads.dot.ca.gov/",
        "road": "SR-88",
        "location": "RED LAKE CREEK - CARSON PASS",
        "lat": 38.71363,
        "lon": -119.95522,
        "active": True,
        "updated": "2027-01-14T05:12:40",
        "lines": [{"label": "West", "code": "R-2", "text": R2}],
    }


def test_caltrans_no_controls_is_not_active() -> None:
    [s] = parse_caltrans(feed(cc("KIRKWOOD", "SR-88", "38.699970", "-120.080170")))
    assert s["active"] is False
    assert s["lines"] == [{"label": "West", "code": "R-0", "text": R0}]


def test_caltrans_directions_at_one_place_share_one_entry() -> None:
    [s] = parse_caltrans(
        feed(
            cc("KIRKWOOD", "SR-88", "38.699970", "-120.080170", "West",
               stamp=("2026-09-25", "08:03:46")),
            cc("KIRKWOOD", "SR-88", "38.700400", "-120.078200", "East", "R-1",
               "Chains are required.", stamp=("2027-01-14", "04:00:00")),
        )
    )
    assert [(ln["label"], ln["code"]) for ln in s["lines"]] == [("West", "R-0"), ("East", "R-1")]
    assert s["active"] is True
    assert s["updated"] == "2027-01-14T04:00:00"


def test_caltrans_drops_records_it_cannot_trust() -> None:
    good = cc("KIRKWOOD", "SR-88", "38.699970", "-120.080170")
    # Both shapes below are in the live District 7 feed.
    unplaced = cc("Ladybug curve", "SR-2", "Not Reported", "Not Reported",
                  status="-118.1307759", text="")
    no_text = cc("MONITOR PASS", "SR-89", "38.660550", "-119.726350", status="R-1", text="")
    retired = cc("OLD GATE", "SR-4", "38.4", "-120.0", in_service="false")
    off_earth = cc("NOWHERE", "SR-4", "138.4", "-120.0")
    out = parse_caltrans(feed(unplaced, no_text, retired, off_earth, good, {"cc": None}, {}))
    assert [s["location"] for s in out] == ["KIRKWOOD"]


def test_caltrans_feed_of_the_wrong_shape_is_empty_not_an_error() -> None:
    assert parse_caltrans(None) == []
    assert parse_caltrans({"data": "down for maintenance"}) == []
    assert parse_caltrans([1, 2, 3]) == []


def test_caltrans_star_direction_means_no_direction() -> None:
    [s] = parse_caltrans(
        feed(cc("CEDAR PASS (6,305 ft)", "SR-299", "41.562740", "-120.271580", "*"))
    )
    assert s["lines"][0]["label"] is None


WSDOT = [
    {
        "DateUpdated": "/Date(1799935200000-0800)/",
        "ElevationInFeet": 3022,
        "Latitude": 47.424,
        "Longitude": -121.414,
        "MountainPassId": 11,
        "MountainPassName": "Snoqualmie Pass I-90",
        "RestrictionOne": {
            "RestrictionText": "Traction Tires Required, Chains Required On Vehicles "
            "Over 10,000 GVW",
            "TravelDirection": "Eastbound",
        },
        "RestrictionTwo": {"RestrictionText": "No restrictions", "TravelDirection": "Westbound"},
        "RoadCondition": "Compact snow and ice on the roadway.",
        "TemperatureInFahrenheit": 27,
        "TravelAdvisoryActive": True,
        "WeatherCondition": "Snowing",
    },
    {
        "DateUpdated": "/Date(1799935200000-0800)/",
        "ElevationInFeet": 5430,
        "Latitude": 46.8717,
        "Longitude": -121.5156,
        "MountainPassId": 5,
        "MountainPassName": "Chinook Pass SR 410",
        "RestrictionOne": {"RestrictionText": "Pass Closed", "TravelDirection": "Eastbound"},
        "RestrictionTwo": {"RestrictionText": "Pass Closed", "TravelDirection": "Westbound"},
        "RoadCondition": "Closed for the season.",
        "TemperatureInFahrenheit": None,
        "TravelAdvisoryActive": False,
        "WeatherCondition": "",
    },
    {
        "DateUpdated": "/Date(1799935200000-0800)/",
        "Latitude": 47.7462,
        "Longitude": -121.0859,
        "MountainPassName": "Stevens Pass US 2",
        "RestrictionOne": {"RestrictionText": "No restrictions", "TravelDirection": "Eastbound"},
        "RestrictionTwo": {"RestrictionText": "No restrictions", "TravelDirection": "Westbound"},
        "RoadCondition": "Bare and dry.",
        "TravelAdvisoryActive": False,
        "WeatherCondition": "Clear",
    },
]


def test_wsdot_pass_report_keeps_the_agency_text() -> None:
    snoq, chinook, stevens = parse_wsdot(WSDOT)
    assert snoq["agency"] == "WSDOT"
    assert snoq["road"] == "I-90"
    assert snoq["location"] == "Snoqualmie Pass I-90"
    assert snoq["updated"] == "2027-01-14T06:00:00-08:00"
    assert snoq["active"] is True
    assert snoq["lines"] == [
        {"label": "Road", "code": None, "text": "Compact snow and ice on the roadway."},
        {"label": "Weather", "code": None, "text": "Snowing"},
        {
            "label": "Eastbound",
            "code": None,
            "text": "Traction Tires Required, Chains Required On Vehicles Over 10,000 GVW",
        },
        {"label": "Westbound", "code": None, "text": "No restrictions"},
    ]
    assert chinook["road"] == "SR 410"
    assert chinook["active"] is True  # closed, though no advisory flag is set
    assert [ln["text"] for ln in chinook["lines"]] == [
        "Closed for the season.", "Pass Closed", "Pass Closed",
    ]
    assert stevens["active"] is False


def test_wsdot_bad_rows_and_bad_payloads_are_dropped() -> None:
    assert parse_wsdot(None) == []
    assert parse_wsdot({"Message": "The supplied access code was missing or invalid."}) == []
    rows = [{"MountainPassName": "Nowhere Pass", "Latitude": 0, "Longitude": 0}, "junk"]
    assert parse_wsdot(rows) == []


TRIPCHECK_META = {
    "road-weather-items": {
        "weather-condition-list": [{"weather-id": 4, "weather-desc": "Snow"}],
        "road-condition-list": [{"road-cond-id": 7, "road-cond-desc": "Packed Snow"}],
        "commercial-vehicle-restriction-list": [],
        "driving-restriction-list": [
            {"restriction-id": "B", "restriction-desc": "Carry chains or traction tires"},
        ],
    }
}
# Field names follow ODOT's published TripCheck API description; no key was
# available to capture a live response.
TRIPCHECK = {
    "organization-information": {"organization-id": "ODOT"},
    "road-weather-reports": [
        {
            "station-id": 61,
            "entry-time": "2027-01-14T13:40:00Z",
            "expiry-time": "2027-01-15T13:40:00Z",
            "location": {
                "location-name": "Santiam Pass",
                "route-id": "US20",
                "hwy-id": "016",
                "direction": "",
                "start-location": {
                    "start-lat": 44.4246, "start-long": -121.8561, "start-milepost": 80.0,
                },
                "end-location": {"end-lat": 44.41, "end-long": -121.7, "end-milepost": 88.0},
            },
            "air-temperature": -3.0,
            "snowfall-accum-rate": 10.0,
            "adjacent-snow-depth": 117.0,
            "weather-conditions": {"weather-id": 4},
            "road-conditions": {"road-cond-id": 7},
            "commercial-vehicle-restriction": None,
            "driving-restriction": {
                "restriction-id": "B",
                "restriction-start-milepost": 72.0,
                "restriction-end-milepost": 88.0,
            },
            "comments": "Plows are working the summit.",
        },
        {
            "station-id": 62,
            "entry-time": "2027-01-14T13:40:00Z",
            "location": {
                "location-name": "Tombstone Summit",
                "route-id": "US20",
                "start-location": {"start-lat": 44.3957, "start-long": -122.1415},
            },
            "weather-conditions": {"weather-id": 99},
            "road-conditions": {"road-cond-id": 7},
            "driving-restriction": None,
            "comments": "",
        },
    ],
}


def test_tripcheck_ids_resolve_to_odots_own_words() -> None:
    santiam, tombstone = parse_tripcheck(TRIPCHECK, TRIPCHECK_META)
    assert santiam["agency"] == "ODOT TripCheck"
    assert santiam["road"] == "US20"
    assert santiam["location"] == "Santiam Pass"
    assert santiam["updated"] == "2027-01-14T13:40:00Z"
    assert santiam["active"] is True
    assert santiam["lines"] == [
        {"label": "Road", "code": None, "text": "Packed Snow"},
        {"label": "Weather", "code": None, "text": "Snow"},
        {"label": "Restriction", "code": "B", "text": "Carry chains or traction tires"},
        {"label": "Crew comment", "code": None, "text": "Plows are working the summit."},
    ]
    assert santiam["new_snow_in"] == 3.9
    assert santiam["roadside_snow_in"] == 46
    # Unknown ids are left out; nothing is made up to fill the gap.
    assert tombstone["lines"] == [{"label": "Road", "code": None, "text": "Packed Snow"}]
    assert tombstone["active"] is False
    assert "new_snow_in" not in tombstone


def test_tripcheck_restriction_without_a_description_shows_nothing_about_it() -> None:
    # Tombstone Summit has nothing left to say without the table and drops out.
    [santiam] = parse_tripcheck(TRIPCHECK, {})
    assert santiam["lines"] == [
        {"label": "Crew comment", "code": None, "text": "Plows are working the summit."},
    ]
    assert santiam["active"] is False


def test_tripcheck_bad_payloads_are_empty() -> None:
    assert parse_tripcheck(None, None) == []
    assert parse_tripcheck({"statusCode": 401, "message": "Access denied"}, {}) == []


def _status(location: str, lat: float, lon: float, active: bool = False, road: str = "SR-88"):  # noqa: ANN202
    return {
        "agency": "Caltrans", "agency_link": "https://roads.dot.ca.gov/", "road": road,
        "location": location, "lat": lat, "lon": lon, "active": active, "updated": None,
        "lines": [{"label": "West", "code": "R-2" if active else "R-0", "text": "x"}],
    }


def test_limits_are_the_documented_ones() -> None:
    assert (NEAR_KM, NAMED_KM, MAX_ROADS) == (8.0, 40.0, 4)


def test_roads_link_by_distance_with_straight_line_miles() -> None:
    near = _status("RED LAKE CREEK", 38.71362, -119.95523)
    far = _status("PEDDLER VISTA", 38.5634, -120.2693)
    [linked] = link_roads(CARSON, [far, near])
    assert linked["location"] == "RED LAKE CREEK"
    assert linked["distance_mi"] == 2.2
    assert linked["named"] is False
    assert "distance_mi" not in near  # the shared status list is not mutated


def test_a_road_that_names_the_pass_links_from_farther_away() -> None:
    gate = _status("SNOW PARK - SONORA PASS", 38.25237, -119.99796, road="SR-108")
    other = _status("STRAWBERRY", 38.2, -119.99, road="SR-108")
    linked = link_roads(SONORA, [gate, other])
    assert [(s["location"], s["named"]) for s in linked] == [("SNOW PARK - SONORA PASS", True)]
    assert linked[0]["distance_mi"] > NEAR_KM / 1.609344


def test_a_shared_name_far_away_is_a_different_pass() -> None:
    # The gazetteer's White Pass in the Glacier Peak Wilderness is not US 12's.
    white = {"slug": "white-glacier-peak", "name": "White Pass", "lat": 48.033221,
             "lon": -121.148538}
    us12 = _status("White Pass US 12", 46.6385, -121.3905, road="US 12")
    assert link_roads(white, [us12]) == []


def test_part_of_a_name_is_not_the_name() -> None:
    donner = {"slug": "donner", "name": "Donner Pass", "lat": 39.315978, "lon": -120.321572}
    lake = _status("DONNER LAKE INTERCHANGE", 39.33, -120.6, road="I-80")
    assert link_roads(donner, [lake]) == []


def test_wsdot_and_tripcheck_names_match_their_passes() -> None:
    [snoq] = link_roads(SNOQUALMIE, parse_wsdot(WSDOT))
    assert snoq["location"] == "Snoqualmie Pass I-90" and snoq["named"] is True
    [santiam] = link_roads(SANTIAM, parse_tripcheck(TRIPCHECK, TRIPCHECK_META))
    assert santiam["location"] == "Santiam Pass" and santiam["named"] is True


def test_restrictions_in_effect_are_never_crowded_out() -> None:
    quiet = [_status(f"QUIET {i}", 38.6943 + i * 0.001, -119.9886) for i in range(1, 6)]
    chains = _status("CHAINS", 38.75, -119.9886, active=True)
    linked = link_roads(CARSON, [*quiet, chains])
    assert len(linked) == MAX_ROADS
    assert linked[0]["location"] == "CHAINS"
    assert [s["location"] for s in linked[1:]] == ["QUIET 1", "QUIET 2", "QUIET 3"]


def test_a_trail_pass_far_from_any_road_has_no_road_status() -> None:
    assert link_roads(GLEN, parse_caltrans(feed(
        cc("KIRKWOOD", "SR-88", "38.699970", "-120.080170")))) == []
