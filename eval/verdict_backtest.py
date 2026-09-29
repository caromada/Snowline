"""Leave-one-out backtest of the fused verdicts against trip reports.

The extraction evaluation next door (run_eval.py) asks whether the reader
understood a report. This asks the other question: was the verdict right?
For every report that states a snow condition, the verdict for that pass is
recomputed for the day the report describes with that report removed (and
any other report by the same author about the same day), then compared
with what the report says was found.

Everything below was fixed before any result was looked at.

The mapping
-----------
Both sides are placed on the four steps of the verdict scale.

    step  verdict            shown as                 snow_condition
    0     open               Likely snow-free         none
    1     snow_caution       Patchy snow              patchy
    2     traction_advised   Snow likely              continuous
    3     not_recommended    Deep snow or hazards     deep

`traction_used` is supporting evidence. It can raise the step a report
lands on, by one step at most, and it can never lower it. What a party put
on their feet sets a floor:

    none                                   no floor
    microspikes                            step 2
    crampons, ice_axe, spikes_and_axe      step 3

So "patchy" with microspikes lands on step 2, "continuous" with an ice axe
lands on step 3, "patchy" with an ice axe lands on step 2 (one step, not
two), and "deep" with no traction stays on step 3. Every score is also
computed with the snow word alone (`*_snow_only`), so the effect of this
choice is always visible beside the primary number.

Other rules
-----------
- A report with no snow_condition is not ground truth for snow and is not
  scored. exposure_comfort is never used on the observed side.
- The day tested is date_observed, falling back to the posting date, the
  same fallback the engine uses. A report with neither is not scored.
- The verdict compared is the published status, crossing overlay included,
  because that is what a reader would have seen. Rows where the overlay
  moved the status are flagged (`crossing_override`).
- "unknown" is not a miss and not a match. It is counted as no_verdict and
  left out of every rate's denominator, with the count printed beside it.
- Direction of a miss: engine_less means the engine said less snow than
  the report found (the serious kind); engine_more means it said more (the
  cautious kind).
- Rates carry a 95% Wilson interval. A cell with fewer than MIN_CELL scored
  reports prints counts only: no percentage, no interval.
- Confidence tracks accuracy only if the exact-match rate does not fall as
  the grade rises and the intervals of the lowest and highest reportable
  grades do not overlap. In the right order with overlapping intervals is
  reported as unproven, not as a pass.
- Seasons: early (April to June), midsummer (July and August), fall
  (September and October), winter (November to March).
- "Sensor near pass elevation": a linked station within BLIND_GAP_FT of the
  pass elevation, above or below, with a reading inside the sensor window.

Added after the first run
-------------------------
One diagnostic, which changes no score: each row lists the stations voting
in its verdict whose reading had not moved in a week (`stalled_sensors`),
because the first run showed misses fed by pillows stuck on one value.

Usage: python -m eval.verdict_backtest --store data/sierra.sqlite
"""

from __future__ import annotations

import argparse
import json
import logging
import math
from collections.abc import Callable, Iterable
from datetime import UTC, date, datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

from fusion import fuse
from fusion.fusion import (
    BLIND_GAP_FT,
    MAX_AGE_DAYS,
    STATUS_LABEL,
    STATUSES,
    _is_blind,
    _latest_per_station,
    _severity_to_status,
)

log = logging.getLogger(__name__)

ROOT = Path(__file__).resolve().parent.parent
RESULTS_PATH = Path(__file__).resolve().parent / "verdict_results.json"
WEB_PATH = ROOT / "web" / "public" / "data" / "accuracy.json"

SNOW_STEP = {"none": 0, "patchy": 1, "continuous": 2, "deep": 3}
TRACTION_FLOOR = {
    "none": 0,
    "microspikes": 2,
    "crampons": 3,
    "ice_axe": 3,
    "spikes_and_axe": 3,
}
MAX_TRACTION_RAISE = 1

MIN_CELL = 10

