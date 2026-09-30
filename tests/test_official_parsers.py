"""Each parser against a saved copy of the real page, as fetched on 2026-09-29."""

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from ingest.official import (
    caltrans_roads,
    nps_alerts,
    nps_bulletins,
    nps_dated,
    nps_roads,
    nps_tables,
)

FIXTURES = Path(__file__).parent / "fixtures" / "official"
FETCHED = datetime(2026, 9, 29, 21, 30, tzinfo=UTC)
STAMP = "2026-09-29T21:30:00+00:00"


def _read(name: str) -> str:
    return (FIXTURES / name).read_text()


def _by_place(reports: list[dict[str, Any]], place: str) -> list[dict[str, Any]]:
    return [r for r in reports if r["place"] == place]


def _one(reports: list[dict[str, Any]], place: str) -> dict[str, Any]:
    (found,) = _by_place(reports, place)
    return found


# Sequoia and Kings Canyon: a heading, then a line that opens with a date.


def _seki() -> list[dict[str, Any]]:
    return nps_dated.parse_headed(
        _read("nps_seki_trailcond.html"), nps_dated.PAGES["nps-seki-trails"], FETCHED
    )


def test_seki_report_has_every_field_of_the_shape() -> None:
    assert _one(_seki(), "Copper Creek and Granite Pass") == {
        "source": "nps-seki-trails",
        "agency": "National Park Service",
        "unit": "Sequoia and Kings Canyon National Parks",
        "section": "Cedar Grove and Roads End",
        "place": "Copper Creek and Granite Pass",
        "text": (
            "Copper Creek is still running, and water available at Lower and Upper Tent "
            "Meadow. East and Middle Fork of Dougherty Creek still running."
        ),
        "date": "2026-09-21",
        "url": "https://www.nps.gov/seki/planyourvisit/trailcond.htm",
        "fetched_at": STAMP,
        "bounds": [36.25, -119.0, 37.25, -118.15],
    }


def test_seki_keeps_the_agencys_words_untouched_typos_and_all() -> None:
    assert _one(_seki(), "Colby Pass")["text"] == "Snow all but mlted out."
    assert _one(_seki(), "Taboose Pass")["text"] == (
        "Overgrown and brushy,with creek crossings washed out. Not recomended for stock."
    )


def test_seki_reads_a_place_written_as_a_bold_line_instead_of_a_heading() -> None:
    twin = _one(_seki(), "Twin Lakes Trail")
    assert twin["date"] == "2026-09-21"
    assert twin["text"].startswith("East Clover Creek at JO Pass junction is dry.")
    # The line before it belongs to the heading above, and ends where it ends.
    assert _one(_seki(), "High Sierra Trail")["text"] == (
        "Water is off at Bearpaw Meadow campground, but available at spigot behind "
        "ranger station."
    )


def test_seki_lists_a_place_once_for_each_district_that_reports_it() -> None:
    sections = [r["section"] for r in _by_place(_seki(), "Kearsarge Pass")]
    assert sections == [
        "Cedar Grove and Roads End",
        "Sierra Crest and East Side (Inyo National Forest)",
    ]


def test_seki_drops_a_report_dated_after_the_day_it_was_fetched() -> None:
    # The page carries "07/27/2027 - Washout at Guyot Flat Creek", a typing slip.
    reports = _seki()
    assert all(r["date"] <= "2026-09-29" for r in reports)
    assert not [r for r in reports if "Guyot Flat" in r["text"]]


def test_seki_drops_what_has_no_date() -> None:
    reports = _seki()
    assert not [r for r in reports if "bridge above Paradise Valley" in r["text"].lower()]
    assert not [r for r in reports if "These river crossings" in r["text"]]
    # Counted on the page by hand: 111 dated lines, one of them in the future.
    assert len(reports) == 110
    recent = sorted((r["date"], r["place"]) for r in reports if r["date"] >= "2026-09-08")
    assert recent == [
        ("2026-09-21", "Alta Peak Trail"),
        ("2026-09-21", "Copper Creek and Granite Pass"),
        ("2026-09-21", "High Sierra Trail"),
        ("2026-09-21", "Redwood Meadow"),
        ("2026-09-21", "Twin Lakes Trail"),
        ("2026-09-23", "Mosquito Lakes"),
    ]


