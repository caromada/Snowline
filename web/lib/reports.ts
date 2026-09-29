// Everything about filed reports that can be decided without a browser or a
// network: dates, wording, grouping. The components only lay this out.
import {
  MAX_REPORT_CHARS,
  MAX_WATER_SOURCE_CHARS,
  type PassReport,
  REPORT_WINDOW_DAYS,
  type ReportConditions,
  type ReportDraft,
  type ReportTag,
  type ReportTaps,
  SEASON_WINDOW_DAYS,
  TAP_CHOICES,
  type TapField,
} from "./reportTypes";

const DAY_MS = 86_400_000;

// Every pass is in Washington, Oregon or California, so the day someone was
// there is a Pacific day whatever clock they file from.
const PACIFIC_DAY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Los_Angeles",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function pacificToday(now: Date): string {
  return PACIFIC_DAY.format(now);
}

function dayNumber(date: string): number {
  return Math.round(Date.parse(`${date}T00:00:00Z`) / DAY_MS);
}

function dayBefore(date: string, days: number): string {
  return new Date((dayNumber(date) - days) * DAY_MS).toISOString().slice(0, 10);
}

function format(date: string, options: Intl.DateTimeFormatOptions): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { ...options, timeZone: "UTC" });
}

export function shortDate(date: string): string {
  return format(date, { month: "short", day: "numeric" });
}

export function longDate(date: string): string {
  return format(date, { month: "short", day: "numeric", year: "numeric" });
}

export function dateChoices(today: string): { value: string; label: string }[] {
  return Array.from({ length: REPORT_WINDOW_DAYS + 1 }, (_, back) => {
    const value = dayBefore(today, back);
    const day = format(value, { weekday: "short", month: "short", day: "numeric" }).replace(",", "");
    return { value, label: back === 0 ? `Today, ${day}` : back === 1 ? `Yesterday, ${day}` : day };
  });
}

/** How long before `from` the date was, in words. `from` is today, or the
 * date on the history slider. */
export function agoInWords(date: string, from: string): string {
  const days = dayNumber(from) - dayNumber(date);
  if (days < 0) return days === -1 ? "1 day later" : `${-days} days later`;
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 14) return `${days} days ago`;
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return "over a year ago";
}

const FIELD_NAMES: Record<keyof ReportConditions, string> = {
  snow_condition: "Snow",
  traction_used: "Traction",
  crossing_condition: "Crossing",
  exposure_comfort: "Travel felt",
  larches: "Larches",
  wildflowers: "Wildflowers",
  mosquitoes: "Mosquitoes",
  water_status: "Water",
  water_source: "Water",
};

const VALUE_WORDS: Record<string, string> = {
  spikes_and_axe: "microspikes and ice axe",
};

export function fieldName(field: keyof ReportConditions): string {
  return FIELD_NAMES[field];
}

export function valueWords(value: string): string {
  return VALUE_WORDS[value] ?? value.replace(/_/g, " ");
}

const TAG_ORDER = [
  "snow_condition",
  "traction_used",
  "crossing_condition",
  "exposure_comfort",
  "larches",
  "wildflowers",
  "mosquitoes",
] as const;

function waterWords(source: string | null, status: string): string {
  return source ? `${source}, ${valueWords(status)}` : valueWords(status);
}

export function reportTags(report: ReportConditions & { tapped?: string[] }): ReportTag[] {
  const tapped = new Set(report.tapped ?? []);
  const tags: ReportTag[] = [];
  for (const field of TAG_ORDER) {
    const value = report[field];
    if (value) tags.push({ field, text: `${FIELD_NAMES[field]}: ${valueWords(value)}`, tapped: tapped.has(field) });
  }
  if (report.water_status) {
    tags.push({
      field: "water_status",
      text: `Water: ${waterWords(report.water_source, report.water_status)}`,
      tapped: tapped.has("water_status"),
    });
  }
  return tags;
}

export function photoAlt(report: PassReport, passName: string): string {
  const said = reportTags(report).map((tag) => `${tag.text}.`);
  return [`Photo filed by a visitor at ${passName} on ${longDate(report.date_observed)}.`, ...said].join(" ");
}

interface Tally {
  words: string;
  count: number;
  latest: string;
}

function tally(found: { key: string; words: string; date: string }[]): string {
  const groups = new Map<string, Tally>();
  for (const { key, words, date } of found) {
    const group = groups.get(key);
    if (!group) groups.set(key, { words, count: 1, latest: date });
    else {
      group.count += 1;
      if (date > group.latest) {
        group.latest = date;
        group.words = words;
      }
    }
  }
  return Array.from(groups.values())
    .sort((a, b) => b.latest.localeCompare(a.latest) || b.count - a.count)
    .map((g) => `${g.words} (${g.count} ${g.count === 1 ? "report" : "reports"}, latest ${shortDate(g.latest)})`)
    .join("; ");
}

