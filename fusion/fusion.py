"""Evidence fusion: four streams into one honest status per pass.

Pure logic, no I/O. The pipeline adapts store rows into plain dicts and
this module turns them into a status, a confidence grade, explicit
conflicts, and per-sentence facts that each point back at their evidence.

The four streams disagree in structurally different ways:
- sensors are precise but sit in flats, not on passes
- satellite is spatially complete but temporally gappy and sees cover,
  not condition
- humans report condition exactly where it matters, noisily, with bias
  (calibrated upstream per reporter register)
- gauges answer the crossing question and proxy melt intensity

Disagreement is surfaced, never averaged away.
"""

from __future__ import annotations

from datetime import date as _date
from typing import Any

from extraction.calibrate import calibrated_severity

# Stream reliability priors.
PRIOR = {"sensor": 0.9, "satellite": 0.65, "report": 0.75}

# Recency half-lives in days.
HALF_LIFE = {"sensor": 4.0, "satellite": 3.0, "report": 5.0}

# Windows: evidence older than this contributes nothing.
MAX_AGE_DAYS = {"sensor": 10, "satellite": 12, "report": 14}

SWE_FULL_SEVERITY_IN = 15.0

SNOW_SEVERITY = {"none": 0.0, "patchy": 1.0, "continuous": 2.0, "deep": 3.0}
TRACTION_SEVERITY = {
    "none": 0.0,
    "microspikes": 1.5,
    "crampons": 2.25,
    "ice_axe": 2.5,
    "spikes_and_axe": 2.75,
}
CROSSING_ORDER = ["dry", "low", "knee_high", "thigh_high", "dangerous"]

STATUSES = ["open", "snow_caution", "traction_advised", "not_recommended"]
STATUS_LABEL = {
    "open": "Open",
    "snow_caution": "Snow, use caution",
    "traction_advised": "Traction advised",
    "not_recommended": "Not recommended",
    "unknown": "Unknown",
}

ACTIVE_MELT_SWING_PCT = 35.0

# Snow evidence is asymmetric in elevation. A sensor below the pass that
# still holds snow says the pass holds more. A sensor below the pass that has
# melted out only says the snowline is somewhere above it, so once the pass
# sits this far above a melted-out sensor, that sensor is blind to it. The
# Sierra's pillows sit near pass height; Cascade SNOTELs often sit 3,000 ft
# under the high passes, which is where this matters.
BLIND_GAP_FT = 1500.0
MELTED_OUT_SWE_IN = 0.5
# Among sensors that can see the pass, closer in elevation counts for more.
ELEVATION_WEIGHT_SCALE_FT = 3000.0

# When every sensor is blind, the melt-out date still carries information:
# the day a sensor melts out, the snowline is at its elevation, and through
# the season it keeps climbing. Sierra melt-out runs roughly 7,000 ft in
# early May to 11,000 ft in early July (about 65 ft a day); the Cascades are
# slower. 40 ft a day is the conservative choice: a slower climb predicts
# snow up high for longer. It is an estimate, weighted and labeled as one.
SNOWLINE_RISE_FT_PER_DAY = 40.0
SNOWLINE_MARGIN_FT = 500.0
SNOWLINE_WEIGHT_FRAC = 0.45
MIN_ZERO_RUN_DAYS = 7
SEASON_GAP_DAYS = 20
# CDEC pillows stop reporting once they melt out, so "melted out, then
# silent" is itself melt-out evidence, but only until fall storms can
# arrive: a silent pillow cannot report new snow.
QUIET_EVIDENCE_UNTIL_MMDD = "10-15"
# Past the highest terrain in the lower 48 (Whitney, 14,505 ft) a snowline
# number means nothing; say "above everything" instead.
SNOWLINE_CEILING_FT = 14500.0
CONFLICT_THRESHOLD = 1.0


def _age_days(eval_date: str, observed: str) -> int:
    return (_date.fromisoformat(eval_date) - _date.fromisoformat(observed)).days


def _decay(age: int, stream: str) -> float:
    return 0.5 ** (max(age, 0) / HALF_LIFE[stream])


def _severity_to_status(severity: float) -> str:
    if severity < 0.5:
        return "open"
    if severity < 1.25:
        return "snow_caution"
    if severity < 2.1:
        return "traction_advised"
    return "not_recommended"


