import logging
import os
import time
from datetime import UTC, datetime
from pathlib import Path

import pytest

import ingest.http as http
from ingest.http import FetchError
from ingest.official import nps_alerts
from ingest.official.client import AGENT, Client, allowed

NPS_ROBOTS = """User-agent: *
Disallow: /ns/
Disallow: /search/
Disallow: /loader.cfm
Disallow: /*loader.cfm*
User-agent: bingbot
Crawl-delay: 5

Sitemap: https://www.nps.gov/sitemap.xml
"""


def test_robots_rules_for_everyone_apply_to_us() -> None:
    assert allowed(NPS_ROBOTS, AGENT, "/seki/planyourvisit/trailcond.htm")
    assert not allowed(NPS_ROBOTS, AGENT, "/search/?q=tioga")
    assert not allowed(NPS_ROBOTS, AGENT, "/ns/anything")
    assert not allowed(NPS_ROBOTS, AGENT, "/common/loader.cfm?page=1")


def test_robots_longest_rule_wins_and_allow_wins_a_tie() -> None:
    text = "User-agent: *\nDisallow: /node\nAllow: /node/public\nDisallow: /core/\nAllow: /core/"
    assert not allowed(text, AGENT, "/node/12")
    assert allowed(text, AGENT, "/node/public/page")
    assert allowed(text, AGENT, "/core/x.css")


def test_robots_group_naming_us_replaces_the_group_for_everyone() -> None:
    text = (
        "User-agent: *\nDisallow:\n\n"
        "User-agent: Sierra-Pass-Report\nUser-agent: otherbot\nDisallow: /r05/\n"
    )
    assert not allowed(text, AGENT, "/r05/inyo/conditions")
    assert allowed(text, AGENT, "/r06/mbs/conditions")
    assert allowed(text, "somebody-else/2.0", "/r05/inyo/conditions")


def test_robots_end_anchor_wildcards_comments_and_empty_files() -> None:
    text = "# keep out\nUser-agent: *   # everyone\nDisallow: /*.pdf$\nDisallow: /private*/x\n"
    assert not allowed(text, AGENT, "/maps/trail.pdf")
    assert allowed(text, AGENT, "/maps/trail.pdf.html")
    assert not allowed(text, AGENT, "/private-files/x")
    assert allowed("", AGENT, "/anything")
    assert allowed("User-agent: *\nDisallow:\n", AGENT, "/anything")
    assert not allowed("User-agent: *\nDisallow: /\n", AGENT, "/anything")


class Web:
    """A pretend internet: url -> body, or an exception to raise."""

    def __init__(self, pages: dict[str, object]) -> None:
        self.pages = pages
        self.calls: list[str] = []
        self.slept: list[float] = []
        self.clock = 1000.0

    def fetch(
        self, url: str, params: dict[str, str] | None = None, timeout: float = 30,
        cache: bool = True,
    ) -> tuple[str, bool]:
        self.calls.append(url)
        self.clock += 0.25
        found = self.pages.get(url, FetchError(f"404 Client Error: Not Found for url: {url}"))
        if isinstance(found, Exception):
            raise found
        assert isinstance(found, str)
        return found, False

    def sleep(self, seconds: float) -> None:
        self.slept.append(round(seconds, 2))
        self.clock += seconds

    def client(self, record: object = None) -> Client:
        return Client(
            record=record,  # type: ignore[arg-type]
            fetch=self.fetch, sleep=self.sleep, clock=lambda: self.clock,
            now=lambda: datetime(2026, 9, 29, 21, 30, tzinfo=UTC),
        )


def test_a_page_is_fetched_once_a_run_and_handed_to_the_recorder() -> None:
    web = Web({
        "https://www.nps.gov/robots.txt": NPS_ROBOTS,
        "https://www.nps.gov/seki/planyourvisit/trailcond.htm": "<h1>Trail Conditions</h1>",
    })
    kept: list[tuple[str, str, str]] = []
    client = web.client(lambda source, url, payload: kept.append((source, url, payload)))
    url = "https://www.nps.gov/seki/planyourvisit/trailcond.htm"
    first = client.get("nps-seki-trails", url)
    again = client.get("nps-seki-trails", url)
    assert first is not None and first is again
    assert first.text == "<h1>Trail Conditions</h1>"
    assert first.fetched_at == datetime(2026, 9, 29, 21, 30, tzinfo=UTC)
    assert web.calls == ["https://www.nps.gov/robots.txt", url]
    assert kept == [("nps-seki-trails", url, "<h1>Trail Conditions</h1>")]