/** One line per season item that a visible report in the fourteen days up
 * to `until` speaks to. Reports that disagree are shown side by side,
 * newest first; nothing here decides between them. */
export function seasonWatch(reports: PassReport[], until: string): string[] {
  const end = dayNumber(until);
  const recent = reports.filter((r) => {
    const back = end - dayNumber(r.date_observed);
    return r.status === "visible" && back >= 0 && back <= SEASON_WINDOW_DAYS;
  });
  const lines: string[] = [];
  for (const field of ["larches", "wildflowers", "mosquitoes"] as const) {
    const found = recent.flatMap((r) => {
      const value = r[field];
      return value ? [{ key: value, words: valueWords(value), date: r.date_observed }] : [];
    });
    if (found.length) lines.push(`${FIELD_NAMES[field]}: ${tally(found)}`);
  }
  const water = recent.flatMap((r) => {
    if (!r.water_status) return [];
    const source = r.water_source?.trim() || null;
    return [
      {
        key: `${source?.toLowerCase() ?? ""}\u0000${r.water_status}`,
        words: waterWords(source ?? "unnamed source", r.water_status),
        date: r.date_observed,
      },
    ];
  });
  if (water.length) lines.push(`Water: ${tally(water)}`);
  return lines;
}

/** The date the list counts back from: today while the map shows the
 * present, the date on the history slider otherwise. */
export function windowEnd(evalDate: string, isNow: boolean, today: string): string {
  return isNow ? today : evalDate;
}

export function splitByWindow(
  reports: PassReport[],
  until: string,
): { recent: PassReport[]; earlier: PassReport[] } {
  const end = dayNumber(until);
  const ordered = reports
    .filter((r) => dayNumber(r.date_observed) <= end)
    .sort((a, b) => b.date_observed.localeCompare(a.date_observed) || b.created_at.localeCompare(a.created_at));
  return {
    recent: ordered.filter((r) => end - dayNumber(r.date_observed) <= REPORT_WINDOW_DAYS),
    earlier: ordered.filter((r) => end - dayNumber(r.date_observed) > REPORT_WINDOW_DAYS),
  };
}

export function emptyDraft(today: string): ReportDraft {
  return {
    date: today,
    text: "",
    snow_condition: null,
    traction_used: null,
    crossing_condition: null,
    larches: null,
    wildflowers: null,
    mosquitoes: null,
    water_status: null,
    water_source: "",
  };
}

export function tapsOf(draft: ReportDraft): ReportTaps {
  const taps: ReportTaps = {};
  for (const field of Object.keys(TAP_CHOICES) as TapField[]) {
    const value = draft[field];
    if (value) taps[field] = value;
  }
  const source = draft.water_source.trim();
  if (source) taps.water_source = source;
  return taps;
}

/** Why the draft cannot be published as it stands, or null when it can. */
export function draftProblem(draft: ReportDraft): string | null {
  const taps = tapsOf(draft);
  if (draft.text.trim().length > MAX_REPORT_CHARS) return `Keep your words under ${MAX_REPORT_CHARS} characters.`;
  if ((taps.water_source?.length ?? 0) > MAX_WATER_SOURCE_CHARS) {
    return `Keep the water source under ${MAX_WATER_SOURCE_CHARS} characters.`;
  }
  if (taps.water_source && !taps.water_status) return "Choose how the water source was running, or clear its name.";
  if (!draft.text.trim() && Object.keys(taps).length === 0) return "Write what you found or make at least one choice.";
  return null;
}

/** The draft as the card it will become. What the words say about snow,
 * traction and the crossing is read after publishing, so only the person's
 * own choices appear here. */
export function previewOf(draft: ReportDraft, slug: string, photoUrl: string | null): PassReport {
  const taps = tapsOf(draft);
  return {
    id: "preview",
    pass_slug: slug,
    date_observed: draft.date,
    snow_condition: draft.snow_condition,
    traction_used: draft.traction_used,
    crossing_condition: draft.crossing_condition,
    exposure_comfort: null,
    larches: draft.larches,
    wildflowers: draft.wildflowers,
    mosquitoes: draft.mosquitoes,
    water_status: draft.water_status,
    water_source: draft.water_status ? (taps.water_source ?? null) : null,
    body: draft.text.trim(),
    quote_span: null,
    photo_path: photoUrl,
    status: "visible",
    tapped: Object.keys(taps),
    created_at: "",
    mine: true,
  };
}
