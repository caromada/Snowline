"""Which snow sensor readings can be believed.

Pure logic, no I/O. The store keeps every reading as the agency published
it; this module decides, at read time, which of them may count as evidence.
Rejecting here rather than at ingest keeps the raw record reprocessable,
covers CDEC and SNOTEL with one rule, and lets the judgement depend on what
was known on the day being evaluated: the first day of a stuck run looks
like any other reading, and only the days after it give the sensor away.

Two rules, both set from four seasons of station data (2023 to 2026) and
from the physics, before any verdict was rescored:

- Ceiling. The deepest pack in the record year of 2023 held 135 in of
  water. The faulty readings in the store start at 388 in. Anything over
  SWE_CEILING_IN is an instrument fault, whatever the season.
- Flatline. From June through September a snowpack that still holds an inch
  of water loses some of it every day. A week of readings that do not move
  is a sensor stuck on one value, or a bare pillow with a zero offset.

What the flatline rule must not catch:
- bare ground, which reads 0.0 for months: readings under
  FLATLINE_MIN_SWE_IN never start or join a run
- a winter pack between storms and a spring pack at its peak, which do sit
  flat for a week or more: a run only counts as stuck once a full week of
  it falls inside melt season. Among SNOTEL stations, whose data is
  reviewed, flat weeks are common in April (the longest ran twenty days)
  and all but gone by late May. From June on, the only flat weeks in four
  seasons belong to one pillow that stopped at 14.5 in for seventeen days
  and then fell to zero overnight.

Not caught: a sensor that dies outside melt season, and a dead sensor that
drifts faster than the tolerance. Both need more than a single series to
tell apart from real snow.
"""

from __future__ import annotations

from typing import Any

SWE_CEILING_IN = 200.0

FLATLINE_READINGS = 7
# A dead sensor is not perfectly still. Some CDEC encoders step in counts of
# 0.12 in and wander over three of them; a SNOTEL pillow flickers by 0.1 in
# either way. A live pack in melt season moves further than this in a day.
FLATLINE_TOLERANCE_IN = 0.25
FLATLINE_MIN_SWE_IN = 1.0
MELT_SEASON_MMDD = ("06-01", "09-30")


def _in_melt_season(iso_day: str) -> bool:
    return MELT_SEASON_MMDD[0] <= iso_day[5:] <= MELT_SEASON_MMDD[1]


def _flat_run_start(series: list[dict[str, Any]], end: int) -> int:
    """Index where the flat run ending at `end` begins.

    Walking back from `end`, the run takes in every earlier reading for as
    long as the whole run stays inside the tolerance band.
    """
    low = high = float(series[end]["value"])
    start = end
    while start > 0:
        value = float(series[start - 1]["value"])
        if not FLATLINE_MIN_SWE_IN <= value <= SWE_CEILING_IN:
            break
        if max(high, value) - min(low, value) > FLATLINE_TOLERANCE_IN:
            break
        low, high = min(low, value), max(high, value)
        start -= 1
    return start


def fault_at(series: list[dict[str, Any]], i: int) -> tuple[str, int] | None:
    """The fault in reading i as it looked on its own day, or None.

    Returns (reason, index where the fault begins). Only readings up to i
    are consulted. A stuck run counts once a full week of it falls inside
    melt season, and from then on for as long as the value holds, so a
    sensor caught holding still through a week of summer stays rejected
    into the fall until it moves.
    """
    value = float(series[i]["value"])
    if value > SWE_CEILING_IN:
        return "ceiling", i
    if value < FLATLINE_MIN_SWE_IN:
        return None
    start = _flat_run_start(series, i)
    in_season = sum(_in_melt_season(o["observed_date"]) for o in series[start : i + 1])
    return ("flatline", start) if in_season >= FLATLINE_READINGS else None


def screen_swe(
    series: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Split one station's SWE readings into (believed, rejected).

    `series` is oldest first and ends at the day being judged, so nothing
    here looks into the future. Both lists come back oldest first. Each
    rejection is {"reading", "reason", "since"}: reason is "ceiling" or
    "flatline", and since is the first day of the stuck run for a flatline,
    the reading's own day for a ceiling.

    A stuck run is rejected whole, its first days included: they looked
    fine when they arrived, and by the day being judged they do not.
    """
    believed: list[dict[str, Any]] = []
    rejected: list[dict[str, Any]] = []
    i = len(series) - 1
    while i >= 0:
        fault = fault_at(series, i)
        if fault is None:
            believed.append(series[i])
            i -= 1
            continue
        reason, start = fault
        since = series[start]["observed_date"]
        rejected.extend(
            {"reading": o, "reason": reason, "since": since}
            for o in reversed(series[start : i + 1])
        )
        i = start - 1
    believed.reverse()
    rejected.reverse()
    return believed, rejected
