"""LLM extraction over trip reports.

Conventions enforced here:
- model names come from config, never inline
- every call uses structured output against EXTRACTION_JSON_SCHEMA and is
  validated; one retry on invalid output, then that single call escalates
  to the bigger model and the escalation is logged
- results are cached by sha256 of the post text, so nothing is paid twice
- bulk work goes through the Batch API engine; the live endpoint is for
  single posts (the BYOK paste-a-report path)
- the system prompt is marked cacheable
- a per-run budget (LLM_BUDGET_USD) aborts the job before it overspends
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import subprocess
from typing import Any

from config import (
    ESCALATION_MODEL,
    EXTRACTION_MAX_TOKENS,
    EXTRACTION_MODEL,
    LLM_BUDGET_USD,
    PRICE_PER_MTOK,
)
from extraction.schema import EXTRACTION_JSON_SCHEMA, validate
from store import Store

log = logging.getLogger(__name__)

API_URL = "https://api.anthropic.com/v1/messages"
API_VERSION = "2023-06-01"

SYSTEM_PROMPT = """You extract structured trail conditions from backpacking trip reports.

Read the post and fill exactly one JSON record. Rules:
- null is the correct answer for any field the post does not clearly state. Most posts answer only some fields.
- location: the main pass or place the conditions describe, as the author wrote it.
- date_observed: the ISO date the conditions were seen. Resolve relative phrases ("yesterday", "on Saturday", "on the 16th") against the post date you are given. If you cannot resolve it confidently, use null.
- snow_condition: none | patchy | continuous | deep. "Snow free" is none. Isolated patches or fields you can avoid or shortly cross are patchy. Unbroken snow travel is continuous. Deep is continuous plus explicit depth or serious postholing/navigation.
- traction_used: what the author actually used or clearly states was needed: none | microspikes | crampons | ice_axe | spikes_and_axe. Carrying unused gear is none.
- crossing_condition: the most serious stream crossing described: dry | low | knee_high | thigh_high | dangerous. "Waist deep", linked arms, or real fear at a ford is dangerous.
- exposure_comfort: how the steep or snowy travel felt to the author: relaxed | cautious | sketchy | terrifying. If the author describes snow or steep travel and sounds untroubled ("no big deal", "pleasant", easy tone), that is relaxed. Hedged care ("take it slow", turned back, glad to have gear) is cautious. Use null only when the post says nothing about how the travel felt.
- reporter_register: judge ONLY from explicit markers, not tone. thru_hiker: trail names, NOBO/SOBO, resupply/mileage talk, thru-hike context. experienced: explicit history ("forty years in this range", "second big snow year") or technical mountaineering vocabulary in use (front pointing, self belay). first_timer: self-identified as new ("my first pass", "first long trail", never used an axe). Everything else, including calm competent tone with no markers, is unknown.
- quote_span: one short verbatim quote from the post that best supports the snow or crossing claim.

