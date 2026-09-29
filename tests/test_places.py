from gazetteer.places import place_index

GLEN = {"slug": "glen", "name": "Glen Pass", "lat": 36.7854, "lon": -118.4166,
        "elevation_ft": 11926, "tier": "featured"}
KEARSARGE = {"slug": "kearsarge", "name": "Kearsarge Pass", "lat": 36.7728, "lon": -118.3736,
             "elevation_ft": 11709, "tier": "featured"}
FAR = {"slug": "aasgard", "name": "Aasgard Pass", "lat": 47.4808, "lon": -120.8225,
       "elevation_ft": 7841, "tier": "featured"}


def _saddle(i: int) -> dict:
    # A crowd of minor saddles packed closer to the trailhead than any featured pass.
    return {"slug": f"saddle-{i}", "name": f"Saddle {i}", "lat": 36.7725 + i * 0.0005,
            "lon": -118.3420, "elevation_ft": 9500, "tier": "osm"}


ONION = {"kind": "trailhead", "osm_id": 1, "name": "Onion Valley Trailhead",
         "lat": 36.7725, "lon": -118.3411}


def test_lists_the_passes_near_a_place_nearest_first() -> None:
    [place] = place_index([GLEN, KEARSARGE, FAR], [ONION], [])
    assert place["name"] == "Onion Valley Trailhead"
    assert place["kind"] == "trailhead"
    assert [slug for slug, _ in place["passes"]] == ["kearsarge", "glen"]
    assert place["passes"][0][1] == 1.8


def test_featured_passes_keep_their_seat_among_minor_saddles() -> None:
    saddles = [_saddle(i) for i in range(10)]
    [place] = place_index([*saddles, GLEN, KEARSARGE], [ONION], [])
    slugs = [slug for slug, _ in place["passes"]]
    assert "kearsarge" in slugs and "glen" in slugs
    assert len(slugs) == 8
    assert [mi for _, mi in place["passes"]] == sorted(mi for _, mi in place["passes"])


def test_places_without_a_name_or_a_pass_are_left_out() -> None:
    nameless = {**ONION, "name": "Trailhead"}
    dispersed = {"kind": "campground", "osm_id": 2, "name": "Dispersed Camping",
                 "lat": 36.77, "lon": -118.34}
    lonely = {"kind": "campground", "osm_id": 3, "name": "Desert Camp", "lat": 35.0, "lon": -116.0}
    assert place_index([GLEN, KEARSARGE], [nameless], [dispersed, lonely]) == []


def test_a_campground_speaks_for_less_ground_than_a_trailhead() -> None:
    # About 17 km from Glen Pass: inside a trailhead's reach, outside a campground's.
    spot = {"osm_id": 4, "name": "Far Meadow", "lat": 36.7854, "lon": -118.2266}
    assert place_index([GLEN], [{**spot, "kind": "trailhead"}], [])[0]["passes"][0][0] == "glen"
    assert place_index([GLEN], [], [{**spot, "kind": "campground"}]) == []


def test_the_same_inputs_write_the_same_records() -> None:
    a = place_index([GLEN, KEARSARGE], [ONION], [])
    b = place_index([KEARSARGE, GLEN], [ONION], [])
    assert a == b
