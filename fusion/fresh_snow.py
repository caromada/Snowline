"""New snow at a pass, from the snow sensors linked to it. Pure logic, no I/O.

A snow pillow weighs the water in the snowpack once a day. New snow adds
water, but so does rain soaking into old snow, and a pillow on bare ground
drifts by itself: across four summers of this project's own store, 1.4% of
CDEC station-days rose 0.3 in or more with no snow anywhere. So a rise is
reported as new snow only when all of this holds:

- snow water rose at least SWE_MIN_IN over the window. That is three steps
  of a SNOTEL pillow's 0.1 in resolution, about 3 in of snow at 10% density;
- the station's own snow depth rose at least DEPTH_MIN_IN over the same
  window, or, where the station has no depth sensor, a second station linked
  to the same pass also qualifies over that window;
- the rise is physically possible (MAX_GAIN_IN_PER_DAY).

Anything less is left out. Absence of a fact here is not a claim that no
snow fell, only that the sensors did not show it.
"""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

SWE_MIN_IN = 0.3
DEPTH_MIN_IN = 1.0
# Wetter than any 24 hours on record at a Sierra or Cascade pillow.
MAX_GAIN_IN_PER_DAY = 10.0
# Daily values post the morning after; two days covers a late upstream.
MAX_AGE_DAYS = 2
WINDOWS: tuple[tuple[str, int], ...] = (("24h", 1), ("72h", 3))
FORECAST_DAYS = 3
KM_PER_MI = 1.609344


def _series(rows: list[dict[str, Any]], metric: str, today: date) -> dict[str, float]:
    """date -> value, later rows winning, nothing dated past today.

    Readings below zero are a pillow drifting on bare ground and count as
    zero, so drift recovering to zero never reads as a gain.
    """
    out: dict[str, float] = {}
    limit = today.isoformat()
    for r in rows:
        if r.get("metric") == metric and r.get("value") is not None:
            if str(r["observed_date"]) <= limit:
                out[str(r["observed_date"])] = max(0.0, float(r["value"]))
    return out


def station_change(rows: list[dict[str, Any]], today: date) -> dict[str, Any] | None:
    """Measured change at one station over each window, counted back from
    its latest reading. None when the station has nothing current."""
    swe = _series(rows, "swe_in", today)
    if not swe:
        return None
    latest = max(swe)
    if (today - date.fromisoformat(latest)).days > MAX_AGE_DAYS:
        return None
    depth = _series(rows, "snow_depth_in", today)
    out: dict[str, Any] = {"as_of": latest, "swe_in": round(swe[latest], 2)}
    for label, days in WINDOWS:
        base = (date.fromisoformat(latest) - timedelta(days=days)).isoformat()
        out[f"swe_{label}_in"] = round(swe[latest] - swe[base], 2) if base in swe else None
        out[f"depth_{label}_in"] = (
            round(depth[latest] - depth[base]) if latest in depth and base in depth else None
        )
    return out


def _verdict(change: dict[str, Any], label: str, days: int) -> str | None:
    """'depth' when the station's own depth confirms the rise, 'pending'
    when it has no depth to ask, None when there is no rise to report."""
    swe = change[f"swe_{label}_in"]
    if swe is None or swe < SWE_MIN_IN or swe > MAX_GAIN_IN_PER_DAY * days:
        return None
    depth = change[f"depth_{label}_in"]
    if depth is None:
        return "pending"
    return "depth" if depth >= DEPTH_MIN_IN else None


def _short(iso: str) -> str:
    d = date.fromisoformat(iso)
    return f"{d.strftime('%b')} {d.day}"


def _gain(entry: dict[str, Any], label: str, long_form: bool) -> str:
    water = "snow water" if long_form else "water"
    depth = "snow depth" if long_form else "depth"
    text = f"{entry[f'swe_{label}_in']} in of {water}"
    if entry[f"depth_{label}_in"] is not None:
        text += f" and {entry[f'depth_{label}_in']} in of {depth}"
    return text


