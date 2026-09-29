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
import re
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any

from config import DB_PATH, EXTRACTIONS_CACHE, WEB_DATA_DIR
from extraction.extractor import post_hash
from extraction.resolve import resolve_post
from fusion import fuse
from fusion.official import load_official
from fusion.season import pass_season
from fusion.winter import load_winter
from gazetteer import load_passes
from gazetteer.access import link_access, load_access
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


def station_file(provenance: str) -> str:
    """Filesystem- and URL-safe name for a station's curve file."""
    return re.sub(r"[^A-Za-z0-9_-]+", "_", provenance) + ".json"


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
    forecasts = _load_forecasts(today)
    fire = _load_fire(today)
    winter = load_winter(today)
    official = load_official(today)
    access = load_access()

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
    station_curves: dict[str, dict[str, list[list]]] = {}
    for sub in ("pass", "station"):
        (WEB_DATA_DIR / sub).mkdir(parents=True, exist_ok=True)
    written: set[Path] = set()

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

        ledger = _ledger(sensor_obs, satellite_obs, gauge_obs, reports, dates)
        detail = {
            "pass": {k: p[k] for k in ("slug", "name", "elevation_ft", "lat", "lon",
                                        "creek", "aspect_note", "aliases")},
            "dates": dates,
            "statuses": statuses,
            "ledger": ledger,
            # Station curves are shared by every pass near that station, so
            # they live once under data/station/ and load on demand; only the
            # per-pass modeled satellite curve rides inline.
            "curves": {"snow_cover_frac": _curve(satellite_obs, "snow_cover_frac")},
            "forecast": forecasts.get(slug),
            "fire": fire.get(slug),
            "winter": winter.get(slug),
            "official": official.get(slug),
            "season": pass_season(p, sensor_obs, date.fromisoformat(today)),
            "access": link_access(
                p, access["trailheads"], access["campgrounds"], access["parking"]
            ),
            "stations": {
                "swe_in": sorted({o["provenance"] for o in sensor_obs}),
                "discharge_cfs": sorted(
                    {o["provenance"] for o in gauge_obs if o["metric"] == "discharge_cfs"}
                ),
            },
        }
        for metric, obs in (("swe_in", sensor_obs), ("discharge_cfs", gauge_obs)):
            for series in _curve(obs, metric):
                station_curves.setdefault(series["provenance"], {})[metric] = series["points"]
        path = WEB_DATA_DIR / "pass" / f"{slug}.json"
        path.write_text(json.dumps(detail))
        written.add(path)

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

    for prov, metrics in station_curves.items():
        path = WEB_DATA_DIR / "station" / station_file(prov)
        path.write_text(json.dumps({"provenance": prov, "curves": metrics}))
        written.add(path)

    # Passes and stations that left the gazetteer must not linger as stale files.
    for sub in ("pass", "station"):
        for stale in (WEB_DATA_DIR / sub).glob("*.json"):
            if stale not in written:
                stale.unlink()

    generated_at = datetime.now(UTC).isoformat(timespec="seconds")
    (WEB_DATA_DIR / "landing.json").write_text(
        json.dumps(
            _landing(passes_out, dates, links_by_stream, generated_at),
            separators=(",", ":"),
        )
    )

    index = {"generated_at": generated_at, "dates": dates, "passes": passes_out}
    WEB_DATA_DIR.mkdir(parents=True, exist_ok=True)
    (WEB_DATA_DIR / "passes.json").write_text(json.dumps(index))
    log.info(
        "exported %d passes x %d dates, %d station curves",
        len(passes_out),
        len(dates),
        len(station_curves),
    )


FORECAST_PATH = Path(__file__).resolve().parent / "data" / "forecast" / "passes.json"


def _load_forecasts(today: str) -> dict[str, Any]:
    """NWS forecasts from ingest.nws, only if issued today or yesterday.

    A stale forecast is worse than none, so an old or missing file means the
    panel simply shows no forecast.
    """
    if not FORECAST_PATH.exists():
        return {}
    doc = json.loads(FORECAST_PATH.read_text())
    issued = date.fromisoformat(doc.get("issued_for", "1970-01-01"))
    if (date.fromisoformat(today) - issued).days > 1:
        log.warning("forecast file issued %s is stale; skipping forecasts", issued)
        return {}
    return {slug: {**f, "issued_for": doc["issued_for"]} for slug, f in doc["passes"].items()}


FIRE_PATH = Path(__file__).resolve().parent / "data" / "fire" / "passes.json"


def _load_fire(today: str) -> dict[str, Any]:
    """Fire and smoke facts from ingest.fire, under the forecast's rule:
    issued today or yesterday, or not shown at all."""
    if not FIRE_PATH.exists():
        return {}
    doc = json.loads(FIRE_PATH.read_text())
    issued = date.fromisoformat(doc.get("issued_for", "1970-01-01"))
    if (date.fromisoformat(today) - issued).days > 1:
        log.warning("fire file issued %s is stale; skipping fire and smoke", issued)
        return {}
    dates = {"issued_for": doc["issued_for"], "smoke_date": doc.get("smoke_date")}
    return {slug: {**f, **dates} for slug, f in doc["passes"].items()}