# North Cascades: dated lines inside the cell of a table, most without a year.


def _noca() -> list[dict[str, Any]]:
    return nps_dated.parse_table_lines(
        _read("nps_noca_trail_conditions.html"), nps_dated.PAGES["nps-noca-trails"], FETCHED
    )


def test_noca_takes_the_year_from_the_pages_own_date() -> None:
    reports = _by_place(_noca(), "Cascade Pass / Sahale Arm / Horseshoe Basin")
    assert [r["date"] for r in reports] == ["2026-09-29", "2026-07-06"]
    assert reports[0]["section"] == "Cascade Pass/Sahale Arm/Horseshoe Basin"
    assert reports[0]["text"].startswith(
        "The entirety of the Cascade Pass Trail accessing Cascade Pass and beyond to Sahale "
        "Glacier Camp is slippery with mud and at higher elevations packed snow/ice."
    )
    assert reports[0]["text"].endswith("with water sources covered but locatable.")
    assert reports[1]["text"] == "Basin Creek bridge has been installed for the season."


def test_noca_keeps_the_year_the_agency_wrote() -> None:
    dates = [r["date"] for r in _by_place(_noca(), "Brush Creek (to Whatcom Pass)")]
    assert dates == ["2026-09-03", "2025-09-17"]


def test_noca_drops_general_notes_and_rows_with_no_recent_report() -> None:
    reports = _noca()
    assert not [r for r in reports if r["text"].startswith("General")]
    assert not [r for r in reports if "No recent report" in r["text"]]
    assert not _by_place(reports, "Goode Ridge")
    assert not _by_place(reports, "Trail Name")


def test_noca_reads_a_place_name_split_across_bold_and_link() -> None:
    reports = _by_place(_noca(), "Hannegan Pass / Chilliwack River")
    assert [r["date"] for r in reports] == ["2026-09-03", "2026-07-12"]


# Mount Rainier and Olympic: a table with a date column.


def _mora() -> list[dict[str, Any]]:
    return nps_tables.parse(
        _read("nps_mora_trails.html"), nps_tables.PAGES["nps-mora-trails"], FETCHED
    )


def test_mora_row_becomes_a_report_with_its_snow_cover() -> None:
    report = _one(_mora(), "Summerland to Indian Bar")
    assert report["date"] == "2026-09-28"
    assert report["section"] == "Wonderland Trail"
    assert report["unit"] == "Mount Rainier National Park"
    assert report["text"] == (
        "% Snow Cover: 0\n"
        "The Fryingpan Creek Trailhead parking area and the connector trail from the "
        "parking lot is closed. Access to Summerland is available via the Wonderland "
        "Trail, with limited parking at White River Campground."
    )


def test_mora_row_with_only_a_snow_cover_still_reports_it() -> None:
    report = _one(_mora(), "Pacific Crest Trail (PCT) NORTH from Chinook Pass to Sourdough Gap.")
    assert report["date"] == "2026-07-14"
    assert report["text"] == "% Snow Cover: 0"


def test_mora_summary_row_is_named_for_its_section() -> None:
    report = _one(_mora(), "Wonderland Trail")
    assert report["date"] == "2026-09-28"
    assert report["text"].startswith(
        "The Wonderland Trail is CLOSED between Carbon River and Summerland"
    )
    assert report["text"].endswith("Please bring a bear canister.")
    assert not _by_place(_mora(), "Summary")
    assert not _by_place(_mora(), "Trail Name")


def test_mora_leaves_a_link_to_a_map_out_of_the_report() -> None:
    report = _one(_mora(), "Trails in the White River Area")
    assert report["date"] == "2026-09-15"
    assert report["text"] == (
        "The Fryingpan Creek Trailhead parking area will be closed starting 10/1/2026."
    )


def test_mora_reads_a_table_with_a_stray_empty_column() -> None:
    report = _one(_mora(), "Spray Park")
    assert report["date"] == "2026-08-24"
    assert report["text"].startswith("% Snow Cover: 1\nSR165 Carbon River/Fairfax Bridge is closed")


def _olym() -> list[dict[str, Any]]:
    return nps_tables.parse(
        _read("nps_olym_trail_conditions.html"), nps_tables.PAGES["nps-olym-trails"], FETCHED
    )


