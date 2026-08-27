"""SQLite implementation of the raw-first store.

Mirrors db/schema.sql logically: raw payloads land before parsing, every
observation points back to its raw fetch, geometry rides as GeoJSON text.
"""

from __future__ import annotations

import json
import sqlite3
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

_SCHEMA = """
CREATE TABLE IF NOT EXISTS raw_fetches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    url TEXT NOT NULL,
    fetched_at TEXT NOT NULL,
    payload TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS observations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pass_slug TEXT NOT NULL,
    stream TEXT NOT NULL,
    metric TEXT NOT NULL,
    observed_date TEXT NOT NULL,
    value REAL,
    unit TEXT,
    geom TEXT,
    raw_fetch_id INTEGER REFERENCES raw_fetches(id),
    provenance TEXT NOT NULL,
    meta TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS observations_pass_date
    ON observations (pass_slug, observed_date);
CREATE TABLE IF NOT EXISTS extractions (
    post_hash TEXT PRIMARY KEY,
    post_meta TEXT NOT NULL,
    extraction TEXT NOT NULL,
    model TEXT NOT NULL,
    tokens_in INTEGER NOT NULL DEFAULT 0,
    tokens_out INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS fused_status (
    pass_slug TEXT NOT NULL,
    eval_date TEXT NOT NULL,
    result TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (pass_slug, eval_date)
);
"""


def _now() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


class Store:
    def __init__(self, path: Path | str) -> None:
        if str(path) != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(str(path))
        self.conn.row_factory = sqlite3.Row
        self.conn.executescript(_SCHEMA)

    def close(self) -> None:
        self.conn.close()

    # -- raw-first ---------------------------------------------------------
    def record_raw(self, source: str, url: str, payload: str) -> int:
        cur = self.conn.execute(
            "INSERT INTO raw_fetches (source, url, fetched_at, payload) VALUES (?,?,?,?)",
            (source, url, _now(), payload),
        )
        self.conn.commit()
        return int(cur.lastrowid or 0)

    # -- observations ------------------------------------------------------
    def add_observation(
        self,
        pass_slug: str,
        stream: str,
        metric: str,
        observed_date: str,
        value: float | None,
        unit: str | None,
        provenance: str,
        raw_fetch_id: int | None = None,
        geom: dict[str, Any] | None = None,
        meta: dict[str, Any] | None = None,
    ) -> int:
        cur = self.conn.execute(
            "INSERT INTO observations "
            "(pass_slug, stream, metric, observed_date, value, unit, geom, raw_fetch_id,"
            " provenance, meta) VALUES (?,?,?,?,?,?,?,?,?,?)",
            (
                pass_slug,
                stream,
                metric,
                observed_date,
                value,
                unit,
                json.dumps(geom) if geom else None,
                raw_fetch_id,
                provenance,
                json.dumps(meta or {}),
            ),
        )
        self.conn.commit()
        return int(cur.lastrowid or 0)

    def observations(
        self,
        pass_slug: str | None = None,
        stream: str | None = None,
        start: str | None = None,
        end: str | None = None,
    ) -> list[dict[str, Any]]:
        query = "SELECT * FROM observations WHERE 1=1"
        args: list[Any] = []
        for clause, val in (
            (" AND pass_slug=?", pass_slug),
            (" AND stream=?", stream),
            (" AND observed_date>=?", start),
            (" AND observed_date<=?", end),
        ):
            if val is not None:
                query += clause
                args.append(val)
        query += " ORDER BY observed_date"
        rows = self.conn.execute(query, args).fetchall()
        out = []
        for r in rows:
            d = dict(r)
            d["meta"] = json.loads(d["meta"])
            d["geom"] = json.loads(d["geom"]) if d["geom"] else None
            out.append(d)
        return out

    def clear_observations(self, stream: str) -> None:
        self.conn.execute("DELETE FROM observations WHERE stream=?", (stream,))
        self.conn.commit()

    def delete_observations(self, stream: str, start: str, end: str) -> int:
        """Remove a stream's rows in a date window so re-ingest is idempotent."""
        cur = self.conn.execute(
            "DELETE FROM observations WHERE stream=? AND observed_date>=? AND observed_date<=?",
            (stream, start, end),
        )
        self.conn.commit()
        return cur.rowcount

    # -- extractions -------------------------------------------------------
    def put_extraction(
        self,
        post_hash: str,
        post_meta: dict[str, Any],
        extraction: dict[str, Any],
        model: str,
        tokens_in: int = 0,
        tokens_out: int = 0,
    ) -> None:
        self.conn.execute(
            "INSERT OR REPLACE INTO extractions "
            "(post_hash, post_meta, extraction, model, tokens_in, tokens_out, created_at) "
            "VALUES (?,?,?,?,?,?,?)",
            (
                post_hash,
                json.dumps(post_meta),
                json.dumps(extraction),
                model,
                tokens_in,
                tokens_out,
                _now(),
            ),
        )
        self.conn.commit()

    def get_extraction(self, post_hash: str) -> dict[str, Any] | None:
        row = self.conn.execute(
            "SELECT * FROM extractions WHERE post_hash=?", (post_hash,)
        ).fetchone()
        if not row:
            return None
        d = dict(row)
        d["post_meta"] = json.loads(d["post_meta"])
        d["extraction"] = json.loads(d["extraction"])
        return d

    def dump_extractions(self, path: Path) -> int:
        """Write the extraction cache to JSONL so it survives without the DB.

        The SQLite file is reproducible from live APIs and stays out of git;
        the paid-for LLM extractions are the one thing worth committing.
        """
        rows = self.conn.execute("SELECT * FROM extractions ORDER BY post_hash").fetchall()
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("w") as f:
            for r in rows:
                f.write(json.dumps(dict(r)) + "\n")
        return len(rows)

    def load_extractions(self, path: Path) -> int:
        """Hydrate the extraction cache from the committed JSONL."""
        if not path.exists():
            return 0
        count = 0
        for line in path.read_text().splitlines():
            if not line.strip():
                continue
            d = json.loads(line)
            self.conn.execute(
                "INSERT OR IGNORE INTO extractions "
                "(post_hash, post_meta, extraction, model, tokens_in, tokens_out, created_at) "
                "VALUES (?,?,?,?,?,?,?)",
                (
                    d["post_hash"],
                    d["post_meta"],
                    d["extraction"],
                    d["model"],
                    d["tokens_in"],
                    d["tokens_out"],
                    d["created_at"],
                ),
            )
            count += 1
        self.conn.commit()
        return count

    # -- fused -------------------------------------------------------------
    def put_fused(self, pass_slug: str, eval_date: str, result: dict[str, Any]) -> None:
        self.conn.execute(
            "INSERT OR REPLACE INTO fused_status (pass_slug, eval_date, result, created_at) "
            "VALUES (?,?,?,?)",
            (pass_slug, eval_date, json.dumps(result), _now()),
        )
        self.conn.commit()

    def get_fused(self, pass_slug: str, eval_date: str) -> dict[str, Any] | None:
        row = self.conn.execute(
            "SELECT result FROM fused_status WHERE pass_slug=? AND eval_date=?",
            (pass_slug, eval_date),
        ).fetchone()
        return json.loads(row["result"]) if row else None
