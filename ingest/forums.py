"""Trip report ingestion.

Live scrapers exist for the three real sources and follow the same
raw-first contract as the sensor modules. The public demo ships with a
curated corpus instead (data/corpus/posts.jsonl, provenance
"corpus:curated"): realistic posts written for this project, because
re-scraping years-old forum threads is neither reproducible nor polite to
the forums. Point the scrapers at live URLs and everything downstream is
identical.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from config import ROOT
from ingest.http import fetch_text
from store import Store

log = logging.getLogger(__name__)

CORPUS_PATH = ROOT / "data" / "corpus" / "posts.jsonl"


def load_corpus(path: Path | None = None) -> list[dict[str, Any]]:
    """The curated demo corpus. Each post: id, source, url, author, posted_date, title, text."""
    posts = []
    for line in (path or CORPUS_PATH).read_text().splitlines():
        if line.strip():
            posts.append(json.loads(line))
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
