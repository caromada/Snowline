import {
  MAX_QUOTE_CHARS,
  MAX_REPORT_CHARS,
  MAX_WATER_SOURCE_CHARS,
  REPORTS_PER_DAY,
  REPORT_WINDOW_DAYS,
} from "./config.ts";
import {
  type Crossing,
  type Exposure,
  type Flag,
  FLAGS,
  type Larches,
  type Mosquitoes,
  READ_CHOICES,
  READ_FIELDS,
  type SnowCondition,
  TAP_CHOICES,
  TAP_FIELDS,
  type Traction,
  type Water,
  type Wildflowers,
} from "./reportFields.ts";

export interface Taps {
  snow_condition?: SnowCondition;
  traction_used?: Traction;
  crossing_condition?: Crossing;
  larches?: Larches;
  wildflowers?: Wildflowers;
  mosquitoes?: Mosquitoes;
  water_status?: Water;
  water_source?: string;
}

export interface Filing {
  slug: string;
  date: string;
  text: string;
  taps: Taps;
  photoPath: string | null;
}

export interface Conditions {
  snow_condition: SnowCondition | null;
  traction_used: Traction | null;
  crossing_condition: Crossing | null;
  exposure_comfort: Exposure | null;
  larches: Larches | null;
  wildflowers: Wildflowers | null;
  mosquitoes: Mosquitoes | null;
  water_status: Water | null;
  water_source: string | null;
  quote_span: string | null;
}

/** What the model returns for one report. */
export interface Reading extends Conditions {
  flag: Flag | "none";
}

export interface Merged extends Conditions {
  status: "visible" | "hidden";
  flag: Flag | "unreadable" | null;
  /** The fields the person set by hand, so a reader of the table can tell a
   * tap from something read out of the words. */
  tapped: string[];
}

export type FilingCode =
  | "bad_request"
  | "bad_slug"
  | "bad_date"
  | "date_in_future"
  | "date_too_old"
  | "text_too_long"
  | "bad_tap"
  | "water_needs_status"
  | "water_source_too_long"
  | "bad_photo"
  | "empty";

export type Checked<T> = { ok: true; value: T } | { ok: false; code: FilingCode; message: string };

const SLUG = /^[a-z0-9-]{1,80}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const PHOTO_NAME = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.jpg$/;
const DAY_MS = 86_400_000;
// Control characters other than tab and newline. Built from code points so
// no raw control byte sits in this file.
const CONTROL = new RegExp(
  `[${String.fromCharCode(0)}-${String.fromCharCode(8)}${String.fromCharCode(11)}-${String.fromCharCode(31)}${String.fromCharCode(127)}]`,
  "g",
);

// Every pass Snowline covers is in Washington, Oregon or California, so the
// day someone was there is a Pacific day whatever clock they file from.
const PACIFIC_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Los_Angeles",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function pacificToday(now: Date): string {
  return PACIFIC_DAY.format(now);
}

function dayNumber(date: string): number | null {
  if (!DATE.test(date)) return null;
  const at = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(at) || new Date(at).toISOString().slice(0, 10) !== date) return null;
  return Math.round(at / DAY_MS);
}