def _station_fact(entry: dict[str, Any]) -> str:
    where = ", ".join(
        bit
        for bit in (
            f"{entry['elevation_ft']:,} ft" if entry["elevation_ft"] else None,
            f"{entry['distance_mi']} mi away",
        )
        if bit
    )
    head = f"{entry['name']} ({where}) gained "
    until = _short(entry["as_of"])
    if entry["swe_24h_in"] is None:
        return f"{head}{_gain(entry, '72h', True)} in the 72 hours to {until}."
    fact = f"{head}{_gain(entry, '24h', True)} in the 24 hours to {until}"
    if entry["swe_72h_in"] is not None:
        fact += f"; {_gain(entry, '72h', False)} over 72 hours"
    return fact + "."


def forecast_snow(
    forecast: dict[str, Any] | None, issued_for: str | None, today: date
) -> dict[str, Any] | None:
    """Snowfall the NWS grid carries for today and the two days after, or
    None when the forecast is missing, older than a day, or carries no snow."""
    if not forecast or not issued_for:
        return None
    try:
        age = (today - date.fromisoformat(issued_for)).days
    except ValueError:
        return None
    if age < 0 or age > 1:
        return None
    last = (today + timedelta(days=FORECAST_DAYS - 1)).isoformat()
    days = [
        d
        for d in forecast.get("days", [])
        if today.isoformat() <= str(d.get("date")) <= last and d.get("snowfall_in") is not None
    ]
    total = round(sum(float(d["snowfall_in"]) for d in days), 1)
    if total <= 0:
        return None
    return {
        "from": min(str(d["date"]) for d in days),
        "through": max(str(d["date"]) for d in days),
        "total_in": total,
        "source": forecast.get("source"),
    }


def _forecast_fact(forecast: dict[str, Any]) -> str:
    span = (
        f"on {_short(forecast['from'])}"
        if forecast["from"] == forecast["through"]
        else f"from {_short(forecast['from'])} through {_short(forecast['through'])}"
    )
    return f"National Weather Service forecast: {forecast['total_in']} in of snow {span}."


def fresh_snow(
    stations: list[dict[str, Any]],
    today: date,
    forecast: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    """New snow at one pass. Each station is its link record (provenance,
    name, elevation_ft, distance_km) plus its store rows under "rows"."""
    current = []
    for st in sorted(stations, key=lambda s: s["distance_km"]):
        change = station_change(st["rows"], today)
        if change:
            current.append((st, change))
    if not current and not forecast:
        return None

    verdicts = {
        label: [_verdict(change, label, days) for _, change in current]
        for label, days in WINDOWS
    }
    entries = []
    for i, (st, change) in enumerate(current):
        entry: dict[str, Any] = {
            "provenance": st["provenance"],
            "name": st["name"],
            "elevation_ft": round(st["elevation_ft"]) if st.get("elevation_ft") else None,
            "distance_mi": round(st["distance_km"] / KM_PER_MI, 1),
            "as_of": change["as_of"],
            "confirmed_by": None,
        }
        for label, _ in WINDOWS:
            verdict = verdicts[label][i]
            others = [v for j, v in enumerate(verdicts[label]) if j != i and v]
            confirmed = verdict == "depth" or (verdict == "pending" and bool(others))
            entry[f"swe_{label}_in"] = change[f"swe_{label}_in"] if confirmed else None
            entry[f"depth_{label}_in"] = (
                change[f"depth_{label}_in"] if confirmed and verdict == "depth" else None
            )
            if confirmed and entry["confirmed_by"] is None:
                entry["confirmed_by"] = "depth" if verdict == "depth" else "nearby station"
        if entry["confirmed_by"]:
            entries.append(entry)

    as_of = max((change["as_of"] for _, change in current), default=None)
    facts = [_station_fact(e) for e in entries]
    if current and not entries:
        n = len(current)
        facts.append(
            f"No new snow measured at the {n} nearby station{'' if n == 1 else 's'} "
            f"in the 72 hours to {_short(str(as_of))}."
        )
    if forecast:
        facts.append(_forecast_fact(forecast))
    return {
        "as_of": as_of,
        "stations_checked": len(current),
        "stations": entries,
        "forecast": forecast,
        "facts": facts,
    }