def test_olym_bullets_stay_separate_lines() -> None:
    report = _one(_olym(), "Irely Lake Trail")
    assert report["date"] == "2026-09-29"
    assert report["section"] == "Quinault"
    assert report["text"] == (
        "Aside from a few muddy sections of trail, this trail has been brushed recently "
        "and is in good shape\n"
        "The bridge over the creek leading to Irely Lake has been fixed and is now usable "
        "as of 10/2024\n"
        "Closed to stock"
    )


def test_olym_row_that_reports_nothing_is_dropped() -> None:
    reports = _olym()
    assert not _by_place(reports, "Griff Creek Trail")  # "No recent reports."
    assert _one(reports, "Elwha River Trail")["date"] == "2026-08-23"


# Yosemite wilderness conditions: one date at the top, prose by area.


def _yose_wild() -> list[dict[str, Any]]:
    return nps_bulletins.parse(
        _read("nps_yose_wildcond.html"), nps_bulletins.PAGES["nps-yose-wilderness"], FETCHED
    )


def test_yose_bulletin_dates_each_paragraph_by_the_bulletins_date() -> None:
    reports = _yose_wild()
    assert {r["date"] for r in reports} == {"2026-09-04"}
    glacier = _by_place(reports, "Glacier Point Road")
    assert [r["text"] for r in glacier] == [
        "Bridalveil Creek and Meadow Brook on the south rim are flowing.",
        "Red Peak Pass is now completely passable without snow traction devices. People "
        "hiking the Red Peak loop should be aware that the bridge on the Lyell Fork of "
        "Triple Peak Fork is still broken- expect a wet crossing.",
    ]


def test_yose_bulletin_leaves_out_the_standing_sections() -> None:
    places = {r["place"] for r in _yose_wild()}
    assert places == {
        "Yosemite Valley", "Wawona", "Hetch Hetchy", "Glacier Point Road", "Tuolumne Meadows",
    }


def test_yose_bulletin_without_its_date_gives_nothing() -> None:
    html = _read("nps_yose_wildcond.html").replace("<p><em>September 4, 2026</em></p>", "")
    assert "September 4, 2026" not in html
    page = nps_bulletins.PAGES["nps-yose-wilderness"]
    assert nps_bulletins.parse(html, page, FETCHED) == []


# Road status tables, dated by the page.


def test_yose_roads_put_the_status_first_and_the_notes_after() -> None:
    reports = nps_roads.parse(
        _read("nps_yose_conditions.html"), nps_roads.PAGES["nps-yose-roads"], FETCHED
    )
    tioga = _one(reports, "Tioga Road (continuation of Highway 120 through the park)")
    assert tioga["date"] == "2026-09-28"
    assert tioga["text"] == (
        "Open\n"
        "Expect 10-minute delays in Tuolumne Meadows, and 15-minute delays from 8 am to "
        "3:30 pm, Monday through Thursday from Olmsted Pt to Tioga Pass\n"
        "No overnight parking along the road or parking lots starting October 15"
    )
    glacier = _one(reports, "Glacier Point Road")
    assert glacier["text"].startswith(
        "Closed\nTemporarily closed due to smoky conditions and to allow firefighting"
    )
    assert len(reports) == 8


def test_mora_roads_use_the_date_in_the_heading() -> None:
    reports = nps_roads.parse(
        _read("nps_mora_road_status.html"), nps_roads.PAGES["nps-mora-roads"], FETCHED
    )
    chinook = _one(reports, "SR 410 (Chinook Pass)")
    assert chinook["date"] == "2026-09-28"
    assert chinook["text"] == (
        "OPEN\n"
        "North Entrance to SR123/Cayuse Pass then east to Chinook Pass\n"
        "For pass information, check the Washington State Dept. of Transportation (WSDOT) "
        "or call 1-800-695-ROAD (7623) toll-free statewide or 206-DOT-HIWY (368-4499) in "
        "the greater Seattle area.\n"
        "Commercial vehicles prohibited at all times."
    )
    assert not _by_place(reports, "ROAD")
    assert len(reports) == 12


def test_crla_roads_read_a_three_column_table() -> None:
    reports = nps_roads.parse(
        _read("nps_crla_conditions.html"), nps_roads.PAGES["nps-crla-roads"], FETCHED
    )
    east = _one(reports, "East Rim Drive")
    assert east["date"] == "2026-09-23"
    assert east["text"].startswith(
        "OPEN\nFrom North Entrance Road it is a left turn at North Junction."
    )
    # The visitor center table below has the same columns and is not roads.
    assert not [r for r in reports if "Visitor Center" in r["place"] or r["place"] == "Steel"]
    assert len(reports) == 9


