import json
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any

import pytest

import ingest.official.runner as runner
from fusion.official import load_official
from ingest.http import FetchError
from ingest.official import caltrans_roads, nps_dated, nps_roads
from ingest.official.client import Client
from store import Store

FIXTURES = Path(__file__).parent / "fixtures" / "official"
TODAY = date(2026, 9, 29)
NOW = datetime(2026, 9, 29, 21, 30, tzinfo=UTC)

GRANITE = {"slug": "granite", "name": "Granite Pass", "lat": 36.886, "lon": -118.603,
           "tier": "featured", "aliases": ["granite", "granite pass"]}
EBBETTS = {"slug": "ebbetts", "name": "Ebbetts Pass", "lat": 38.544, "lon": -119.812,
           "tier": "featured", "aliases": ["ebbetts"]}
GLEN = {"slug": "glen", "name": "Glen Pass", "lat": 36.7854, "lon": -118.4166,
        "tier": "featured", "aliases": ["glen", "glen pass"]}

SEKI_URL = nps_dated.PAGES["nps-seki-trails"].url
PAGES: dict[str, object] = {
    "https://www.nps.gov/robots.txt": "User-agent: *\nDisallow: /search/\n",
    SEKI_URL: (FIXTURES / "nps_seki_trailcond.html").read_text(),
    caltrans_roads.URL: (FIXTURES / "caltrans_roads_4_88_89_108.html").read_text(),
    nps_roads.PAGES["nps-yose-roads"].url: "<h1>Current Conditions</h1><p>Moved.</p>",
}


def _client(pages: dict[str, object], record: Any = None) -> Client:
    def fetch(
        url: str, params: dict[str, str] | None = None, timeout: float = 30,
        cache: bool = True,
    ) -> tuple[str, bool]:
        found = pages.get(url, FetchError(f"404 Client Error: Not Found for url: {url}"))
        if isinstance(found, Exception):
            raise found
        assert isinstance(found, str)
        return found, False

    return Client(record=record, fetch=fetch, sleep=lambda s: None, now=lambda: NOW)


@pytest.fixture(autouse=True)
def _offline(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("NPS_API_KEY", raising=False)
    monkeypatch.setattr(runner, "load_passes", lambda: [GRANITE, EBBETTS, GLEN])
    monkeypatch.setattr(runner, "make_client", lambda record: _client(PAGES, record))


def test_run_writes_reports_by_pass_and_says_how_each_source_fared(tmp_path: Path) -> None:
    out = tmp_path / "official" / "passes.json"
    doc = runner.run(today=TODAY, out_path=out, db_path=tmp_path / "absent.sqlite")
    assert json.loads(out.read_text()) == doc
    assert doc["issued_for"] == "2026-09-29"
    assert doc["sources"] == {
        "nps-seki-trails": "ok",
        "nps-noca-trails": "unavailable",
        "nps-mora-trails": "unavailable",
        "nps-olym-trails": "unavailable",
        "nps-yose-wilderness": "unavailable",
        "nps-yose-roads": "empty",
        "nps-mora-roads": "unavailable",
        "nps-crla-roads": "unavailable",
        "caltrans-highways": "ok",
        "nps-alerts": "unavailable",
    }
    assert doc["counts"]["nps-seki-trails"] == {"reports": 110, "current": 6}
    assert doc["counts"]["caltrans-highways"] == {"reports": 9, "current": 9}
    assert sorted(doc["passes"]) == ["ebbetts", "granite"]
    (granite,) = doc["passes"]["granite"]["reports"]
    assert granite["place"] == "Copper Creek and Granite Pass"
    assert granite["unit"] == "Sequoia and Kings Canyon National Parks"
    assert "bounds" not in granite and "source" not in granite
    assert not (tmp_path / "absent.sqlite").exists()  # a missing store is never created


def test_the_file_run_writes_is_the_file_the_export_reads(tmp_path: Path) -> None:
    out = tmp_path / "passes.json"
    runner.run(today=TODAY, out_path=out, db_path=tmp_path / "absent.sqlite")
    loaded = load_official("2026-09-30", out)
    assert sorted(loaded) == ["ebbetts", "granite"]
    assert loaded["granite"]["issued_for"] == "2026-09-29"
    assert loaded["granite"]["reports"][0]["date"] == "2026-09-21"
    # Twenty two days after the report, the same file shows nothing for it.
    out.write_text(out.read_text().replace('"issued_for":"2026-09-29"',
                                           '"issued_for":"2026-10-13"'))
    assert "granite" not in load_official("2026-10-13", out)


def test_one_source_breaking_costs_only_itself(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    def broken(client: Client) -> dict[str, Any]:
        raise RuntimeError("parser met a shape it never saw")

    monkeypatch.setitem(runner.FAMILIES, "caltrans", (("caltrans-highways",), broken))
    doc = runner.run(today=TODAY, out_path=tmp_path / "p.json", db_path=tmp_path / "no.sqlite")
    assert doc["sources"]["caltrans-highways"] == "failed"
    assert doc["sources"]["nps-seki-trails"] == "ok"
    assert sorted(doc["passes"]) == ["granite"]


def test_with_every_source_down_nothing_is_written(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    monkeypatch.setattr(runner, "make_client", lambda record: _client({}, record))
    out = tmp_path / "official" / "passes.json"
    with pytest.raises(runner.NothingFetched):
        runner.run(today=TODAY, out_path=out, db_path=tmp_path / "absent.sqlite")
    assert not out.exists()


def test_every_payload_is_kept_as_fetched_when_there_is_a_store(tmp_path: Path) -> None:
    db = tmp_path / "sierra.sqlite"
    Store(db).close()
    runner.run(today=TODAY, out_path=tmp_path / "p.json", db_path=db)
    store = Store(db)
    try:
        rows = store.conn.execute(
            "SELECT source, url, payload FROM raw_fetches ORDER BY source"
        ).fetchall()
    finally:
        store.close()
    kept = {row[0]: (row[1], row[2]) for row in rows}
    assert sorted(kept) == ["caltrans-highways", "nps-seki-trails", "nps-yose-roads"]
    assert kept["nps-seki-trails"] == (SEKI_URL, PAGES[SEKI_URL])
    assert kept["caltrans-highways"][0] == caltrans_roads.URL
