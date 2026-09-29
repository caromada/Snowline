import json
import math
from datetime import date
from pathlib import Path

import pytest

import pipeline
from fusion.fire import (
    compass,
    douglas_peucker,
    fire_name,
    link_pass,
    nearest_fire,
    parse_perimeter,
    parse_smoke_kml,
    simplify_polygons,
    simplify_ring,
    smoke_over,
)
from ingest.fire import SmokeUnavailable, collect_pages, load_smoke, smoke_url

PASS = {"slug": "glen", "name": "Glen Pass", "lat": 36.7854, "lon": -118.4166}

KM_PER_DEG_LAT = 110.574


def square(lon: float, lat: float, half_km: float) -> list[list[float]]:
    """A closed square ring centred on a point."""
    dy = half_km / KM_PER_DEG_LAT
    dx = half_km / (111.32 * math.cos(math.radians(lat)))
    return [
        [lon - dx, lat - dy], [lon + dx, lat - dy], [lon + dx, lat + dy],
        [lon - dx, lat + dy], [lon - dx, lat - dy],
    ]


def fire(name: str, polygons: list[list[list[list[float]]]], **extra: object) -> dict:
    return {
        "name": name, "acres": 12400, "percent_contained": 35, "discovered": "2026-09-01",
        "updated": "2026-09-28", "url": None, "polygons": polygons, **extra,
    }


def offset(lat: float, lon: float, km_north: float, km_east: float) -> tuple[float, float]:
    return (
        lat + km_north / KM_PER_DEG_LAT,
        lon + km_east / (111.32 * math.cos(math.radians(lat))),
    )


# Douglas-Peucker


def test_points_on_a_straight_line_collapse_to_the_endpoints() -> None:
    line = [(float(i), 0.0) for i in range(10)]
    assert douglas_peucker(line, 0.1) == [(0.0, 0.0), (9.0, 0.0)]


def test_a_spike_beyond_the_tolerance_survives_and_a_smaller_one_does_not() -> None:
    line = [(0.0, 0.0), (1.0, 0.05), (2.0, 0.0), (3.0, 2.0), (4.0, 0.0)]
    assert douglas_peucker(line, 0.5) == [(0.0, 0.0), (2.0, 0.0), (3.0, 2.0), (4.0, 0.0)]


def test_simplification_never_moves_farther_than_the_tolerance() -> None:
    wave = [(i / 50, math.sin(i / 50)) for i in range(400)]
    kept = douglas_peucker(wave, 0.02)
    assert len(kept) < len(wave) / 4
    for x, y in wave:
        nearest = min(
            _segment_distance(x, y, a, b) for a, b in zip(kept, kept[1:], strict=False)
        )
        assert nearest <= 0.02 + 1e-9


def _segment_distance(
    x: float, y: float, a: tuple[float, float], b: tuple[float, float]
) -> float:
    dx, dy = b[0] - a[0], b[1] - a[1]
    t = max(0.0, min(1.0, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy)))
    return math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy))


def test_a_perimeter_of_100k_points_does_not_exhaust_the_stack() -> None:
    zigzag = [(i / 1000, (i % 2) * 1e-7) for i in range(100_000)]
    assert douglas_peucker(zigzag, 0.001) == [zigzag[0], zigzag[-1]]


def test_a_simplified_ring_stays_closed() -> None:
    n = 720
    circle = [
        [-120 + 0.1 * math.cos(2 * math.pi * i / n), 40 + 0.1 * math.sin(2 * math.pi * i / n)]
        for i in range(n)
    ]
    circle.append(circle[0])
    ring = simplify_ring(circle, tolerance_m=100)
    assert ring is not None
    assert ring[0] == ring[-1]
    assert 8 <= len(ring) < 120


def test_a_ring_that_collapses_to_a_sliver_is_dropped() -> None:
    sliver = [[-120.0, 40.0], [-119.9, 40.00001], [-119.8, 40.0], [-119.9, 39.99999],
              [-120.0, 40.0]]
    assert simplify_ring(sliver, tolerance_m=100) is None


