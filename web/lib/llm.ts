// BYOK client. The key lives in the visitor's localStorage only and travels
// nowhere except to Anthropic. Model names live here and nowhere else.

import type { Extraction } from "./types";

export const EXTRACTION_MODEL = "claude-haiku-4-5";

const API_URL = "https://api.anthropic.com/v1/messages";
const API_VERSION = "2023-06-01";
const KEY_STORAGE = "sierra-pass-report:api-key";

export function getStoredKey(): string | null {
  try {
    return window.localStorage.getItem(KEY_STORAGE);
  } catch {
    return null;
  }
}

export function setStoredKey(key: string): void {
  try {
    if (key) window.localStorage.setItem(KEY_STORAGE, key);
    else window.localStorage.removeItem(KEY_STORAGE);
  } catch {
    // Private windows may refuse storage; the key just won't persist.
  }
}

const EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "location",
    "date_observed",
    "snow_condition",
    "traction_used",
    "crossing_condition",
    "exposure_comfort",
    "reporter_register",
    "quote_span",
  ],
  properties: {
    location: { type: ["string", "null"] },
    date_observed: { type: ["string", "null"], pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
    snow_condition: {
      type: ["string", "null"],
      enum: ["none", "patchy", "continuous", "deep", null],
    },
    traction_used: {
      type: ["string", "null"],
      enum: ["none", "microspikes", "crampons", "ice_axe", "spikes_and_axe", null],
    },
    crossing_condition: {
      type: ["string", "null"],
      enum: ["dry", "low", "knee_high", "thigh_high", "dangerous", null],
    },
    exposure_comfort: {
      type: ["string", "null"],
      enum: ["relaxed", "cautious", "sketchy", "terrifying", null],
    },
    reporter_register: {
      type: "string",
      enum: ["thru_hiker", "experienced", "first_timer", "unknown"],
    },
    quote_span: { type: ["string", "null"] },
  },
};

const EXTRACTION_SYSTEM = `You extract structured trail conditions from backpacking trip reports. Fill exactly one record via the tool. null is the correct answer for any field the post does not clearly state. Resolve relative dates against today's date if given. quote_span must be a short verbatim quote from the post.`;

async function callClaude(
  apiKey: string,
  system: string,
  user: string,
  tool?: { name: string; schema: object },
): Promise<{ text: string | null; toolInput: unknown }> {
  const body: Record<string, unknown> = {
    model: EXTRACTION_MODEL,
    max_tokens: 1024,
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: user }],
  };
  if (tool) {
    body.tools = [{ name: tool.name, description: tool.name, input_schema: tool.schema }];
    body.tool_choice = { type: "tool", name: tool.name };
  }
  const resp = await fetch(API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": API_VERSION,
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const detail = await resp.text();
    throw new Error(`API ${resp.status}: ${detail.slice(0, 200)}`);
  }
  const data = await resp.json();
  let text: string | null = null;
  let toolInput: unknown = null;
  for (const block of data.content ?? []) {
    if (block.type === "text") text = block.text;
    if (block.type === "tool_use") toolInput = block.input;
  }
  return { text, toolInput };
}

export async function extractReport(apiKey: string, postText: string): Promise<Extraction> {
  const today = new Date().toISOString().slice(0, 10);
  const { toolInput } = await callClaude(
    apiKey,
    EXTRACTION_SYSTEM,
    `Today's date: ${today}\n\n${postText}`,
    { name: "record_extraction", schema: EXTRACTION_SCHEMA },
  );
  return toolInput as Extraction;
}

export async function askPass(
  apiKey: string,
  passName: string,
  evidenceSummary: string,
  question: string,
): Promise<string> {
  const system =
    "You answer questions about one Sierra Nevada pass using ONLY the evidence provided. " +
    "If the evidence does not answer the question, say so plainly. Two or three sentences, " +
    "no speculation, cite which stream (sensor, satellite, report, gauge) backs each claim.";
  const { text } = await callClaude(
    apiKey,
    system,
    `Pass: ${passName}\n\nEvidence:\n${evidenceSummary}\n\nQuestion: ${question}`,
  );
  return text ?? "No answer returned.";
}