def _latest_per_station(
    sensor_obs: list[dict[str, Any]], eval_date: str
) -> dict[str, dict[str, Any]]:
    latest: dict[str, dict[str, Any]] = {}
    for o in sensor_obs:
        if o["metric"] != "swe_in":
            continue
        age = _age_days(eval_date, o["observed_date"])
        if age < 0 or age > MAX_AGE_DAYS["sensor"]:
            continue
        prev = latest.get(o["provenance"])
        if prev is None or o["observed_date"] > prev["observed_date"]:
            latest[o["provenance"]] = o
    return latest


def _elevation_gap(o: dict[str, Any], pass_elev_ft: float | None) -> float | None:
    """How far the pass sits above this station, in feet (negative: below)."""
    station_elev = (o.get("meta") or {}).get("station_elevation_ft")
    if pass_elev_ft is None or station_elev is None:
        return None
    return float(pass_elev_ft) - float(station_elev)


def _is_blind(o: dict[str, Any], pass_elev_ft: float | None) -> bool:
    gap = _elevation_gap(o, pass_elev_ft)
    return gap is not None and gap > BLIND_GAP_FT and float(o["value"]) < MELTED_OUT_SWE_IN


def _blind_sensors(
    sensor_obs: list[dict[str, Any]], eval_date: str, pass_elev_ft: float | None
) -> dict[str, Any] | None:
    """Melted-out stations too far below the pass to say anything about it."""
    blind = [o for o in _latest_per_station(sensor_obs, eval_date).values()
             if _is_blind(o, pass_elev_ft)]
    if not blind:
        return None
    blind.sort(key=lambda o: -float(o["meta"]["station_elevation_ft"]))
    return {
        "stations": [
            {
                "provenance": o["provenance"],
                "name": o["meta"].get("station_name") or o["provenance"],
                "elevation_ft": round(float(o["meta"]["station_elevation_ft"])),
            }
            for o in blind
        ],
        "min_gap_ft": round(min(_elevation_gap(o, pass_elev_ft) or 0.0 for o in blind)),
        "refs": [o.get("id") for o in blind],
    }


def _melt_out_date(series: list[dict[str, Any]]) -> tuple[str, bool] | None:
    """Start of the current melted-out run, and whether the melt was observed.

    `series` is one station's readings up to the eval date, oldest first.
    Walking back stops at a data gap (the off-season between ingest windows),
    so a run never spans two seasons. With no snow seen before the run, the
    run's start is only an upper bound on the melt-out date, which errs
    toward a lower snowline, the cautious side; it needs a week of data.
    """
    run_start: str | None = None
    prev: str | None = None
    for o in reversed(series):
        d = o["observed_date"]
        if prev is not None and _age_days(prev, d) > SEASON_GAP_DAYS:
            break
        if float(o["value"]) >= MELTED_OUT_SWE_IN:
            return (run_start, True) if run_start else None
        run_start = d
        prev = d
    if not (run_start and series):
        return None
    if _age_days(series[-1]["observed_date"], run_start) >= MIN_ZERO_RUN_DAYS:
        return run_start, False
    return None


