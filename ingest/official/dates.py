"""The dates agencies write on their reports. Pure functions.

A date is read or it is not: nothing here repairs a bad day of the month or
fills in a missing part, with one exception. North Cascades writes "9/29"
with no year, and the year is taken from the page's own date, as the latest
year that does not put the report after the page it is printed on.
"""

from __future__ import annotations

import re
from datetime import date

_MONTHS = {
    name: number
    for number, names in enumerate(
        (
            ("january", "jan"), ("february", "feb"), ("march", "mar"), ("april", "apr"),
            ("may",), ("june", "jun"), ("july", "jul"), ("august", "aug"),
            ("september", "sept", "sep"), ("october", "oct"), ("november", "nov"),
            ("december", "dec"),
        ),
        start=1,
    )
    for name in names
}
_MONTH_WORD = "|".join(sorted(_MONTHS, key=len, reverse=True))

_NUMERIC = r"(?P<m>\d{1,2})/(?P<d>\d{1,2})/(?P<y>\d{4}|\d{2})"
_WORDED = rf"(?P<mw>{_MONTH_WORD})\.?\s+(?P<dw>\d{{1,2}})(?:st|nd|rd|th)?,?\s+(?P<yw>\d{{4}})"
_ISO = r"(?P<yi>\d{4})-(?P<mi>\d{2})-(?P<di>\d{2})"
_ANY = re.compile(rf"(?<![\w/])(?:{_NUMERIC}|{_WORDED}|{_ISO})(?![\d/])", re.IGNORECASE)
_WHOLE = re.compile(
    rf"(?:{_NUMERIC}|{_WORDED}|{_ISO}(?:[ T][\d:.]+)?)", re.IGNORECASE
)
_LEADING = re.compile(rf"{_NUMERIC}\s*[-\u2013\u2014:]?\s*(?P<rest>.*)", re.DOTALL)
_LEADING_NO_YEAR = re.compile(
    r"(?P<m>\d{1,2})/(?P<d>\d{1,2})\s*[-\u2013\u2014:]\s*(?P<rest>.*)", re.DOTALL
)


def _make(year: int, month: int, day: int) -> date | None:
    try:
        return date(year, month, day)
    except ValueError:
        return None


def _from_match(m: re.Match[str]) -> date | None:
    if m.group("m"):
        year = int(m.group("y"))
        return _make(year + 2000 if year < 100 else year, int(m.group("m")), int(m.group("d")))
    if m.group("mw"):
        return _make(int(m.group("yw")), _MONTHS[m.group("mw").lower()], int(m.group("dw")))
    return _make(int(m.group("yi")), int(m.group("mi")), int(m.group("di")))


def parse_date(text: str) -> date | None:
    """The date, when the text is a date and nothing else."""
    m = _WHOLE.fullmatch(text.strip())
    return _from_match(m) if m else None


def find_date(text: str) -> date | None:
    """The first date written inside a longer line."""
    m = _ANY.search(text)
    return _from_match(m) if m else None


def latest_on_or_before(month: int, day: int, limit: date) -> date | None:
    for year in (limit.year, limit.year - 1):
        found = _make(year, month, day)
        if found and found <= limit:
            return found
    return None


def leading_date(line: str, page_date: date | None = None) -> tuple[date, str] | None:
    """(date, the words after it) for a line that opens with a date.

    page_date lets a date with no year be read; without it such a line is
    not a dated line. A line that is a date and nothing more reports
    nothing and is not one either.
    """
    text = line.strip()
    m = _LEADING.match(text)
    if m:
        found = _from_match(m)
    else:
        m = _LEADING_NO_YEAR.match(text) if page_date else None
        if not m or page_date is None:
            return None
        found = latest_on_or_before(int(m.group("m")), int(m.group("d")), page_date)
    rest = m.group("rest").strip()
    if not found or not rest:
        return None
    return found, rest
