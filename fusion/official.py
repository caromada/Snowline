"""Official reports, linked to passes. Pure logic.

A report belongs to a pass when it names the pass, and only then. Three
guards keep a report about one place off another pass:

  1. The pass must lie inside the bounds of the unit that wrote the report.
     A Kings Canyon report naming Granite Pass never reaches the Granite
     Pass in the North Cascades.
  2. Only a whole name counts, written as a name. "Muir Pass" links;
     "John Muir Trail" does not, and neither does "carry your trail pass"
     for Trail Pass. One-word aliases and aliases that name some other
     place ("pine creek" for Pine Creek Pass) are never used, the same
     caution the gazetteer takes with short names.
  3. A name two passes inside the bounds share links to neither.

Linking through the road or trail a pass is on is not done here. The repo
knows trailheads only as points near a pass, and "near" is not "on". Tried
against the pages of 2026-09-29, matching a report's place to the
trailheads gazetteer.access links to each pass hung the one Copper Creek
report on more than thirty passes, and put a Twin Lakes Trail report on
Panther Gap, 1.7 miles from that trailhead and on a different trail. That
link waits for real route geometry (gazetteer/routes.py, when it lands).
"""

from __future__ import annotations

import json
import logging
import re
from collections.abc import Iterable
from datetime import date
from functools import lru_cache
from pathlib import Path
from typing import Any

from config import DATA_DIR

log = logging.getLogger(__name__)

OFFICIAL_PATH = DATA_DIR / "official" / "passes.json"
# A report older than this is not shown, however little has changed since.
MAX_AGE_DAYS = 21
# The file itself follows the forecast's rule: written today or yesterday.
MAX_FILE_AGE_DAYS = 1
MAX_REPORTS = 4
EXCERPT_CHARS = 400

_PASS_WORDS = {"pass", "gap", "col", "saddle", "summit", "notch", "divide", "crest"}
_ABBREVIATIONS = {
    "mt", "st", "dept", "rd", "hwy", "jct", "co", "approx", "mi", "ft", "hrs", "hr", "pt",
    "no", "vs", "etc", "sr", "us", "fs", "fr", "ave", "blvd", "lk", "cr", "ck", "mtn", "mts",
    "jr", "dr", "e", "w", "n", "s", "a", "p", "m", "g", "i",
}
_PUBLIC_FIELDS = ("agency", "unit", "section", "place", "text", "date", "url", "fetched_at")


