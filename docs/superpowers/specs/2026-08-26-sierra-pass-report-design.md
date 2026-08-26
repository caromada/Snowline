# Sierra Pass Report, design spec

Date: 2026-08-26. Source: Daniel's project 6 brief (the brief is the authoritative product spec; this doc records architecture and the decisions the local environment forces).

## What it is

A fusion engine answering "can I get over this Sierra pass this weekend, and do I need an ice axe?" Four evidence streams (SNOTEL telemetry, USGS stream gauges, satellite fractional snow cover, LLM-extracted forum trip reports) resolve into a per-pass status (open / snow with caution / traction advised / not recommended) plus an honest confidence grade. Every sentence in the UI traces to its source. Demo runs on 2023 to 2026 historical data because late August is minimum snow; 2023 (monster snow year) is the showcase season.

## Two-tier capability model (requested mid-design)

- Tier 1, no API key: the full product works. Fusion, map, vignettes, evidence ledger, confidence, all driven by sensor data plus LLM extractions that ship precomputed in the repo (cached by post content hash, so they are data, not calls).
- Tier 2, bring your own key: unlocks live-LLM features. (a) Paste-a-report: paste any trip report text, watch it extracted into structured evidence and fused into the selected pass live. (b) Re-extraction of new forum posts. (c) "Ask this pass" natural-language Q&A grounded only in the evidence ledger. Key comes from `ANTHROPIC_API_KEY` env on the pipeline side, or a UI field stored in localStorage only on the web side (direct browser calls with the `anthropic-dangerous-direct-browser-access` header; the key never leaves the visitor's browser except to Anthropic).

## Environment-forced decisions

1. **No Postgres installed locally.** Production DDL (`db/schema.sql`) targets Postgres + PostGIS with provenance on every row, as the brief specifies. The local pipeline runs the identical logical schema on SQLite (geometry as GeoJSON text, point-in-polygon in pure Python). A thin store interface keeps the swap honest.
2. **No `ANTHROPIC_API_KEY` in local env.** The extractor module is written per the global LLM conventions (haiku default via one config constant, structured output with schema validation, retry once then escalate that call to sonnet, batch API for bulk, content-hash cache, `LLM_BUDGET_USD` ceiling, tokens logged). For this build, extraction runs through a Claude Code CLI shim (`--engine cli`) writing into the same cache; the cached results ship with the repo (Tier 1).
3. **Forum scraping.** Scraper modules for High Sierra Topix / PCTA water report / Reddit are real code with raw-first storage, timeouts, retry, cached fallback. The demo corpus is a curated set of ~40 realistic trip-report posts (clearly marked provenance `corpus:curated`), because live-scraping years-old forum threads in one session is not reproducible or polite. 30 of them are hand-labeled as the held-out eval set; extraction accuracy is published in the README.
4. **Satellite.** NSIDC/Earthdata needs an auth token. The sampling module (pass polygon, NDSI threshold, cloud mask handling) is real and unit-tested; demo satellite observations are derived per pass from the 2023 SNOTEL melt curve plus elevation lapse, marked provenance `satellite:modeled` and rendered honestly in the UI as modeled cover, with cloud-gap days included so the confidence logic has real gaps to chew on.

## Architecture

```
gazetteer/passes.json        15 passes: polygon, aliases, elevation, linked SNOTEL triplets + USGS sites
ingest/   snotel.py usgs.py satellite.py forums.py   each: fetch -> raw table -> parse -> observations
extraction/ schema.py extractor.py resolve.py        LLM extraction + entity resolution vs gazetteer
fusion/   fusion.py                                  pure logic, no I/O: evidence -> status + confidence
store/    sqlite_store.py  db/schema.sql             raw-first, provenance on every row
eval/     labeled.jsonl run_eval.py                  30 held-out posts, published accuracy
pipeline.py                                          orchestrates ingest -> extract -> fuse -> export JSON
web/      Next.js + MapLibre                         reads exported per-pass JSON; MapLibre + AWS terrain tiles (keyless)
.github/workflows/ingest.yml                         daily cron
```

Data contract between pipeline and web: `web/public/data/passes.json` (gazetteer + latest status per pass) and `web/public/data/pass/<slug>.json` (fused status, confidence breakdown, evidence ledger entries each carrying source type, date, quote span or sensor values, and the raw curve for expansion).

## Fusion logic (the core)

Per pass, per evaluation date: collect evidence items, each `(stream, observed_date, signal, weight_basis)`.
- Stream reliability priors: sensor 0.9, satellite 0.65 (cover not condition), human 0.75 pre-calibration.
- Recency decay: half-life 5 days for human reports, 3 days for satellite, none for same-day sensor.
- Reporter calibration: infer experience register (pct-hiker / experienced / first-timer) from language during extraction; adjective severity is remapped per register before scoring (the README section).
- Score -> status thresholds; confidence grade (high/moderate/low) from evidence density, stream agreement, and staleness. Disagreement between streams is surfaced as explicit conflict strings, never averaged away.
- Pure Python, zero I/O, unit tested with synthetic evidence sets including conflict cases.

## Design system (from the brief, followed exactly)

7-value forest palette (#0F1A14 deep pine ground, #1C2B21 moss panels, #4E7A5A fern, #8FAE8B sage, #B9BEB3 granite, #5B8FB9 snowmelt, #E8A87C alpenglow as the ONLY warm accent). Space Grotesk caps for pass names, Source Serif for panel prose, JetBrains Mono for IDs/elevations/timestamps. All tokens in one theme file. Pixel layer: 16x16 source/condition glyphs, 96x32 data-generated pass vignette (snowline at reported elevation, creek from gauge, sky from satellite recency), pixel campfire loader, drawn on canvas from palette-indexed arrays, whole-pixel motion only. Motion: panel 200ms, vignette assembles 350ms, ledger expand 150ms, contour ring 600ms, glyph bounce 80ms, two clouds at 4px/min, all gated by prefers-reduced-motion. No traffic-light red anywhere.

## Testing

- `pytest`: fusion (synthetic evidence incl. conflicts and empty sets), gazetteer resolution (alias and fuzzy cases), extraction schema validation, satellite sampling geometry, store round-trip.
- Eval: `eval/run_eval.py` scores extractor output against 30 hand labels, field-level accuracy, one honest number in the README.
- `ruff` clean, type hints throughout; web is TypeScript strict.

## Build order

1. Repo scaffold, theme/config constants, gazetteer with polygons + aliases
2. Store layer + Postgres DDL + SQLite impl, SNOTEL + USGS ingest against live APIs (2023 season backfill)
3. Satellite sampling module + modeled demo observations
4. Extraction schema, extractor (API + CLI shim), entity resolution, corpus, eval
5. Fusion module + tests, pipeline export
6. Next.js + MapLibre frontend, pixel layer, panels, BYOK features, design pass
7. README (GIF, what it does, architecture, what was hard, setup last), GitHub Actions cron
