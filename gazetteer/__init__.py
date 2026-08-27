"""Pass gazetteer: load the 15-pass database and resolve messy location text.

Resolution order: exact alias, alias-substring inside the text, then fuzzy
match, so "Glen", "the pass after Rae Lakes", and "Kersarge" all land.
"""

from __future__ import annotations

import difflib
import json
import re
from functools import lru_cache
from pathlib import Path
from typing import Any

_GAZETTEER_PATH = Path(__file__).resolve().parent / "passes.json"

FUZZY_CUTOFF = 0.78


def _norm(text: str) -> str:
    return re.sub(r"[^a-z0-9 ]+", " ", text.lower()).strip()


@lru_cache(maxsize=1)
def load_passes() -> list[dict[str, Any]]:
    data = json.loads(_GAZETTEER_PATH.read_text())
    return data["passes"]


@lru_cache(maxsize=1)
def _alias_index() -> dict[str, str]:
    # First wins: featured passes come first in passes.json, so their
    # aliases beat any OSM entry that shares a name fragment.
    index: dict[str, str] = {}
    for p in load_passes():
        for key in (_norm(p["name"]), _norm(p["slug"]), *(_norm(a) for a in p["aliases"])):
            if key and key not in index:
                index[key] = p["slug"]
    return index


def get_pass(slug: str) -> dict[str, Any] | None:
    for p in load_passes():
        if p["slug"] == slug:
            return p
    return None


def resolve(text: str | None) -> str | None:
    """Resolve free text to a pass slug, or None if no confident match."""
    if not text:
        return None
    q = _norm(text)
    if not q:
        return None
    index = _alias_index()
    if q in index:
        return index[q]
    # Longest alias that appears as a whole-word substring of the text.
    best: tuple[int, str] | None = None
    for alias, slug in index.items():
        if re.search(rf"\b{re.escape(alias)}\b", q) and (best is None or len(alias) > best[0]):
            best = (len(alias), slug)
    if best:
        return best[1]
    fuzzy = difflib.get_close_matches(q, list(index), n=1, cutoff=FUZZY_CUTOFF)
    if fuzzy:
        return index[fuzzy[0]]
    return None
