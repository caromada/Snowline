from gazetteer.access import link_access, parse_element

PASS = {
    "slug": "glen", "name": "Glen Pass", "lat": 36.7854, "lon": -118.4166, "elevation_ft": 11926,
}


def _th(name: str, lat: float, lon: float, ft: int | None = 9200, **extra: object) -> dict:
    return {"kind": "trailhead", "osm_id": hash(name) % 10_000, "name": name, "lat": lat,
            "lon": lon, "elevation_ft": ft, **extra}


def test_parse_trailhead_converts_metres_and_reads_tags() -> None:
    element = {
        "type": "node", "id": 7, "lat": 36.77, "lon": -118.34,
        "tags": {"highway": "trailhead", "name": "Onion Valley", "ele": "2800", "fee": "no",
                 "website": "https://example.org/onion", "operator": "Inyo National Forest"},
    }
    rec = parse_element(element, "trailhead")
    assert rec == {
        "kind": "trailhead", "osm_id": 7, "name": "Onion Valley", "lat": 36.77, "lon": -118.34,
        "elevation_ft": 9186, "fee": False, "website": "https://example.org/onion",
        "operator": "Inyo National Forest",
    }


def test_parse_way_uses_its_center_and_campground_fields() -> None:
    element = {
        "type": "way", "id": 9, "center": {"lat": 36.8, "lon": -118.3},
        "tags": {"tourism": "camp_site", "name": "Upper Grays Meadow", "reservation": "required",
                 "fee": "yes", "capacity": "35", "tents": "yes", "backcountry": "no"},
    }
    rec = parse_element(element, "campground")
    assert rec["lat"] == 36.8 and rec["lon"] == -118.3
    assert rec["reservation"] == "required"
    assert rec["fee"] is True
    assert rec["sites"] == 35
    assert rec["tents"] is True
    assert "backcountry" not in rec  # "no" is the default and says nothing


def test_parse_drops_private_and_unusable_elements() -> None:
    private = {"type": "node", "id": 1, "lat": 1.0, "lon": 1.0,
               "tags": {"amenity": "parking", "access": "private"}}
    no_point = {"type": "way", "id": 2, "tags": {"tourism": "camp_site", "name": "Lost"}}
    unnamed_camp = {
        "type": "node", "id": 3, "lat": 1.0, "lon": 1.0, "tags": {"tourism": "camp_site"},
    }
    assert parse_element(private, "parking") is None
    assert parse_element(no_point, "campground") is None
    assert parse_element(unnamed_camp, "campground") is None


def test_unnamed_trailhead_gets_a_plain_label() -> None:
    element = {"type": "node", "id": 4, "lat": 1.0, "lon": 1.0, "tags": {"highway": "trailhead"}}
    assert parse_element(element, "trailhead")["name"] == "Trailhead"


def test_link_orders_by_distance_limits_and_respects_radius() -> None:
    near = _th("Onion Valley", 36.7727, -118.3410)          # about 7 km east
    nearer = _th("Charlotte Lake", 36.7790, -118.4260)      # about 1 km
    far = _th("Roads End", 36.7947, -118.5829)              # about 15 km west
    beyond = _th("Whitney Portal", 36.5870, -118.2400)      # about 27 km
    out = link_access(PASS, [near, nearer, far, beyond], [], [], limit=2)
    assert [t["name"] for t in out["trailheads"]] == ["Charlotte Lake", "Onion Valley"]
    everything = link_access(PASS, [near, nearer, far, beyond], [], [])
    assert "Whitney Portal" not in [t["name"] for t in everything["trailheads"]]
    assert everything["trailheads"][0]["distance_mi"] < 1.0


def test_link_reports_gain_to_the_pass() -> None:
    out = link_access(PASS, [_th("Onion Valley", 36.7727, -118.3410, 9186)], [], [])
    assert out["trailheads"][0]["gain_ft"] == 11926 - 9186
    unknown = link_access(PASS, [_th("Onion Valley", 36.7727, -118.3410, None)], [], [])
    assert "gain_ft" not in unknown["trailheads"][0]


def test_link_attaches_the_parking_beside_a_trailhead() -> None:
    th = _th("Onion Valley", 36.7727, -118.3410)
    beside = {"kind": "parking", "osm_id": 1, "lat": 36.7729, "lon": -118.3412, "spaces": 60,
              "fee": False, "surface": "asphalt"}
    elsewhere = {"kind": "parking", "osm_id": 2, "lat": 36.80, "lon": -118.30, "spaces": 10}
    out = link_access(PASS, [th], [], [beside, elsewhere])
    assert out["trailheads"][0]["parking"] == {"spaces": 60, "fee": False, "surface": "asphalt"}
    bare = link_access(PASS, [th], [], [elsewhere])
    assert "parking" not in bare["trailheads"][0]


def test_link_campgrounds_use_their_own_wider_radius() -> None:
    camp = {"kind": "campground", "osm_id": 5, "name": "Whitney Portal Campground",
            "lat": 36.5870, "lon": -118.2400, "reservation": "required"}
    out = link_access(PASS, [], [camp], [])
    assert out["campgrounds"][0]["name"] == "Whitney Portal Campground"
    assert out["campgrounds"][0]["distance_mi"] > 15
    assert "kind" not in out["campgrounds"][0]


def test_pass_with_nothing_nearby_links_empty_lists() -> None:
    assert link_access(PASS, [], [], []) == {"trailheads": [], "campgrounds": []}
