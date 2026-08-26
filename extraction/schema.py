"""The null-heavy extraction schema for trip-report posts.

Most posts answer only some fields; null is the honest default everywhere.
`quote_span` must be verbatim text from the post so every claim in the UI
can point at the sentence it came from.
"""

from __future__ import annotations

from typing import Any

SNOW_CONDITIONS = ["none", "patchy", "continuous", "deep"]
TRACTION = ["none", "microspikes", "crampons", "ice_axe", "spikes_and_axe"]
CROSSINGS = ["dry", "low", "knee_high", "thigh_high", "dangerous"]
EXPOSURE = ["relaxed", "cautious", "sketchy", "terrifying"]
REGISTERS = ["thru_hiker", "experienced", "first_timer", "unknown"]

EXTRACTION_JSON_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "required": [
        "location",
        "date_observed",
        "snow_condition",
        "traction_used",
        "crossing_condition",
        "exposure_comfort",
        "reporter_register",
        "quote_span",
    ],
    "properties": {
        "location": {
            "type": ["string", "null"],
            "description": "Pass or place name as written in the post, verbatim-ish",
        },
        "date_observed": {
            "type": ["string", "null"],
            "pattern": "^\\d{4}-\\d{2}-\\d{2}$",
            "description": "ISO date the conditions were observed, resolved from the "
            "post date when the author says things like 'yesterday'; null if unclear",
        },
        "snow_condition": {"type": ["string", "null"], "enum": [*SNOW_CONDITIONS, None]},
        "traction_used": {"type": ["string", "null"], "enum": [*TRACTION, None]},
        "crossing_condition": {"type": ["string", "null"], "enum": [*CROSSINGS, None]},
        "exposure_comfort": {"type": ["string", "null"], "enum": [*EXPOSURE, None]},
        "reporter_register": {"type": "string", "enum": REGISTERS},
        "quote_span": {
            "type": ["string", "null"],
            "description": "Short verbatim quote from the post backing the main claim",
        },
    },
}

FIELDS = list(EXTRACTION_JSON_SCHEMA["properties"].keys())

_ENUMS: dict[str, list[str]] = {
    "snow_condition": SNOW_CONDITIONS,
    "traction_used": TRACTION,
    "crossing_condition": CROSSINGS,
    "exposure_comfort": EXPOSURE,
}


def validate(record: Any) -> list[str]:
    """Return a list of problems; empty list means valid."""
    problems: list[str] = []
    if not isinstance(record, dict):
        return ["record is not an object"]
    for field in FIELDS:
        if field not in record:
            problems.append(f"missing field: {field}")
    for field, allowed in _ENUMS.items():
        value = record.get(field)
        if value is not None and value not in allowed:
            problems.append(f"{field}: {value!r} not in {allowed}")
    register = record.get("reporter_register")
    if register is not None and register not in REGISTERS:
        problems.append(f"reporter_register: {register!r} not in {REGISTERS}")
    for field in ("location", "quote_span"):
        value = record.get(field)
        if value is not None and not isinstance(value, str):
            problems.append(f"{field}: expected string or null")
    date = record.get("date_observed")
    if date is not None:
        import re

        if not isinstance(date, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date):
            problems.append(f"date_observed: {date!r} is not an ISO date")
    extra = set(record) - set(FIELDS)
    if extra:
        problems.append(f"unexpected fields: {sorted(extra)}")
    return problems
