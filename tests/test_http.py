import threading
import time
from collections.abc import Iterator
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest
import requests

import ingest.http as http


class _Trickle(BaseHTTPRequestHandler):
    """Answers with a byte every 100ms: never idle long, never done."""

    def do_GET(self) -> None:  # noqa: N802 - http.server API
        self.send_response(200)
        self.send_header("Content-Type", "text/plain")
        self.end_headers()
        if self.path.startswith("/fast"):
            self.wfile.write(b"ok")
            return
        try:
            for _ in range(50):
                self.wfile.write(b"x")
                self.wfile.flush()
                time.sleep(0.1)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def log_message(self, *args: object) -> None:
        pass


@pytest.fixture
def server() -> Iterator[str]:
    srv = ThreadingHTTPServer(("127.0.0.1", 0), _Trickle)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{srv.server_address[1]}"
    srv.shutdown()


@pytest.fixture(autouse=True)
def _isolated(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(http, "CACHE_DIR", tmp_path)
    monkeypatch.setattr(http, "FETCH_RETRY_BACKOFF_S", 0)


def test_deadline_bounds_a_trickling_response(server: str) -> None:
    start = time.monotonic()
    with pytest.raises(requests.Timeout):
        http._get_within(f"{server}/slow", None, timeout=0.5)
    assert time.monotonic() - start < 2.0


def test_trickle_without_cache_raises_fetch_error(server: str) -> None:
    with pytest.raises(http.FetchError):
        http.fetch_text(f"{server}/slow", timeout=0.3)


def test_trickle_serves_the_last_good_copy(server: str) -> None:
    url = f"{server}/slow"
    key = http._cache_key(url, None)
    (http.CACHE_DIR / f"{key}.body").write_text("yesterday")
    assert http.fetch_text(url, timeout=0.3) == ("yesterday", True)


def test_fast_response_is_cached(server: str) -> None:
    text, cached = http.fetch_text(f"{server}/fast")
    assert (text, cached) == ("ok", False)
    assert list(http.CACHE_DIR.glob("*.body"))
