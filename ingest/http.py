"""Resilient HTTP: timeout, one retry with backoff, cached fallback.

Every successful response is written to the cache; when an upstream is down
the last good payload is served instead so the pipeline degrades rather
than crashing.
"""

from __future__ import annotations

import hashlib
import json
import logging
import time
from urllib.parse import urlencode

import requests

from config import CACHE_DIR, FETCH_RETRY_BACKOFF_S, FETCH_TIMEOUT_S

log = logging.getLogger(__name__)


class FetchError(RuntimeError):
    """Upstream failed and no cached fallback exists."""


def _cache_key(url: str, params: dict[str, str] | None) -> str:
    blob = url + "?" + urlencode(sorted((params or {}).items()))
    return hashlib.sha256(blob.encode()).hexdigest()


def fetch_text(url: str, params: dict[str, str] | None = None) -> tuple[str, bool]:
    """Return (body, from_cache). Raises FetchError only with no fallback."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_file = CACHE_DIR / f"{_cache_key(url, params)}.body"
    last_error: Exception | None = None
    for attempt in range(2):
        try:
            resp = requests.get(url, params=params, timeout=FETCH_TIMEOUT_S)
            resp.raise_for_status()
            cache_file.write_text(resp.text)
            return resp.text, False
        except (requests.RequestException, OSError) as exc:
            last_error = exc
            if attempt == 0:
                time.sleep(FETCH_RETRY_BACKOFF_S)
    if cache_file.exists():
        log.warning("upstream failed (%s), serving cached fallback for %s", last_error, url)
        return cache_file.read_text(), True
    raise FetchError(f"fetch failed with no cached fallback: {url}: {last_error}")


def fetch_json(url: str, params: dict[str, str] | None = None) -> tuple[object, str, bool]:
    """Return (parsed, raw_text, from_cache)."""
    text, cached = fetch_text(url, params)
    return json.loads(text), text, cached
