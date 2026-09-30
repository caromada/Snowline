"""An agency page as a flat run of headings, lines and table marks.

Standard library only. Agency pages are hand-edited in a rich text box, so
the same table is written three ways on one page and a place name is as
often a bold line as a heading. The parsers work from lines of text in
reading order, never from the exact nesting.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date
from html.parser import HTMLParser

from ingest.official.dates import find_date

_HEADINGS = {"h1": 1, "h2": 2, "h3": 3, "h4": 4, "h5": 5, "h6": 6}
# An accordion title groups what is under it whatever headings follow, so it
# gets a level no heading tag has.
ACCORDION = 7
_SKIPPED = {"script", "style", "noscript", "svg", "nav", "template", "select", "form"}
_BREAKS = {
    "p", "div", "br", "li", "ul", "ol", "dl", "dt", "dd", "section", "article", "aside",
    "blockquote", "figure", "figcaption", "caption", "hr", "pre", "address", "main",
    "header", "footer", "summary", "details", "thead", "tbody", "tfoot",
}
_TABLE_MARKS = {"table": "table", "tr": "row", "td": "cell", "th": "cell"}


@dataclass(frozen=True)
class Item:
    """kind is "heading", "line", or a table mark: "table", "row", "cell" and
    their "end_" forms. level is 1 to 6 on a heading, ACCORDION on an
    accordion title, else 0. linked marks a line that is a link's caption
    and nothing else."""

    kind: str
    text: str = ""
    level: int = 0
    linked: bool = False


@dataclass
class Table:
    """rows[r][c] is one cell's lines of text. heading is the last heading
    above the table, in reading order."""

    heading: str
    rows: list[list[list[str]]] = field(default_factory=list)
    link_lines: set[str] = field(default_factory=set)

    def words(self, cell: list[str]) -> list[str]:
        """A cell's lines without the captions of links to maps and forms."""
        return [line for line in cell if line not in self.link_lines]


def clean(text: str) -> str:
    return re.sub(r"\s+", " ", text.replace("\xa0", " ")).strip()


class _Reader(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.out: list[Item] = []
        self._text: list[str] = []
        self._in_link = 0
        self._outside_a_link = False
        self._skipping = 0
        self._heading: list[int] = []
        # One entry per open table: [row is open, cell is open].
        self._open: list[list[bool]] = []

    def _flush(self, level: int = 0) -> None:
        text = clean("".join(self._text))
        linked = not self._outside_a_link
        self._text = []
        self._outside_a_link = False
        if text and level:
            self.out.append(Item("heading", text, level))
        elif text:
            self.out.append(Item("line", text, linked=linked))

    def _close_cell(self) -> None:
        if self._open and self._open[-1][1]:
            self._flush()
            self.out.append(Item("end_cell"))
            self._open[-1][1] = False

    def _close_row(self) -> None:
        self._close_cell()
        if self._open and self._open[-1][0]:
            self.out.append(Item("end_row"))
            self._open[-1][0] = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in _SKIPPED:
            self._skipping += 1
        if self._skipping:
            return
        if tag == "a":
            self._in_link += 1
        elif tag in _HEADINGS:
            self._flush()
            self._heading.append(_HEADINGS[tag])
        elif tag == "button":
            self._flush()
            classes = dict(attrs).get("class") or ""
            self._heading.append(ACCORDION if "accordion" in classes else 0)
        elif tag == "table":
            self._flush()
            self._open.append([False, False])
            self.out.append(Item("table"))
        elif tag == "tr" and self._open:
            self._close_row()
            self._open[-1][0] = True
            self.out.append(Item("row"))
        elif tag in ("td", "th") and self._open:
            self._close_cell()
            if not self._open[-1][0]:
                self._open[-1][0] = True
                self.out.append(Item("row"))
            self._open[-1][1] = True
            self.out.append(Item("cell"))
        elif tag in _BREAKS:
            self._flush()

    def handle_endtag(self, tag: str) -> None:
        if tag in _SKIPPED:
            self._skipping = max(0, self._skipping - 1)
            return
        if self._skipping:
            return
        if tag == "a":
            self._in_link = max(0, self._in_link - 1)
        elif tag in _HEADINGS or tag == "button":
            level = self._heading.pop() if self._heading else 0
            self._flush(level)
        elif tag == "table" and self._open:
            self._close_row()
            self._open.pop()
            self.out.append(Item("end_table"))
        elif tag == "tr" and self._open:
            self._close_row()
        elif tag in ("td", "th") and self._open:
            self._close_cell()
        elif tag in _BREAKS:
            self._flush()

    def handle_data(self, data: str) -> None:
        if self._skipping:
            return
        self._text.append(data)
        if not self._in_link and clean(data):
            self._outside_a_link = True

    def finish(self) -> list[Item]:
        self.close()
        self._flush()
        while self._open:
            self._close_row()
            self._open.pop()
            self.out.append(Item("end_table"))
        return self.out


def items(html: str) -> list[Item]:
    reader = _Reader()
    reader.feed(html)
    return reader.finish()


def tables(stream: list[Item]) -> list[Table]:
    """Every table in the stream, inner tables included, in the order they
    open. Text inside an inner table belongs to that table alone."""
    found: list[Table] = []
    stack: list[Table] = []
    heading = ""
    for item in stream:
        if item.kind == "table":
            table = Table(heading)
            found.append(table)
            stack.append(table)
        elif item.kind == "end_table":
            if stack:
                stack.pop()
        elif item.kind == "row" and stack:
            stack[-1].rows.append([])
        elif item.kind == "cell" and stack and stack[-1].rows:
            stack[-1].rows[-1].append([])
        elif item.kind in ("heading", "line"):
            if item.kind == "heading":
                heading = item.text
            if stack and stack[-1].rows and stack[-1].rows[-1]:
                stack[-1].rows[-1][-1].append(item.text)
                if item.linked:
                    stack[-1].link_lines.add(item.text)
    return found


def updated_on(stream: list[Item]) -> date | None:
    """The date the agency put on the page as a whole: a heading that says
    when it was updated, else the "Last updated" line at the foot."""
    for item in stream:
        if item.kind == "heading" and "updated" in item.text.lower():
            found = find_date(item.text)
            if found:
                return found
    for item in stream:
        if item.kind == "line" and item.text.lower().startswith("last updated"):
            return find_date(item.text)
    return None
