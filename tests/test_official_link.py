import json
from datetime import date
from pathlib import Path
from typing import Any

from fusion.official import (
    EXCERPT_CHARS,
    MAX_AGE_DAYS,
    MAX_REPORTS,
    excerpt,
    link_reports,
    load_official,
    names_for,
)

TODAY = date(2026, 9, 29)
SEKI = [36.25, -119.0, 37.25, -118.15]
NOCA = [48.20, -121.75, 49.01, -120.55]
CALIFORNIA = [32.5, -124.5, 42.05, -114.0]


def _pass(slug: str, name: str, lat: float, lon: float, **more: Any) -> dict[str, Any]:
    return {"slug": slug, "name": name, "lat": lat, "lon": lon, "tier": "osm",
            "aliases": [name.lower()], **more}


GRANITE = _pass("granite", "Granite Pass", 36.886, -118.603, tier="featured",
                aliases=["granite", "granite pass"])
GRANITE_WA = _pass("granite-pass-wa", "Granite Pass", 48.55, -120.80)
NEW_ARMY = _pass("new-army", "New Army Pass", 36.489, -118.236, tier="featured",
                 aliases=["new army", "new army pass"])
ARMY = _pass("army-pass", "Army Pass", 36.497, -118.239)
MUIR = _pass("muir", "Muir Pass", 37.112, -118.671, tier="featured",
             aliases=["muir", "muir pass", "the hut pass", "muir hut"])
PINE_CREEK = _pass("pine-creek", "Pine Creek Pass", 37.10, -118.70, tier="featured",
                   aliases=["pine creek", "pine creek pass"])
SHEPHERD = _pass("shepherd", "Shepherd Pass", 36.672, -118.345, tier="featured",
                 aliases=["shepherd", "shepherd pass", "shepherds pass", "shepherd's pass"])
TRAIL_PASS = _pass("trail-pass", "Trail Pass", 36.436, -118.19)
EBBETTS = _pass("ebbetts", "Ebbetts Pass", 38.544, -119.812, tier="featured", aliases=["ebbetts"])
COTTONWOOD = _pass("cottonwood", "Cottonwood Pass", 36.45, -118.22, tier="featured",
                   aliases=["cottonwood pass"])
COTTONWOOD_2 = _pass("cottonwood-pass-2", "Cottonwood Pass", 35.78, -120.2)
PASSES = [GRANITE, GRANITE_WA, NEW_ARMY, ARMY, MUIR, PINE_CREEK, SHEPHERD, TRAIL_PASS,
          EBBETTS, COTTONWOOD, COTTONWOOD_2]


def _report(place: str, text: str, day: str = "2026-09-21", **more: Any) -> dict[str, Any]:
    return {
        "source": "nps-seki-trails", "agency": "National Park Service",
        "unit": "Sequoia and Kings Canyon National Parks", "section": "Cedar Grove",
        "place": place, "text": text, "date": day,
        "url": "https://www.nps.gov/seki/planyourvisit/trailcond.htm",
        "fetched_at": "2026-09-29T21:30:00+00:00", "bounds": SEKI, **more,
    }


def _linked(reports: list[dict[str, Any]], today: date = TODAY) -> dict[str, list[Any]]:
    return link_reports(PASSES, reports, today)


def test_a_report_naming_the_pass_in_its_place_is_linked_and_shaped_for_the_app() -> None:
    linked = _linked([_report("Copper Creek and Granite Pass", "Copper Creek is still running.")])
    assert linked == {"granite": [{
        "agency": "National Park Service",
        "unit": "Sequoia and Kings Canyon National Parks",
        "section": "Cedar Grove",
        "place": "Copper Creek and Granite Pass",
        "text": "Copper Creek is still running.",
        "truncated": False,
        "date": "2026-09-21",
        "url": "https://www.nps.gov/seki/planyourvisit/trailcond.htm",
        "fetched_at": "2026-09-29T21:30:00+00:00",
        "named_in": "place",
    }]}


def test_the_same_name_in_another_range_is_kept_apart_by_the_units_bounds() -> None:
    report = _report("Granite Pass", "Snow free.", bounds=NOCA)
    assert list(_linked([report])) == ["granite-pass-wa"]