def test_small_islands_are_dropped_but_a_small_fire_keeps_its_only_ring() -> None:
    big = square(-120.0, 40.0, 3.0)
    island = square(-119.9, 40.0, 0.05)
    out = simplify_polygons([[big], [island]], tolerance_m=50, min_area_m2=40_000)
    assert len(out) == 1
    assert len(out[0][0]) == 5
    only = simplify_polygons([[island]], tolerance_m=50, min_area_m2=40_000)
    assert len(only) == 1


def test_a_fire_smaller_than_the_tolerance_still_draws() -> None:
    spot = square(-120.0, 40.0, 0.03)
    out = simplify_polygons([[spot]], tolerance_m=60, min_area_m2=40_000)
    assert len(out) == 1
    assert out[0][0][0] == out[0][0][-1]
    assert len(out[0][0]) >= 4


def test_simplified_coordinates_are_rounded_for_a_small_file() -> None:
    out = simplify_polygons([[square(-120.123456789, 40.0, 3.0)]], tolerance_m=50)
    assert all(len(str(abs(v)).split(".")[1]) <= 4 for ring in out[0] for pt in ring for v in pt)


# WFIGS records


def feature(**props: object) -> dict:
    base = {
        "poly_IncidentName": "Marten Creek", "attr_IncidentName": "0445 MARTEN CREEK",
        "poly_GISAcres": 12411.7, "attr_IncidentSize": 12400, "attr_PercentContained": 35,
        "attr_FireDiscoveryDateTime": 1788206940000, "poly_DateCurrent": 1790647556000,
        "attr_ModifiedOnDateTime_dt": 1790638167897, "attr_IncidentTypeCategory": "WF",
        "attr_FireOutDateTime": None,
    }
    return {
        "type": "Feature",
        "properties": {**base, **props},
        "geometry": {"type": "Polygon", "coordinates": [square(-120.0, 40.0, 2.0)]},
    }


def test_a_perimeter_record_keeps_the_facts_the_panel_shows() -> None:
    rec = parse_perimeter(feature())
    assert rec is not None
    assert rec["name"] == "Marten Creek Fire"
    assert rec["acres"] == 12400
    assert rec["percent_contained"] == 35
    assert rec["discovered"] == "2026-08-31"
    # 02:05 UTC on the 29th is still the evening of the 28th on the coast.
    assert rec["updated"] == "2026-09-28"
    assert rec["url"] is None
    assert len(rec["polygons"]) == 1


def test_reported_size_falls_back_to_the_mapped_acres() -> None:
    rec = parse_perimeter(feature(attr_IncidentSize=None))
    assert rec is not None and rec["acres"] == 12412


def test_unknown_containment_stays_unknown_rather_than_zero() -> None:
    rec = parse_perimeter(feature(attr_PercentContained=None))
    assert rec is not None and rec["percent_contained"] is None


def test_a_public_link_is_kept_only_when_the_record_carries_one() -> None:
    rec = parse_perimeter(feature(attr_IncidentUrl="https://inciweb.wildfire.gov/incident/1"))
    assert rec is not None and rec["url"] == "https://inciweb.wildfire.gov/incident/1"
    odd = parse_perimeter(feature(attr_IncidentUrl="javascript:alert(1)"))
    assert odd is not None and odd["url"] is None


def test_fires_declared_out_and_prescribed_burns_are_not_active_fires() -> None:
    assert parse_perimeter(feature(attr_FireOutDateTime=1790000000000)) is None
    assert parse_perimeter(feature(attr_IncidentTypeCategory="RX")) is None


def test_a_record_without_geometry_is_skipped() -> None:
    bare = feature()
    bare["geometry"] = None
    assert parse_perimeter(bare) is None


