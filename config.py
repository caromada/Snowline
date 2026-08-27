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

AWDB_BASE = "https://wcc.sc.egov.usda.gov/awdbRestApi/services/v1"
NWIS_IV_BASE = "https://waterservices.usgs.gov/nwis/iv/"
