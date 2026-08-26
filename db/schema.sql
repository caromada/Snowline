-- Sierra Pass Report, production schema (Postgres + PostGIS).
-- The local pipeline runs the identical logical schema on SQLite
-- (store/sqlite_store.py) with geometry held as GeoJSON text.
-- Every parsed row carries provenance back to a raw fetch, so the whole
-- pipeline is reprocessable from raw_fetches alone.

CREATE EXTENSION IF NOT EXISTS postgis;

-- Raw payloads exactly as fetched, before any parsing.
CREATE TABLE raw_fetches (
    id          BIGSERIAL PRIMARY KEY,
    source      TEXT        NOT NULL,           -- snotel | usgs | satellite | forum:<site>
    url         TEXT        NOT NULL,
    fetched_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    payload     TEXT        NOT NULL
);

-- Typed observations parsed from raw fetches.
CREATE TABLE observations (
    id            BIGSERIAL PRIMARY KEY,
    pass_slug     TEXT      NOT NULL,
    stream        TEXT      NOT NULL,           -- snotel | usgs | satellite | report
    metric        TEXT      NOT NULL,           -- swe_in | snow_depth_in | discharge_cfs |
                                                -- diurnal_swing_pct | snow_cover_frac | report
    observed_date DATE      NOT NULL,
    value         DOUBLE PRECISION,
    unit          TEXT,
    geom          geometry(Point, 4326),
    raw_fetch_id  BIGINT REFERENCES raw_fetches(id),
    provenance    TEXT      NOT NULL,           -- station triplet, site no, tile id, post url
    meta          JSONB     NOT NULL DEFAULT '{}'
);
CREATE INDEX observations_pass_date ON observations (pass_slug, observed_date);
CREATE INDEX observations_stream ON observations (stream);

-- LLM extractions over forum posts, cached by content hash so no post is
-- ever paid for twice.
CREATE TABLE extractions (
    post_hash   TEXT PRIMARY KEY,               -- sha256 of post text
    post_meta   JSONB NOT NULL,                 -- url, author, posted_date, source
    extraction  JSONB NOT NULL,                 -- the null-heavy structured record
    model       TEXT  NOT NULL,
    tokens_in   INTEGER NOT NULL DEFAULT 0,
    tokens_out  INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Fused status per pass per evaluation date.
CREATE TABLE fused_status (
    pass_slug  TEXT NOT NULL,
    eval_date  DATE NOT NULL,
    result     JSONB NOT NULL,                  -- status, confidence, conflicts, ledger refs
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (pass_slug, eval_date)
);