def test_multipolygons_keep_every_part() -> None:
    multi = feature()
    multi["geometry"] = {
        "type": "MultiPolygon",
        "coordinates": [[square(-120.0, 40.0, 2.0)], [square(-119.8, 40.0, 1.0)]],
    }
    rec = parse_perimeter(multi)
    assert rec is not None and len(rec["polygons"]) == 2


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("Marten Creek", "Marten Creek Fire"),
        ("THREE QUEENS", "Three Queens Fire"),
        ("WONDERLAND COMPLEX", "Wonderland Complex"),
        ("Marten Creek Fire", "Marten Creek Fire"),
        ("MP18", "MP18 Fire"),
        ("Border 2", "Border 2 Fire"),
        ("  McCully ", "McCully Fire"),
    ],
)
def test_incident_names_read_as_names(raw: str, expected: str) -> None:
    assert fire_name(raw) == expected


# Linking


@pytest.mark.parametrize(
    ("bearing", "word"),
    [(0, "north"), (44, "northeast"), (90, "east"), (135, "southeast"), (180, "south"),
     (225, "southwest"), (270, "west"), (315, "northwest"), (359, "north")],
)
def test_compass_names_eight_directions(bearing: float, word: str) -> None:
    assert compass(bearing) == word


def test_nearest_fire_gives_distance_and_direction_from_the_pass() -> None:
    # A 2 km square whose centre is 22 km south and 22 km west of the pass:
    # its near corner is 20 km each way, 28.3 km (17.6 mi) to the southwest.
    lat, lon = offset(PASS["lat"], PASS["lon"], -22, -22)
    hit = nearest_fire(PASS, [fire("Marten Creek Fire", [[square(lon, lat, 2.0)]])])
    assert hit is not None
    assert hit["name"] == "Marten Creek Fire"
    assert hit["acres"] == 12400
    assert hit["percent_contained"] == 35
    assert hit["direction"] == "southwest"
    assert hit["inside"] is False
    assert hit["distance_mi"] == pytest.approx(17.6, abs=0.2)


def test_distance_is_to_the_perimeter_edge_not_a_vertex() -> None:
    # A long east-west edge 10 km north of the pass, its corners far away.
    lat, _ = offset(PASS["lat"], PASS["lon"], 10, 0)
    top, _ = offset(PASS["lat"], PASS["lon"], 12, 0)
    _, west = offset(PASS["lat"], PASS["lon"], 0, -40)
    _, east = offset(PASS["lat"], PASS["lon"], 0, 40)
    ring = [[west, lat], [east, lat], [east, top], [west, top], [west, lat]]
    hit = nearest_fire(PASS, [fire("Long Fire", [[ring]])])
    assert hit is not None
    assert hit["distance_mi"] == pytest.approx(6.2, abs=0.1)
    assert hit["direction"] == "north"


def test_a_pass_inside_the_perimeter_is_flagged() -> None:
    hit = nearest_fire(PASS, [fire("Home Fire", [[square(PASS["lon"], PASS["lat"], 3.0)]])])
    assert hit is not None
    assert hit["inside"] is True
    assert hit["distance_mi"] == 0
    assert hit["direction"] is None


def test_a_pass_in_an_unburned_island_is_not_inside() -> None:
    outer = square(PASS["lon"], PASS["lat"], 6.0)
    hole = square(PASS["lon"], PASS["lat"], 1.0)
    hit = nearest_fire(PASS, [fire("Ring Fire", [[outer, hole]])])
    assert hit is not None
    assert hit["inside"] is False
    assert hit["distance_mi"] == pytest.approx(0.6, abs=0.1)


def test_fires_beyond_50_km_are_not_linked() -> None:
    lat, lon = offset(PASS["lat"], PASS["lon"], 60, 0)
    assert nearest_fire(PASS, [fire("Far Fire", [[square(lon, lat, 2.0)]])]) is None


