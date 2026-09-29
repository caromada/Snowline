"""Trip report ingestion.

The repo ships a curated corpus (data/corpus/posts.jsonl, provenance
"corpus:curated"): posts written for this project, not by anyone who stood
on a pass. They are samples. Every post loaded here is stamped with that
provenance, and the pipeline leaves samples out of verdicts unless the demo
switch is on (see config.demo_streams and ingest.samples).

The scrapers below follow the same raw-first contract as the sensor
modules. They are not run by the daily ingest.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from config import ROOT
from ingest.http import fetch_text
from ingest.samples import SAMPLE_PROVENANCE
from store import Store

log = logging.getLogger(__name__)

CORPUS_PATH = ROOT / "data" / "corpus" / "posts.jsonl"


def load_corpus(path: Path | None = None) -> list[dict[str, Any]]:
    """The curated sample corpus, every post stamped as a sample.

    Each post: id, provenance, source, url, author, posted_date, title, text.
    """
    posts = []
    for line in (path or CORPUS_PATH).read_text().splitlines():
        if line.strip():
            posts.append({**json.loads(line), "provenance": SAMPLE_PROVENANCE})
    return posts


def scrape_topix_thread(store: Store, url: str) -> list[dict[str, Any]]:
    """Fetch one High Sierra Topix thread, raw-first. Parsing is source-specific
    and intentionally conservative: store the page, extract post blocks, and
    let the LLM do the reading."""
    html, cached = fetch_text(url)
    if not cached:
        store.record_raw("forum:topix", url, html)
    log.info("topix thread stored (%d bytes); parse per-deployment", len(html))
    return []


def scrape_reddit_listing(store: Store, subreddit: str) -> list[dict[str, Any]]:
    """Fetch a subreddit's new-posts JSON listing, raw-first."""
    url = f"https://www.reddit.com/r/{subreddit}/new.json?limit=50"
    body, cached = fetch_text(url)
    if not cached:
        store.record_raw(f"forum:reddit:{subreddit}", url, body)
    try:
        listing = json.loads(body)
    except json.JSONDecodeError:
        return []
    posts = []
    for child in listing.get("data", {}).get("children", []):
        d = child.get("data", {})
        if not d.get("selftext"):
            continue
        posts.append(
            {
                "id": f"reddit:{d.get('id')}",
                "source": f"reddit:{subreddit}",
                "url": f"https://www.reddit.com{d.get('permalink', '')}",
                "author": f"u/{d.get('author', 'unknown')}",
                "posted_date": "",
                "title": d.get("title", ""),
                "text": d.get("selftext", ""),
            }
        )
    return posts
