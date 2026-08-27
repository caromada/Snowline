"""Orchestrate: observations + cached extractions -> fused JSON for the web app.

Writes:
- web/public/data/passes.json    gazetteer + status per pass per demo week
- web/public/data/pass/<slug>.json  full evidence ledger and curves per pass

Demo weeks walk the 2023 melt season; the final eval date is today, fed by
the trailing-week ingest.
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime
from typing import Any

from config import DB_PATH, EXTRACTIONS_CACHE, WEB_DATA_DIR
from extraction.extractor import post_hash
from extraction.resolve import resolve_post
from fusion import fuse
from gazetteer import load_passes
from ingest.forums import load_corpus
from store import Store

log = logging.getLogger(__name__)

FIRST_SEASON_YEAR = 2023
SEASON_CHECKPOINTS = ["05-01", "05-15", "06-01", "06-15", "07-01", "07-15", "08-01"]


def eval_dates(today: str) -> list[str]:
    """Scrubber checkpoints: every melt season from 2023 on, plus today."""
    dates = [
        f"{year}-{ck}"
        for year in range(FIRST_SEASON_YEAR, int(today[:4]) + 1)
        for ck in SEASON_CHECKPOINTS
        if f"{year}-{ck}" < today
    ]
    return [*dates, today]


def _reports_by_pass(store: Store) -> dict[str, list[dict[str, Any]]]:
    """Cached extractions resolved onto passes."""
    by_pass: dict[str, list[dict[str, Any]]] = {}
    for post in load_corpus():
        cached = store.get_extraction(post_hash(post["text"]))
        if cached is None:
            continue
        slug = resolve_post(cached["extraction"], post)
        if slug is None:
            log.info("post %s did not resolve to a pass", post["id"])
            continue
        by_pass.setdefault(slug, []).append(
            {
                "extraction": cached["extraction"],
                "post_meta": {**cached["post_meta"], "text": post["text"]},
                "model": cached["model"],
            }
        )
    return by_pass


def _curve(obs: list[dict[str, Any]], metric: str, provenance: str | None = None) -> list[dict]:
    points = [
        {"date": o["observed_date"], "value": o["value"], "provenance": o["provenance"]}
        for o in obs
        if o["metric"] == metric and (provenance is None or o["provenance"] == provenance)
    ]
    # One point per date per provenance, latest wins; then group per station
    # as [date, value] pairs thinned to every third day. Sparklines need no
    # more, and the compact form keeps 500 exports honest in size.
    seen: dict[tuple[str, str], dict] = {}
    for p in points:
        seen[(p["date"], p["provenance"])] = p
    by_prov: dict[str, list[list]] = {}
    for p in sorted(seen.values(), key=lambda p: str(p["date"])):
        by_prov.setdefault(p["provenance"], []).append(
            [p["date"], round(float(p["value"]), 1)]
        )
    return [
        {
            "provenance": prov,
            "points": [
                pt for i, pt in enumerate(pts) if i % 3 == 0 or i == len(pts) - 1
            ],
        }
        for prov, pts in by_prov.items()
    ]


def _vignette_params(result: dict[str, Any], pass_info: dict[str, Any]) -> dict[str, Any]:
    """Everything the 96x32 pixel scene needs to draw itself from data."""
    sensor = result["components"]["sensor"]
    satellite = result["components"]["satellite"]
    crossing = result["crossing"]
    cover = satellite["cover_frac"] if satellite else None
    if cover is None and sensor:
        cover = min(1.0, sensor["swe_in"] / 20.0)
    flow = crossing.get("flow_cfs")
    return {
        "snow_cover": cover if cover is not None else 0.0,
        "snowline_frac": 1.0 - (cover if cover is not None else 0.0) * 0.85,
        "creek_level": min(1.0, (flow or 0.0) / 400.0),
        "sky_fresh": (satellite["age_days"] <= 4) if satellite else False,
        "status": result["status"],
        "elevation_ft": pass_info["elevation_ft"],
    }


def export(store: Store | None = None) -> None:
    store = store or Store(DB_PATH)
    today = datetime.now(UTC).date().isoformat()
    dates = eval_dates(today)

    # The DB is rebuilt from live APIs and never committed; the paid-for
    # extraction cache rides in git as JSONL and rehydrates here.
    loaded = store.load_extractions(EXTRACTIONS_CACHE)
    if loaded:
        log.info("hydrated %d cached extractions", loaded)

    # Modeled satellite cover is derived deterministically from the sensor
    # curves, so regenerate it wholesale each run; stale rows never linger.
    from ingest.satellite import ingest_modeled

    store.clear_observations("satellite")
    ingest_modeled(store, f"{FIRST_SEASON_YEAR}-04-01", today)

    reports_by_pass = _reports_by_pass(store)

    # Sensor rows are stored once per station; passes join to them through
    # the link tables at read time, annotated with their own distance.
    from ingest import cdec as cdec_mod
    from ingest import snotel as snotel_mod
    from ingest import usgs as usgs_mod

    links_by_stream = {
        "cdec": cdec_mod.pass_links(store),
        "snotel": snotel_mod.pass_links(store),
        "usgs": usgs_mod.pass_links(store),
    }
    station_cache: dict[str, list[dict[str, Any]]] = {}

    def station_rows(stream: str, link: dict[str, Any]) -> list[dict[str, Any]]:
        key = f"@{link['provenance']}"
        if key not in station_cache:
            station_cache[key] = store.observations(key, stream=stream)
        return [
            {**o, "meta": {**o["meta"], "distance_km": link["distance_km"]}}
            for o in station_cache[key]
        ]

    passes_out: list[dict[str, Any]] = []
    (WEB_DATA_DIR / "pass").mkdir(parents=True, exist_ok=True)

    for p in load_passes():
        slug = p["slug"]
        snow_rows = [
            o
            for stream in ("cdec", "snotel")
            for link in links_by_stream[stream].get(slug, [])
            for o in station_rows(stream, link)
        ]
        sensor_obs = [o for o in snow_rows if o["metric"] == "swe_in"]
        satellite_obs = [o for o in store.observations(slug, stream="satellite")]
        gauge_obs = [
            o
            for link in links_by_stream["usgs"].get(slug, [])
            for o in station_rows("usgs", link)
        ]
        reports = reports_by_pass.get(slug, [])

        statuses: dict[str, Any] = {}
        for d in dates:
            result = fuse(p, d, sensor_obs, satellite_obs, gauge_obs, reports)
            result["vignette"] = _vignette_params(result, p)
            # The scored per-report breakdown embeds full post texts; the
            # ledger carries those once, so strip them from every date.
            if result["components"].get("reports"):
                result["components"]["reports"] = {
                    k: v
                    for k, v in result["components"]["reports"].items()
                    if k != "reports"
                }
            store.put_fused(slug, d, result)
            statuses[d] = {
                k: result[k]
                for k in (
                    "pass_slug", "eval_date", "status", "status_label", "severity",
                    "confidence", "confidence_score", "conflicts", "facts", "vignette",
                )
            }

        ledger = _ledger(sensor_obs, satellite_obs, gauge_obs, reports)
        detail = {
            "pass": {k: p[k] for k in ("slug", "name", "elevation_ft", "lat", "lon",
                                        "creek", "aspect_note", "aliases")},
            "dates": dates,
            "statuses": statuses,
            "ledger": ledger,
            "curves": {
                "swe_in": _curve(sensor_obs, "swe_in"),
                "discharge_cfs": _curve(gauge_obs, "discharge_cfs"),
                "snow_cover_frac": _curve(satellite_obs, "snow_cover_frac"),
            },
        }
        (WEB_DATA_DIR / "pass" / f"{slug}.json").write_text(json.dumps(detail))

        passes_out.append(
            {
                **{
                    k: p[k]
                    for k in ("slug", "name", "elevation_ft", "lat", "lon", "aliases", "tier")
                },
                "statuses": {
                    d: {
                        "status": s["status"],
                        "status_label": s["status_label"],
                        "confidence": s["confidence"],
                    }
                    for d, s in statuses.items()
                },
            }
        )

    index = {"generated_at": datetime.now(UTC).isoformat(timespec="seconds"),
             "dates": dates, "passes": passes_out}
    WEB_DATA_DIR.mkdir(parents=True, exist_ok=True)
    (WEB_DATA_DIR / "passes.json").write_text(json.dumps(index))
    log.info("exported %d passes x %d dates", len(passes_out), len(dates))


def _ledger(
    sensor_obs: list[dict[str, Any]],
    satellite_obs: list[dict[str, Any]],
    gauge_obs: list[dict[str, Any]],
    reports: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """The auditable evidence column: one dated entry per source event."""
    entries: list[dict[str, Any]] = []
    for r in reports:
        ex = r["extraction"]
        meta = r["post_meta"]
        date = ex.get("date_observed") or meta.get("posted_date") or ""
        entries.append(
            {
                "date": date,
                "source": "report",
                "glyph": "boot",
                "title": meta.get("title") or "Trip report",
                "detail": {
                    "author": meta.get("author"),
                    "source": meta.get("source"),
                    "url": meta.get("url"),
                    "posted_date": meta.get("posted_date"),
                    "extraction": ex,
                    "quote": ex.get("quote_span"),
                    "text": meta.get("text"),
                    "model": r.get("model"),
                },
            }
        )
    # Sensors and satellite: weekly checkpoints rather than every day, so the
    # ledger stays a register, not a data dump.
    def _weekly(obs: list[dict[str, Any]], metric: str) -> list[dict[str, Any]]:
        rows = [o for o in obs if o["metric"] == metric]
        by_week: dict[str, dict[str, Any]] = {}
        for o in rows:
            week = f"{o['observed_date'][:7]}-w{(int(o['observed_date'][8:10]) - 1) // 14}"
            key = f"{week}:{o['provenance']}"
            prev = by_week.get(key)
            if prev is None or o["observed_date"] > prev["observed_date"]:
                by_week[key] = o
        return sorted(by_week.values(), key=lambda o: str(o["observed_date"]))

    for o in _weekly(sensor_obs, "swe_in"):
        entries.append(
            {
                "date": o["observed_date"],
                "source": "sensor",
                "glyph": "snowstake",
                "title": f"{o['meta'].get('station_name', 'Station')}: "
                f"{round(o['value'], 1)} in SWE",
                "detail": {
                    "provenance": o["provenance"],
                    "station_elevation_ft": o["meta"].get("station_elevation_ft"),
                    "distance_km": o["meta"].get("distance_km"),
                    "value": o["value"],
                    "unit": "in",
                },
            }
        )
    for o in _weekly(satellite_obs, "snow_cover_frac"):
        entries.append(
            {
                "date": o["observed_date"],
                "source": "satellite",
                "glyph": "satellite",
                "title": f"Snow cover {round(o['value'] * 100)}%"
                + (" (modeled)" if o["meta"].get("modeled") else ""),
                "detail": {"provenance": o["provenance"], **o["meta"], "value": o["value"]},
            }
        )
    for o in _weekly(gauge_obs, "discharge_cfs"):
        entries.append(
            {
                "date": o["observed_date"],
                "source": "gauge",
                "glyph": "creek",
                "title": f"{o['meta'].get('site_name', 'Gauge')}: {round(o['value'])} cfs",
                "detail": {"provenance": o["provenance"], **o["meta"], "value": o["value"]},
            }
        )
    entries.sort(key=lambda e: str(e["date"]), reverse=True)
    # Reports always ride along; sensor checkpoints cap so four seasons of
    # weekly rows don't swamp the payload.
    reports_all = [e for e in entries if e["source"] == "report"]
    sensors_capped = [e for e in entries if e["source"] != "report"][:150]
    merged = sorted(
        reports_all + sensors_capped, key=lambda e: str(e["date"]), reverse=True
    )
    return merged


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    export()