def _norm(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def names_for(pass_: dict[str, Any]) -> list[str]:
    """The normalized names that may be looked for in an agency's prose."""
    candidates = [pass_["name"]]
    if pass_.get("tier") == "featured":
        candidates += list(pass_.get("aliases", []))
    found: list[str] = []
    for candidate in candidates:
        words = _norm(candidate).split()
        if len(words) < 2 or words[0] == "the" or words[-1] not in _PASS_WORDS:
            continue
        name = " ".join(words)
        if name not in found:
            found.append(name)
    return found


@lru_cache(maxsize=4096)
def _pattern(name: str) -> re.Pattern[str]:
    words = r"[^A-Za-z0-9]+".join(re.escape(word) for word in name.split())
    return re.compile(rf"(?<![A-Za-z0-9]){words}(?![A-Za-z0-9])", re.IGNORECASE)


def _spans(name: str, text: str) -> list[tuple[int, int]]:
    """Where the name is written as a name: its first and last words open
    with a capital or a digit, so "Trail Pass" and "TRAIL PASS" count and
    "trail pass" does not."""
    spans = []
    for m in _pattern(name).finditer(text):
        words = re.findall(r"[A-Za-z0-9]+", m.group(0))
        if all(w[0].isupper() or w[0].isdigit() for w in (words[0], words[-1])):
            spans.append(m.span())
    return spans


def _named(names: dict[str, list[str]], text: str) -> set[str]:
    """Slugs named in the text. names maps a name to the slugs inside the
    bounds that carry it. A name written inside a longer name that also
    matched is dropped, then a name with two owners is dropped."""
    hits = [(span, name) for name in names for span in _spans(name, text)]
    slugs: set[str] = set()
    for (start, end), name in hits:
        inside_longer = any(
            s <= start and end <= e and (e - s) > (end - start) for (s, e), _ in hits
        )
        if not inside_longer and len(names[name]) == 1:
            slugs.add(names[name][0])
    return slugs


def _inside(pass_: dict[str, Any], bounds: object) -> bool:
    if not isinstance(bounds, list | tuple) or len(bounds) != 4:
        return False
    try:
        south, west, north, east = (float(b) for b in bounds)
    except (TypeError, ValueError):
        return False
    return south <= pass_["lat"] <= north and west <= pass_["lon"] <= east


def _age_days(report: dict[str, Any], today: date) -> int | None:
    try:
        return (today - date.fromisoformat(report["date"])).days
    except (KeyError, TypeError, ValueError):
        return None


def is_current(report: dict[str, Any], today: date) -> bool:
    age = _age_days(report, today)
    return age is not None and 0 <= age <= MAX_AGE_DAYS


def _ends_sentence(text: str, at: int) -> bool:
    """Whether the character at `at` closes a sentence or a line."""
    char = text[at]
    if char == "\n":
        return True
    if char not in ".!?":
        return False
    rest = text[at + 1:at + 3]
    if rest and not rest[0].isspace():
        return False
    if char == ".":
        before = re.search(r"([A-Za-z]+)$", text[:at])
        if before and before.group(1).lower() in _ABBREVIATIONS:
            return False
        after = text[at + 1:].lstrip()
        if after and after[0].islower():
            return False
    return True


def excerpt(text: str, limit: int = EXCERPT_CHARS) -> tuple[str, bool]:
    """(what to quote, whether anything was left off). A long report is
    quoted up to the last sentence that ends inside the limit; when even the
    first sentence runs past it, that sentence is quoted whole, because half
    a sentence of somebody's closure notice can say the opposite."""
    text = text.strip()
    if len(text) <= limit:
        return text, False
    ends = [at for at in range(len(text)) if _ends_sentence(text, at)]
    fitting = [at for at in ends if at < limit]
    if fitting:
        cut = fitting[-1]
    elif ends:
        cut = ends[0]
    else:
        return text, False
    shown = text[:cut + 1].strip()
    return shown, len(shown) < len(text)


def _public(report: dict[str, Any], named_in: str) -> dict[str, Any]:
    out = {key: report[key] for key in _PUBLIC_FIELDS}
    out["text"], out["truncated"] = excerpt(report["text"])
    out["named_in"] = named_in
    return out


def link_reports(
    passes: Iterable[dict[str, Any]], reports: Iterable[dict[str, Any]], today: date
) -> dict[str, list[dict[str, Any]]]:
    """slug -> the reports to show for that pass: those naming it where the
    place is given first, then those naming it in their words, each newest
    first, capped at MAX_REPORTS."""
    passes = list(passes)
    names_in: dict[tuple[float, ...], dict[str, list[str]]] = {}
    found: dict[str, list[tuple[int, int, dict[str, Any]]]] = {}
    seen: set[tuple[str, str, str, str, str]] = set()
    for report in reports:
        if not all(isinstance(report.get(key), str) for key in _PUBLIC_FIELDS):
            continue
        if not is_current(report, today):
            continue
        bounds = report.get("bounds")
        key = tuple(bounds) if isinstance(bounds, list | tuple) else ()
        if key not in names_in:
            table: dict[str, list[str]] = {}
            for p in passes:
                if _inside(p, bounds):
                    for name in names_for(p):
                        table.setdefault(name, []).append(p["slug"])
            names_in[key] = table
        in_place = _named(names_in[key], report["place"])
        in_text = _named(names_in[key], report["text"]) - in_place
        age = _age_days(report, today) or 0
        for slug in in_place | in_text:
            printed = (slug, report["unit"], report["place"], report["date"], report["text"])
            if printed in seen:
                continue
            seen.add(printed)
            where = "place" if slug in in_place else "text"
            found.setdefault(slug, []).append(
                (0 if where == "place" else 1, age, _public(report, where))
            )
    return {
        slug: [r for _, _, r in sorted(rows, key=lambda row: row[:2])[:MAX_REPORTS]]
        for slug, rows in found.items()
    }


def load_official(today: str, path: Path = OFFICIAL_PATH) -> dict[str, Any]:
    """Per-pass reports from ingest.official for the export, or {} when the
    file is missing, unreadable or older than MAX_FILE_AGE_DAYS. Each report
    is aged again against today, since the file may be yesterday's."""
    if not path.exists():
        return {}
    try:
        doc = json.loads(path.read_text())
        issued = date.fromisoformat(doc["issued_for"])
        passes = doc["passes"]
        day = date.fromisoformat(today)
        if (day - issued).days > MAX_FILE_AGE_DAYS:
            log.warning("official file issued %s is stale; skipping official reports", issued)
            return {}
        out = {}
        for slug, record in passes.items():
            current = [r for r in record.get("reports", []) if is_current(r, day)]
            if current:
                out[slug] = {
                    "reports": current,
                    "issued_for": doc["issued_for"],
                    "fetched_at": doc.get("generated_at"),
                }
        return out
    except (ValueError, KeyError, TypeError, AttributeError) as exc:
        log.warning("unreadable official file %s: %s", path, exc)
        return {}
