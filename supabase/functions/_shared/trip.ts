// What the model returns is a draft. Nothing in it reaches the page until
// this module has checked it against the candidates code found and the
// words the person typed.
import { MAX_TRIP_PASSES } from "./config.ts";
import { type CandidateSet, norm, type Why } from "./gazetteer.ts";

export const ACTIVITIES = [
  "hiking",
  "backpacking",
  "trail running",
  "climbing",
  "skiing",
  "snowshoeing",
  "cycling",
  "driving",
  "other",
] as const;
export type Activity = (typeof ACTIVITIES)[number];

/** The model's structured output, before any of it is trusted. */
export interface TripDraft {
  passes: string[];
  start_date: string | null;
  end_date: string | null;
  activity: string | null;
  party_size: number | null;
  unplaced: string[];
}

export interface TripStop {
  slug: string;
  name: string;
  why: Why;
}

export interface UnderstoodTrip {
  passes: TripStop[];
  start: string | null;
  end: string | null;
  activity: Activity | null;
  party_size: number | null;
  /** Place names from the person's own text that matched nothing. */
  unplaced: string[];
}

const DAY_MS = 86_400_000;
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
/** A trip dated further from today than this, either way, is a misreading. */
const MAX_DAYS_AWAY = 2 * 366;
const MAX_UNPLACED = 8;
const MAX_UNPLACED_CHARS = 80;

export function isDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const m = ISO.exec(value);
  if (!m) return false;
  const at = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  // Rejects dates the calendar does not hold, such as 2027-02-30.
  return at.toISOString().slice(0, 10) === value;
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** Today on the Pacific coast, where every pass in the index is. */
export function pacificToday(now: Date = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
}

export function weekday(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
}

export function normalizeTripText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ").replace(/[?!.\s]+$/, "");
}

export function validateTrip(
  draft: TripDraft,
  set: CandidateSet,
  text: string,
  today: string,
): { trip: UnderstoodTrip; rejected: string[] } {
  const allowed = new Map(set.candidates.map((c) => [c.pass.slug, c]));
  const rejected: string[] = [];
  const passes: TripStop[] = [];
  const seen = new Set<string>();
  for (const slug of Array.isArray(draft.passes) ? draft.passes : []) {
    if (typeof slug !== "string" || seen.has(slug)) continue;
    seen.add(slug);
    const candidate = allowed.get(slug);
    if (!candidate) {
      rejected.push(slug.slice(0, 80));
      continue;
    }
    if (passes.length < MAX_TRIP_PASSES) {
      passes.push({ slug, name: candidate.pass.name, why: candidate.why });
    }
  }

  const near = (d: unknown): d is string => isDate(d) && Math.abs(daysBetween(today, d)) <= MAX_DAYS_AWAY;
  let start = near(draft.start_date) ? draft.start_date : null;
  let end = near(draft.end_date) ? draft.end_date : null;
  start ??= end;
  end ??= start;
  if (start && end && end < start) [start, end] = [end, start];

  const activity = ACTIVITIES.find((a) => a === draft.activity) ?? null;
  const size = draft.party_size;
  const party_size = typeof size === "number" && Number.isInteger(size) && size >= 1 && size <= 99 ? size : null;

  // Only words the person typed may be shown back as unplaced: the model
  // cannot put a sentence of its own on the page this way.
  const typed = ` ${norm(text)} `;
  const unplaced: string[] = [];
  for (const raw of Array.isArray(draft.unplaced) ? draft.unplaced : []) {
    if (typeof raw !== "string") continue;
    const phrase = raw.trim().replace(/\s+/g, " ");
    const key = norm(phrase);
    if (!key || phrase.length > MAX_UNPLACED_CHARS || !typed.includes(` ${key} `)) continue;
    if (unplaced.some((u) => norm(u) === key)) continue;
    if (unplaced.length < MAX_UNPLACED) unplaced.push(phrase);
  }

  return { trip: { passes, start, end, activity, party_size, unplaced }, rejected };
}

/**
 * What an identical request shares. Words like "this Saturday" resolve from
 * the text and today's date alone, so today stands in for the resolved
 * dates: the key can then be computed before the model is called, which is
 * the point of a cache. The data's latest date is in the key because the
 * candidates come from that day's index.
 */
export function tripCacheParts(input: {
  model: string;
  text: string;
  today: string;
  dataDate: string;
  position?: { lat: number; lon: number } | null;
}): string[] {
  const where = input.position
    ? `${Math.round(input.position.lat)},${Math.round(input.position.lon)}`
    : "";
  return ["trip-v1", input.model, normalizeTripText(input.text), input.today, input.dataDate, where];
}

/** A position a visitor chose to share, or null if it is not one on the West Coast. */
export function readPosition(value: unknown): { lat: number; lon: number } | null {
  const p = value as { lat?: unknown; lon?: unknown } | null;
  if (!p || typeof p.lat !== "number" || typeof p.lon !== "number") return null;
  if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) return null;
  if (p.lat < 30 || p.lat > 52 || p.lon < -130 || p.lon > -110) return null;
  return { lat: p.lat, lon: p.lon };
}
