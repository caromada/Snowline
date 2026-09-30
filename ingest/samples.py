"""Telling sample evidence from the real thing. Pure logic, no I/O.

Two stand-in streams were written for the demo: the curated corpus of trip
reports and the snow cover modeled from sensor curves. Neither observed a
pass, so the pipeline keeps them out of verdicts unless the demo switch is
on (see config.demo_streams). The rules live here, by what a row is rather
than where it was loaded from, so a report filed by a person in the app
flows through untouched the day such reports exist.
"""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any
from urllib.parse import urlsplit

SAMPLE_PROVENANCE = "corpus:curated"
MODELED_PROVENANCE = "satellite:modeled"

# Names no real site can hold: the top-level domains and the example domains
# set aside for documentation and testing (RFC 2606, RFC 6761).
RESERVED_TLDS = frozenset({"test", "example", "invalid", "localhost"})
RESERVED_DOMAINS = frozenset({"example.com", "example.net", "example.org"})


def is_reserved_host(host: str) -> bool:
    """True for a reserved name or anything under one."""
    labels = [label for label in host.strip().lower().rstrip(".").split(".") if label]
    if not labels:
        return False
    return labels[-1] in RESERVED_TLDS or ".".join(labels[-2:]) in RESERVED_DOMAINS


def _host(url: str) -> str:
    # urlsplit only finds the host after "//"; a bare "forum.test/t/1" has none.
    return urlsplit(url if "//" in url else f"//{url}").hostname or ""


def is_sample_post(post: Mapping[str, Any]) -> bool:
    """A post written for the demo: from the curated corpus, or linking to a
    host that cannot exist."""
    if post.get("provenance") == SAMPLE_PROVENANCE:
        return True
    url = post.get("url")
    return isinstance(url, str) and is_reserved_host(_host(url))


def is_modeled_observation(obs: Mapping[str, Any]) -> bool:
    """A snow cover row derived from a sensor curve rather than from a scene."""
    meta = obs.get("meta") or {}
    return obs.get("provenance") == MODELED_PROVENANCE or meta.get("modeled") is True