# A live snowpack in melt season moves every day. Bare ground legitimately
# reads the same for weeks, so readings under an inch are never flagged.
STALL_READINGS = 7
STALL_TOLERANCE_IN = 0.02
STALL_MIN_SWE_IN = 1.0
Z_95 = 1.959964

GRADES = ["low", "moderate", "high"]
SEASONS = ["early", "midsummer", "fall", "winter"]
SEASON_LABEL = {
    "early": "Early season (April to June)",
    "midsummer": "Midsummer (July and August)",
    "fall": "Fall (September and October)",
    "winter": "Winter (November to March)",
}

# Hosts that cannot belong to a real site (RFC 2606 and RFC 6761). A post
# filed under one was written as a stand-in, not by someone on a pass.
RESERVED_TLDS = ("test", "example", "invalid", "localhost")
RESERVED_DOMAINS = ("example.com", "example.net", "example.org")

# A rough box around the range, only used to say where reports come from.
SIERRA_BOX = {"lat": (35.3, 40.3), "lon": (-121.6, -117.6)}


def wilson_interval(successes: int, n: int, z: float = Z_95) -> tuple[float, float]:
    """Wilson score interval for a binomial proportion."""
    if n <= 0 or successes < 0 or successes > n:
        raise ValueError(f"impossible counts: {successes} of {n}")
    p = successes / n
    denom = 1.0 + z * z / n
    centre = (p + z * z / (2 * n)) / denom
    half = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / denom
    low = 0.0 if successes == 0 else max(0.0, centre - half)
    high = 1.0 if successes == n else min(1.0, centre + half)
    return low, high


