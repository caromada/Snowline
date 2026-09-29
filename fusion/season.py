"""This melt season against the seasons on file, per pass. Pure logic, no I/O.

The store holds April 1 to August 31 of every season since 2023, so every
season is read over that window and no other. Autumn snow belongs to the
next winter, and a peak that came before April 1 is not on file: "peak" here
always means the highest reading on or after April 1.

Melt-out is the fusion engine's own notion (fusion.fusion._melt_out_date):
the first day of a melted-out run that follows observed snow. A season's
melt-out is that date as the engine reports it once the station has been
bare for MIN_ZERO_RUN_DAYS, so a one day blip in June does not move a
May melt-out by six weeks, while snow that returns within the week does.

Three earlier seasons are not a climatology. Nothing here is called normal;
every comparison names the seasons it rests on, needs MIN_EARLIER_SEASONS of
them at the same station, and is the middle value of those seasons and
nothing more. A season already bare on April 1 or still under snow on
August 31 keeps its place in the order without being given a date.

Thresholds, measured against the store (311 stations, 2023 to 2026):

- Sensor faults. A quarter of one network's station-seasons carry a fault:
  stuck readings, bare-ground offsets that last all summer, and drift.
  The rules were set so the better kept network passes them: of its
  773 station-seasons none lingered under THIN_PACK_IN past 20 days and
  none rose more than 6 times at that level, against 79 and 2 of the other
  network's 395. A flagged season is left out, by name, never repaired.
  With the rules on, 2023 is the latest melt-out at all 50 Sierra Nevada
  stations that have a date for each of 2023, 2024 and 2025.
- DISAGREE_DAYS. Stations sharing a pass differ in "days against the
  earlier seasons" by 8 days at the median and by 21 or less in 93% of 174
  pairs (2026). Inside that, the pass gets the range the stations span;
  beyond it they are telling different stories and each is given its own.
- The pass window. The engine's SNOWLINE_RISE_FT_PER_DAY is the slow edge
  and FAST_RISE_FT_PER_DAY the fast one: between stations 1,500 to 2,500 ft
  apart the middle half of climbs ran 39 to 100 ft a day (best fit 56).
  WINDOW_PAD_DAYS is the scatter left once elevation is accounted for:
  stations near the same pass differ by 23 days either way at the 10th and
  90th percentile, whatever the distance between them. Tested by hiding
  each station in turn and estimating it from its neighbours (2,270
  station-seasons), the window held the true date 89% of the time, 82%
  from a single neighbour, at a median width of 54 days. That is the width
  the evidence supports. The test is station against station: no pass
  has a sensor, so how well a wind-scoured or corniced pass follows a
  pillow in a sheltered flat is not measured by anything here.
- WINDOW_MAX_GAP_FT. The test has 51 cases beyond it.
"""

from __future__ import annotations

import math
from collections.abc import Callable
from datetime import date, timedelta
from typing import Any

from fusion.fresh_snow import KM_PER_MI, MAX_GAIN_IN_PER_DAY, SWE_MIN_IN
from fusion.fusion import (
    MAX_AGE_DAYS,
    MELTED_OUT_SWE_IN,
    MIN_ZERO_RUN_DAYS,
    QUIET_EVIDENCE_UNTIL_MMDD,
    SNOWLINE_RISE_FT_PER_DAY,
    _melt_out_date,
)
from ingest.geo import haversine_km

WINDOW_START_MMDD = "04-01"
WINDOW_END_MMDD = "08-31"

MIN_EARLIER_SEASONS = 2
DISAGREE_DAYS = 21
FAST_RISE_FT_PER_DAY = 100.0
WINDOW_PAD_DAYS = 21
WINDOW_MAX_GAP_FT = 2500.0
# The same pillow often reports through two networks under two names.
SAME_SITE_KM = 1.5
SAME_SITE_FT = 500.0