def test_the_nearer_of_two_fires_wins() -> None:
    lat1, lon1 = offset(PASS["lat"], PASS["lon"], 30, 0)
    lat2, lon2 = offset(PASS["lat"], PASS["lon"], 0, 12)
    hit = nearest_fire(
        PASS,
        [fire("North Fire", [[square(lon1, lat1, 1.0)]]),
         fire("East Fire", [[square(lon2, lat2, 1.0)]])],
    )
    assert hit is not None and hit["name"] == "East Fire"
    assert hit["direction"] == "east"


def smoke(density: str, half_km: float) -> dict:
    return {"density": density, "ring": square(PASS["lon"], PASS["lat"], half_km)}


def test_the_heaviest_smoke_over_the_pass_wins() -> None:
    plumes = [smoke("light", 200), smoke("heavy", 20), smoke("medium", 80)]
    assert smoke_over(PASS, plumes) == "heavy"


def test_smoke_elsewhere_is_not_smoke_overhead() -> None:
    lat, lon = offset(PASS["lat"], PASS["lon"], 100, 0)
    assert smoke_over(PASS, [{"density": "heavy", "ring": square(lon, lat, 20)}]) is None


def test_a_pass_with_neither_fire_nor_smoke_gets_no_entry() -> None:
    assert link_pass(PASS, [], []) is None


def test_smoke_alone_is_an_entry() -> None:
    assert link_pass(PASS, [], [smoke("medium", 50)]) == {"smoke": "medium"}


def test_fire_and_smoke_ride_together() -> None:
    lat, lon = offset(PASS["lat"], PASS["lon"], -10, 0)
    out = link_pass(PASS, [fire("South Fire", [[square(lon, lat, 1.0)]])], [smoke("light", 50)])
    assert out is not None
    assert out["smoke"] == "light"
    assert out["fire"]["name"] == "South Fire"
    assert "polygons" not in out["fire"]


def test_a_source_that_failed_is_left_out_not_reported_clear() -> None:
    out = link_pass(PASS, None, [smoke("light", 50)])
    assert out == {"smoke": "light"}
    assert link_pass(PASS, None, None) is None


# HMS smoke


KML = """<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2">
<Document>
<name>HMS Smoke Mapping-20260929</name>
<Folder><name>Smoke (Light)</name>
<Placemark><description><![CDATA[<div style="width:170px;">Start Time: 2026272 1200UTC<br>
End Time: 2026272 1500UTC<br>Density: Light<br>Satellite: GOES-WEST</div>]]></description>
<styleUrl>#Smoke_Light_style</styleUrl>
<Polygon><tessellate>1</tessellate><gx:drawOrder>0</gx:drawOrder>
<outerBoundaryIs><LinearRing><coordinates>
  -120.5,38.0,0
  -119.5,38.0,0
  -119.5,39.0,0
  -120.5,39.0,0
  -120.5,38.0,0
</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>
</Folder>
<Folder><name>Smoke (Heavy)</name>
<Placemark><description><![CDATA[Density: Heavy]]></description>
<styleUrl>#Smoke_Heavy_style</styleUrl>
<Polygon><outerBoundaryIs><LinearRing><coordinates>
  -120.2,38.4,0 -119.8,38.4,0 -119.8,38.6,0 -120.2,38.6,0 -120.2,38.4,0
</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>
<Placemark><description><![CDATA[Density: Mystery]]></description>
<Polygon><outerBoundaryIs><LinearRing><coordinates>
  -100,38,0 -99,38,0 -99,39,0 -100,38,0
</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>
</Folder>
</Document></kml>"""


def test_smoke_polygons_carry_density_time_and_a_closed_ring() -> None:
    plumes = parse_smoke_kml(KML)
    assert [p["density"] for p in plumes] == ["light", "heavy"]
    assert plumes[0]["start"] == "2026-09-29T12:00Z"
    assert plumes[0]["end"] == "2026-09-29T15:00Z"
    assert plumes[0]["ring"][0] == [-120.5, 38.0]
    assert plumes[0]["ring"][0] == plumes[0]["ring"][-1]
    assert len(plumes[1]["ring"]) == 5