LANDING_STATUS_KEYS = ["open", "snow_caution", "traction_advised", "not_recommended", "unknown"]


def _landing(
    passes_out: list[dict[str, Any]],
    dates: list[str],
    links_by_stream: dict[str, dict[str, list[dict[str, Any]]]],
    generated_at: str,
) -> dict[str, Any]:
    """Compact data for the marketing page: ~1/20th of the full index.

    Each pass is [lon, lat, featured, statuses, slug, name, state], statuses
    one digit per date (an index into status_keys), so the melt-out map can
    animate every pass through every season, and the homepage search can find
    any pass by name, from a single small file.
    """
    code = {k: str(i) for i, k in enumerate(LANDING_STATUS_KEYS)}
    gaz_state = {g["slug"]: g.get("state", "") for g in load_passes()}
    today = dates[-1]
    stations = {
        stream: len({link["provenance"] for links in by_pass.values() for link in links})
        for stream, by_pass in links_by_stream.items()
    }
    featured_today = [
        {
            "slug": p["slug"],
            "name": p["name"],
            "elevation_ft": p["elevation_ft"],
            "status": p["statuses"][today]["status"],
            "status_label": p["statuses"][today]["status_label"],
            "confidence": p["statuses"][today]["confidence"],
        }
        for p in passes_out
        if p["tier"] == "featured"
    ]
    return {
        "generated_at": generated_at,
        "dates": dates,
        "status_keys": LANDING_STATUS_KEYS,
        "counts": {
            "passes": len(passes_out),
            "featured": len(featured_today),
            "snow_stations": stations.get("snotel", 0) + stations.get("cdec", 0),
            "stream_gauges": stations.get("usgs", 0),
            "seasons": len({d[:4] for d in dates}),
        },
        "passes": [
            [
                round(p["lon"], 4),
                round(p["lat"], 4),
                1 if p["tier"] == "featured" else 0,
                "".join(code.get(p["statuses"][d]["status"], "4") for d in dates),
                p["slug"],
                p["name"],
                gaz_state.get(p["slug"], ""),
            ]
            for p in passes_out
        ],
        "featured_today": featured_today,
        "model": _model_facts(),
    }


def _model_facts() -> dict[str, Any]:
    """The fusion model's real settings and measured accuracy, for the site."""
    from fusion import fusion as f

    eval_path = Path(__file__).resolve().parent / "eval" / "results.json"
    return {
        "priors": f.PRIOR,
        "half_life_days": f.HALF_LIFE,
        "max_age_days": f.MAX_AGE_DAYS,
        "snowline_rise_ft_per_day": f.SNOWLINE_RISE_FT_PER_DAY,
        "blind_gap_ft": f.BLIND_GAP_FT,
        "eval": json.loads(eval_path.read_text()) if eval_path.exists() else None,
    }


LEDGER_WINDOW_DAYS = 30
LEDGER_PER_SOURCE = 4


def _ledger(
    sensor_obs: list[dict[str, Any]],
    satellite_obs: list[dict[str, Any]],
    gauge_obs: list[dict[str, Any]],
    reports: list[dict[str, Any]],
    dates: list[str],
) -> list[dict[str, Any]]:
    """The auditable evidence column: one dated entry per source event."""
    entries: list[dict[str, Any]] = []
    for r in reports:
        ex = r["extraction"]
        meta = r["post_meta"]
        observed = ex.get("date_observed") or meta.get("posted_date") or ""
        entries.append(
            {
                "date": observed,
                "source": "report",
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
                "title": f"{o['meta'].get('site_name', 'Gauge')}: {round(o['value'])} cfs",
                "detail": {"provenance": o["provenance"], **o["meta"], "value": o["value"]},
            }
        )
    entries.sort(key=lambda e: str(e["date"]), reverse=True)
    # Reports always ride along. Sensor checkpoints are kept per scrubber
    # date: the few most recent of each source in the window before it, so
    # scrubbing back to 2023 still shows the 2023 sensors, and four seasons of
    # rows don't swamp the payload.
    reports_all = [e for e in entries if e["source"] == "report"]
    checkpoints = [e for e in entries if e["source"] != "report"]
    keep: set[int] = set()
    for d in dates:
        lo = (date.fromisoformat(d) - timedelta(days=LEDGER_WINDOW_DAYS)).isoformat()
        taken: dict[str, int] = {}
        for i, e in enumerate(checkpoints):
            if lo < str(e["date"]) <= d and taken.get(e["source"], 0) < LEDGER_PER_SOURCE:
                taken[e["source"]] = taken.get(e["source"], 0) + 1
                keep.add(i)
    kept = [checkpoints[i] for i in sorted(keep)]
    return sorted(reports_all + kept, key=lambda e: str(e["date"]), reverse=True)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    export()