def _snowline_estimate(
    sensor_obs: list[dict[str, Any]], eval_date: str, pass_elev_ft: float | None
) -> dict[str, Any] | None:
    """Snowline inferred from melt-out dates, or None.

    Two kinds of station qualify: ones reporting now but blind to the pass
    (melted out far below it), and ones that melted out and then went quiet
    earlier this season.
    """
    if pass_elev_ft is None:
        return None
    by_station: dict[str, list[dict[str, Any]]] = {}
    for o in sensor_obs:
        if (
            o["metric"] == "swe_in"
            and o["observed_date"] <= eval_date
            and o["observed_date"][:4] == eval_date[:4]
            and (o.get("meta") or {}).get("station_elevation_ft") is not None
        ):
            by_station.setdefault(o["provenance"], []).append(o)
    best: dict[str, Any] | None = None
    for prov, series in by_station.items():
        series.sort(key=lambda o: o["observed_date"])
        last = series[-1]
        quiet = _age_days(eval_date, last["observed_date"]) > MAX_AGE_DAYS["sensor"]
        if quiet:
            still_snowy = float(last["value"]) >= MELTED_OUT_SWE_IN
            if still_snowy or eval_date[5:] > QUIET_EVIDENCE_UNTIL_MMDD:
                continue
        elif not _is_blind(last, pass_elev_ft):
            continue
        melt = _melt_out_date(series)
        if melt is None:
            continue
        melt_date, observed = melt
        days = _age_days(eval_date, melt_date)
        elev = float(last["meta"]["station_elevation_ft"])
        est = elev + SNOWLINE_RISE_FT_PER_DAY * days
        if best is None or est > best["snowline_ft"]:
            best = {
                "snowline_ft": est,
                "station": last["meta"].get("station_name") or prov,
                "station_elevation_ft": round(elev),
                "melt_out": melt_date,
                "melt_observed": observed,
                "quiet_since": last["observed_date"] if quiet else None,
                "days": days,
                "refs": [last.get("id")],
            }
    if best is None:
        return None
    gap = float(pass_elev_ft) - best["snowline_ft"]
    if gap <= -SNOWLINE_MARGIN_FT:
        severity = 0.0
    elif gap <= 0:
        severity = 0.5
    else:
        severity = min(2.0, 0.5 + gap / 1000.0)
    best["snowline_ft"] = round(min(best["snowline_ft"], SNOWLINE_CEILING_FT), -2)
    best["severity"] = round(severity, 2)
    # No recency decay: the information is the melt-out date, not the age of
    # the last reading. The low weight and confidence carry the uncertainty.
    best["weight"] = PRIOR["sensor"] * SNOWLINE_WEIGHT_FRAC
    return best


def _sensor_component(
    sensor_obs: list[dict[str, Any]], eval_date: str, pass_elev_ft: float | None = None
) -> dict[str, Any] | None:
    """Latest SWE per station within window, weighted by distance and elevation.

    Stations blind to the pass (see BLIND_GAP_FT) are left out entirely.
    """
    latest = {
        prov: o
        for prov, o in _latest_per_station(sensor_obs, eval_date).items()
        if not _is_blind(o, pass_elev_ft)
    }
    if not latest:
        return None
    wsum = vsum = 0.0
    freshest = None
    for o in latest.values():
        dist = float(o.get("meta", {}).get("distance_km") or 20.0)
        w = 1.0 / (1.0 + dist / 10.0)
        gap = _elevation_gap(o, pass_elev_ft)
        if gap is not None:
            w *= 1.0 / (1.0 + abs(gap) / ELEVATION_WEIGHT_SCALE_FT)
        wsum += w
        vsum += w * float(o["value"])
        if freshest is None or o["observed_date"] > freshest:
            freshest = o["observed_date"]
    swe = vsum / wsum
    severity = min(3.0, swe / SWE_FULL_SEVERITY_IN * 3.0)
    # Melt trend: compare each station's earliest in-window reading.
    trend = None
    per_station_first: dict[str, dict[str, Any]] = {}
    for o in sensor_obs:
        if o["metric"] != "swe_in" or o["provenance"] not in latest:
            continue
        if 0 <= _age_days(eval_date, o["observed_date"]) <= MAX_AGE_DAYS["sensor"]:
            prev = per_station_first.get(o["provenance"])
            if prev is None or o["observed_date"] < prev["observed_date"]:
                per_station_first[o["provenance"]] = o
    if per_station_first and latest:
        first_avg = sum(float(o["value"]) for o in per_station_first.values()) / len(
            per_station_first
        )
        first_date = min(o["observed_date"] for o in per_station_first.values())
        last_date = max(o["observed_date"] for o in latest.values())
        span = max(1, _age_days(last_date, first_date))
        trend = (swe - first_avg) / span  # inches per day, negative = melting
    age = _age_days(eval_date, freshest or eval_date)
    return {
        "severity": round(severity, 2),
        "swe_in": round(swe, 1),
        "trend_in_per_day": round(trend, 2) if trend is not None else None,
        "age_days": age,
        "weight": PRIOR["sensor"] * _decay(age, "sensor"),
        "stations": sorted(latest),
        "refs": [o.get("id") for o in latest.values()],
    }