# The deepest real pack in the store peaked near 135 in (2023). Everything
# above 150 in it is a sentinel (32767) or a stuck sensor (391.82).
MAX_PLAUSIBLE_SWE_IN = 150.0
# The most a pillow can gain in a day is also more than it can lose: melt
# tops out near 3 in a day. A bigger step is a stuck sensor letting go or a
# recalibration, and a melt-out date read off one is an artifact.
MAX_STEP_IN_PER_DAY = MAX_GAIN_IN_PER_DAY
# A pack under THIN_PACK_IN in the melt season is days from gone. Readings
# that stay between melted out and THIN_PACK_IN for longer than
# LINGER_MAX_DAYS are a pillow resting on bare ground with an offset, and
# more than WANDER_MAX_RISES daily rises at that level are a pillow drifting.
THIN_PACK_IN = 3.0
LINGER_MAX_DAYS = 28
WANDER_MAX_RISES = 8
# A record that starts later than this may have missed the season's peak.
PEAK_START_SLACK_DAYS = 7


def season_of(today: date) -> int:
    """The latest season whose window has opened."""
    opened = today.isoformat()[5:] >= WINDOW_START_MMDD
    return today.year if opened else today.year - 1


def season_day(iso: str) -> int:
    """Days since April 1 of the date's own year, so leap years line up."""
    d = date.fromisoformat(iso)
    return (d - date(d.year, 4, 1)).days


def _days(later: str, earlier: str) -> int:
    return (date.fromisoformat(later) - date.fromisoformat(earlier)).days


def _window(rows: list[dict[str, Any]], year: int, today: date) -> list[dict[str, Any]]:
    """One station's snow water readings inside the season window, oldest
    first, one per date, impossible values dropped."""
    lo = f"{year}-{WINDOW_START_MMDD}"
    hi = min(f"{year}-{WINDOW_END_MMDD}", today.isoformat())
    by_date: dict[str, dict[str, Any]] = {}
    for r in rows:
        if r.get("metric") != "swe_in" or r.get("value") is None:
            continue
        day = str(r["observed_date"])
        if lo <= day <= hi and 0.0 <= float(r["value"]) <= MAX_PLAUSIBLE_SWE_IN:
            by_date[day] = r
    return [by_date[day] for day in sorted(by_date)]


def _too_steep(a: dict[str, Any], b: dict[str, Any]) -> bool:
    gap = max(1, _days(b["observed_date"], a["observed_date"]))
    return abs(float(b["value"]) - float(a["value"])) > MAX_STEP_IN_PER_DAY * gap


