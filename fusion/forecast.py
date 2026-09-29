"""Seven days of weather at pass elevation, from a National Weather Service
forecast grid. Pure logic, no I/O: raw gridpoint layers in, a per-day
summary and plain-language headline facts out.

NWS grid values are intervals ("2026-10-03T14:00:00+00:00/PT6H"). Each is
spread across the local (Pacific) calendar days it touches, so a 6-hour
snowfall that straddles midnight lands on both days in proportion.
"""

from __future__ import annotations

import re
from datetime import date, datetime, timedelta
from typing import Any
from zoneinfo import ZoneInfo

PACIFIC = ZoneInfo("America/Los_Angeles")
DAYS = 7
# Standard environmental lapse rate: the grid cell sits at its own average
# elevation, and a pass above it runs colder.
LAPSE_F_PER_1000FT = 3.5
M_TO_FT = 3.28084
MM_TO_IN = 1 / 25.4
KMH_TO_MPH = 0.621371

SNOW_POP_MIN = 30
THUNDER_MIN = 25
GUST_MIN_MPH = 45

_DURATION = re.compile(r"P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?")


def parse_interval(valid_time: str) -> tuple[datetime, datetime]:
    """'2026-10-03T14:00:00+00:00/PT6H' -> (start, end), timezone-aware."""
    start_s, dur_s = valid_time.split("/")
    start = datetime.fromisoformat(start_s)
    m = _DURATION.fullmatch(dur_s)
    if not m:
        raise ValueError(f"unsupported duration {dur_s!r}")
    d, h, mins = (int(g) if g else 0 for g in m.groups())
    return start, start + timedelta(days=d, hours=h, minutes=mins)


def _split_by_day(start: datetime, end: datetime) -> list[tuple[date, float]]:
    """(local day, fraction of the interval falling on it)."""
    total = (end - start).total_seconds()
    if total <= 0:
        return []
    out: list[tuple[date, float]] = []
    cur = start.astimezone(PACIFIC)
    stop = end.astimezone(PACIFIC)
    while cur < stop:
        next_midnight = datetime.combine(
            cur.date() + timedelta(days=1), datetime.min.time(), PACIFIC
        )
        seg_end = min(next_midnight, stop)
        out.append((cur.date(), (seg_end - cur).total_seconds() / total))
        cur = seg_end
    return out


def _layer(grid: dict[str, Any], name: str) -> list[dict[str, Any]]:
    layer = grid.get(name) or {}
    return [v for v in layer.get("values", []) if v.get("value") is not None]


def summarize(
    grid: dict[str, Any], pass_elevation_ft: float, today: date
) -> list[dict[str, Any]]:
    """Per-day forecast at the pass for today plus the next six days."""
    grid_elev_ft = float((grid.get("elevation") or {}).get("value") or 0.0) * M_TO_FT
    lapse_f = (pass_elevation_ft - grid_elev_ft) / 1000.0 * LAPSE_F_PER_1000FT
    days = [today + timedelta(days=i) for i in range(DAYS)]
    acc: dict[date, dict[str, Any]] = {
        d: {"hi": None, "lo": None, "snow_level": None, "pop": 0, "snow_mm": 0.0,
            "thunder": 0, "gust_kmh": 0.0}
        for d in days
    }

    def each(name: str):  # noqa: ANN202 - small local generator
        for v in _layer(grid, name):
            start, end = parse_interval(v["validTime"])
            for d, frac in _split_by_day(start, end):
                if d in acc:
                    yield d, float(v["value"]), frac

    for d, c, _ in each("temperature"):
        f = c * 9 / 5 + 32 - lapse_f
        a = acc[d]
        a["hi"] = f if a["hi"] is None else max(a["hi"], f)
        a["lo"] = f if a["lo"] is None else min(a["lo"], f)
    for d, m, _ in each("snowLevel"):
        ft = m * M_TO_FT
        a = acc[d]
        a["snow_level"] = ft if a["snow_level"] is None else min(a["snow_level"], ft)
    for d, p, _ in each("probabilityOfPrecipitation"):
        acc[d]["pop"] = max(acc[d]["pop"], p)
    for d, mm, frac in each("snowfallAmount"):
        acc[d]["snow_mm"] += mm * frac
    for d, p, _ in each("probabilityOfThunder"):
        acc[d]["thunder"] = max(acc[d]["thunder"], p)
    for d, k, _ in each("windGust"):
        acc[d]["gust_kmh"] = max(acc[d]["gust_kmh"], k)

    out = []
    for d in days:
        a = acc[d]
        out.append(
            {
                "date": d.isoformat(),
                "high_f": round(a["hi"]) if a["hi"] is not None else None,
                "low_f": round(a["lo"]) if a["lo"] is not None else None,
                "snow_level_ft": (
                    round(a["snow_level"], -2) if a["snow_level"] is not None else None
                ),
                "precip_chance": round(a["pop"]),
                "snowfall_in": round(a["snow_mm"] * MM_TO_IN, 1),
                "thunder_chance": round(a["thunder"]),
                "gust_mph": round(a["gust_kmh"] * KMH_TO_MPH),
            }
        )
    return out


def _day_name(iso: str, today: date) -> str:
    d = date.fromisoformat(iso)
    if d == today:
        return "today"
    if d == today + timedelta(days=1):
        return "tomorrow"
    return d.strftime("%A")


def headline(days: list[dict[str, Any]], pass_elevation_ft: float, today: date) -> list[str]:
    """Up to two plain-language facts about the week ahead at the pass."""
    facts: list[str] = []
    snowy = [
        d for d in days
        if d["snow_level_ft"] is not None
        and d["snow_level_ft"] < pass_elevation_ft
        and d["precip_chance"] >= SNOW_POP_MIN
    ]
    if snowy:
        d = min(snowy, key=lambda d: d["snow_level_ft"])
        amount = f", about {d['snowfall_in']} in on the grid" if d["snowfall_in"] >= 0.5 else ""
        facts.append(
            f"New snow possible {_day_name(d['date'], today)}: the forecast snow level drops to "
            f"{int(d['snow_level_ft']):,} ft, below the pass, with a {d['precip_chance']}% chance "
            f"of precipitation{amount}."
        )
    stormy = [d for d in days if d["thunder_chance"] >= THUNDER_MIN]
    if stormy:
        d = max(stormy, key=lambda d: d["thunder_chance"])
        facts.append(
            f"Thunderstorms possible {_day_name(d['date'], today)} "
            f"({d['thunder_chance']}% chance); exposed passes are no place to be in lightning."
        )
    windy = [d for d in days if d["gust_mph"] >= GUST_MIN_MPH]
    if windy and len(facts) < 2:
        d = max(windy, key=lambda d: d["gust_mph"])
        facts.append(f"Strong wind {_day_name(d['date'], today)}, gusts near {d['gust_mph']} mph.")
    if not facts:
        highs = [d["high_f"] for d in days if d["high_f"] is not None]
        if highs:
            avg = round(sum(highs) / len(highs))
            facts.append(
                "No snow or storms in the forecast this week; "
                f"highs near {avg}°F at pass elevation."
            )
    return facts[:2]
