import json
from pathlib import Path

import pytest

from gazetteer import get_pass, load_passes, resolve
from ingest.geo import haversine_km
from scripts.build_gazetteer import DUPLICATE_KM, PASSES, merge_osm, resolve_sierra

OSM_PATH = Path(__file__).resolve().parent.parent / "gazetteer" / "osm_passes.json"

MONO = {
    "slug": "mono",
    "name": "Mono Pass",
    "elevation_ft": 12060,
    "near": (37.3743, -118.7817),
    "aliases": ["mono", "mono pass"],
    "creek": "Rock Creek",
    "aspect_note": "the Rock Creek Mono Pass, not the Bloody Canyon one",
}


def _node(osm_id: int, name: str, lat: float, lon: float, ft: int | None) -> dict:
    return {"osm_id": osm_id, "name": name, "lat": lat, "lon": lon,
            "elevation_ft": ft, "state": "CA"}


ROCK_CREEK = _node(370361637, "Mono Pass", 37.4254943, -118.772644, 12073)
BLOODY_CANYON = _node(1744921256, "Mono Pass", 37.8555917, -119.2166398, 10600)


def test_position_and_elevation_come_from_the_osm_node() -> None:
    [mono] = resolve_sierra([MONO], [BLOODY_CANYON, ROCK_CREEK])
    assert (mono["lat"], mono["lon"]) == (37.425494, -118.772644)
    assert mono["elevation_ft"] == 12073
    assert mono["osm_id"] == 370361637


def test_hand_written_fields_survive() -> None:
    [mono] = resolve_sierra([MONO], [ROCK_CREEK])
    assert mono["slug"] == "mono"
    assert mono["aliases"] == ["mono", "mono pass"]
    assert mono["creek"] == "Rock Creek"
    assert mono["aspect_note"] == "the Rock Creek Mono Pass, not the Bloody Canyon one"
    assert "near" not in mono


def test_same_name_beyond_the_cap_is_not_a_match() -> None:
    with pytest.raises(ValueError, match="Mono Pass"):
        resolve_sierra([MONO], [BLOODY_CANYON])


def test_a_nearer_node_with_another_name_is_ignored() -> None:
    gabbot = _node(1, "Gabbot Pass", 37.3743, -118.7817, 12270)
    [mono] = resolve_sierra([MONO], [gabbot, ROCK_CREEK])
    assert mono["osm_id"] == 370361637


def test_names_match_whatever_the_capitals() -> None:
    lower = {**ROCK_CREEK, "name": "Mono pass"}
    [mono] = resolve_sierra([MONO], [lower])
    assert mono["osm_id"] == 370361637
    assert mono["name"] == "Mono Pass"


def test_hand_elevation_fills_in_for_a_node_without_one() -> None:
    bare = {**ROCK_CREEK, "elevation_ft": None}
    [mono] = resolve_sierra([MONO], [bare])
    assert mono["elevation_ft"] == 12060
    assert mono["lat"] == 37.425494


def test_merge_drops_the_osm_twin_of_a_resolved_pass() -> None:
    featured = resolve_sierra([MONO], [ROCK_CREEK, BLOODY_CANYON])
    gabbot = _node(1, "Gabbot Pass", 37.3743, -118.7817, 12270)
    merged = merge_osm(featured, [ROCK_CREEK, gabbot])
    assert [m["name"] for m in merged] == ["Gabbot Pass"]


NEW_ARMY = {
    "slug": "new-army",
    "name": "New Army Pass",
    "elevation_ft": 12315,
    "near": (36.4570, -118.2230),
    "aliases": ["new army", "new army pass"],
    "creek": "Cottonwood Creek / Rock Creek (south)",
    "aspect_note": "",
}
NEW_ARMY_NODE = _node(1343514123, "New Army Pass", 36.4904112, -118.240752, 12178)


def test_a_named_neighbour_is_its_own_pass() -> None:
    featured = resolve_sierra([NEW_ARMY], [NEW_ARMY_NODE])
    army = _node(1343514151, "Army Pass", 36.4966, -118.2388, 12021)
    assert 0.5 < haversine_km(army["lat"], army["lon"], 36.4904112, -118.240752) < 1.0
    merged = merge_osm(featured, [NEW_ARMY_NODE, army])
    assert [m["slug"] for m in merged] == ["army-pass"]


def test_a_node_on_top_of_a_featured_pass_is_dropped() -> None:
    featured = resolve_sierra([NEW_ARMY], [NEW_ARMY_NODE])
    twin = _node(2, "New Army Saddle", 36.4911, -118.2407, 12170)
    assert merge_osm(featured, [NEW_ARMY_NODE, twin]) == []


def test_army_and_new_army_resolve_apart() -> None:
    army = get_pass("army-pass")
    assert army is not None and army["tier"] == "osm"
    assert resolve("Army Pass") == "army-pass"
    assert resolve("New Army Pass") == "new-army"
    assert resolve("came down new army pass in the afternoon") == "new-army"
    assert resolve("old army pass still had a cornice") == "army-pass"


def test_neighbours_of_featured_passes_resolve() -> None:
    assert resolve("Junction Pass") == "junction-pass"
    assert resolve("Gould Pass") == "gould-pass"
    assert resolve("Whitney Pass") == "whitney-pass"


def test_every_sierra_pass_has_a_node_within_the_cap() -> None:
    nodes = json.loads(OSM_PATH.read_text())["nodes"]
    assert len(resolve_sierra(PASSES, nodes)) == len(PASSES)


def test_built_gazetteer_sits_on_the_osm_nodes() -> None:
    nodes = {n["osm_id"]: n for n in json.loads(OSM_PATH.read_text())["nodes"]}
    built = {p["slug"]: p for p in load_passes()}
    for entry in PASSES:
        p = built[entry["slug"]]
        node = nodes[p["osm_id"]]
        assert node["name"].lower() == entry["name"].lower()
        assert haversine_km(p["lat"], p["lon"], node["lat"], node["lon"]) < 0.01
    assert built["mono"]["osm_id"] == 370361637
    assert built["hell-for-sure"]["osm_id"] == 5118782944


def test_no_osm_entry_duplicates_a_featured_pass() -> None:
    passes = load_passes()
    featured = [p for p in passes if p["tier"] == "featured"]
    featured_ids = {p["osm_id"] for p in featured if "osm_id" in p}
    for p in passes:
        if p["tier"] != "osm":
            continue
        assert p["osm_id"] not in featured_ids
        for f in featured:
            assert haversine_km(p["lat"], p["lon"], f["lat"], f["lon"]) >= DUPLICATE_KM
