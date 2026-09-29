import pytest

from ingest.forums import load_corpus
from ingest.samples import (
    SAMPLE_PROVENANCE,
    is_modeled_observation,
    is_reserved_host,
    is_sample_post,
)


@pytest.mark.parametrize(
    "host",
    [
        "example-forum.test",
        "forum.test",
        "TEST",
        "reports.example",
        "example.com",
        "www.example.com",
        "example.net",
        "api.example.org",
        "Example.ORG.",
        "nothing.invalid",
        "localhost",
        "app.localhost",
    ],
)
def test_reserved_hosts_are_recognised(host: str) -> None:
    assert is_reserved_host(host)


@pytest.mark.parametrize(
    "host",
    [
        "",
        "snowline.app",
        "www.reddit.com",
        "highsierratopix.com",
        # Reserved names are whole labels, not substrings.
        "contest.com",
        "latest",
        "myexample.com",
        "example.com.evil.io",
        "test.io",
    ],
)
def test_real_hosts_are_not_reserved(host: str) -> None:
    assert not is_reserved_host(host)


def test_a_post_from_the_curated_corpus_is_a_sample() -> None:
    assert is_sample_post({"provenance": SAMPLE_PROVENANCE, "url": "https://snowline.app/r/1"})


def test_a_post_on_a_reserved_host_is_a_sample_whatever_its_provenance() -> None:
    assert is_sample_post({"url": "https://example-forum.test/topix/t/48211#p1"})
    assert is_sample_post({"provenance": "app:report", "url": "https://example.com/r/1"})
    assert is_sample_post({"url": "example-forum.test/no/scheme"})
    assert is_sample_post({"url": "HTTPS://WWW.EXAMPLE.ORG:8443/r/1"})


def test_a_report_filed_in_the_app_is_not_a_sample() -> None:
    assert not is_sample_post({"provenance": "app:report", "url": "https://snowline.app/r/1"})
    # A report filed from the pass may carry no link at all.
    assert not is_sample_post({"provenance": "app:report"})
    assert not is_sample_post({"provenance": "app:report", "url": None})
    assert not is_sample_post({"provenance": "app:report", "url": ""})
    assert not is_sample_post({})


def test_every_post_in_the_shipped_corpus_is_a_sample() -> None:
    posts = load_corpus()
    assert posts
    assert all(p["provenance"] == SAMPLE_PROVENANCE for p in posts)
    assert all(is_sample_post(p) for p in posts)
    # Both halves of the rule hold on their own for the shipped corpus.
    assert all(is_sample_post({"url": p["url"]}) for p in posts)


def test_modeled_cover_is_recognised_by_provenance_or_flag() -> None:
    assert is_modeled_observation({"provenance": "satellite:modeled", "meta": {}})
    assert is_modeled_observation({"provenance": "satellite:viirs", "meta": {"modeled": True}})
    assert not is_modeled_observation({"provenance": "satellite:viirs", "meta": {}})
    assert not is_modeled_observation({"provenance": "satellite:viirs"})
