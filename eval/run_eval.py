"""Score cached extractions against the 30 hand-labeled posts.

Scoring rules per field:
- location: correct when both resolve to the same gazetteer slug
- date_observed and the four condition enums: exact match (null == null)
- reporter_register: exact match
- quote_span: correct when nullability matches and a non-null prediction is
  a verbatim substring of the post (whitespace-normalized), since many
  different spans are legitimately supportive

Usage: python -m eval.run_eval
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from config import DB_PATH
from extraction.extractor import post_hash
from extraction.schema import FIELDS
from gazetteer import resolve
from ingest.forums import load_corpus
from store import Store

LABELS_PATH = Path(__file__).resolve().parent / "labeled.jsonl"

EXACT_FIELDS = [
    "date_observed",
    "snow_condition",
    "traction_used",
    "crossing_condition",
    "exposure_comfort",
    "reporter_register",
]


def _norm_ws(text: str) -> str:
    return re.sub(r"\s+", " ", text.lower()).strip()


def score_one(gold: dict, pred: dict, post_text: str) -> dict[str, bool]:
    result: dict[str, bool] = {}
    result["location"] = resolve(gold.get("location")) == resolve(pred.get("location"))
    for field in EXACT_FIELDS:
        result[field] = gold.get(field) == pred.get(field)
    g_quote, p_quote = gold.get("quote_span"), pred.get("quote_span")
    if g_quote is None or p_quote is None:
        result["quote_span"] = g_quote is None and p_quote is None
    else:
        result["quote_span"] = _norm_ws(p_quote) in _norm_ws(post_text)
    return result


def main() -> None:
    store = Store(DB_PATH)
    posts = {p["id"]: p for p in load_corpus()}
    labels = [json.loads(line) for line in LABELS_PATH.read_text().splitlines() if line.strip()]

    per_field: dict[str, list[bool]] = {f: [] for f in FIELDS}
    missing = []
    for label in labels:
        post = posts[label["id"]]
        cached = store.get_extraction(post_hash(post["text"]))
        if cached is None:
            missing.append(label["id"])
            continue
        scores = score_one(label["gold"], cached["extraction"], post["text"])
        for field, ok in scores.items():
            per_field[field].append(ok)

    if missing:
        print(f"WARNING: no cached extraction for {missing}; run scripts.extract_corpus first")
    n = len(labels) - len(missing)
    if n == 0:
        return
    print(f"\nExtraction accuracy on {n} held-out hand-labeled posts:\n")
    overall: list[bool] = []
    for field in FIELDS:
        vals = per_field[field]
        acc = sum(vals) / len(vals)
        overall.extend(vals)
        print(f"  {field:20s} {acc:6.1%}")
    print(f"\n  {'overall (field-level)':20s} {sum(overall) / len(overall):6.1%}\n")


if __name__ == "__main__":
    main()
