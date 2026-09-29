"""Highway chain controls and pass closures, linked to passes. Pure logic.

Three agencies publish in three shapes; each parser turns its feed into the
same record and copies the agency's wording untouched:

    agency, agency_link, road, location, lat, lon, updated, active,
    lines: [{label, code, text}]

"active" only says the agency reports a restriction, advisory or closure in
effect. What the restriction is stays in the agency's own words. A record
that cannot be placed or read is dropped, never repaired by guessing.
"""

from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from typing import Any

from ingest.geo import haversine_km

# A control point within NEAR_KM is on or beside the pass. One that names
# the pass ("SNOW PARK - SONORA PASS" is the gate 20 miles below the summit)
# links from as far as NAMED_KM, which still keeps US 12's White Pass away
# from the White Pass in the Glacier Peak Wilderness.
NEAR_KM = 8.0
NAMED_KM = 40.0
MAX_ROADS = 4
KM_PER_MI = 1.609344
CM_PER_IN = 2.54

CALTRANS_LINK = "https://roads.dot.ca.gov/"
WSDOT_LINK = "https://wsdot.com/travel/real-time/mountainpasses"
TRIPCHECK_LINK = "https://www.tripcheck.com/"

CALTRANS_NO_CONTROLS = "R-0"
_CALTRANS_CODE = re.compile(r"[A-Z]{1,3}-?\d?")
_WSDOT_DATE = re.compile(r"/Date\((-?\d+)([+-]\d{4})?\)/")
_WSDOT_ROAD = re.compile(r"\b(I-\d+|US \d+|SR \d+)\b")
_NOTHING = {
    "", "none", "no restrictions", "no restriction", "not reported",
    "no current information available", "no current information",
}


def _text(value: object) -> str | None:
    return value.strip() or None if isinstance(value, str) else None


def _position(lat: object, lon: object) -> tuple[float, float] | None:
    """A position on the West Coast, or None. (0, 0) and "Not Reported" are
    both how upstreams say they do not know."""
    try:
        la, lo = float(lat), float(lon)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    if not (30.0 <= la <= 50.0 and -126.0 <= lo <= -113.0):
        return None
    return round(la, 5), round(lo, 5)


def parse_caltrans(doc: object) -> list[dict[str, Any]]:
    """Chain control points from one district's ccStatus feed. The two
    directions at one named place become one record with a line each."""
    rows = doc.get("data") if isinstance(doc, dict) else None
    grouped: dict[tuple[str, str], dict[str, Any]] = {}
    for row in rows if isinstance(rows, list) else []:
        cc = row.get("cc") if isinstance(row, dict) else None
        if not isinstance(cc, dict) or cc.get("inService") != "true":
            continue
        loc = cc.get("location") or {}
        status = cc.get("statusData") or {}
        code = _text(status.get("status"))
        text = _text(status.get("statusDescription"))
        name = _text(loc.get("locationName"))
        road = _text(loc.get("route"))
        position = _position(loc.get("latitude"), loc.get("longitude"))
        if not (code and text and name and road and position):
            continue
        if not _CALTRANS_CODE.fullmatch(code):
            continue
        stamp = status.get("statusTimestamp") or {}
        day, clock = _text(stamp.get("statusDate")), _text(stamp.get("statusTime"))
        updated = f"{day}T{clock}" if day and clock else None
        direction = _text(loc.get("direction"))
        record = grouped.setdefault(
            (road, name),
            {
                "agency": "Caltrans",
                "agency_link": CALTRANS_LINK,
                "road": road,
                "location": name,
                "lat": position[0],
                "lon": position[1],
                "active": False,
                "updated": None,
                "lines": [],
            },
        )
        line = {"label": direction if direction != "*" else None, "code": code, "text": text}
        if line not in record["lines"]:
            record["lines"].append(line)
        record["active"] = record["active"] or code != CALTRANS_NO_CONTROLS
        if updated and (record["updated"] is None or updated > record["updated"]):
            record["updated"] = updated
    return list(grouped.values())


def _wsdot_date(value: object) -> str | None:
    m = _WSDOT_DATE.fullmatch(value) if isinstance(value, str) else None
    if not m:
        return None
    offset = m.group(2) or "+0000"
    sign = -1 if offset[0] == "-" else 1
    tz = timezone(sign * timedelta(hours=int(offset[1:3]), minutes=int(offset[3:5])))
    try:
        return datetime.fromtimestamp(int(m.group(1)) / 1000, tz).isoformat(timespec="seconds")
    except (OverflowError, OSError, ValueError):
        return None


def parse_wsdot(doc: object) -> list[dict[str, Any]]:
    """Mountain pass reports from the WSDOT Traveler Information API."""
    out = []
    for row in doc if isinstance(doc, list) else []:
        if not isinstance(row, dict):
            continue
        name = _text(row.get("MountainPassName"))
        position = _position(row.get("Latitude"), row.get("Longitude"))
        if not name or not position:
            continue
        lines = [
            {"label": label, "code": None, "text": text}
            for label, text in (
                ("Road", _text(row.get("RoadCondition"))),
                ("Weather", _text(row.get("WeatherCondition"))),
            )
            if text
        ]
        restricted = False
        for key in ("RestrictionOne", "RestrictionTwo"):
            r = row.get(key)
            text = _text(r.get("RestrictionText")) if isinstance(r, dict) else None
            if not text:
                continue
            lines.append(
                {"label": _text(r.get("TravelDirection")), "code": None, "text": text}
            )
            restricted = restricted or text.lower().rstrip(".") not in _NOTHING
        if not lines:
            continue
        road = _WSDOT_ROAD.search(name)
        out.append(
            {
                "agency": "WSDOT",
                "agency_link": WSDOT_LINK,
                "road": road.group(1) if road else None,
                "location": name,
                "lat": position[0],
                "lon": position[1],
                # The feed's own TravelAdvisoryActive flag is set on nearly every
                # pass all summer; only the restriction text says anything.
                "active": restricted,
                "updated": _wsdot_date(row.get("DateUpdated")),
                "lines": lines,
            }
        )
    return out