Output only the JSON record."""


class BudgetExceededError(RuntimeError):
    pass


class ExtractionFailed(RuntimeError):
    pass


class Budget:
    """Tracks estimated spend across one run."""

    def __init__(self, limit_usd: float = LLM_BUDGET_USD) -> None:
        self.limit = limit_usd
        self.spent = 0.0

    def charge(self, model: str, tokens_in: int, tokens_out: int) -> None:
        p_in, p_out = PRICE_PER_MTOK.get(model, (3.0, 15.0))
        self.spent += tokens_in / 1e6 * p_in + tokens_out / 1e6 * p_out
        if self.spent > self.limit:
            raise BudgetExceededError(
                f"LLM budget exceeded: spent ~${self.spent:.2f} of ${self.limit:.2f} "
                "(raise LLM_BUDGET_USD to continue)"
            )


# Bumping this invalidates every cached extraction: the cache key must change
# whenever the prompt or schema changes, or stale reads linger forever.
PROMPT_VERSION = "v2"


def post_hash(text: str) -> str:
    return hashlib.sha256(f"{PROMPT_VERSION}:{text}".encode()).hexdigest()


def build_user_prompt(post: dict[str, Any], problems: list[str] | None = None) -> str:
    parts = [
        f"Post date: {post.get('posted_date') or 'unknown'}",
        f"Source: {post.get('source', 'unknown')}",
        f"Title: {post.get('title', '')}",
        "",
        post["text"],
    ]
    if problems:
        parts += [
            "",
            "Your previous answer was invalid: " + "; ".join(problems),
            "Return a corrected JSON record.",
        ]
    return "\n".join(parts)


def _parse_json_reply(text: str) -> Any:
    cleaned = re.sub(r"^```(?:json)?\s*|\s*```$", "", text.strip())
    return json.loads(cleaned)


# -- engines ---------------------------------------------------------------


def _call_api(model: str, user_prompt: str) -> tuple[Any, int, int]:
    """Live endpoint with forced structured output via tool use."""
    import requests

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise ExtractionFailed("ANTHROPIC_API_KEY is not set; use engine='cli' or set the key")
    body = {
        "model": model,
        "max_tokens": EXTRACTION_MAX_TOKENS,
        "system": [{"type": "text", "text": SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}],
        "messages": [{"role": "user", "content": user_prompt}],
        "tools": [
            {
                "name": "record_extraction",
                "description": "Record the structured extraction",
                "input_schema": EXTRACTION_JSON_SCHEMA,
            }
        ],
        "tool_choice": {"type": "tool", "name": "record_extraction"},
    }
    resp = requests.post(
        API_URL,
        json=body,
        headers={"x-api-key": api_key, "anthropic-version": API_VERSION},
        timeout=120,
    )
    resp.raise_for_status()
    data = resp.json()
    usage = data.get("usage", {})
    record = None
    for block in data.get("content", []):
        if block.get("type") == "tool_use":
            record = block.get("input")
    return record, usage.get("input_tokens", 0), usage.get("output_tokens", 0)


def _call_cli(model: str, user_prompt: str) -> tuple[Any, int, int]:
    """Claude Code CLI shim: same contract, no API key needed locally."""
    prompt = (
        SYSTEM_PROMPT
        + "\n\nThe JSON schema:\n"
        + json.dumps(EXTRACTION_JSON_SCHEMA)
        + "\n\n---\n"
        + user_prompt
    )
    proc = subprocess.run(
        ["claude", "-p", "--model", model, "--output-format", "json"],
        input=prompt,
        capture_output=True,
        text=True,
        timeout=600,
        check=False,
    )
    if proc.returncode != 0:
        raise ExtractionFailed(f"claude CLI failed: {proc.stderr[:300]}")
    reply = json.loads(proc.stdout)
    usage = reply.get("usage", {})
    try:
        record = _parse_json_reply(reply.get("result", ""))
    except json.JSONDecodeError:
        record = None
    return record, usage.get("input_tokens", 0), usage.get("output_tokens", 0)


_ENGINES = {"api": _call_api, "cli": _call_cli}


def run_extraction(
    post: dict[str, Any],
    engine: str = "api",
    budget: Budget | None = None,
) -> tuple[dict[str, Any], str, int, int]:
    """The uncached call path: one call per post, one retry on invalid
    output, then a single escalated call on the bigger model.

    Returns (record, model_used, tokens_in, tokens_out). Thread-safe: no
    store access, so bulk runners can fan this out and persist centrally.
    """
    call = _ENGINES[engine]
    budget = budget or Budget()
    h = post_hash(post["text"])
    tokens_in_total = 0
    tokens_out_total = 0
    model_used = EXTRACTION_MODEL
    problems: list[str] | None = None
    record = None
    for attempt, model in enumerate((EXTRACTION_MODEL, EXTRACTION_MODEL, ESCALATION_MODEL)):
        record, t_in, t_out = call(model, build_user_prompt(post, problems))
        tokens_in_total += t_in
        tokens_out_total += t_out
        budget.charge(model, t_in, t_out)
        problems = validate(record)
        model_used = model
        if not problems:
            break
        if attempt == 1:
            log.warning(
                "extraction escalating to %s for post %s: %s",
                ESCALATION_MODEL, post.get("id", h[:8]), problems,
            )
    if problems:
        raise ExtractionFailed(f"invalid extraction after escalation: {problems}")
    log.info(
        "extracted %s via %s (%s): in=%d out=%d",
        post.get("id", h[:8]), engine, model_used, tokens_in_total, tokens_out_total,
    )
    assert record is not None
    return record, model_used, tokens_in_total, tokens_out_total


def extract_post(
    post: dict[str, Any],
    store: Store,
    engine: str = "api",
    budget: Budget | None = None,
) -> dict[str, Any]:
    """Extract one post, cached by content hash so nothing is paid twice."""
    h = post_hash(post["text"])
    cached = store.get_extraction(h)
    if cached:
        return cached["extraction"]
    record, model_used, t_in, t_out = run_extraction(post, engine, budget)
    store.put_extraction(
        h,
        {k: post.get(k) for k in ("id", "source", "url", "author", "posted_date", "title")},
        record,
        model_used,
        t_in,
        t_out,
    )
    return record


def submit_batch(posts: list[dict[str, Any]]) -> str:
    """Bulk extraction through the Batch API (50 percent off the live price).

    Returns the batch id; poll_batch() collects results into the store.
    """
    import requests

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise ExtractionFailed("ANTHROPIC_API_KEY is not set")
    requests_payload = [
        {
            "custom_id": post_hash(p["text"]),
            "params": {
                "model": EXTRACTION_MODEL,
                "max_tokens": EXTRACTION_MAX_TOKENS,
                "system": [
                    {
                        "type": "text",
                        "text": SYSTEM_PROMPT,
                        "cache_control": {"type": "ephemeral"},
                    }
                ],
                "messages": [{"role": "user", "content": build_user_prompt(p)}],
                "tools": [
                    {
                        "name": "record_extraction",
                        "description": "Record the structured extraction",
                        "input_schema": EXTRACTION_JSON_SCHEMA,
                    }
                ],
                "tool_choice": {"type": "tool", "name": "record_extraction"},
            },
        }
        for p in posts
    ]
    resp = requests.post(
        "https://api.anthropic.com/v1/messages/batches",
        json={"requests": requests_payload},
        headers={"x-api-key": api_key, "anthropic-version": API_VERSION},
        timeout=120,
    )
    resp.raise_for_status()
    return str(resp.json()["id"])
