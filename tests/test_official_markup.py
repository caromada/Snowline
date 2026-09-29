from datetime import date

from ingest.official.dates import find_date, leading_date, parse_date
from ingest.official.markup import ACCORDION, Item, items, tables, updated_on


def test_lines_break_at_blocks_and_line_breaks_and_headings_carry_their_level() -> None:
    html = (
        "<h2>Wilderness Trails</h2><h4>High Sierra Trail</h4>"
        "<p>09/21/2026 - Water is off.<br />\n<br />"
        "<span style='font-weight: bold'>Twin Lakes Trail</span></p>"
        "<p>09/21/2026 -&nbsp;Many downed&nbsp;trees. </p>"
    )
    assert items(html) == [
        Item("heading", "Wilderness Trails", 2),
        Item("heading", "High Sierra Trail", 4),
        Item("line", "09/21/2026 - Water is off."),
        Item("line", "Twin Lakes Trail"),
        Item("line", "09/21/2026 - Many downed trees."),
    ]


def test_inline_tags_do_not_break_a_line_and_scripts_are_not_text() -> None:
    html = (
        "<p><strong>9/29</strong>-The <a href='/x'>Cascade Pass</a> Trail is slippery.</p>"
        "<script>var a = '<p>not text</p>';</script><style>p {color: red}</style>"
        "<nav><p>Park Home</p></nav>"
    )
    assert items(html) == [Item("line", "9/29-The Cascade Pass Trail is slippery.")]


def test_an_accordion_button_is_a_section_heading() -> None:
    html = (
        '<h4 class="usa-accordion__heading"><button class="usa-accordion__button" '
        'type="button">\nCedar Grove and Roads End\n</button></h4>'
    )
    assert items(html) == [Item("heading", "Cedar Grove and Roads End", ACCORDION)]


def test_tables_keep_cells_as_lines_and_remember_the_heading_above() -> None:
    html = (
        "<h2>Wonderland Trail</h2><p>NOTE: Sunrise Road is CLOSED.</p>"
        "<table><tbody>"
        "<tr><td><p><strong>Trail Name</strong></p></td><td><p>Update</p></td></tr>"
        "<tr><td>Summerland to Indian Bar</td><td>09/28/2026</td></tr>"
        "<tr><td>Box Canyon<br />to Reflection Lakes</td><td> </td></tr>"
        "</tbody></table>"
    )
    (table,) = tables(items(html))
    assert table.heading == "Wonderland Trail"
    assert table.rows == [
        [["Trail Name"], ["Update"]],
        [["Summerland to Indian Bar"], ["09/28/2026"]],
        [["Box Canyon", "to Reflection Lakes"], []],
    ]


def test_a_layout_table_does_not_swallow_the_table_inside_it() -> None:
    html = (
        '<table class="CS_Layout_Table"><tr><td><h2>Road Status</h2><p>Call ahead.</p>'
        "<table><tr><th>ROAD</th><th>STATUS</th></tr>"
        "<tr><td><p>Sunrise Road</p></td><td><p>CLOSED</p><ul><li>Bring water.</li></ul></td></tr>"
        "</table></td></tr></table>"
    )
    outer, inner = sorted(tables(items(html)), key=lambda t: len(t.rows))
    assert outer.rows == [[["Road Status", "Call ahead."]]]
    assert inner.heading == "Road Status"
    assert inner.rows == [
        [["ROAD"], ["STATUS"]],
        [["Sunrise Road"], ["CLOSED", "Bring water."]],
    ]


def test_a_line_that_is_only_a_link_is_marked_so_a_caption_is_not_read_as_a_report() -> None:
    html = (
        "<table><tr><td><a href='/trail.htm'>Carbon Glacier Trail</a></td>"
        "<td><a href='/map.pdf'>Sunrise Area Trails Map</a><br />"
        "The parking area will be closed. See the <a href='/x'>alert</a>.</td></tr></table>"
    )
    stream = items(html)
    assert [(i.text, i.linked) for i in stream if i.kind == "line"] == [
        ("Carbon Glacier Trail", True),
        ("Sunrise Area Trails Map", True),
        ("The parking area will be closed. See the alert.", False),
    ]
    (table,) = tables(stream)
    assert table.rows[0][1] == [
        "Sunrise Area Trails Map", "The parking area will be closed. See the alert.",
    ]
    assert table.link_lines == {"Carbon Glacier Trail", "Sunrise Area Trails Map"}