def _satellite_component(
    satellite_obs: list[dict[str, Any]], eval_date: str
) -> dict[str, Any] | None:
    best = None
    for o in satellite_obs:
        if o["metric"] != "snow_cover_frac":
            continue
        age = _age_days(eval_date, o["observed_date"])
        if age < 0 or age > MAX_AGE_DAYS["satellite"]:
            continue
        if best is None or o["observed_date"] > best["observed_date"]:
            best = o
    if best is None:
        return None
    age = _age_days(eval_date, best["observed_date"])
    cover = float(best["value"])
    return {
        "severity": round(cover * 3.0, 2),
        "cover_frac": cover,
        "age_days": age,
        "modeled": bool(best.get("meta", {}).get("modeled")),
        "weight": PRIOR["satellite"] * _decay(age, "satellite"),
        "refs": [best.get("id")],
    }


def _report_component(reports: list[dict[str, Any]], eval_date: str) -> dict[str, Any] | None:
    """Aggregate recent human reports, register-calibrated, recency-decayed."""
    scored = []
    for r in reports:
        ex = r["extraction"]
        observed = ex.get("date_observed") or r.get("post_meta", {}).get("posted_date")
        if not observed:
            continue
        age = _age_days(eval_date, observed)
        if age < 0 or age > MAX_AGE_DAYS["report"]:
            continue
        signals: list[float] = []
        snow = ex.get("snow_condition")
        if snow in SNOW_SEVERITY:
            signals.append(SNOW_SEVERITY[snow])
        traction = ex.get("traction_used")
        if traction in TRACTION_SEVERITY:
            signals.append(TRACTION_SEVERITY[traction])
        comfort = calibrated_severity(ex.get("exposure_comfort"), ex.get("reporter_register"))
        if comfort is not None:
            signals.append(comfort)
        if not signals:
            continue
        scored.append(
            {
                "severity": sum(signals) / len(signals),
                "age_days": age,
                "decay": _decay(age, "report"),
                "report": r,
            }
        )
    if not scored:
        return None
    wsum = sum(s["decay"] for s in scored)
    severity = sum(s["severity"] * s["decay"] for s in scored) / wsum
    freshest = min(s["age_days"] for s in scored)
    return {
        "severity": round(severity, 2),
        "n_reports": len(scored),
        "age_days": freshest,
        "weight": PRIOR["report"] * _decay(freshest, "report") * min(1.0, len(scored) / 2.0),
        "refs": [s["report"].get("post_meta", {}).get("id") for s in scored],
        "reports": scored,
    }


def _crossing_component(
    reports: list[dict[str, Any]], gauge_obs: list[dict[str, Any]], eval_date: str
) -> dict[str, Any]:
    worst = None
    refs = []
    for r in reports:
        ex = r["extraction"]
        observed = ex.get("date_observed") or r.get("post_meta", {}).get("posted_date")
        crossing = ex.get("crossing_condition")
        if not observed or crossing not in CROSSING_ORDER:
            continue
        age = _age_days(eval_date, observed)
        if age < 0 or age > MAX_AGE_DAYS["report"]:
            continue
        if worst is None or CROSSING_ORDER.index(crossing) > CROSSING_ORDER.index(worst):
            worst = crossing
            refs.append(r.get("post_meta", {}).get("id"))
    flow = None
    flow_trend = None
    swing = None
    in_window = [
        o
        for o in gauge_obs
        if o["metric"] == "discharge_cfs" and 0 <= _age_days(eval_date, o["observed_date"]) <= 10
    ]
    if in_window:
        in_window.sort(key=lambda o: o["observed_date"])
        flow = float(in_window[-1]["value"])
        if len(in_window) >= 4:
            earlier = float(in_window[0]["value"])
            flow_trend = "dropping" if flow < earlier * 0.92 else (
                "rising" if flow > earlier * 1.08 else "steady"
            )
    swings = [
        float(o["value"])
        for o in gauge_obs
        if o["metric"] == "diurnal_swing_pct"
        and 0 <= _age_days(eval_date, o["observed_date"]) <= 7
    ]
    if swings:
        swing = sum(swings) / len(swings)
    return {
        "worst_reported": worst,
        "flow_cfs": flow,
        "flow_trend": flow_trend,
        "diurnal_swing_pct": round(swing, 1) if swing is not None else None,
        "active_melt": swing is not None and swing >= ACTIVE_MELT_SWING_PCT,
        "refs": refs,
    }


