"""Reporter bias calibration.

A PCT thru-hiker's "fine" and a first-timer's "terrifying" can describe the
same snowfield. The extractor infers each reporter's experience register
from their language; this module remaps their comfort adjectives onto one
severity scale before fusion sees them.

Severity scale: 0 relaxed .. 3 terrifying, continuous after calibration.
- first_timer reports run hot: damp them downward
- thru_hiker reports run cold: understatement hides difficulty, push up
- experienced reports get a small upward nudge for the same reason
"""

from __future__ import annotations

EXPOSURE_BASE = {"relaxed": 0.0, "cautious": 1.0, "sketchy": 2.0, "terrifying": 3.0}

REGISTER_OFFSET = {
    "first_timer": -0.75,
    "thru_hiker": +0.5,
    "experienced": +0.25,
    "unknown": 0.0,
}


def calibrated_severity(
    exposure_comfort: str | None, reporter_register: str | None
) -> float | None:
    """Map (adjective, register) to a 0..3 severity, or None without an adjective."""
    if exposure_comfort is None or exposure_comfort not in EXPOSURE_BASE:
        return None
    base = EXPOSURE_BASE[exposure_comfort]
    offset = REGISTER_OFFSET.get(reporter_register or "unknown", 0.0)
    # A relaxed report stays relaxed no matter who wrote it; offsets apply
    # only once there is something to calibrate.
    if base == 0.0:
        return 0.0
    return max(0.0, min(3.0, base + offset))