function refuse(code: FilingCode, message: string): Checked<never> {
  return { ok: false, code, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateFiling(body: unknown, today: string, userId: string): Checked<Filing> {
  if (!isRecord(body)) return refuse("bad_request", "The report was not in a form that could be read.");

  const slug = body.slug;
  if (typeof slug !== "string" || !SLUG.test(slug)) return refuse("bad_slug", "Unknown pass.");

  const date = body.date;
  const day = typeof date === "string" ? dayNumber(date) : null;
  const now = dayNumber(today);
  if (typeof date !== "string" || day === null || now === null) {
    return refuse("bad_date", "That date is not valid.");
  }
  if (day > now) return refuse("date_in_future", "The date you were there cannot be in the future.");
  if (now - day > REPORT_WINDOW_DAYS) {
    return refuse("date_too_old", `Reports are taken for the last ${REPORT_WINDOW_DAYS} days.`);
  }

  if (body.text !== undefined && body.text !== null && typeof body.text !== "string") {
    return refuse("bad_request", "The report was not in a form that could be read.");
  }
  const text = (body.text ?? "").replace(CONTROL, "").trim();
  if (text.length > MAX_REPORT_CHARS) {
    return refuse("text_too_long", `Keep your words under ${MAX_REPORT_CHARS} characters.`);
  }

  const rawTaps = body.taps ?? {};
  if (!isRecord(rawTaps)) return refuse("bad_tap", "One of the choices was not recognized.");
  const taps: Record<string, string> = {};
  for (const [field, value] of Object.entries(rawTaps)) {
    if (value === null || value === undefined || value === "") continue;
    if (field === "water_source") {
      if (typeof value !== "string") return refuse("bad_tap", "One of the choices was not recognized.");
      const source = value.replace(CONTROL, " ").replace(/\s+/g, " ").trim();
      if (source.length > MAX_WATER_SOURCE_CHARS) {
        return refuse("water_source_too_long", `Keep the water source under ${MAX_WATER_SOURCE_CHARS} characters.`);
      }
      if (source) taps.water_source = source;
      continue;
    }
    const allowed: readonly string[] | undefined = (TAP_CHOICES as Record<string, readonly string[]>)[field];
    if (!allowed || !TAP_FIELDS.includes(field as (typeof TAP_FIELDS)[number])) {
      return refuse("bad_tap", "One of the choices was not recognized.");
    }
    if (typeof value !== "string" || !allowed.includes(value)) {
      return refuse("bad_tap", "One of the choices was not recognized.");
    }
    taps[field] = value;
  }
  if (taps.water_source && !taps.water_status) {
    return refuse("water_needs_status", "Choose how the water source was running, or clear its name.");
  }

  let photoPath: string | null = null;
  if (body.photo_path !== undefined && body.photo_path !== null) {
    const path = body.photo_path;
    if (typeof path !== "string") return refuse("bad_photo", "The photo could not be attached.");
    const [folder, name, ...rest] = path.split("/");
    if (folder !== userId || rest.length > 0 || !name || !PHOTO_NAME.test(name)) {
      return refuse("bad_photo", "The photo could not be attached.");
    }
    photoPath = path;
  }

  if (!text && Object.keys(taps).length === 0) {
    return refuse("empty", "Write what you found or make at least one choice.");
  }
  return { ok: true, value: { slug, date, text, taps: taps as Taps, photoPath } };
}

export type ReportAllowance =
  | { ok: true }
  | { ok: false; reason: "daily_limit" | "pass_limit" | "budget"; message: string };

export function reportAllowance(input: {
  filedToday: number;
  filedForPassToday: number;
  spentTodayUsd: number;
  budgetUsd: number;
  /** False when the report is taps alone, which costs nothing to take. */
  needsReading: boolean;
}): ReportAllowance {
  if (input.filedToday >= REPORTS_PER_DAY) {
    return {
      ok: false,
      reason: "daily_limit",
      message: `You have filed ${REPORTS_PER_DAY} reports today, which is the daily limit. It resets at midnight UTC.`,
    };
  }
  if (input.filedForPassToday >= 1) {
    return {
      ok: false,
      reason: "pass_limit",
      message: "You have already filed a report for this pass today. One report per pass per day is the limit.",
    };
  }
  if (input.needsReading && input.spentTodayUsd >= input.budgetUsd) {
    return {
      ok: false,
      reason: "budget",
      message: "Written reports are paused for today. A report made of choices alone can still be filed.",
    };
  }
  return { ok: true };
}

export function parseReading(raw: unknown): Reading | null {
  if (!isRecord(raw)) return null;
  const flag = raw.flag;
  if (typeof flag !== "string" || (flag !== "none" && !(FLAGS as readonly string[]).includes(flag))) return null;
  const out: Record<string, string | null> = {};
  for (const field of READ_FIELDS) {
    const value = raw[field];
    if (value === null) out[field] = null;
    else if (typeof value === "string" && (READ_CHOICES[field] as readonly string[]).includes(value)) out[field] = value;
    else return null;
  }
  for (const field of ["water_source", "quote_span"] as const) {
    const value = raw[field];
    if (value !== null && typeof value !== "string") return null;
    out[field] = value;
  }
  return { flag, ...out } as unknown as Reading;
}

function squeeze(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** The span as given when the words contain it, spacing aside; null otherwise. */
function verbatim(span: string | null, text: string, limit: number): string | null {
  if (!span) return null;
  const clean = squeeze(span);
  if (!clean || clean.length > limit) return null;
  return squeeze(text).toLowerCase().includes(clean.toLowerCase()) ? clean : null;
}

const NOTHING: Conditions = {
  snow_condition: null,
  traction_used: null,
  crossing_condition: null,
  exposure_comfort: null,
  larches: null,
  wildflowers: null,
  mosquitoes: null,
  water_status: null,
  water_source: null,
  quote_span: null,
};

export function mergeReport(filing: Filing, reading: Reading | "refused" | null): Merged {
  const tapped = (Object.keys(TAP_CHOICES) as string[])
    .concat("water_source")
    .filter((field) => (filing.taps as Record<string, string | undefined>)[field] !== undefined);
  const own: Conditions = { ...NOTHING, ...filing.taps };

  if (reading === "refused") return { ...own, status: "hidden", flag: "unreadable", tapped };
  if (reading === null) return { ...own, status: "visible", flag: null, tapped };
  if (reading.flag !== "none") return { ...own, status: "hidden", flag: reading.flag, tapped };

  const read: Conditions = { ...NOTHING };
  for (const field of READ_FIELDS) {
    (read as unknown as Record<string, string | null>)[field] = reading[field];
  }
  // A water reading means something only with the source it is about, and
  // the source must be the visitor's own words, not the model's.
  read.water_source = verbatim(reading.water_source, filing.text, MAX_WATER_SOURCE_CHARS);
  if (!read.water_source) read.water_status = null;
  read.quote_span = verbatim(reading.quote_span, filing.text, MAX_QUOTE_CHARS);

  const merged: Conditions = { ...read };
  for (const field of TAP_FIELDS) {
    const tap = filing.taps[field];
    if (tap !== undefined) (merged as unknown as Record<string, string | null>)[field] = tap;
  }
  if (filing.taps.water_status !== undefined) {
    merged.water_source = filing.taps.water_source ?? null;
  }
  return { ...merged, status: "visible", flag: null, tapped };
}