def test_requests_to_one_host_are_spaced_and_other_hosts_do_not_wait() -> None:
    web = Web({
        "https://www.nps.gov/robots.txt": NPS_ROBOTS,
        "https://www.nps.gov/a.htm": "a",
        "https://www.nps.gov/b.htm": "b",
        "https://roads.dot.ca.gov/roadscell.php": "c",
    })
    client = web.client()
    client.get("x", "https://www.nps.gov/a.htm")
    client.get("x", "https://www.nps.gov/b.htm")
    client.get("x", "https://roads.dot.ca.gov/roadscell.php", {"roadnumber": "4"})
    # robots.txt, then two pages on nps.gov; robots.txt, then one page at Caltrans.
    assert web.slept == [3.0, 3.0, 3.0]


def test_a_disallowed_path_is_never_requested(caplog: pytest.LogCaptureFixture) -> None:
    web = Web({"https://www.nps.gov/robots.txt": NPS_ROBOTS})
    with caplog.at_level(logging.WARNING):
        assert web.client().get("x", "https://www.nps.gov/search/", {"q": "tioga"}) is None
    assert web.calls == ["https://www.nps.gov/robots.txt"]
    assert "robots.txt" in caplog.text


def test_a_host_with_no_robots_file_has_no_rules() -> None:
    web = Web({"https://roads.dot.ca.gov/roadscell.php": "ok"})
    got = web.client().get("x", "https://roads.dot.ca.gov/roadscell.php")
    assert got is not None and got.text == "ok"


def test_a_host_whose_robots_file_cannot_be_reached_is_left_alone() -> None:
    web = Web({
        "https://www.nps.gov/robots.txt": FetchError("503 Server Error: Unavailable"),
        "https://www.nps.gov/a.htm": "a",
    })
    client = web.client()
    assert client.get("x", "https://www.nps.gov/a.htm") is None
    assert client.get("x", "https://www.nps.gov/b.htm") is None
    assert web.calls == ["https://www.nps.gov/robots.txt"]


def test_a_failed_page_is_quiet_and_is_not_tried_twice() -> None:
    web = Web({"https://www.nps.gov/robots.txt": NPS_ROBOTS})
    client = web.client()
    assert client.get("x", "https://www.nps.gov/gone.htm") is None
    assert client.get("x", "https://www.nps.gov/gone.htm") is None
    assert web.calls.count("https://www.nps.gov/gone.htm") == 1


def test_a_copy_served_from_the_cache_keeps_the_time_it_was_really_fetched(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(http, "CACHE_DIR", tmp_path)
    url = "https://www.nps.gov/a.htm"
    body = tmp_path / f"{http._cache_key(url, None)}.body"
    body.write_text("yesterday's copy")
    fetched = datetime(2026, 9, 28, 14, 5, tzinfo=UTC).timestamp()
    os.utime(body, (fetched, fetched))

    web = Web({"https://www.nps.gov/robots.txt": NPS_ROBOTS})
    web.fetch = lambda url, params=None, timeout=30, cache=True: (  # type: ignore[method-assign]
        (NPS_ROBOTS, False) if url.endswith("robots.txt") else ("yesterday's copy", True)
    )
    got = web.client().get("x", url)
    assert got is not None
    assert got.fetched_at == datetime(2026, 9, 28, 14, 5, tzinfo=UTC)


def test_the_key_never_reaches_the_log_or_the_store(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    monkeypatch.setenv("NPS_API_KEY", "s3cr3t-key")
    kept: list[tuple[str, str, str]] = []
    web = Web({
        "https://developer.nps.gov/api/v1/alerts": FetchError(
            "403 Client Error: Forbidden for url: "
            "https://developer.nps.gov/api/v1/alerts?api_key=s3cr3t-key"
        ),
    })
    with caplog.at_level(logging.INFO):
        client = web.client(lambda *row: kept.append(row))  # type: ignore[arg-type]
        assert nps_alerts.fetch(client) == {"nps-alerts": None}
    assert "s3cr3t-key" not in caplog.text
    assert "[redacted]" in caplog.text

    web.pages["https://developer.nps.gov/api/v1/alerts"] = '{"data": []}'
    again = web.client(lambda *row: kept.append(row))  # type: ignore[arg-type]
    assert nps_alerts.fetch(again) == {"nps-alerts": []}
    assert kept == [("nps-alerts", "https://developer.nps.gov/api/v1/alerts", '{"data": []}')]


def test_without_a_key_the_alerts_are_skipped_with_one_line(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    monkeypatch.delenv("NPS_API_KEY", raising=False)
    web = Web({})
    with caplog.at_level(logging.INFO):
        assert nps_alerts.fetch(web.client()) == {"nps-alerts": None}
    assert web.calls == []
    assert caplog.text.count("NPS_API_KEY") == 1


def test_real_sleep_and_clock_are_the_defaults() -> None:
    client = Client()
    assert client._sleep is time.sleep and client._clock is time.monotonic
