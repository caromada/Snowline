"""A polite client for agency sites, on top of ingest.http.

Four promises, kept for every source: robots.txt is read first and obeyed,
a page is requested at most once in a run, requests to one host are spaced,
and the payload goes to the raw store exactly as it arrived.

robots.txt follows RFC 9309. A host that answers 4xx for the file has no
rules (Caltrans answers 404, the NPS API gateway 403). A host whose file
cannot be reached at all is left alone for the run.
"""

from __future__ import annotations

import json
import logging
import re
import time
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from urllib.parse import urlencode, urlsplit

import ingest.http as http
from ingest.http import HEADERS, FetchError, fetch_text
from ingest.raw import Recorder
from ingest.wsdot import redact

log = logging.getLogger(__name__)

AGENT = HEADERS["User-Agent"]
DELAY_S = 3.0
TIMEOUT_S = 45
_NO_SUCH_FILE = re.compile(r"\b4\d\d Client Error")

Fetch = Callable[..., tuple[str, bool]]


@dataclass(frozen=True)
class Fetched:
    text: str
    fetched_at: datetime
    parsed: object = None


def _product(agent: str) -> str:
    return re.split(r"[/\s]", agent.strip(), maxsplit=1)[0].lower()


def _groups(text: str) -> list[tuple[list[str], list[tuple[bool, str]]]]:
    groups: list[tuple[list[str], list[tuple[bool, str]]]] = []
    naming = False
    for raw in text.splitlines():
        line = raw.split("#", 1)[0].strip()
        if ":" not in line:
            continue
        field, value = (part.strip() for part in line.split(":", 1))
        field = field.lower()
        if field == "user-agent":
            if not naming:
                groups.append(([], []))
            groups[-1][0].append(value.lower())
            naming = True
        elif field in ("allow", "disallow"):
            naming = False
            if groups and value:
                groups[-1][1].append((field == "allow", value))
        else:
            # Crawl-delay, Sitemap and the rest end the run of names too.
            naming = False
    return groups


def _matches(pattern: str, path: str) -> bool:
    anchored = pattern.endswith("$")
    body = pattern[:-1] if anchored else pattern
    regex = ".*".join(re.escape(part) for part in body.split("*"))
    return re.match(regex + ("$" if anchored else ""), path) is not None


def allowed(robots: str, agent: str, path: str) -> bool:
    """Whether robots.txt lets this agent fetch the path (query included).
    The group naming the agent is used alone; failing that, the group for
    everyone. The longest matching rule decides, and Allow wins a tie."""
    product = _product(agent)
    groups = _groups(robots)
    mine = [rules for names, rules in groups if any(n != "*" and n in product for n in names)]
    if not mine:
        mine = [rules for names, rules in groups if "*" in names]
    verdict, longest = True, -1
    for rules in mine:
        for allow, pattern in rules:
            if not _matches(pattern, path):
                continue
            if len(pattern) > longest or (len(pattern) == longest and allow):
                verdict, longest = allow, len(pattern)
    return verdict


class Client:
    def __init__(
        self,
        record: Recorder | None = None,
        fetch: Fetch = fetch_text,
        sleep: Callable[[float], None] = time.sleep,
        clock: Callable[[], float] = time.monotonic,
        now: Callable[[], datetime] = lambda: datetime.now(UTC),
        delay_s: float = DELAY_S,
    ) -> None:
        self._record = record
        self._fetch = fetch
        self._sleep = sleep
        self._clock = clock
        self._now = now
        self._delay_s = delay_s
        self._last: dict[str, float] = {}
        # None for a host's robots means the host is off limits this run.
        self._robots: dict[str, str | None] = {}
        self._seen: dict[str, Fetched | None] = {}

    def _spaced(self, host: str, url: str, params: dict[str, str] | None) -> tuple[str, bool]:
        if host in self._last:
            wait = self._delay_s - (self._clock() - self._last[host])
            if wait > 0:
                self._sleep(wait)
        try:
            return self._fetch(url, params, timeout=TIMEOUT_S, cache=True)
        finally:
            self._last[host] = self._clock()

    def _rules(self, scheme: str, host: str) -> str | None:
        if host not in self._robots:
            try:
                self._robots[host] = self._spaced(host, f"{scheme}://{host}/robots.txt", None)[0]
            except FetchError as exc:
                if _NO_SUCH_FILE.search(str(exc)):
                    self._robots[host] = ""
                else:
                    log.warning("%s: robots.txt unreachable, leaving the host alone: %s",
                                host, exc)
                    self._robots[host] = None
        return self._robots[host]

    def get(
        self, source: str, url: str, params: dict[str, str] | None = None, secret: str = ""
    ) -> Fetched | None:
        """The page, or None when it may not or could not be fetched. Never
        raises: one source failing must stay that source's own problem."""
        query = urlencode(sorted((params or {}).items()))
        key = f"{url}?{query}"
        if key in self._seen:
            return self._seen[key]
        self._seen[key] = None
        parts = urlsplit(url)
        rules = self._rules(parts.scheme, parts.netloc)
        if rules is None:
            return None
        path = (parts.path or "/") + (f"?{query}" if query else "")
        if not allowed(rules, AGENT, path):
            log.warning("%s: robots.txt disallows %s; not fetched", source, parts.path)
            return None
        try:
            text, from_cache = self._spaced(parts.netloc, url, params)
        except FetchError as exc:
            log.warning("%s unavailable: %s", source, redact(exc, secret))
            return None
        fetched_at = self._now()
        if from_cache:
            copy = http.CACHE_DIR / f"{http._cache_key(url, params)}.body"
            fetched_at = datetime.fromtimestamp(copy.stat().st_mtime, UTC)
        if self._record:
            self._record(source, url, text)
        self._seen[key] = Fetched(text, fetched_at.replace(microsecond=0))
        return self._seen[key]

    def get_json(
        self, source: str, url: str, params: dict[str, str] | None = None, secret: str = ""
    ) -> Fetched | None:
        got = self.get(source, url, params, secret)
        if got is None:
            return None
        try:
            return Fetched(got.text, got.fetched_at, json.loads(got.text))
        except ValueError as exc:
            log.warning("%s answered with something that is not JSON: %s", source, exc)
            return None
