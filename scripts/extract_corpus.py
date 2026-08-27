"""Run LLM extraction over the demo corpus.

Usage: python -m scripts.extract_corpus [--engine cli|api] [--workers 8]

Cached posts (by content hash) are skipped; extraction calls fan out across
worker threads and results persist from the main thread only, keeping
SQLite single-writer.
"""

from __future__ import annotations

import argparse
import logging
from concurrent.futures import ThreadPoolExecutor, as_completed

from config import DB_PATH, EXTRACTIONS_CACHE
from extraction.extractor import Budget, post_hash, run_extraction
from ingest.forums import load_corpus
from store import Store

log = logging.getLogger(__name__)


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser()
    parser.add_argument("--engine", default="cli", choices=["cli", "api"])
    parser.add_argument("--workers", type=int, default=8)
    args = parser.parse_args()

    store = Store(DB_PATH)
    store.load_extractions(EXTRACTIONS_CACHE)
    budget = Budget()
    posts = load_corpus()
    pending = [p for p in posts if store.get_extraction(post_hash(p["text"])) is None]
    print(f"{len(posts)} posts, {len(pending)} not yet cached")

    failures = 0
    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {
            pool.submit(run_extraction, p, args.engine, budget): p for p in pending
        }
        for fut in as_completed(futures):
            post = futures[fut]
            try:
                record, model_used, t_in, t_out = fut.result()
            except Exception as exc:  # noqa: BLE001 - report per post, keep going
                failures += 1
                log.error("post %s failed: %s", post["id"], exc)
                continue
            store.put_extraction(
                post_hash(post["text"]),
                {k: post.get(k) for k in ("id", "source", "url", "author", "posted_date", "title")},
                record,
                model_used,
                t_in,
                t_out,
            )
            print(f"done {post['id']} ({model_used})")
    dumped = store.dump_extractions(EXTRACTIONS_CACHE)
    print(f"complete: {len(pending) - failures} extracted, {failures} failed, {dumped} cached")


if __name__ == "__main__":
    main()