def _lookup(meta: object, list_key: str, id_key: str, desc_key: str) -> dict[str, str]:
    """ODOT's own id -> description table from RW/Metadata."""
    items = meta.get("road-weather-items") if isinstance(meta, dict) else None
    rows = items.get(list_key) if isinstance(items, dict) else None
    table = {}
    for row in rows if isinstance(rows, list) else []:
        if isinstance(row, dict) and row.get(id_key) is not None and _text(row.get(desc_key)):
            table[_id(row[id_key])] = row[desc_key].strip()
    return table


def _id(value: object) -> str:
    # Numeric ids arrive as 7 in one document and 7.0 in the other.
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value).strip()


def _inches(cm: object, digits: int) -> float | int | None:
    if isinstance(cm, bool) or not isinstance(cm, int | float) or cm <= 0:
        return None
    return round(cm / CM_PER_IN, digits) if digits else round(cm / CM_PER_IN)


def parse_tripcheck(reports: object, meta: object) -> list[dict[str, Any]]:
    """Road and weather reports from ODOT TripCheck. Reports carry ids; the
    words come from ODOT's metadata table, and an id the table does not
    explain is left out."""
    rows = reports.get("road-weather-reports") if isinstance(reports, dict) else None
    road_words = _lookup(meta, "road-condition-list", "road-cond-id", "road-cond-desc")
    weather_words = _lookup(meta, "weather-condition-list", "weather-id", "weather-desc")
    limit_words = _lookup(meta, "driving-restriction-list", "restriction-id", "restriction-desc")
    out = []
    for row in rows if isinstance(rows, list) else []:
        loc = row.get("location") if isinstance(row, dict) else None
        if not isinstance(loc, dict):
            continue
        start = loc.get("start-location") or {}
        name = _text(loc.get("location-name"))
        position = _position(start.get("start-lat"), start.get("start-long"))
        if not name or not position:
            continue
        lines = []
        for label, key, id_key, words in (
            ("Road", "road-conditions", "road-cond-id", road_words),
            ("Weather", "weather-conditions", "weather-id", weather_words),
        ):
            part = row.get(key)
            ident = part.get(id_key) if isinstance(part, dict) else None
            if ident is not None and _id(ident) in words:
                lines.append({"label": label, "code": None, "text": words[_id(ident)]})
        active = False
        limit = row.get("driving-restriction")
        ident = limit.get("restriction-id") if isinstance(limit, dict) else None
        if ident is not None and _id(ident) in limit_words:
            text = limit_words[_id(ident)]
            lines.append({"label": "Restriction", "code": _id(ident), "text": text})
            active = text.lower().rstrip(".") not in _NOTHING
        comment = _text(row.get("comments"))
        if comment:
            lines.append({"label": "Crew comment", "code": None, "text": comment})
        if not lines:
            continue
        record: dict[str, Any] = {
            "agency": "ODOT TripCheck",
            "agency_link": TRIPCHECK_LINK,
            "road": _text(loc.get("route-id")),
            "location": name,
            "lat": position[0],
            "lon": position[1],
            "active": active,
            "updated": _text(row.get("entry-time")),
            "lines": lines,
        }
        new_snow = _inches(row.get("snowfall-accum-rate"), 1)
        roadside = _inches(row.get("adjacent-snow-depth"), 0)
        if new_snow is not None:
            record["new_snow_in"] = new_snow
        if roadside is not None:
            record["roadside_snow_in"] = roadside
        out.append(record)
    return out


def shape(doc: object, depth: int = 4) -> object:
    """The key names and value types of a payload, for the log when a feed
    does not match what the parser expects. Never the values themselves."""
    if isinstance(doc, dict):
        if depth == 0:
            return "dict"
        items = sorted(doc.items(), key=lambda kv: str(kv[0]))
        return {str(k): shape(v, depth - 1) for k, v in items}
    if isinstance(doc, list):
        return [shape(doc[0], depth - 1)] if doc and depth else []
    return type(doc).__name__


def _norm(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", text.lower()).strip()


def _names(pass_name: str, location: str) -> bool:
    """The location carries the pass's whole name. One-word names ("Summit")
    are too common on road signs to identify anything."""
    name = _norm(pass_name)
    if len(name.split()) < 2:
        return False
    return re.search(rf"\b{re.escape(name)}\b", _norm(location)) is not None


def link_roads(
    pass_: dict[str, Any], statuses: list[dict[str, Any]], limit: int = MAX_ROADS
) -> list[dict[str, Any]]:
    """Road reports on or near one pass. Restrictions in effect come first so
    the cap can never drop one; then reports naming the pass; then nearest."""
    lat, lon = pass_["lat"], pass_["lon"]
    band = NAMED_KM / 110.0
    hits = []
    for status in statuses:
        if abs(status["lat"] - lat) > band:
            continue
        km = haversine_km(lat, lon, status["lat"], status["lon"])
        named = km <= NAMED_KM and _names(pass_["name"], status["location"])
        if km <= NEAR_KM or named:
            hits.append((not status["active"], not named, km, status, named))
    hits.sort(key=lambda hit: hit[:3])
    return [
        {**status, "distance_mi": round(km / KM_PER_MI, 1), "named": named}
        for _, _, km, status, named in hits[:limit]
    ]