def test_unclosed_cells_and_rows_still_come_out_as_rows() -> None:
    html = "<table><tr><td>Tioga Road<td>Open<tr><td>Glacier Point Road<td>Closed</table>"
    (table,) = tables(items(html))
    assert table.rows == [[["Tioga Road"], ["Open"]], [["Glacier Point Road"], ["Closed"]]]


def test_the_pages_own_date_prefers_a_heading_over_the_footer() -> None:
    footer = "<h1>Current Conditions</h1><p>Open</p><p>Last updated: September 28, 2026</p>"
    assert updated_on(items(footer)) == date(2026, 9, 28)
    both = "<h3>Road Status - Updated September 27, 2026</h3>" + footer
    assert updated_on(items(both)) == date(2026, 9, 27)
    assert updated_on(items("<h1>Current Conditions</h1><p>Open</p>")) is None


def test_dates_are_read_in_every_form_the_agencies_use() -> None:
    assert parse_date("09/21/2026") == date(2026, 9, 21)
    assert parse_date("6/1/2026") == date(2026, 6, 1)
    assert parse_date("9/29/26") == date(2026, 9, 29)
    assert parse_date("September 4, 2026") == date(2026, 9, 4)
    assert parse_date("Sept. 8, 2026") == date(2026, 9, 8)
    assert parse_date("September 29th, 2026") == date(2026, 9, 29)
    assert parse_date("2026-09-28 17:12:32.0") == date(2026, 9, 28)


def test_what_is_not_a_date_is_not_guessed_into_one() -> None:
    assert parse_date("") is None
    assert parse_date("02/30/2026") is None
    assert parse_date("13/01/2026") is None
    assert parse_date("Open") is None
    assert parse_date("9/29") is None
    assert parse_date("As of 9/29/26 the road is open") is None


def test_a_date_is_found_inside_a_sentence() -> None:
    assert find_date("Road Status - Updated September 28, 2026") == date(2026, 9, 28)
    assert find_date("Last updated: September 24, 2026") == date(2026, 9, 24)
    assert find_date(
        "This highway information is the latest reported as of Tuesday, "
        "September 29th, 2026 at 02:04 PM."
    ) == date(2026, 9, 29)
    assert find_date("Status/Condition as of Sept. 8, 2026") == date(2026, 9, 8)
    assert find_date("No date here, only 1/4 mile of trail") is None


def test_a_dated_line_gives_its_date_and_the_words_after_it() -> None:
    assert leading_date("09/21/2026 - Water is off at Bearpaw Meadow.") == (
        date(2026, 9, 21), "Water is off at Bearpaw Meadow.")
    assert leading_date("05/26/2026 Open. Hikers may see burned trees.") == (
        date(2026, 5, 26), "Open. Hikers may see burned trees.")
    assert leading_date("7/24/25: The trail becomes more challenging.") == (
        date(2025, 7, 24), "The trail becomes more challenging.")
    assert leading_date("6/17/26- Trail along Ruby Creek is not accessible to stock.") == (
        date(2026, 6, 17), "Trail along Ruby Creek is not accessible to stock.")
    for dash in (chr(0x2013), chr(0x2014)):  # en and em dash, as editors autocorrect them
        assert leading_date(f"08/13/2026 {dash} Snow free.") == (date(2026, 8, 13), "Snow free.")
    assert leading_date("General: Trail is generally snow-free in spring.") is None
    assert leading_date("09/21/2026 -") is None


def test_a_date_without_a_year_takes_the_latest_year_the_page_allows() -> None:
    page = date(2026, 9, 29)
    assert leading_date("9/29-The Cascade Pass Trail is slippery.", page) == (
        date(2026, 9, 29), "The Cascade Pass Trail is slippery.")
    assert leading_date("9/5- The Big Beaver Trail is closed.", page) == (
        date(2026, 9, 5), "The Big Beaver Trail is closed.")
    # Later in the year than the page itself: it can only be last year's.
    assert leading_date("12/10 - The road is closed due to landslides.", page) == (
        date(2025, 12, 10), "The road is closed due to landslides.")
    # Without a page date there is no year to take.
    assert leading_date("9/29-The Cascade Pass Trail is slippery.") is None
    # A fraction is not a date: a yearless date needs its dash or colon.
    assert leading_date("1/4 north of Devil's Dream Camp.", page) is None
