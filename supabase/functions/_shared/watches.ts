import { FREE_WATCHES, PLUS_WATCHES } from "./config.ts";

// Which watches fire between one day's export of a pass and the next, and
// the sentence that says why. Every sentence describes what the data shows;
// none says what to do about it. Nothing here sends anything.

/** Must match the check on watches.kind in the migration; a test compares them. */
export const WATCH_KINDS = [
  "any_change",
  "snow_free",
  "new_snow",
  "fire_nearby",
  "road_restriction",
] as const;

export type WatchKind = (typeof WATCH_KINDS)[number];

/** A fire's edge this much nearer than the day before counts as a change. */
export const FIRE_CLOSER_MI = 3;
const QUOTE_MAX_CHARS = 160;

export interface WatchVerdict {
  status: string;
  status_label: string;
}

export interface WatchFire {
  name: string;
  acres: number | null;
  percent_contained: number | null;
  distance_mi: number;
  direction: string | null;
  inside: boolean;
}

export interface WatchSnowStation {
  name: string;
  elevation_ft: number | null;
  distance_mi: number;
  as_of: string;
  swe_24h_in: number | null;
  depth_24h_in: number | null;
}

export interface WatchRoad {
  agency: string;
  road: string | null;
  location: string;
  active: boolean;
  lines: { label: string | null; code: string | null; text: string }[];
  distance_mi: number;
  named: boolean;
}

/** The parts of an exported pass detail that a watch reads. */
export interface WatchSource {
  pass: { slug: string; name: string };
  dates: string[];
  statuses: Record<string, WatchVerdict>;
  /** Null or absent: fire data was not issued that day, which is not the same as no fire. */
  fire?: { fire?: WatchFire; issued_for: string } | null;
  /** Null or absent: the winter sources were not read that day. */
  winter?: {
    fresh_snow?: { as_of: string | null; stations: WatchSnowStation[] };
    roads?: WatchRoad[];
    issued_for: string;
  } | null;
}

export interface Fired {
  kind: WatchKind;
  /** One sentence, for the notice. */
  reason: string;
}

export function watchCap(plan: string | null | undefined): number {
  return plan === "plus" ? PLUS_WATCHES : FREE_WATCHES;
}

