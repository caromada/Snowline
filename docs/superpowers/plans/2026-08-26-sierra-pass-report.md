# Sierra Pass Report Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Executed inline in the originating session (autonomous run).

**Goal:** Fuse SNOTEL, USGS gauges, satellite snow cover, and LLM-extracted trip reports into a per-pass Sierra conditions map with honest confidence, shipped as a public repo that fully works without an API key and unlocks live-LLM features with one.

**Architecture:** Python pipeline (ingest raw-first into SQLite, extract with Claude, fuse in a pure module, export JSON) + Next.js/MapLibre frontend reading the exported JSON. Postgres+PostGIS DDL ships for production; SQLite runs locally. Precomputed extractions ship in-repo (Tier 1); BYOK unlocks paste-a-report, re-extraction, and grounded Q&A (Tier 2).

**Tech Stack:** Python 3.12 (stdlib + requests, pytest, ruff), SQLite, Next.js 14 + TypeScript strict + MapLibre GL, canvas pixel layer, GitHub Actions cron.

---

## File structure

```
config.py                       model names, budgets, paths (single source of truth)
gazetteer/passes.json           15 passes: slug, name, aliases, elevation_ft, polygon, snotel triplets, usgs sites
gazetteer/__init__.py           load + alias/fuzzy resolution
store/__init__.py  store/sqlite_store.py    raw-first store, provenance columns
db/schema.sql                   Postgres + PostGIS production DDL
ingest/http.py                  fetch with timeout, one retry+backoff, cached fallback
ingest/snotel.py                AWDB REST daily SWE/depth
ingest/usgs.py                  NWIS IV discharge + diurnal swing
ingest/satellite.py             polygon sampling, NDSI/cloud logic + modeled demo generator
ingest/forums.py                scrapers (topix/pcta/reddit) + curated corpus loader
extraction/schema.py            null-heavy JSON schema + validation
extraction/extractor.py         API engine (haiku, structured output, retry->sonnet, batch, budget) + CLI shim engine, hash cache
extraction/resolve.py           entity resolution against gazetteer
extraction/calibrate.py         reporter register inference -> adjective remapping
fusion/fusion.py                pure: evidence -> status + confidence + conflicts
pipeline.py                     orchestrate; writes web/public/data/*.json
eval/labeled.jsonl  eval/run_eval.py         30 hand labels, field accuracy
tests/test_*.py                 fusion, gazetteer, schema, satellite, store, calibrate
web/                            Next.js app (theme.ts tokens, map, panel, pixel layer, BYOK)
.github/workflows/ingest.yml    daily cron
README.md  LICENSE  .env.example
```

## Tasks

### Task 1: Scaffold + config + gazetteer
- [x] pyproject.toml with ruff config; config.py (EXTRACTION_MODEL="claude-haiku-4-5", ESCALATION_MODEL="claude-sonnet-5", LLM_BUDGET_USD env, paths)
- [x] gazetteer/passes.json: 15 passes (Kearsarge, Bishop, Piute, Mono, Duck, Taboose, Sawmill, Baxter, Shepherd, Glen, Muir, Mather, Pinchot, Forester, Donohue) with real coords/elevations, small polygons, aliases
- [x] tests/test_gazetteer.py: resolve "Glen", "the pass after Rae Lakes" alias table, fuzzy "Kersarge"; run pytest; commit

### Task 2: Store + DDL
- [x] db/schema.sql (Postgres+PostGIS: raw_fetches, observations with geometry+provenance, extractions, fused_status)
- [x] store/sqlite_store.py mirroring it (geometry as GeoJSON text); round-trip test; commit

### Task 3: Ingest sensors (live APIs, 2023 backfill)
- [x] ingest/http.py (timeout, 1 retry, cache fallback into data/cache/); test with local file:// style stub
- [x] ingest/snotel.py: AWDB REST v1 stations near crest + daily SWE/depth; store raw JSON then parse to observations
- [x] ingest/usgs.py: NWIS IV discharge for linked sites, compute diurnal swing per day; raw-first
- [x] Run real backfill for May-Jul 2023 + latest week; verify row counts; commit (data committed as demo dataset)

### Task 4: Satellite
- [x] ingest/satellite.py: point-in-polygon (pure python ray cast), NDSI>0.4 -> snow, cloud fraction handling; modeled-demo generator from SNOTEL curve + elevation lapse, provenance satellite:modeled, with cloud gaps
- [x] tests for geometry + cloud masking; commit

### Task 5: Extraction
- [x] extraction/schema.py: fields location, date_observed, snow_condition, traction_used, crossing_condition, exposure_comfort, reporter_register, quote_span, all nullable; validator
- [x] extraction/extractor.py: engine=api (per LLM conventions: one config constant, structured output, validate, retry once, escalate to sonnet + log, batch for bulk, prompt-cache marked system prompt, token log, budget abort) / engine=cli shim via `claude -p`; cache by sha256(post text)
- [x] ingest/forums.py: scraper stubs with raw-first + curated corpus (~40 posts, provenance corpus:curated)
- [x] extraction/resolve.py + extraction/calibrate.py with tests
- [x] Run extraction over corpus via CLI shim, commit cached extractions
- [x] eval/labeled.jsonl (30 posts hand-labeled) + eval/run_eval.py; run; record number; commit

### Task 6: Fusion
- [x] fusion/fusion.py pure module: reliability priors, recency half-lives, register calibration applied, status thresholds, confidence from density+agreement+staleness, explicit conflict strings
- [x] tests: synthetic sets (all-agree high conf, sensor/human conflict surfaces conflict string, sparse -> low conf, stale -> decay, empty -> unknown); commit

### Task 7: Pipeline export
- [x] pipeline.py: ingest -> extract -> fuse for each week of 2023 season + latest; writes web/public/data/passes.json + pass/<slug>.json (status, confidence breakdown, ledger with raw curves/quotes, vignette params); commit exported demo data

### Task 8: Frontend
- [x] npx create-next-app web (TS strict, app router); theme tokens in web/lib/theme.ts; fonts via next/font (Space Grotesk, Source Serif 4, JetBrains Mono)
- [x] Map: MapLibre + AWS terrain-tiles hillshade recolored to forest palette, pass markers, contour ring select (600ms draw), two drifting pixel clouds
- [x] Panel: 96x32 canvas vignette generated from data (assembles 350ms), prose summary with per-sentence source tap-through, evidence ledger with 16x16 pixel glyphs, expand 150ms, shimmer on new
- [x] Pixel layer: palette-indexed sprite arrays drawn to canvas, whole-pixel motion, campfire loader, tent saved-passes (localStorage)
- [x] Season scrubber for 2023 demo weeks; reduced-motion handling; mobile responsive
- [x] BYOK: key field (localStorage), paste-a-report live extraction, ask-this-pass grounded Q&A, direct browser calls
- [x] Build clean (`npm run build`), visual check via browser, commit

### Task 9: Ship
- [x] .github/workflows/ingest.yml daily cron; .env.example; LICENSE (MIT)
- [x] README per style rules: demo GIF placeholder + live link spot, what it does, architecture, What was hard, eval number, setup last, no em dashes
- [x] Final ruff + pytest + npm build; commit
