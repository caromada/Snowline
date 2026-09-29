"""Raw-first for feeds fetched off the main thread or before a store is open.

Fetchers hand each payload, exactly as received, to a Recorder. The caller
collects them and writes them to the store afterwards from one thread,
because a sqlite connection must stay on the thread that opened it.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from pathlib import Path

from store import Store

log = logging.getLogger(__name__)

# (source, url, payload). The url never carries a query string, so an
# access key can not end up in the store.
Recorder = Callable[[str, str, str], None]
Payload = tuple[str, str, str]


def collector() -> tuple[Recorder, list[Payload]]:
    payloads: list[Payload] = []

    def record(source: str, url: str, payload: str) -> None:
        payloads.append((source, url, payload))

    return record, payloads


def store_payloads(db_path: Path, payloads: list[Payload]) -> int:
    """Write collected payloads to the store. A missing store is not created
    just to hold them; the count written is returned."""
    if not payloads:
        return 0
    if not db_path.exists():
        log.warning("no store at %s; %d raw payloads not kept", db_path, len(payloads))
        return 0
    store = Store(db_path)
    try:
        for source, url, payload in payloads:
            store.record_raw(source, url, payload)
    finally:
        store.close()
    return len(payloads)
