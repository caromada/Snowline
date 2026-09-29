"""The one shape every source produces.

    source      which page or feed, e.g. "nps-seki-trails"
    agency      who published it
    unit        the park, forest or road system
    section     the agency's own grouping on the page, when it has one
    place       the place the agency named
    text        the report exactly as published, lines joined by a newline
    date        the date the agency gave, ISO
    url         where to read it at the source
    fetched_at  when this copy was fetched, ISO, UTC
    bounds      [south, west, north, east] of the ground the unit reports on

bounds never reaches the app. It is what stops a report naming Granite Pass
in Kings Canyon from landing on the Granite Pass in the North Cascades.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from typing import Any

from fusion.forecast import PACIFIC

Bounds = tuple[float, float, float, float]
Report = dict[str, Any]

NPS = "National Park Service"


@dataclass(frozen=True)
class Page:
    source: str
    agency: str
    unit: str
    url: str
    bounds: Bounds


def make_report(
    page: Page,
    place: str,
    lines: list[str],
    found: date | None,
    fetched_at: datetime,
    section: str = "",
    url: str | None = None,
) -> Report | None:
    """A report, or None when it lacks a place, a date or any words, or is
    dated after the day it was fetched. An undated condition is worse than
    none, and a date in the future is a typing slip nobody can correct."""
    text = "\n".join(line for line in (ln.strip() for ln in lines) if line)
    place = place.strip()
    if not (place and text and found):
        return None
    if found > fetched_at.astimezone(PACIFIC).date():
        return None
    return {
        "source": page.source,
        "agency": page.agency,
        "unit": page.unit,
        "section": section.strip(),
        "place": place,
        "text": text,
        "date": found.isoformat(),
        "url": url or page.url,
        "fetched_at": fetched_at.isoformat(timespec="seconds"),
        "bounds": list(page.bounds),
    }