def test_a_name_two_passes_share_inside_the_bounds_links_to_neither() -> None:
    report = _report("SR 190", "Closed at Cottonwood Pass.", bounds=CALIFORNIA)
    assert _linked([report]) == {}
    # Inside bounds that hold only one of them, the name is not in doubt.
    assert list(_linked([_report("Cottonwood Pass", "Expect winter conditions.")])) == [
        "cottonwood"
    ]


def test_a_name_inside_a_longer_name_is_not_a_match() -> None:
    linked = _linked([_report("New Army Pass", "Deep snow patch near east side of pass.")])
    assert list(linked) == ["new-army"]
    both = _linked([_report("Army Pass and New Army Pass", "Snow free.")])
    assert sorted(both) == ["army-pass", "new-army"]


def test_short_names_and_names_of_other_places_are_never_used() -> None:
    assert names_for(MUIR) == ["muir pass"]
    assert names_for(PINE_CREEK) == ["pine creek pass"]
    assert names_for(SHEPHERD) == ["shepherd pass", "shepherds pass", "shepherd s pass"]
    reports = [
        _report("John Muir Trail (JMT)", "Large tree down near crossing of Piute Creek."),
        _report("Pine Creek", "Crossing is knee deep."),
    ]
    assert _linked(reports) == {}


def test_a_name_must_be_written_as_a_name() -> None:
    assert _linked([_report("Cottonwood Lakes", "Carry your trail pass and permit.")]) == {}
    assert list(_linked([_report("Cottonwood Lakes", "Snow free to Trail Pass.")])) == [
        "trail-pass"
    ]
    shouted = _report("SR 4", "IS CLOSED FROM LAKE ALPINE TO THE JCT OF SR 89 /EBBETTS PASS/",
                      bounds=CALIFORNIA)
    assert list(_linked([shouted])) == ["ebbetts"]


def test_a_junction_camp_or_lake_named_after_the_pass_is_not_the_pass() -> None:
    reports = [
        _report("Twin Lakes Trail", "East Clover Creek at Granite Pass junction is dry."),
        _report("Bubbs Creek", "White Creek, below the Granite Pass Jct., must be forded."),
        _report("Simpson Meadow", "Trees down between Granite Pass Camp and the river."),
        _report("Granite Pass Trailhead", "Parking lot is full by 8 am."),
    ]
    assert _linked(reports) == {}
    # A trail or road named for the pass is the way to it, and does count.
    kept = [
        _report("Granite Pass Trail", "Brushy below the lakes.", "2026-09-22"),
        _report("Copper Creek", "Granite Pass Road is closed at the gate.", "2026-09-21"),
        _report("Dougherty Creek", "Snow free to Granite Pass, camp is dry.", "2026-09-20"),
    ]
    assert [r["place"] for r in _linked(kept)["granite"]] == [
        "Granite Pass Trail", "Copper Creek", "Dougherty Creek",
    ]


def test_a_pass_named_only_in_the_text_is_linked_and_says_so() -> None:
    linked = _linked([_report("Deadman Canyon", "Stock passable up to Shepherd's Pass.")])
    assert [r["named_in"] for r in linked["shepherd"]] == ["text"]


def test_reports_older_than_the_limit_or_dated_ahead_are_not_shown() -> None:
    assert MAX_AGE_DAYS == 21
    reports = [
        _report("Granite Pass", "Exactly at the limit.", "2026-09-08"),
        _report("Granite Pass", "One day past it.", "2026-09-07"),
        _report("Granite Pass", "Dated tomorrow.", "2026-09-30"),
        _report("Granite Pass", "No date that can be read.", "soon"),
    ]
    assert [r["text"] for r in _linked(reports)["granite"]] == ["Exactly at the limit."]


def test_reports_naming_the_pass_in_the_place_come_first_then_the_newest() -> None:
    reports = [
        _report("Simpson Meadow", "Tree down below Granite Pass.", "2026-09-28"),
        _report("Granite Pass", "Older.", "2026-09-12"),
        _report("Granite Pass", "Newer.", "2026-09-20"),
    ]
    assert [r["text"] for r in _linked(reports)["granite"]] == [
        "Newer.", "Older.", "Tree down below Granite Pass.",
    ]


