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


def _get_within(url: str, params: dict[str, str] | None, timeout: float) -> str:
    """GET with a wall-clock deadline on the whole response.

    requests' own timeout only bounds the gap between bytes, and the USGS
    site service trickles a response slowly enough to never trip it: a 120s
    timeout once let one call run for 31 minutes. Stream the body and give up
    once the deadline passes. read1 returns after a single socket read, so a
    trickle cannot hide inside one large chunk request.
    """
    deadline = time.monotonic() + timeout
    with requests.get(url, params=params, timeout=(10, timeout), stream=True) as resp:
        resp.raise_for_status()
        chunks: list[bytes] = []
        while chunk := resp.raw.read1(65536, decode_content=True):
            chunks.append(chunk)
            if time.monotonic() > deadline:
                raise requests.Timeout(f"response still arriving after {timeout:.0f}s")
        return b"".join(chunks).decode(resp.encoding or "utf-8", errors="replace")


def fetch_text(
    url: str, params: dict[str, str] | None = None, timeout: float = FETCH_TIMEOUT_S
) -> tuple[str, bool]:
    """Return (body, from_cache). Raises FetchError only with no fallback."""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    cache_file = CACHE_DIR / f"{_cache_key(url, params)}.body"
    last_error: Exception | None = None
    for attempt in range(2):
        try:
            text = _get_within(url, params, timeout)
            cache_file.write_text(text)
            return text, False
        except (requests.RequestException, OSError) as exc:
            last_error = exc
            if attempt == 0:
                time.sleep(FETCH_RETRY_BACKOFF_S)
    if cache_file.exists():
        log.warning("upstream failed (%s), serving cached fallback for %s", last_error, url)
        return cache_file.read_text(), True
    raise FetchError(f"fetch failed with no cached fallback: {url}: {last_error}")


def fetch_json(
    url: str, params: dict[str, str] | None = None, timeout: float = FETCH_TIMEOUT_S
) -> tuple[object, str, bool]:
    """Return (parsed, raw_text, from_cache)."""
    text, cached = fetch_text(url, params, timeout)
    return json.loads(text), text, cached