def fuse(
    pass_info: dict[str, Any],
    eval_date: str,
    sensor_obs: list[dict[str, Any]],
    satellite_obs: list[dict[str, Any]],
    gauge_obs: list[dict[str, Any]],
    reports: list[dict[str, Any]],
) -> dict[str, Any]:
    """Fuse all evidence for one pass on one date."""
    sensor = _sensor_component(sensor_obs, eval_date, pass_info.get("elevation_ft"))
    blind = _blind_sensors(sensor_obs, eval_date, pass_info.get("elevation_ft"))
    snowline = (
        _snowline_estimate(sensor_obs, eval_date, pass_info.get("elevation_ft"))
        if sensor is None
        else None
    )
    satellite = _satellite_component(satellite_obs, eval_date)
    human = _report_component(reports, eval_date)
    crossing = _crossing_component(reports, gauge_obs, eval_date)

    components = {
        "sensor": sensor,
        "snowline": snowline,
        "satellite": satellite,
        "reports": human,
    }
    present = {k: c for k, c in components.items() if c is not None}

    if not present:
        return {
            "pass_slug": pass_info["slug"],
            "eval_date": eval_date,
            "status": "unknown",
            "status_label": STATUS_LABEL["unknown"],
            "severity": None,
            "confidence": "low",
            "confidence_score": 0.0,
            "components": components,
            "crossing": crossing,
            "conflicts": [],
            "facts": [_blind_fact(pass_info, blind)]
            if blind
            else [
                {
                    "text": "No recent evidence for this pass in any stream.",
                    "stream": "none",
                    "refs": [],
                }
            ],
        }

    wsum = sum(c["weight"] for c in present.values())
    severity = sum(c["severity"] * c["weight"] for c in present.values()) / wsum
    status = _severity_to_status(severity)

    # Crossing overlay: a dangerous ford is its own show-stopper; a
    # thigh-high one keeps the pass out of plain "open".
    if crossing["worst_reported"] == "dangerous":
        status = "not_recommended"
    elif crossing["worst_reported"] == "thigh_high" and STATUSES.index(status) < 1:
        status = "snow_caution"

    # Conflicts: streams that disagree by more than a full severity level.
    conflicts: list[str] = []
    names = {
        "sensor": "Sensors",
        "snowline": "The snowline estimate",
        "satellite": "Satellite",
        "reports": "Parties on the ground",
    }
    keys = list(present)
    for i, a in enumerate(keys):
        for b in keys[i + 1 :]:
            diff = abs(present[a]["severity"] - present[b]["severity"])
            if diff > CONFLICT_THRESHOLD:
                lo, hi = (a, b) if present[a]["severity"] < present[b]["severity"] else (b, a)
                conflicts.append(
                    f"{names[hi]} suggest more snow than {names[lo].lower()} do "
                    f"(severity {present[hi]['severity']:.1f} vs {present[lo]['severity']:.1f})."
                )

    # Confidence: density + freshness, knocked down by disagreement.
    score = 0.0
    if sensor:
        score += 2.0 if sensor["age_days"] <= 2 else (1.0 if sensor["age_days"] <= 7 else 0.5)
    if snowline:
        score += 0.5  # an inference, not an observation of the pass
    if satellite:
        score += 1.5 if satellite["age_days"] <= 4 else 0.75
    if human:
        score += min(3.0, float(human["n_reports"]))
    if crossing["flow_cfs"] is not None:
        score += 1.0
    max_diff = max(
        (
            abs(present[a]["severity"] - present[b]["severity"])
            for i, a in enumerate(keys)
            for b in keys[i + 1 :]
        ),
        default=0.0,
    )
    if max_diff > 1.5:
        score -= 2.0
    elif max_diff > 0.8:
        score -= 1.0
    confidence = "high" if score >= 5.0 else ("moderate" if score >= 2.5 else "low")

    return {
        "pass_slug": pass_info["slug"],
        "eval_date": eval_date,
        "status": status,
        "status_label": STATUS_LABEL[status],
        "severity": round(severity, 2),
        "confidence": confidence,
        "confidence_score": round(score, 1),
        "components": components,
        "crossing": crossing,
        "conflicts": conflicts,
        "facts": _facts(pass_info, sensor, satellite, human, crossing)
        + ([_snowline_fact(snowline)] if snowline else [])
        + ([_blind_fact(pass_info, blind)] if blind and not snowline else []),
    }