def test_a_document_with_entity_declarations_is_refused() -> None:
    bomb = '<?xml version="1.0"?><!DOCTYPE kml [<!ENTITY a "aaaa">]><kml>&a;</kml>'
    with pytest.raises(ValueError, match="DOCTYPE"):
        parse_smoke_kml(bomb)


def test_smoke_files_live_under_year_and_month() -> None:
    assert smoke_url(date(2026, 9, 5)) == (
        "https://satepsanone.nesdis.noaa.gov/pub/FIRE/web/HMS/Smoke_Polygons/KML/"
        "2026/09/hms_smoke20260905.kml"
    )


def test_today_is_used_when_it_has_been_analysed() -> None:
    used, plumes = load_smoke(date(2026, 9, 29), lambda d: KML)
    assert used == date(2026, 9, 29)
    assert len(plumes) == 2


def test_yesterday_stands_in_when_today_is_not_published_yet() -> None:
    def fetch(d: date) -> str:
        if d == date(2026, 9, 29):
            raise SmokeUnavailable("404")
        return KML

    used, plumes = load_smoke(date(2026, 9, 29), fetch)
    assert used == date(2026, 9, 28)
    assert len(plumes) == 2


def test_an_empty_file_for_today_means_not_analysed_yet() -> None:
    empty = KML.split("<Folder>")[0] + "</Document></kml>"

    def fetch(d: date) -> str:
        return empty if d == date(2026, 9, 29) else KML

    used, _ = load_smoke(date(2026, 9, 29), fetch)
    assert used == date(2026, 9, 28)


def test_smoke_is_unavailable_when_neither_day_can_be_read() -> None:
    def fetch(d: date) -> str:
        raise SmokeUnavailable("down")

    with pytest.raises(SmokeUnavailable):
        load_smoke(date(2026, 9, 29), fetch)


# Paging


def test_pages_are_followed_until_the_service_stops_flagging_more() -> None:
    pages = {
        0: {"features": [1, 2], "properties": {"exceededTransferLimit": True}},
        2: {"features": [3, 4], "exceededTransferLimit": True},
        4: {"features": [5]},
    }
    asked: list[int] = []

    def fetch(offset_: int) -> dict:
        asked.append(offset_)
        return pages[offset_]

    assert collect_pages(fetch) == [1, 2, 3, 4, 5]
    assert asked == [0, 2, 4]


def test_a_service_that_always_flags_more_cannot_loop_forever() -> None:
    def fetch(offset_: int) -> dict:
        return {"features": [offset_], "properties": {"exceededTransferLimit": True}}

    assert len(collect_pages(fetch, max_pages=5)) == 5


def test_an_empty_page_ends_the_walk() -> None:
    def fetch(offset_: int) -> dict:
        return {"features": [], "properties": {"exceededTransferLimit": True}}

    assert collect_pages(fetch) == []


# Pipeline merge


def _write(path: Path, issued: str) -> None:
    path.write_text(
        json.dumps(
            {
                "issued_for": issued,
                "smoke_date": "2026-09-28",
                "passes": {"glen": {"smoke": "medium"}},
            }
        )
    )


def test_fresh_fire_facts_merge_with_their_dates(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    path = tmp_path / "passes.json"
    _write(path, "2026-09-28")
    monkeypatch.setattr(pipeline, "FIRE_PATH", path)
    assert pipeline._load_fire("2026-09-29") == {
        "glen": {"smoke": "medium", "issued_for": "2026-09-28", "smoke_date": "2026-09-28"}
    }


def test_fire_facts_older_than_a_day_are_omitted(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    path = tmp_path / "passes.json"
    _write(path, "2026-09-27")
    monkeypatch.setattr(pipeline, "FIRE_PATH", path)
    assert pipeline._load_fire("2026-09-29") == {}


def test_a_missing_fire_file_is_no_fire_data(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(pipeline, "FIRE_PATH", tmp_path / "absent.json")
    assert pipeline._load_fire("2026-09-29") == {}