def _without_strays(series: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Drop single readings that jump away from both neighbours while the
    neighbours agree with each other."""
    kept: list[dict[str, Any]] = []
    for i, o in enumerate(series):
        if 0 < i < len(series) - 1:
            before, after = series[i - 1], series[i + 1]
            if _too_steep(before, o) and _too_steep(o, after) and not _too_steep(before, after):
                continue
        kept.append(o)
    return kept


def _erratic(series: list[dict[str, Any]]) -> bool:
    return any(_too_steep(a, b) for a, b in zip(series, series[1:], strict=False))


def _lingers(series: list[dict[str, Any]]) -> bool:
    start: str | None = None
    for o in series:
        if MELTED_OUT_SWE_IN <= float(o["value"]) < THIN_PACK_IN:
            start = start or o["observed_date"]
            if _days(o["observed_date"], start) > LINGER_MAX_DAYS:
                return True
        else:
            start = None
    return False


def _wanders(series: list[dict[str, Any]]) -> bool:
    rises = 0
    for a, b in zip(series, series[1:], strict=False):
        if _days(b["observed_date"], a["observed_date"]) != 1:
            continue
        before, after = float(a["value"]), float(b["value"])
        if before < THIN_PACK_IN and after < THIN_PACK_IN and after - before >= SWE_MIN_IN:
            rises += 1
    return rises > WANDER_MAX_RISES


def _first_melt_out(series: list[dict[str, Any]]) -> tuple[str, bool] | None:
    """The engine's melt-out date as of the first day the station had been
    bare for a week, and whether snow was seen before the run."""
    for i, o in enumerate(series):
        if float(o["value"]) >= MELTED_OUT_SWE_IN:
            continue
        melt = _melt_out_date(series[: i + 1])
        if melt and _days(o["observed_date"], melt[0]) >= MIN_ZERO_RUN_DAYS:
            return melt
    return None


def station_season(rows: list[dict[str, Any]], year: int, today: date) -> dict[str, Any]:
    """One station's season: melt-out date and peak, or why there is none.

    status is "melted" (date known), "snow" (snow on the ground at the end
    of the record), "bare_at_start" (already bare for a week when the record
    begins, so the melt-out came before April 1) or "unusable" with a reason.
    """
    out: dict[str, Any] = {
        "year": year,
        "status": "unusable",
        "reason": None,
        "melt_out": None,
        "melt_out_day": None,
        "peak_swe_in": None,
        "peak_date": None,
        "last_reading": None,
        "last_swe_in": None,
    }
    series = _without_strays(_window(rows, year, today))
    if not series:
        out["reason"] = "no data"
        return out
    last = series[-1]
    out["last_reading"] = last["observed_date"]
    out["last_swe_in"] = round(float(last["value"]), 1)
    if _erratic(series):
        out["reason"] = "erratic"
        return out

    if _lingers(series):
        out["reason"] = "residual"
        return out
    if _wanders(series):
        out["reason"] = "wandering"
        return out

    melt = _first_melt_out(series)
    bare_at_start = melt is not None and not melt[1] and melt[0] == series[0]["observed_date"]
    # With the ground bare on April 1 the season's peak came before the
    # record; what is on file is a spring storm, not a peak to rank.
    if season_day(series[0]["observed_date"]) <= PEAK_START_SLACK_DAYS and not bare_at_start:
        peak = max(series, key=lambda o: float(o["value"]))
        out["peak_swe_in"] = round(float(peak["value"]), 1)
        out["peak_date"] = peak["observed_date"]

    if melt:
        snow_before = any(
            float(o["value"]) >= MELTED_OUT_SWE_IN
            for o in series
            if o["observed_date"] < melt[0]
        )
        if melt[1]:
            out.update(status="melted", melt_out=melt[0], melt_out_day=season_day(melt[0]))
        elif snow_before:
            # The run starts after a hole in the record: the snow went
            # somewhere inside the hole.
            out["reason"] = "gap"
        else:
            out["status"] = "bare_at_start"
        return out

    window_end = min(date.fromisoformat(f"{year}-{WINDOW_END_MMDD}"), today)
    current = (window_end - date.fromisoformat(last["observed_date"])) <= timedelta(
        days=MAX_AGE_DAYS["sensor"]
    )
    if float(last["value"]) >= MELTED_OUT_SWE_IN:
        if current:
            out["status"] = "snow"
        else:
            out["reason"] = "quiet"
    else:
        out["reason"] = "unconfirmed" if current else "quiet"
    return out


# ---- the pass ---------------------------------------------------------------

REASON_TEXT = {
    "no data": "no readings on file",
    "erratic": "readings jump by more than snow can",
    "residual": "the sensor kept a reading on bare ground",
    "wandering": "the sensor drifted on bare ground",
    "quiet": "stopped reporting before melt-out",
    "gap": "a hole in the record hides the melt-out",
    "unconfirmed": "bare for less than a week so far",
}
NUMBER_WORD = {2: "two", 3: "three", 4: "four", 5: "five", 6: "six", 7: "seven", 8: "eight"}
ORDINAL = {2: "second", 3: "third", 4: "fourth", 5: "fifth", 6: "sixth", 7: "seventh"}


def _word(n: int) -> str:
    return NUMBER_WORD.get(n, str(n))


def _nice(day: date | str) -> str:
    d = date.fromisoformat(day) if isinstance(day, str) else day
    return f"{d:%B} {d.day}"


def _from_day(year: int, day: float) -> date:
    return date(year, 4, 1) + timedelta(days=_round(day))


def _round(x: float) -> int:
    """Half away from zero, so 29.5 days earlier and later read alike."""
    return int(math.copysign(math.floor(abs(x) + 0.5), x))


def _plural(n: int, noun: str) -> str:
    return f"{n} {noun}" if abs(n) == 1 else f"{n} {noun}s"


def _join(parts: list[str]) -> str:
    if len(parts) <= 2:
        return " and ".join(parts)
    return ", ".join(parts[:-1]) + " and " + parts[-1]


def _span(years: list[int]) -> str:
    if len(years) >= 3 and years[-1] - years[0] == len(years) - 1:
        return f"{years[0]} to {years[-1]}"
    return _join([str(y) for y in years])


def _seasons_phrase(used: list[int], on_file: list[int], earlier: bool = True) -> str:
    kind = "earlier seasons" if earlier else "seasons"
    if used == on_file:
        return f"the {_word(len(used))} {kind} on file ({_span(used)})"
    return f"{_word(len(used))} of the {_word(len(on_file))} {kind} on file ({_span(used)})"


def _label(st: dict[str, Any]) -> str:
    if st["elevation_ft"] is None:
        return str(st["name"])
    return f"{st['name']} ({st['elevation_ft']:,} ft)"


def _who(stations: list[dict[str, Any]]) -> str:
    if len(stations) <= 2:
        return _join([_label(st) for st in stations])
    return f"{len(stations)} nearby stations"


def _evidence(st: dict[str, Any], detail: str) -> dict[str, Any]:
    return {
        "provenance": st["provenance"],
        "name": st["name"],
        "elevation_ft": st["elevation_ft"],
        "distance_mi": st["distance_mi"],
        "detail": detail,
    }


def _same_site(a: dict[str, Any], b: dict[str, Any]) -> bool:
    if not a["lonlat"] or not b["lonlat"]:
        return False
    if a["provenance"].split(":")[0] == b["provenance"].split(":")[0]:
        return False
    if a["elevation_ft"] is not None and b["elevation_ft"] is not None:
        if abs(a["elevation_ft"] - b["elevation_ft"]) > SAME_SITE_FT:
            return False
    (lon1, lat1), (lon2, lat2) = a["lonlat"][:2], b["lonlat"][:2]
    return haversine_km(lat1, lon1, lat2, lon2) <= SAME_SITE_KM


def _day_value(season: dict[str, Any]) -> float | None:
    """Melt-out as days since April 1. A season already bare on April 1 sits
    before every date on file and one still under snow on August 31 after
    every one; both can still take their place in a median."""
    if season["status"] == "melted":
        return float(season["melt_out_day"])
    if season["status"] == "bare_at_start":
        return -math.inf
    if season["status"] == "snow":
        return math.inf
    return None


def _median(values: list[float]) -> float | None:
    """The median, or None when it falls outside the record."""
    v = sorted(values)
    mid = len(v) // 2
    if len(v) % 2:
        m = v[mid]
    elif math.isinf(v[mid - 1]) or math.isinf(v[mid]):
        return None
    else:
        m = (v[mid - 1] + v[mid]) / 2
    return None if math.isinf(m) else m


def _stations(sensor_obs: list[dict[str, Any]], today: date) -> list[dict[str, Any]]:
    """The pass's stations, nearest first, each site once, with a season
    record for every year on file."""
    rows_by: dict[str, list[dict[str, Any]]] = {}
    limit = today.isoformat()
    for o in sensor_obs:
        if o.get("metric") == "swe_in" and o.get("value") is not None:
            if str(o["observed_date"]) <= limit:
                rows_by.setdefault(o["provenance"], []).append(o)
    if not rows_by:
        return []
    season = season_of(today)
    first = min(int(str(o["observed_date"])[:4]) for rows in rows_by.values() for o in rows)
    found = []
    for prov, rows in rows_by.items():
        latest = max(rows, key=lambda o: str(o["observed_date"]))
        meta = latest.get("meta") or {}
        elevation = meta.get("station_elevation_ft")
        km = meta.get("distance_km")
        seasons = [station_season(rows, y, today) for y in range(first, season + 1)]
        found.append(
            {
                "provenance": prov,
                "name": meta.get("station_name") or prov,
                "elevation_ft": round(float(elevation)) if elevation is not None else None,
                "distance_km": float(km) if km is not None else math.inf,
                "distance_mi": round(float(km) / KM_PER_MI, 1) if km is not None else None,
                "lonlat": (latest.get("geom") or {}).get("coordinates"),
                "seasons": seasons,
                "usable": sum(1 for s in seasons if s["status"] != "unusable"),
            }
        )
    kept: list[dict[str, Any]] = []
    for st in sorted(found, key=lambda s: (-s["usable"], s["distance_km"])):
        if not any(_same_site(st, other) for other in kept):
            kept.append(st)
    return sorted(kept, key=lambda s: s["distance_km"])


def _compare(st: dict[str, Any], season: int) -> None:
    """Set this station's standing against its own earlier seasons."""
    by_year = {s["year"]: s for s in st["seasons"]}
    current = by_year[season]
    st.update(
        comparison=None, days_vs_earlier=None, earlier_years=[], earlier_median_day=None,
        peak_rank=None, peak_of=None, peak_years=[],
    )
    earlier = {
        y: v for y, s in by_year.items() if y < season and (v := _day_value(s)) is not None
    }
    median = _median(list(earlier.values())) if len(earlier) >= MIN_EARLIER_SEASONS else None
    if median is not None:
        st["earlier_years"] = sorted(earlier)
        st["earlier_median_day"] = _round(median)
        if current["status"] == "melted":
            st["comparison"] = "exact"
            st["days_vs_earlier"] = _round(current["melt_out_day"] - median)
        elif current["status"] == "bare_at_start":
            # Bare on April 1 means gone by March 31 at the latest.
            st["comparison"] = "before_record"
            st["days_vs_earlier"] = -(_round(median) + 1)
        elif current["status"] == "snow":
            st["comparison"] = "still_snow"
            st["days_vs_earlier"] = _round(season_day(current["last_reading"]) - median)

    peaks = {y: s["peak_swe_in"] for y, s in by_year.items() if s["peak_swe_in"] is not None}
    if season in peaks and len(peaks) > MIN_EARLIER_SEASONS:
        st["peak_rank"] = 1 + sum(1 for v in peaks.values() if v > peaks[season])
        st["peak_of"] = len(peaks)
        st["peak_years"] = sorted(peaks)


def _season_notes(st: dict[str, Any], season: int) -> str:
    """The earlier seasons behind a station's comparison, and the ones left out."""
    used, left_out = [], []
    for s in st["seasons"]:
        if s["year"] >= season:
            continue
        if s["status"] == "melted":
            used.append(f"{_nice(s['melt_out'])} ({s['year']})")
        elif s["status"] == "bare_at_start":
            used.append(f"before April 1 ({s['year']})")
        elif s["status"] == "snow":
            used.append(f"after {_nice(s['last_reading'])} ({s['year']})")
        else:
            left_out.append(f"{s['year']}: {REASON_TEXT[s['reason']]}")
    return "; ".join([f"earlier seasons: {', '.join(used)}", *left_out])


def _baseline(years: list[int], on_file: list[int]) -> str:
    middle = "midpoint" if len(years) == 2 else "median"
    return f"the {middle} of {_seasons_phrase(years, on_file)}"


def _baseline_date(years: list[int], on_file: list[int]) -> str:
    if len(years) == 2:
        return f"the midpoint of the melt-out dates of {_seasons_phrase(years, on_file)}"
    return f"the median melt-out date of {_seasons_phrase(years, on_file)}"


def _shift(days: int) -> str:
    return f"{_plural(abs(days), 'day')} {'later' if days > 0 else 'earlier'}"


def _melt_out_fact(
    stations: list[dict[str, Any]], season: int, on_file: list[int], this_year: bool
) -> tuple[dict[str, Any], dict[str, Any]] | None:
    """The melt-out comparison and its summary. Rests on the stations that
    share the fullest set of earlier seasons, so one baseline is named."""
    when = "this year" if this_year else f"in {season}"
    exact = [st for st in stations if st["comparison"] == "exact"]
    if not exact:
        bound = [st for st in stations if st["comparison"] == "before_record"]
        if not bound:
            return None
        st = bound[0]
        record = "this year's record" if this_year else f"the {season} record"
        text = (
            f"Snow had already left {_label(st)} when {record} begins on April 1, "
            f"at least {_plural(-st['days_vs_earlier'], 'day')} earlier than "
            f"{_baseline(st['earlier_years'], on_file)}."
        )
        detail = f"already bare on April 1; {_season_notes(st, season)}"
        summary = {
            "kind": "before_record", "agree": True, "spread_days": 0,
            "min_days": st["days_vs_earlier"], "max_days": st["days_vs_earlier"],
            "earlier_years": st["earlier_years"], "stations": [st["provenance"]],
        }
        return _fact("melt_out", text, [_evidence(st, detail)]), summary

    groups: dict[tuple[int, ...], list[dict[str, Any]]] = {}
    for st in exact:
        groups.setdefault(tuple(st["earlier_years"]), []).append(st)
    years, group = max(
        groups.items(), key=lambda kv: (len(kv[0]), len(kv[1]), -kv[1][0]["distance_km"])
    )
    days = [st["days_vs_earlier"] for st in group]
    lo, hi = min(days), max(days)
    agree = hi - lo <= DISAGREE_DAYS
    baseline = _baseline(list(years), on_file)
    if not agree:
        each = _join([f"{_label(st)} {_shift(st['days_vs_earlier'])}" for st in group])
        about = "this year" if this_year else str(season)
        text = f"The nearby stations disagree about {about}: snow left {each} than {baseline}."
    elif lo == hi == 0:
        text = f"Snow left {_who(group)} {when} on the same day as {baseline}."
    else:
        if lo == hi:
            shift = _shift(lo)
        elif lo == 0 or hi == 0:
            shift = f"up to {_shift(lo or hi)}"
        elif lo < 0 < hi:
            shift = f"between {_shift(lo)} and {_shift(hi)}"
        else:
            near, far = sorted((abs(lo), abs(hi)))
            shift = f"{near} to {far} days {'later' if lo > 0 else 'earlier'}"
        text = f"Snow left {_who(group)} {shift} {when} than {baseline}."
    by_year = [{s["year"]: s for s in st["seasons"]} for st in group]
    evidence = [
        _evidence(st, f"left {_nice(ys[season]['melt_out'])}; {_season_notes(st, season)}")
        for st, ys in zip(group, by_year, strict=True)
    ]
    summary = {
        "kind": "exact", "agree": agree, "spread_days": hi - lo, "min_days": lo,
        "max_days": hi, "earlier_years": list(years),
        "stations": [st["provenance"] for st in group],
    }
    return _fact("melt_out", text, evidence, disagree=not agree), summary


def _still_snow_fact(
    stations: list[dict[str, Any]], season: int, on_file: list[int], this_year: bool
) -> dict[str, Any] | None:
    holding = [st for st in stations if st["comparison"] == "still_snow"]
    if not holding:
        return None
    st = holding[0]
    current = st["seasons"][-1]
    on = _nice(current["last_reading"]) + ("" if this_year else f", {season}")
    head = f"Snow was still on the ground at {_label(st)} on {on}"
    if st["days_vs_earlier"] > 0:
        text = (
            f"{head}, {_plural(st['days_vs_earlier'], 'day')} past "
            f"{_baseline_date(st['earlier_years'], on_file)}."
        )
    else:
        middle = _baseline_date(st["earlier_years"], on_file)
        text = (
            f"{head}. {middle[0].upper()}{middle[1:]} there is "
            f"{_nice(_from_day(season, st['earlier_median_day']))}."
        )
    detail = (
        f"{current['last_swe_in']} in of snow water on {_nice(current['last_reading'])}; "
        f"{_season_notes(st, season)}"
    )
    return _fact("still_snow", text, [_evidence(st, detail)])


def _rank_phrase(rank: int, of: int) -> str:
    if rank == 1:
        return "the highest"
    if rank == of:
        return "the lowest"
    return f"the {ORDINAL.get(rank, f'number {rank}')} highest"


def _peak_fact(
    stations: list[dict[str, Any]], season: int, on_file: list[int], this_year: bool
) -> dict[str, Any] | None:
    ranked = [st for st in stations if st["peak_rank"] is not None]
    if not ranked:
        return None
    fullest = max(len(st["peak_years"]) for st in ranked)
    years = next(st["peak_years"] for st in ranked if len(st["peak_years"]) == fullest)
    group = [st for st in ranked if st["peak_years"] == years]
    whose = "this year's" if this_year else f"the {season}"
    subject = f"{whose} highest snow water on or after April 1"
    seasons = _seasons_phrase(years, [*on_file, season], earlier=False)
    peaks = [{s["year"]: s for s in st["seasons"]} for st in group]
    if len(group) == 1:
        st = group[0]
        text = (
            f"At {_label(st)}, {subject} was {peaks[0][season]['peak_swe_in']:.1f} in, "
            f"{_rank_phrase(st['peak_rank'], st['peak_of'])} of {seasons}."
        )
    else:
        by_rank: dict[int, list[dict[str, Any]]] = {}
        for st in group:
            by_rank.setdefault(st["peak_rank"], []).append(st)
        parts = []
        for i, (rank, sts) in enumerate(sorted(by_rank.items())):
            where = (
                f"all {len(sts)} nearby stations"
                if len(by_rank) == 1 and len(sts) > 2
                else _join([_label(st) for st in sts])
            )
            of = f" of {seasons}" if i == 0 else ""
            parts.append(f"{_rank_phrase(rank, len(years))}{of} at {where}")
        text = f"{subject[0].upper()}{subject[1:]} was {_join(parts)}."
    evidence = []
    for st, ys in zip(group, peaks, strict=True):
        earlier = ", ".join(f"{ys[y]['peak_swe_in']:.1f} in ({y})" for y in years if y != season)
        evidence.append(
            _evidence(
                st,
                f"{ys[season]['peak_swe_in']:.1f} in on {_nice(ys[season]['peak_date'])}; "
                f"earlier seasons: {earlier}",
            )
        )
    return _fact("peak", text, evidence)


def _carried(melt_out: str, gap_ft: float) -> tuple[date, date]:
    """One station's melt-out date carried to the pass elevation at the two
    rise rates, three weeks of scatter either side."""
    a, b = gap_ft / FAST_RISE_FT_PER_DAY, gap_ft / SNOWLINE_RISE_FT_PER_DAY
    melted = date.fromisoformat(melt_out)
    return (
        melted + timedelta(days=math.floor(min(a, b) - WINDOW_PAD_DAYS)),
        melted + timedelta(days=math.ceil(max(a, b) + WINDOW_PAD_DAYS)),
    )


def _gap_phrase(gap_ft: float) -> str:
    if abs(gap_ft) < 50:
        return "at the pass elevation"
    return f"{abs(round(gap_ft)):,} ft {'below' if gap_ft > 0 else 'above'} the pass"


def _pass_window(
    stations: list[dict[str, Any]], pass_ft: float | None, today: date, this_year: bool
) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    """The estimated melt-out window for the pass itself, and its fact."""
    if pass_ft is None:
        return None, None
    season = season_of(today)
    melted, holding = [], []
    for st in stations:
        current = st["seasons"][-1]
        if st["elevation_ft"] is None:
            continue
        gap = float(pass_ft) - st["elevation_ft"]
        if current["status"] == "melted" and abs(gap) <= WINDOW_MAX_GAP_FT:
            melted.append((st, gap, *_carried(current["melt_out"], gap)))
        elif current["status"] == "snow" and gap >= 0:
            holding.append((st, date.fromisoformat(current["last_reading"])))
    if not melted:
        return None, None

    in_year = "" if this_year else f" in {season}"
    evidence = [
        _evidence(
            st,
            f"melted out {_nice(st['seasons'][-1]['melt_out'])}, {_gap_phrase(gap)}; "
            f"points to {_nice(lo)} to {_nice(hi)}",
        )
        for st, gap, lo, hi in melted
    ]
    start = _middle([lo for _, _, lo, _ in melted], math.floor)
    end = _middle([hi for _, _, _, hi in melted], math.ceil)
    floor = max((seen for _, seen in holding), default=None)
    apart = max(lo for _, _, lo, _ in melted) > min(hi for _, _, _, hi in melted)
    verb = "left" if end < today else "leaves"
    if apart or (floor is not None and floor > end):
        each = [f"{_label(st)} points to {_nice(lo)} to {_nice(hi)}" for st, _, lo, hi in melted]
        if not apart and floor is not None:
            st, seen = max(holding, key=lambda h: h[1])
            each.append(f"snow was still on the ground at {_label(st)} on {_nice(seen)}")
            evidence.append(_evidence(st, f"still under snow on {_nice(seen)}"))
        text = (
            f"The nearby stations disagree about when snow {verb} the pass itself{in_year}, "
            f"so no window is given: {_join(each)}."
        )
        return None, _fact("pass_window", text, evidence, disagree=True)
    if floor is not None and floor > start:
        start = floor
    if end.year != season or end.isoformat()[5:] > QUIET_EVIDENCE_UNTIL_MMDD:
        return None, None

    sites = [st for st, *_ in melted]
    dates = "date" if len(sites) == 1 else "dates"
    text = (
        f"An estimate: snow {verb} the pass itself between {_nice(start)} and "
        f"{_nice(end)}{in_year}, carried from the melt-out {dates} at {_who(sites)} "
        f"to the pass elevation."
    )
    state = "melted" if end < today else "underway"
    if state == "underway":
        text += " Today falls inside that window."
    window = {
        "state": state,
        "from": start.isoformat(),
        "through": end.isoformat(),
        "stations": [st["provenance"] for st in sites],
    }
    return window, _fact("pass_window", text, evidence, estimate=True)


def _middle(days: list[date], toward: Callable[[float], int]) -> date:
    v = sorted(d.toordinal() for d in days)
    mid = len(v) // 2
    return date.fromordinal(v[mid] if len(v) % 2 else toward((v[mid - 1] + v[mid]) / 2))


def _fact(
    kind: str,
    text: str,
    evidence: list[dict[str, Any]],
    estimate: bool = False,
    disagree: bool = False,
) -> dict[str, Any]:
    return {
        "kind": kind,
        "text": text,
        "estimate": estimate,
        "disagree": disagree,
        "evidence": evidence,
    }


def _short(iso: str) -> str:
    d = date.fromisoformat(iso)
    return f"{d:%b} {d.day}"


def _melt_out_note(s: dict[str, Any]) -> str:
    if s["status"] == "melted":
        return _short(s["melt_out"])
    if s["status"] == "bare_at_start":
        return "before Apr 1"
    if s["status"] == "snow":
        return f"snow on {_short(s['last_reading'])}"
    return f"no date: {REASON_TEXT[s['reason']]}"


def _chart(stations: list[dict[str, Any]]) -> dict[str, Any] | None:
    """The nearest station with a comparison, and the seasons worth drawing."""
    for wanted in ("exact", "still_snow", "before_record", None):
        for st in stations:
            if st["comparison"] == wanted and (wanted or st["peak_rank"] is not None):
                return {
                    "provenance": st["provenance"],
                    "name": st["name"],
                    "elevation_ft": st["elevation_ft"],
                    "distance_mi": st["distance_mi"],
                    "max_swe_in": MAX_PLAUSIBLE_SWE_IN,
                    "seasons": [
                        {
                            "year": s["year"],
                            "melt_out": s["melt_out"],
                            "melt_out_note": _melt_out_note(s),
                            "peak_swe_in": s["peak_swe_in"],
                        }
                        for s in st["seasons"]
                        if s["reason"] not in ("no data", "erratic")
                    ],
                }
    return None


def pass_season(
    pass_info: dict[str, Any], sensor_obs: list[dict[str, Any]], today: date
) -> dict[str, Any] | None:
    """This season against the earlier seasons on file at one pass's stations,
    or None when fewer than MIN_EARLIER_SEASONS earlier seasons are usable.

    `sensor_obs` is what pipeline.export hands the fusion engine: store rows
    for every linked station, each carrying its station's name, elevation and
    distance from the pass in "meta".
    """
    stations = _stations(sensor_obs, today)
    if not stations:
        return None
    season = season_of(today)
    this_year = season == today.year
    for st in stations:
        _compare(st, season)
    on_file = sorted(
        {
            s["year"]
            for st in stations
            for s in st["seasons"]
            if s["year"] < season and s["reason"] != "no data"
        }
    )

    melt_out = _melt_out_fact(stations, season, on_file, this_year)
    facts = [
        melt_out[0] if melt_out else None,
        _still_snow_fact(stations, season, on_file, this_year),
        _peak_fact(stations, season, on_file, this_year),
    ]
    facts = [f for f in facts if f]
    if not facts:
        return None
    window, window_fact = _pass_window(stations, pass_info.get("elevation_ft"), today, this_year)
    if window_fact:
        facts.append(window_fact)

    return {
        "as_of": today.isoformat(),
        "year": season,
        "window": {"from": WINDOW_START_MMDD, "through": WINDOW_END_MMDD},
        "earlier_years": on_file,
        "melt_out": melt_out[1] if melt_out else None,
        "pass_window": window,
        "chart": _chart(stations),
        "facts": facts,
        "stations": [
            {k: v for k, v in st.items() if k not in ("lonlat", "usable", "distance_km")}
            for st in stations
        ],
    }