def reports_needed(half_width: float) -> int:
    """Fewest scored reports for a rate near one half to be known to +/- half_width."""
    n = 1
    while True:
        low, high = wilson_interval(n // 2, n)
        if (high - low) / 2 <= half_width:
            return n
        n += 1


def observed_step(
    snow_condition: str | None, traction_used: str | None, use_traction: bool = True
) -> int | None:
    """Where a report lands on the verdict scale, or None if it states no snow."""
    if snow_condition not in SNOW_STEP:
        return None
    step = SNOW_STEP[snow_condition]
    if not use_traction or traction_used not in TRACTION_FLOOR:
        return step
    floor = TRACTION_FLOOR[traction_used]
    return max(step, min(floor, step + MAX_TRACTION_RAISE))


def verdict_step(status: str) -> int | None:
    return STATUSES.index(status) if status in STATUSES else None


def classify(engine: int | None, observed: int) -> tuple[str, str | None]:
    """(outcome, direction of the miss)."""
    if engine is None:
        return "no_verdict", None
    gap = engine - observed
    if gap == 0:
        return "exact", None
    outcome = "off_by_one" if abs(gap) == 1 else "off_by_more"
    return outcome, "engine_less" if gap < 0 else "engine_more"


def report_date(report: dict[str, Any]) -> tuple[str, str] | None:
    """(ISO day the report describes, where that day came from)."""
    observed = report["extraction"].get("date_observed")
    if observed:
        return observed, "observed"
    posted = report.get("post_meta", {}).get("posted_date")
    if posted:
        return posted, "posted"
    return None


def _party(report: dict[str, Any]) -> str:
    return str(report.get("post_meta", {}).get("author") or "").strip().lower()


def held_out(target: dict[str, Any], reports: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Every report except the target and its party's other reports of that day."""
    party = _party(target)
    when = report_date(target)
    target_id = target.get("post_meta", {}).get("id")
    kept = []
    for r in reports:
        if r is target or (target_id is not None and r.get("post_meta", {}).get("id") == target_id):
            continue
        if party and when is not None and _party(r) == party:
            other = report_date(r)
            if other is not None and other[0] == when[0]:
                continue
        kept.append(r)
    return kept


def sensor_near_pass_elevation(
    sensor_obs: list[dict[str, Any]], eval_date: str, pass_elev_ft: float | None
) -> bool:
    if pass_elev_ft is None:
        return False
    day = date.fromisoformat(eval_date)
    for o in sensor_obs:
        if o["metric"] != "swe_in":
            continue
        elev = (o.get("meta") or {}).get("station_elevation_ft")
        if elev is None or abs(float(pass_elev_ft) - float(elev)) > BLIND_GAP_FT:
            continue
        age = (day - date.fromisoformat(o["observed_date"])).days
        if 0 <= age <= MAX_AGE_DAYS["sensor"]:
            return True
    return False


def stalled_sensors(
    sensor_obs: list[dict[str, Any]], eval_date: str, pass_elev_ft: float | None
) -> list[str]:
    """Stations voting in the verdict whose reading has not moved in a week.

    A diagnostic only: it explains misses and never changes a score. It was
    added after the first run showed pillows stuck on one value.
    """
    voting = {
        prov
        for prov, o in _latest_per_station(sensor_obs, eval_date).items()
        if not _is_blind(o, pass_elev_ft)
    }
    series: dict[str, list[dict[str, Any]]] = {}
    for o in sensor_obs:
        if (
            o["metric"] == "swe_in"
            and o["provenance"] in voting
            and o["observed_date"] <= eval_date
        ):
            series.setdefault(o["provenance"], []).append(o)
    stalled = []
    for prov, rows in series.items():
        rows.sort(key=lambda o: o["observed_date"])
        last = [float(o["value"]) for o in rows[-STALL_READINGS:]]
        if (
            len(last) == STALL_READINGS
            and max(last) - min(last) <= STALL_TOLERANCE_IN
            and last[-1] >= STALL_MIN_SWE_IN
        ):
            stalled.append(prov)
    return sorted(stalled)


def season_of(iso_day: str) -> str:
    month = int(iso_day[5:7])
    if 4 <= month <= 6:
        return "early"
    if 7 <= month <= 8:
        return "midsummer"
    if 9 <= month <= 10:
        return "fall"
    return "winter"


def is_demonstration_post(post_meta: dict[str, Any]) -> bool:
    host = (urlparse(str(post_meta.get("url") or "")).hostname or "").lower()
    if not host:
        return False
    if host.rsplit(".", 1)[-1] in RESERVED_TLDS:
        return True
    return any(host == d or host.endswith("." + d) for d in RESERVED_DOMAINS)


def region_of(pass_info: dict[str, Any]) -> str:
    lat, lon = pass_info.get("lat"), pass_info.get("lon")
    if (
        pass_info.get("state") == "CA"
        and lat is not None
        and lon is not None
        and SIERRA_BOX["lat"][0] <= lat <= SIERRA_BOX["lat"][1]
        and SIERRA_BOX["lon"][0] <= lon <= SIERRA_BOX["lon"][1]
    ):
        return "Sierra Nevada"
    return "Elsewhere"


def backtest_pass(
    pass_info: dict[str, Any],
    sensor_obs: list[dict[str, Any]],
    satellite_obs: list[dict[str, Any]],
    gauge_obs: list[dict[str, Any]],
    reports: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """One row per scoreable report on this pass, each fused without itself."""
    rows: list[dict[str, Any]] = []
    for target in reports:
        ex = target["extraction"]
        observed = observed_step(ex.get("snow_condition"), ex.get("traction_used"))
        snow_only = observed_step(ex.get("snow_condition"), None, use_traction=False)
        when = report_date(target)
        if observed is None or snow_only is None or when is None:
            continue
        day, date_source = when
        others = held_out(target, reports)
        result = fuse(pass_info, day, sensor_obs, satellite_obs, gauge_obs, others)
        status = result["status"]
        engine = verdict_step(status)
        outcome, direction = classify(engine, observed)
        outcome_snow, direction_snow = classify(engine, snow_only)
        components = result["components"]
        human = components.get("reports")
        severity = result["severity"]
        rows.append(
            {
                "post_id": target["post_meta"].get("id"),
                "pass_slug": pass_info["slug"],
                "pass_name": pass_info["name"],
                "elevation_ft": pass_info.get("elevation_ft"),
                "state": pass_info.get("state"),
                "region": region_of(pass_info),
                "date": day,
                "date_source": date_source,
                "season": season_of(day),
                "year": day[:4],
                "observed": {
                    "snow_condition": ex.get("snow_condition"),
                    "traction_used": ex.get("traction_used"),
                    "step": observed,
                    "step_snow_only": snow_only,
                    "label": STATUS_LABEL[STATUSES[observed]],
                    "label_snow_only": STATUS_LABEL[STATUSES[snow_only]],
                },
                "engine": {
                    "status": status,
                    "status_label": result["status_label"],
                    "step": engine,
                    "severity": severity,
                    "confidence": result["confidence"],
                    "confidence_score": result["confidence_score"],
                    "streams": [k for k, c in components.items() if c is not None],
                    "other_reports": human["n_reports"] if human else 0,
                    "crossing_override": severity is not None
                    and _severity_to_status(severity) != status,
                    "conflicts": len(result["conflicts"]),
                },
                "evidence": {
                    "sensor_near_pass": sensor_near_pass_elevation(
                        sensor_obs, day, pass_info.get("elevation_ft")
                    ),
                    "satellite": components.get("satellite") is not None,
                    "other_reports": human is not None,
                },
                "diagnostics": {
                    "stalled_sensors": stalled_sensors(
                        sensor_obs, day, pass_info.get("elevation_ft")
                    ),
                },
                "outcome": outcome,
                "direction": direction,
                "outcome_snow_only": outcome_snow,
                "direction_snow_only": direction_snow,
                "quote": ex.get("quote_span"),
                "demonstration": is_demonstration_post(target["post_meta"]),
            }
        )
    return rows


def rate_cell(count: int, n: int, min_n: int = MIN_CELL) -> dict[str, Any]:
    """A rate with its sample size and interval, or counts alone when thin."""
    if n < min_n:
        return {"count": count, "n": n, "thin": True, "rate": None, "low": None, "high": None}
    low, high = wilson_interval(count, n)
    return {
        "count": count,
        "n": n,
        "thin": False,
        "rate": round(count / n, 4),
        "low": round(low, 4),
        "high": round(high, 4),
    }


def _cell(rows: list[dict[str, Any]], suffix: str = "") -> dict[str, Any]:
    outcome_key, direction_key = "outcome" + suffix, "direction" + suffix
    scored = [r for r in rows if r[outcome_key] != "no_verdict"]
    n = len(scored)

    def count(pred: Callable[[dict[str, Any]], bool]) -> int:
        return sum(1 for r in scored if pred(r))

    exact = count(lambda r: r[outcome_key] == "exact")
    off_one = count(lambda r: r[outcome_key] == "off_by_one")
    less = [r for r in scored if r[direction_key] == "engine_less"]
    more = [r for r in scored if r[direction_key] == "engine_more"]
    return {
        "reports": len(rows),
        "no_verdict": len(rows) - n,
        "n": n,
        "exact": rate_cell(exact, n),
        "within_one": rate_cell(exact + off_one, n),
        "off_by_one": rate_cell(off_one, n),
        "off_by_more": rate_cell(n - exact - off_one, n),
        "engine_less": rate_cell(len(less), n),
        "engine_more": rate_cell(len(more), n),
        "engine_less_by_more_than_one": sum(
            1 for r in less if r[outcome_key] == "off_by_more"
        ),
        "engine_more_by_more_than_one": sum(
            1 for r in more if r[outcome_key] == "off_by_more"
        ),
    }


def _split(
    rows: list[dict[str, Any]], keys: Iterable[str], of: Callable[[dict[str, Any]], str]
) -> dict[str, Any]:
    return {k: _cell([r for r in rows if of(r) == k]) for k in keys}


def _yes_no(rows: list[dict[str, Any]], flag: str) -> dict[str, Any]:
    return _split(rows, ["yes", "no"], lambda r: "yes" if r["evidence"][flag] else "no")


def _thin(prefix: str, cells: dict[str, Any], out: list[str]) -> None:
    for key, cell in cells.items():
        if "exact" in cell:
            if cell["exact"]["thin"]:
                out.append(f"{prefix}.{key}")
        else:
            _thin(f"{prefix}.{key}", cell, out)


def confusion(rows: list[dict[str, Any]]) -> list[list[int]]:
    """Counts indexed [step the report found][step the engine said]."""
    grid = [[0] * len(STATUSES) for _ in STATUSES]
    for r in rows:
        if r["engine"]["step"] is not None:
            grid[r["observed"]["step"]][r["engine"]["step"]] += 1
    return grid


def confidence_finding(by_confidence: dict[str, Any]) -> dict[str, Any]:
    """Does a higher grade go with a higher exact-match rate?

    verdict: tracks | ordered_but_unproven | does_not_track | too_thin
    """
    usable = [g for g in GRADES if g in by_confidence and not by_confidence[g]["exact"]["thin"]]
    if len(usable) < 2:
        return {"verdict": "too_thin", "grades_compared": usable, "separable": False}
    rates = [by_confidence[g]["exact"]["rate"] for g in usable]
    bottom = by_confidence[usable[0]]["exact"]
    top = by_confidence[usable[-1]]["exact"]
    separable = top["low"] > bottom["high"] or bottom["low"] > top["high"]
    rising = all(b >= a for a, b in zip(rates, rates[1:], strict=False)) and rates[-1] > rates[0]
    if not rising:
        verdict = "does_not_track"
    elif separable:
        verdict = "tracks"
    else:
        verdict = "ordered_but_unproven"
    return {"verdict": verdict, "grades_compared": usable, "separable": separable}


def summarize(rows: list[dict[str, Any]]) -> dict[str, Any]:
    by_confidence = _split(rows, GRADES, lambda r: r["engine"]["confidence"])
    years = sorted({r["year"] for r in rows})
    regions = sorted({r["region"] for r in rows})
    out: dict[str, Any] = {
        "overall": _cell(rows),
        "overall_snow_only": _cell(rows, "_snow_only"),
        "by_confidence": by_confidence,
        "confidence_finding": confidence_finding(by_confidence),
        "by_season": _split(rows, SEASONS, lambda r: r["season"]),
        "by_year": _split(rows, years, lambda r: r["year"]),
        "by_region": _split(rows, regions, lambda r: r["region"]),
        "by_evidence": {
            "sensor_near_pass": _yes_no(rows, "sensor_near_pass"),
            "satellite": _yes_no(rows, "satellite"),
            "other_reports": _yes_no(rows, "other_reports"),
        },
        "confusion": confusion(rows),
    }
    thin: list[str] = []
    for name in ("by_confidence", "by_season", "by_year", "by_region", "by_evidence"):
        _thin(name, out[name], thin)
    out["thin_cells"] = thin
    return out


def corpus_facts(rows: list[dict[str, Any]], reports_total: int) -> dict[str, Any]:
    states: dict[str, int] = {}
    regions: dict[str, int] = {}
    for r in rows:
        states[r["state"] or "?"] = states.get(r["state"] or "?", 0) + 1
        regions[r["region"]] = regions.get(r["region"], 0) + 1
    return {
        "reports_resolved_to_a_pass": reports_total,
        "reports_scored": len(rows),
        "passes": len({r["pass_slug"] for r in rows}),
        "first_day": min((r["date"] for r in rows), default=None),
        "last_day": max((r["date"] for r in rows), default=None),
        "by_state": states,
        "by_region": regions,
        "demonstration": sum(1 for r in rows if r["demonstration"]),
        "dated_by_posting_day": sum(1 for r in rows if r["date_source"] == "posted"),
    }


def stalled_summary(rows: list[dict[str, Any]]) -> dict[str, int]:
    fed = [r for r in rows if r["diagnostics"]["stalled_sensors"]]
    return {
        "reports": len(fed),
        "exact": sum(1 for r in fed if r["outcome"] == "exact"),
        "engine_more": sum(1 for r in fed if r["direction"] == "engine_more"),
        "engine_less": sum(1 for r in fed if r["direction"] == "engine_less"),
    }


def build_results(
    rows: list[dict[str, Any]], reports_total: int, computed_on: str
) -> dict[str, Any]:
    rows = sorted(rows, key=lambda r: (r["date"], r["pass_slug"], str(r["post_id"])))
    return {
        "computed_on": computed_on,
        "method": {
            "design": "leave one report out, same party same day also removed",
            "snow_step": SNOW_STEP,
            "traction_floor": TRACTION_FLOOR,
            "max_traction_raise": MAX_TRACTION_RAISE,
            "steps": STATUSES,
            "interval": "Wilson 95%",
            "min_cell": MIN_CELL,
            "sensor_near_pass_ft": BLIND_GAP_FT,
        },
        "corpus": corpus_facts(rows, reports_total),
        "reports_needed": {
            "within_10_points": reports_needed(0.10),
            "within_5_points": reports_needed(0.05),
        },
        **summarize(rows),
        "stalled_sensors": stalled_summary(rows),
        "rows": rows,
    }


def _slim_cell(cell: dict[str, Any]) -> dict[str, Any]:
    keep = ("reports", "no_verdict", "n", "exact", "within_one", "engine_less", "engine_more")
    return {k: cell[k] for k in keep}


def web_payload(results: dict[str, Any]) -> dict[str, Any]:
    """The compact file the public page reads. No post ids, authors or sites."""
    misses = [
        {
            "pass": r["pass_name"],
            "slug": r["pass_slug"],
            "date": r["date"],
            "engine": r["engine"]["status"],
            "engine_label": r["engine"]["status_label"],
            "confidence": r["engine"]["confidence"],
            "found": STATUSES[r["observed"]["step"]],
            "found_label": r["observed"]["label"],
            "snow_condition": r["observed"]["snow_condition"],
            "traction_used": r["observed"]["traction_used"],
            "steps_apart": abs(r["engine"]["step"] - r["observed"]["step"]),
            "direction": r["direction"],
            "stalled_sensor": bool(r["diagnostics"]["stalled_sensors"]),
            "quote": r["quote"],
        }
        for r in results["rows"]
        if r["outcome"] in ("off_by_one", "off_by_more")
    ]
    misses.sort(key=lambda m: (m["direction"] != "engine_less", -m["steps_apart"], m["date"]))
    no_verdict = [
        {"pass": r["pass_name"], "slug": r["pass_slug"], "date": r["date"]}
        for r in results["rows"]
        if r["outcome"] == "no_verdict"
    ]
    return {
        "computed_on": results["computed_on"],
        "min_cell": results["method"]["min_cell"],
        "corpus": results["corpus"],
        "reports_needed": results["reports_needed"],
        "overall": results["overall"],
        "overall_snow_only": _slim_cell(results["overall_snow_only"]),
        "by_confidence": {k: _slim_cell(c) for k, c in results["by_confidence"].items()},
        "confidence_finding": results["confidence_finding"],
        "by_season": {k: _slim_cell(c) for k, c in results["by_season"].items()},
        "by_evidence": {
            flag: {k: _slim_cell(c) for k, c in cells.items()}
            for flag, cells in results["by_evidence"].items()
        },
        "confusion": results["confusion"],
        "thin_cells": results["thin_cells"],
        "stalled_sensors": results["stalled_sensors"],
        "misses": misses,
        "no_verdict": no_verdict,
    }


def _fmt(cell: dict[str, Any]) -> str:
    if cell["thin"]:
        return f"{cell['count']} of {cell['n']} (too few to give a rate)"
    return (
        f"{cell['count']} of {cell['n']} = {cell['rate']:.0%} "
        f"(95% interval {cell['low']:.0%} to {cell['high']:.0%})"
    )


def render_text(results: dict[str, Any]) -> str:
    """The same numbers for a terminal, thin cells said out loud."""
    o = results["overall"]
    lines = [
        f"Verdict backtest, computed {results['computed_on']}",
        f"  reports scored: {o['reports']}  engine gave no verdict: {o['no_verdict']}",
        f"  exact match:     {_fmt(o['exact'])}",
        f"  within one step: {_fmt(o['within_one'])}",
        f"  engine said less snow than found: {_fmt(o['engine_less'])}",
        f"  engine said more snow than found: {_fmt(o['engine_more'])}",
        f"  exact, snow word alone: {_fmt(results['overall_snow_only']['exact'])}",
        f"  confidence: {results['confidence_finding']['verdict']}",
        f"  verdicts fed by a stalled sensor: {results['stalled_sensors']}",
    ]
    for name in ("by_confidence", "by_season", "by_year", "by_region"):
        lines.append(f"  {name}:")
        for key, cell in results[name].items():
            lines.append(f"    {key:12s} exact {_fmt(cell['exact'])}")
    for flag, cells in results["by_evidence"].items():
        lines.append(f"  by_evidence.{flag}:")
        for key, cell in cells.items():
            lines.append(f"    {key:12s} exact {_fmt(cell['exact'])}")
    return "\n".join(lines)


def gather_rows(store_path: Path) -> tuple[list[dict[str, Any]], int]:
    """Backtest every pass that has reports, from the real store.

    The evidence gathered per pass must stay the same as in pipeline.export,
    or the backtest grades an engine nobody is running.
    """
    from config import EXTRACTIONS_CACHE
    from gazetteer import load_passes
    from ingest import cdec, snotel, usgs
    from pipeline import _reports_by_pass
    from store import Store

    store = Store(store_path)
    store.load_extractions(EXTRACTIONS_CACHE)
    reports_by_pass = _reports_by_pass(store)
    links = {
        "cdec": cdec.pass_links(store),
        "snotel": snotel.pass_links(store),
        "usgs": usgs.pass_links(store),
    }

    def station_rows(stream: str, link: dict[str, Any]) -> list[dict[str, Any]]:
        return [
            {**o, "meta": {**o["meta"], "distance_km": link["distance_km"]}}
            for o in store.observations(f"@{link['provenance']}", stream=stream)
        ]

    rows: list[dict[str, Any]] = []
    for p in load_passes():
        slug = p["slug"]
        reports = reports_by_pass.get(slug)
        if not reports:
            continue
        sensor_obs = [
            o
            for stream in ("cdec", "snotel")
            for link in links[stream].get(slug, [])
            for o in station_rows(stream, link)
            if o["metric"] == "swe_in"
        ]
        satellite_obs = store.observations(slug, stream="satellite")
        gauge_obs = [
            o for link in links["usgs"].get(slug, []) for o in station_rows("usgs", link)
        ]
        rows.extend(backtest_pass(p, sensor_obs, satellite_obs, gauge_obs, reports))
    store.close()
    return rows, sum(len(v) for v in reports_by_pass.values())


def main(argv: list[str] | None = None) -> None:
    from config import DB_PATH

    parser = argparse.ArgumentParser(description=__doc__.split("\n", 1)[0])
    parser.add_argument("--store", type=Path, default=DB_PATH, help="path to the sqlite store")
    parser.add_argument("--results", type=Path, default=RESULTS_PATH)
    parser.add_argument("--web", type=Path, default=WEB_PATH)
    args = parser.parse_args(argv)
    if not args.store.exists():
        raise SystemExit(f"no store at {args.store}")

    rows, reports_total = gather_rows(args.store)
    results = build_results(rows, reports_total, datetime.now(UTC).date().isoformat())
    args.results.write_text(json.dumps(results, indent=1) + "\n")
    args.web.parent.mkdir(parents=True, exist_ok=True)
    args.web.write_text(json.dumps(web_payload(results), separators=(",", ":")) + "\n")
    print(render_text(results))


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    main()
