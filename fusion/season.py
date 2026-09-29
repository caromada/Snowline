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
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from fusion.fresh_snow import MAX_GAIN_IN_PER_DAY
from fusion.fusion import (
    MAX_AGE_DAYS,
    MELTED_OUT_SWE_IN,
    MIN_ZERO_RUN_DAYS,
    _melt_out_date,
)

WINDOW_START_MMDD = "04-01"
WINDOW_END_MMDD = "08-31"

# Above any snow water these ranges have recorded; the store holds sentinel
# values (32767) and stuck readings (391.82) that are not snow.
MAX_PLAUSIBLE_SWE_IN = 200.0
# The most a pillow can gain in a day is also more than it can lose: melt
# tops out near 3 in a day. A bigger step is a stuck sensor letting go or a
# recalibration, and a melt-out date read off one is an artifact.
MAX_STEP_IN_PER_DAY = MAX_GAIN_IN_PER_DAY
# A melting pack under FLAT_MAX_IN loses water daily. Readings that hold
# inside a FLAT_BAND_IN band for three weeks at that level are a pillow
# resting on bare ground with an offset, not snow.
FLAT_MIN_DAYS = 21
FLAT_BAND_IN = 0.5
FLAT_MAX_IN = 3.0
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


def _flat_residual(series: list[dict[str, Any]]) -> bool:
    start = 0
    values = [float(o["value"]) for o in series]
    for i, v in enumerate(values):
        if not MELTED_OUT_SWE_IN <= v < FLAT_MAX_IN:
            start = i + 1
            continue
        while max(values[start : i + 1]) - min(values[start : i + 1]) >= FLAT_BAND_IN:
            start += 1
        if _days(series[i]["observed_date"], series[start]["observed_date"]) >= FLAT_MIN_DAYS:
            return True
    return False


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
    }
    series = _without_strays(_window(rows, year, today))
    if not series:
        out["reason"] = "no data"
        return out
    last = series[-1]
    out["last_reading"] = last["observed_date"]
    if _erratic(series):
        out["reason"] = "erratic"
        return out

    if season_day(series[0]["observed_date"]) <= PEAK_START_SLACK_DAYS:
        peak = max(series, key=lambda o: float(o["value"]))
        out["peak_swe_in"] = round(float(peak["value"]), 1)
        out["peak_date"] = peak["observed_date"]

    if _flat_residual(series):
        out["reason"] = "residual"
        return out

    melt = _first_melt_out(series)
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