/** A watch with an end date is in force through that date, by UTC day. */
export function watchInForce(untilDate: string | null, today: string): boolean {
  return untilDate === null || untilDate >= today;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function shortDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${MONTHS[Number(m[2]) - 1] ?? m[2]} ${Number(m[3])}`;
}

function miles(mi: number): string {
  if (mi < 0.1) return "less than 0.1 mi";
  return mi >= 10 ? `${Math.round(mi)} mi` : `${mi} mi`;
}

function latest(detail: WatchSource): { date: string; verdict: WatchVerdict | undefined } | null {
  const date = detail.dates[detail.dates.length - 1];
  return date ? { date, verdict: detail.statuses[date] } : null;
}

function verdictReason(
  name: string,
  now: { date: string; verdict: WatchVerdict },
  was: { date: string; verdict: WatchVerdict },
): string {
  return (
    `${name} reads ${now.verdict.status_label} as of ${shortDate(now.date)}; ` +
    `on ${shortDate(was.date)} it read ${was.verdict.status_label}.`
  );
}

function fireSize(fire: WatchFire): string {
  const acres =
    fire.acres !== null
      ? `${fire.acres.toLocaleString("en-US")} ${fire.acres === 1 ? "acre" : "acres"}`
      : null;
  const contained =
    fire.percent_contained !== null
      ? `${fire.percent_contained}% contained`
      : "containment not reported";
  return [acres, contained].filter(Boolean).join(", ");
}

function fireReason(today: WatchSource, yesterday: WatchSource): string | null {
  const fire = today.fire?.fire;
  if (!fire || !today.fire) return null;
  const before = yesterday.fire?.fire;
  const same = before !== undefined && before.name === fire.name;
  const reached = fire.inside && !(same && before.inside);
  const closer =
    same && !fire.inside && !before.inside && before.distance_mi - fire.distance_mi >= FIRE_CLOSER_MI;
  if (same && !reached && !closer) return null;

  const name = today.pass.name;
  const mapped = `as mapped on ${shortDate(today.fire.issued_for)}`;
  if (fire.inside || !fire.direction) {
    return `${name} is inside the mapped perimeter of the ${fire.name}, ${fireSize(fire)}, ${mapped}.`;
  }
  const where = `The ${fire.name}, ${fireSize(fire)}, is ${miles(fire.distance_mi)} to the ${fire.direction} of ${name} ${mapped}`;
  if (closer && yesterday.fire) {
    return `${where}; on ${shortDate(yesterday.fire.issued_for)} its edge was ${miles(before.distance_mi)} away.`;
  }
  return `${where}.`;
}

function snowReason(today: WatchSource, yesterday: WatchSource): string | null {
  const snow = today.winter?.fresh_snow;
  if (!snow?.as_of) return null;
  // The same reading exported twice is not new snow twice.
  if (snow.as_of === yesterday.winter?.fresh_snow?.as_of) return null;
  const risen = snow.stations
    .filter((s) => (s.depth_24h_in ?? 0) > 0 || (s.swe_24h_in ?? 0) > 0)
    .sort(
      (a, b) =>
        (b.depth_24h_in ?? 0) - (a.depth_24h_in ?? 0) ||
        (b.swe_24h_in ?? 0) - (a.swe_24h_in ?? 0) ||
        a.distance_mi - b.distance_mi,
    );
  const top = risen[0];
  if (!top) return null;
  const place =
    top.elevation_ft !== null
      ? `${top.name} (${top.elevation_ft.toLocaleString("en-US")} ft, ${top.distance_mi} mi away)`
      : `${top.name} (${top.distance_mi} mi away)`;
  const gained = [
    (top.swe_24h_in ?? 0) > 0 ? `${top.swe_24h_in} in of snow water` : null,
    (top.depth_24h_in ?? 0) > 0 ? `${top.depth_24h_in} in of snow depth` : null,
  ].filter(Boolean);
  return `${place} gained ${gained.join(" and ")} in the 24 hours to ${shortDate(top.as_of)}.`;
}

function roadKey(road: WatchRoad): string {
  return [road.agency, road.road ?? "", road.location].join("|").toLowerCase();
}

function roadWords(road: WatchRoad): string {
  return road.lines.map((l) => [l.label, l.code, l.text].filter(Boolean).join(" ")).join(" / ");
}

function roadPlace(road: WatchRoad): string {
  return road.road ? `${road.road} at ${road.location}` : road.location;
}

/** The agency's own words, cut at a word when they run long. */
function quoted(road: WatchRoad): string {
  const line = road.lines.find((l) => l.code) ?? road.lines[0];
  if (!line) return "";
  const text = [line.code, line.text].filter(Boolean).join(": ").replace(/\s+/g, " ").trim();
  if (text.length <= QUOTE_MAX_CHARS) return text;
  return `${text.slice(0, QUOTE_MAX_CHARS).replace(/\s+\S*$/, "")}...`;
}

function roadReason(today: WatchSource, yesterday: WatchSource): string | null {
  const roads = today.winter?.roads;
  if (!today.winter || !roads) return null;
  const before = new Map((yesterday.winter?.roads ?? []).map((r) => [roadKey(r), r]));
  // A report that names the pass outranks one that is merely near it.
  const ordered = [...roads].sort(
    (a, b) => Number(b.named) - Number(a.named) || a.distance_mi - b.distance_mi,
  );
  const as_of = shortDate(today.winter.issued_for);

  for (const road of ordered) {
    if (!road.active) continue;
    const was = before.get(roadKey(road));
    if (was?.active && roadWords(was) === roadWords(road)) continue;
    const verb = was?.active ? "changed its report for" : "reports on";
    const words = quoted(road);
    return `${road.agency} ${verb} ${roadPlace(road)} as of ${as_of}${words ? `: "${words}"` : "."}`;
  }
  for (const road of ordered) {
    if (road.active || !before.get(roadKey(road))?.active) continue;
    return `${road.agency} no longer reports a restriction on ${roadPlace(road)} as of ${as_of}.`;
  }
  return null;
}

/**
 * The watch kinds that fire between two exports of one pass, in the order of
 * WATCH_KINDS. Empty when today's export carries no newer date than
 * yesterday's.
 */
export function firedWatches(yesterday: WatchSource, today: WatchSource): Fired[] {
  if (yesterday.pass.slug !== today.pass.slug) {
    throw new Error(`cannot compare ${yesterday.pass.slug} with ${today.pass.slug}`);
  }
  const was = latest(yesterday);
  const now = latest(today);
  if (!was || !now || now.date <= was.date) return [];

  const reasons: Partial<Record<WatchKind, string>> = {};

  const changed =
    was.verdict && now.verdict && was.verdict.status !== now.verdict.status
      ? verdictReason(today.pass.name, { date: now.date, verdict: now.verdict }, { date: was.date, verdict: was.verdict })
      : null;
  if (changed && now.verdict?.status === "open") reasons.snow_free = changed;

  const snow = snowReason(today, yesterday);
  if (snow) reasons.new_snow = snow;
  const fire = fireReason(today, yesterday);
  if (fire) reasons.fire_nearby = fire;
  const road = roadReason(today, yesterday);
  if (road) reasons.road_restriction = road;

  const any = changed ?? fire ?? road ?? snow;
  if (any) reasons.any_change = any;

  return WATCH_KINDS.flatMap((kind) => {
    const reason = reasons[kind];
    return reason ? [{ kind, reason }] : [];
  });
}