def test_a_report_printed_twice_is_shown_once_and_the_list_is_capped() -> None:
    twice = [_report("Granite Pass", "Snow free.", section=s) for s in ("Cedar Grove", "East")]
    assert len(_linked(twice)["granite"]) == 1
    many = [_report("Granite Pass", f"Report {n}.", f"2026-09-{10 + n}") for n in range(9)]
    shown = _linked(many)["granite"]
    assert len(shown) == MAX_REPORTS
    assert shown[0]["text"] == "Report 8."


def test_a_report_with_no_bounds_or_a_broken_shape_links_to_nothing() -> None:
    report = _report("Granite Pass", "Snow free.")
    del report["bounds"]
    assert _linked([report, {"place": "Granite Pass"}]) == {}


def test_short_reports_are_quoted_whole() -> None:
    assert excerpt("Snow free.") == ("Snow free.", False)
    text = "x" * EXCERPT_CHARS
    assert excerpt(text) == (text, False)


def test_a_long_report_stops_at_the_last_sentence_that_fits() -> None:
    first = "The trail is slippery with mud and at higher elevations packed snow and ice. "
    text = first * 8
    shown, cut = excerpt(text)
    assert cut is True
    assert shown == (first * 5).strip()
    assert len(shown) <= EXCERPT_CHARS and shown.endswith("ice.")


def test_an_abbreviation_is_not_the_end_of_a_sentence() -> None:
    filler = "Commercial vehicles are prohibited at all times on this road. " * 5
    text = filler + "For pass information, check the Washington State Dept. of Transportation."
    text = text + " " + "Expect delays. " * 20
    shown, cut = excerpt(text, limit=len(filler) + 60)
    assert cut is True
    assert shown == filler.strip()
    text = "Closed at St. Elmo Pass and Mt. Fremont. " + "Expect delays. " * 40
    assert excerpt(text, limit=30)[0] == "Closed at St. Elmo Pass and Mt. Fremont."


def test_a_line_break_ends_a_sentence_that_has_no_full_stop() -> None:
    text = "OPEN\nScheduled to close October 19, 2026, date subject to change\n" + "z" * 500
    assert excerpt(text, limit=80) == (
        "OPEN\nScheduled to close October 19, 2026, date subject to change", True
    )


def test_a_first_sentence_longer_than_the_limit_is_quoted_to_its_end() -> None:
    first = "Is closed from " + "a very long way " * 40 + "to the junction."
    shown, cut = excerpt(first + " Motorists are advised to use an alternate route.")
    assert (shown, cut) == (first, True)
    unbroken = "word " * 200
    assert excerpt(unbroken) == (unbroken.strip(), False)


def _doc(issued_for: str) -> dict[str, Any]:
    return {
        "generated_at": f"{issued_for}T21:40:00+00:00",
        "issued_for": issued_for,
        "sources": {"nps-trails": "ok"},
        "passes": {"granite": {"reports": [
            {"place": "Granite Pass", "text": "Snow free.", "date": "2026-09-08"},
            {"place": "Granite Pass", "text": "Older.", "date": "2026-09-07"},
        ]}, "glen": {"reports": [
            {"place": "Glen Pass", "text": "Older still.", "date": "2026-09-01"},
        ]}},
    }


def test_load_official_merges_a_fresh_file_and_ages_each_report_again(tmp_path: Path) -> None:
    path = tmp_path / "passes.json"
    path.write_text(json.dumps(_doc("2026-09-28")))
    assert load_official("2026-09-29", path) == {"granite": {
        "reports": [{"place": "Granite Pass", "text": "Snow free.", "date": "2026-09-08"}],
        "issued_for": "2026-09-28",
        "fetched_at": "2026-09-28T21:40:00+00:00",
    }}


def test_load_official_omits_stale_missing_and_broken_files(tmp_path: Path) -> None:
    path = tmp_path / "passes.json"
    assert load_official("2026-09-29", path) == {}
    path.write_text(json.dumps(_doc("2026-09-27")))
    assert load_official("2026-09-29", path) == {}
    path.write_text("{not json")
    assert load_official("2026-09-29", path) == {}
    path.write_text(json.dumps({"passes": {"granite": {}}}))
    assert load_official("2026-09-29", path) == {}
    path.write_text(json.dumps({"issued_for": "2026-09-29", "passes": {"granite": {}}}))
    assert load_official("2026-09-29", path) == {}
