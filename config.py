"""Single source of truth for models, budgets, and paths.

Global convention: model names live here and nowhere else.
"""

from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
RAW_DIR = DATA_DIR / "raw"
CACHE_DIR = DATA_DIR / "cache"
EXTRACTIONS_DIR = DATA_DIR / "extractions"
EXTRACTIONS_CACHE = EXTRACTIONS_DIR / "cache.jsonl"
DB_PATH = DATA_DIR / "sierra.sqlite"
WEB_DATA_DIR = ROOT / "web" / "public" / "data"

# Demo streams. The project began as a demo with two stand-ins for streams it
# could not yet read: a corpus of trip reports written for the demo, and a
# snow cover figure modeled from the nearest snow sensor. Neither observed a
# pass, and the modeled cover is the sensor counted a second time, so they
# stay out of every verdict, confidence score and ledger by default. Setting
# SNOWLINE_DEMO_STREAMS=1 brings both back, for local demos and for running
# the report and cover code paths end to end. Nothing public sets it.
DEMO_STREAMS_ENV = "SNOWLINE_DEMO_STREAMS"


def demo_streams() -> bool:
    """Whether sample reports and modeled cover may feed the export."""
    return os.environ.get(DEMO_STREAMS_ENV) == "1"


# LLM configuration. Default model for in-app calls is Haiku; a single failed
# structured-output call (after one retry) escalates to Sonnet and is logged.
EXTRACTION_MODEL = "claude-haiku-4-5"
ESCALATION_MODEL = "claude-sonnet-5"
EXTRACTION_MAX_TOKENS = 1024

# Per-run cost ceiling. Jobs abort with a clear error rather than exceed it.
LLM_BUDGET_USD = float(os.environ.get("LLM_BUDGET_USD", "2.00"))

# $/MTok for budget accounting (haiku input/output, sonnet input/output).
PRICE_PER_MTOK = {
    "claude-haiku-4-5": (1.0, 5.0),
    "claude-sonnet-5": (3.0, 15.0),
}

# External fetch behavior: every fetch gets a timeout, one retry with backoff,
# and a cached fallback so the pipeline degrades instead of crashing.
FETCH_TIMEOUT_S = 30
FETCH_RETRY_BACKOFF_S = 2.0

# Station directories (which gauges and snow sensors exist) change on the
# scale of years, and the USGS site service can take minutes to answer. They
# are snapshotted in git, refreshed weekly, and served from the snapshot
# whenever the live directory is slow, down, or suspiciously short.
STATIONS_DIR = DATA_DIR / "stations"

# The coverage region. Directory snapshots are named after it, so widening
# the region can never be answered by a snapshot of the old footprint.
REGION = "west-coast"
REGION_STATES = ("CA", "OR", "WA")
DIRECTORY_TIMEOUT_S = 120
DIRECTORY_MAX_AGE_DAYS = 7
DIRECTORY_MIN_KEEP_FRAC = 0.9

AWDB_BASE = "https://wcc.sc.egov.usda.gov/awdbRestApi/services/v1"
NWIS_IV_BASE = "https://waterservices.usgs.gov/nwis/iv/"