def _snowline_fact(sl: dict[str, Any]) -> dict[str, Any]:
    when = "on" if sl["melt_observed"] else "by"
    quiet_since = sl.get("quiet_since")
    if not quiet_since:
        quiet = ""
    elif quiet_since <= sl["melt_out"]:
        quiet = " and stopped reporting"
    else:
        quiet = f" and has been quiet since {quiet_since}"
    level = (
        "above the highest terrain"
        if sl["snowline_ft"] >= SNOWLINE_CEILING_FT
        else f"near {sl['snowline_ft']:,.0f} ft"
    )
    head = (
        f"{sl['station']} ({sl['station_elevation_ft']:,} ft) melted out {when} "
        f"{sl['melt_out']}{quiet}; at a typical {SNOWLINE_RISE_FT_PER_DAY:.0f} ft a day "
        f"that puts the snowline estimate {level}"
    )
    if sl["severity"] == 0.0:
        where = "" if sl["snowline_ft"] >= SNOWLINE_CEILING_FT else ", above the pass"
        tail = f"{where}: likely melted out, though no sensor sees it directly."
    elif sl["severity"] <= 0.5:
        tail = ", close to the pass: expect lingering patches."
    else:
        tail = ", still below the pass: expect snow up high."
    return {"text": head + tail, "stream": "sensor", "refs": sl["refs"]}


def _blind_fact(pass_info: dict[str, Any], blind: dict[str, Any]) -> dict[str, Any]:
    names = ", ".join(
        f"{st['name']} ({st['elevation_ft']:,} ft)" for st in blind["stations"][:3]
    )
    return {
        "text": (
            f"Snow sensors nearby have melted out, but {names} sit at least "
            f"{blind['min_gap_ft']:,} ft below the pass: they cannot tell whether "
            f"it still holds snow."
        ),
        "stream": "sensor",
        "refs": blind["refs"],
    }


def _facts(
    pass_info: dict[str, Any],
    sensor: dict[str, Any] | None,
    satellite: dict[str, Any] | None,
    human: dict[str, Any] | None,
    crossing: dict[str, Any],
) -> list[dict[str, Any]]:
    """Per-sentence panel facts, each traceable to its stream and refs."""
    facts: list[dict[str, Any]] = []
    if sensor:
        trend = sensor.get("trend_in_per_day")
        trend_txt = ""
        if trend is not None and trend < -0.15:
            trend_txt = ", melting fast"
        elif trend is not None and trend < -0.02:
            trend_txt = ", melting steadily"
        facts.append(
            {
                "text": (
                    f"Nearby snow sensors read {sensor['swe_in']} in of water in the "
                    f"snowpack{trend_txt} ({sensor['age_days']}d old)."
                ),
                "stream": "sensor",
                "refs": sensor["refs"],
            }
        )
    if satellite:
        pct = round(satellite["cover_frac"] * 100)
        modeled = " (modeled)" if satellite["modeled"] else ""
        facts.append(
            {
                "text": (
                    f"Satellite{modeled} shows {pct}% snow cover in the pass bowl, "
                    f"last clear look {satellite['age_days']}d ago."
                ),
                "stream": "satellite",
                "refs": satellite["refs"],
            }
        )
    if human:
        n = human["n_reports"]
        parties = "party" if n == 1 else "parties"
        facts.append(
            {
                "text": (
                    f"{n} {parties} reported from this pass recently; "
                    f"calibrated read: {_severity_word(human['severity'])}."
                ),
                "stream": "report",
                "refs": [r for r in human["refs"] if r],
            }
        )
    if crossing["worst_reported"]:
        facts.append(
            {
                "text": (
                    f"Worst reported crossing nearby: "
                    f"{crossing['worst_reported'].replace('_', ' ')}."
                ),
                "stream": "report",
                "refs": crossing["refs"],
            }
        )
    if crossing["flow_cfs"] is not None:
        trend = f" and {crossing['flow_trend']}" if crossing["flow_trend"] else ""
        melt = (
            " Strong afternoon melt pulse, cross early."
            if crossing["active_melt"]
            else ""
        )
        facts.append(
            {
                "text": (
                    f"{pass_info.get('creek') or 'The nearest creek'} gauge reads "
                    f"{round(crossing['flow_cfs'])} cfs{trend}.{melt}"
                ),
                "stream": "gauge",
                "refs": [],
            }
        )
    return facts


def _severity_word(severity: float) -> str:
    if severity < 0.5:
        return "easy going"
    if severity < 1.25:
        return "some snow, manageable"
    if severity < 2.1:
        return "real snow travel, bring traction"
    return "serious conditions"