def test_road_table_on_a_page_with_no_date_gives_nothing() -> None:
    html = _read("nps_yose_conditions.html").replace("Last updated", "Last reviewed")
    assert nps_roads.parse(html, nps_roads.PAGES["nps-yose-roads"], FETCHED) == []


# Caltrans highway conditions: one paragraph to an entry, dated by the page.


def test_caltrans_entry_names_its_highway_and_area() -> None:
    reports = caltrans_roads.parse(_read("caltrans_roads_4_88_89_108.html"), FETCHED)
    ebbetts = [r for r in reports if "Ebbetts Pass" in r["text"]]
    assert ebbetts == [{
        "source": "caltrans-highways",
        "agency": "Caltrans",
        "unit": "California state highways",
        "section": "IN THE CENTRAL CALIFORNIA AREA",
        "place": "SR 4",
        "text": (
            "Is closed from 1.3 mi west of Ebbetts Pass /near Highland Lake Rd/ to 0.5 mi "
            "east of Ebbetts Pass (Alpine Co) from 0800 hrs to 1700 hrs on 9/29/26 - Due "
            "to construction - Motorists are advised to use an alternate route"
        ),
        "date": "2026-09-29",
        "url": "https://roads.dot.ca.gov/roadscell.php?roadnumber=4",
        "fetched_at": STAMP,
        "bounds": [32.5, -124.5, 42.05, -114.0],
    }]


def test_caltrans_gives_every_entry_under_its_own_highway() -> None:
    reports = caltrans_roads.parse(_read("caltrans_roads_4_88_89_108.html"), FETCHED)
    counts: dict[str, int] = {}
    for r in reports:
        counts[r["place"]] = counts.get(r["place"], 0) + 1
    assert counts == {"SR 4": 3, "SR 88": 2, "SR 89": 3, "SR 108": 1}
    north = [r for r in reports if r["section"] == "IN THE NORTHERN CALIFORNIA AREA"]
    assert {r["place"] for r in north} == {"SR 89"} and len(north) == 3


def test_caltrans_leaves_out_lines_that_report_no_condition() -> None:
    reports = caltrans_roads.parse(_read("caltrans_roads_120.html"), FETCHED)
    assert len(reports) == 3
    assert not [r for r in reports if "call 209-372-0200" in r["text"]]
    both = caltrans_roads.parse(_read("caltrans_roads_4_88_89_108.html"), FETCHED)
    assert not [r for r in both if r["text"].startswith("No traffic restrictions")]


def test_caltrans_page_without_its_timestamp_gives_nothing() -> None:
    html = _read("caltrans_roads_120.html").replace("latest reported as of", "latest")
    html = html.replace("September 29th, 2026", "today")
    assert caltrans_roads.parse(html, FETCHED) == []


# National Park Service alerts API. No key was available, so this payload is
# written by hand to the documented shape and is not a saved response.


def test_alerts_become_reports_and_undated_or_empty_ones_are_dropped() -> None:
    doc = json.loads(_read("nps_alerts_documented_shape.json"))
    reports = nps_alerts.parse(doc, datetime(2026, 11, 14, 15, 0, tzinfo=UTC))
    assert reports == [{
        "source": "nps-alerts",
        "agency": "National Park Service",
        "unit": "Yosemite National Park",
        "section": "Park Closure",
        "place": "Tioga Road closed for the season",
        "text": "Tioga Road (Highway 120 through the park) is closed for the winter.",
        "date": "2026-11-12",
        "url": "https://www.nps.gov/yose/planyourvisit/conditions.htm",
        "fetched_at": "2026-11-14T15:00:00+00:00",
        "bounds": [37.45, -119.95, 38.25, -119.15],
    }]


def test_alerts_in_an_unexpected_shape_give_nothing() -> None:
    assert nps_alerts.parse({"data": "none"}, FETCHED) == []
    assert nps_alerts.parse([], FETCHED) == []
    assert nps_alerts.parse({"data": [None, 7, {"title": "x"}]}, FETCHED) == []
