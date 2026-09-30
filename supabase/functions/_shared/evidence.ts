import { LEDGER_MAX_LINES, LEDGER_WINDOW_DAYS, ROAD_MAX_LINES } from "./config.ts";

// The model answers from this and nothing else: the verdict for the date
// being viewed and the evidence behind it, as numbered lines it can cite.
// Fire, smoke, the avalanche rating, new snow and road reports describe the
// present only, so they are given only when the latest date is viewed.
// Official words (a rating, travel advice, a road report) are quoted as
// issued and attributed; nothing here rewords or grades them.

export interface FireEvidenceSource {
  fire?: {
    name: string;
    acres: number | null;
    percent_contained: number | null;
    discovered: string | null;
    updated: string | null;
    distance_mi: number;
    direction: string | null;
    inside: boolean;
  };
  smoke?: string;
  issued_for: string;
  smoke_date: string | null;
}

export interface AvalancheEvidenceSource {
  zone: string | null;
  center: string | null;
  level: number | null;
  rating: string;
  travel_advice: string | null;
  valid_until: string | null;
  valid_until_utc: string | null;
  timezone: string | null;
  off_season: boolean;
  warning: string | null;
}

export interface RoadEvidenceSource {
  agency: string;
  road: string | null;
  location: string;
  active: boolean;
  updated: string | null;
  lines: { label: string | null; code: string | null; text: string }[];
  distance_mi: number;
  new_snow_in?: number;
  roadside_snow_in?: number;
}

export interface WinterEvidenceSource {
  /** null: outside every forecast zone. Absent: zones were not fetched. */
  avalanche?: AvalancheEvidenceSource | null;
  fresh_snow?: { as_of: string | null; facts: string[] };
  roads?: RoadEvidenceSource[];
  issued_for: string;
}

export interface PassEvidenceSource {
  pass: { slug: string; name: string; elevation_ft: number };
  dates: string[];
  statuses: Record<
    string,
    {
      status_label: string;
      confidence: string;
      facts: { text: string; stream: string }[];
      conflicts: string[];
    }
  >;
  ledger: { date: string; source: string; title: string; detail: { quote?: string | null } }[];
  forecast?: {
    days: {
      date: string;
      high_f: number | null;
      low_f: number | null;
      snow_level_ft: number | null;
      precip_chance: number | null;
      snowfall_in: number | null;
      gust_mph: number | null;
    }[];
  } | null;
  fire?: FireEvidenceSource | null;
  winter?: WinterEvidenceSource | null;
  access?: {
    trailheads: { name: string; distance_mi: number; gain_ft?: number }[];
    campgrounds: { name: string; distance_mi: number }[];
  };
}

export interface EvidenceLine {
  n: number;
  kind: string;
  date?: string;
  text: string;
}

export interface Evidence {
  header: string;
  lines: EvidenceLine[];
}

const DAY_MS = 86_400_000;

type Line = Omit<EvidenceLine, "n">;

const WARNING: Record<string, string> = {
  warning: "an Avalanche Warning",
  watch: "an Avalanche Watch",
  special: "a Special Avalanche Bulletin",
};

function miles(mi: number): string {
  if (mi < 0.1) return "less than 0.1 mi";
  return mi >= 10 ? `${Math.round(mi)} mi` : `${mi} mi`;
}

/** Ends a quoted or plain run of text with exactly one full stop. */
function closed(text: string): string {
  const t = text.trim();
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

function fireLines(fire: FireEvidenceSource): Line[] {
  const lines: Line[] = [];
  const f = fire.fire;
  if (f) {
    const size = [
      f.acres !== null ? `${f.acres.toLocaleString("en-US")} ${f.acres === 1 ? "acre" : "acres"}` : null,
      f.percent_contained !== null ? `${f.percent_contained}% contained` : "containment not reported",
    ].filter(Boolean);
    const where =
      f.inside || !f.direction
        ? `The pass is inside the mapped perimeter of ${f.name}: ${size.join(", ")}.`
        : `${f.name} is the nearest active fire: ${size.join(", ")}, ` +
          `${miles(f.distance_mi)} to the ${f.direction} of the pass in a straight line.`;
    const dates = [
      f.discovered ? `discovered ${f.discovered}` : null,
      f.updated ? `perimeter updated ${f.updated}` : null,
    ].filter(Boolean) as string[];
    const when = dates.length ? ` ${dates.join(", ").replace(/^./, (c) => c.toUpperCase())}.` : "";
    lines.push({ kind: "fire", date: f.updated ?? fire.issued_for, text: `${where}${when}` });
  }
  if (fire.smoke) {
    const from = fire.smoke_date ? `, from the satellite analysis of ${fire.smoke_date}` : "";
    lines.push({
      kind: "smoke",
      date: fire.smoke_date ?? fire.issued_for,
      text:
        `Smoke mapped over the pass is ${fire.smoke}${from}. ` +
        "It is seen from above, so it can sit higher than the pass.",
    });
  }
  return lines;
}

function avalancheLine(rating: AvalancheEvidenceSource | null, issuedFor: string, now: number): Line {
  if (!rating) {
    return {
      kind: "avalanche",
      date: issuedFor,
      text:
        "This pass is outside every avalanche center's forecast zones. " +
        "No official avalanche rating exists for it.",
    };
  }
  const center = rating.center ?? "The avalanche center";
  const zone = rating.zone && rating.zone !== rating.center ? `the ${rating.zone} zone` : "this zone";
  const until = rating.valid_until
    ? `${rating.valid_until}${rating.timezone ? ` (${rating.timezone})` : ""}`
    : null;
  const expiry = rating.valid_until_utc ? Date.parse(rating.valid_until_utc) : NaN;
  let text: string;
  if (rating.level !== null && !Number.isNaN(expiry) && expiry < now) {
    text =
      `The avalanche rating ${center} issued for ${zone} expired ${until ?? "already"}. ` +
      "No current rating is on file.";
  } else if (rating.level !== null) {
    const warning = rating.warning && WARNING[rating.warning];
    text =
      `Official avalanche rating from ${center} for ${zone}: ${rating.level} of 5, ` +
      `"${rating.rating}"${until ? `, valid until ${until}` : ""}.` +
      (warning ? ` ${center} has issued ${warning}.` : "") +
      (rating.travel_advice ? ` Its travel advice, word for word: "${closed(rating.travel_advice)}"` : "");
  } else if (rating.off_season) {
    text = `${center} lists ${zone} as off season and has issued no avalanche rating.`;
  } else {
    text = `${center} has issued no avalanche rating for ${zone}.`;
  }
  return { kind: "avalanche", date: issuedFor, text };
}

function roadLines(roads: RoadEvidenceSource[]): Line[] {
  return [...roads]
    .sort((a, b) => Number(b.active) - Number(a.active) || a.distance_mi - b.distance_mi)
    .slice(0, ROAD_MAX_LINES)
    .map((road) => {
      const place = road.road ? `${road.road} at ${road.location}` : road.location;
      const set = road.updated ? `, status set ${road.updated}` : "";
      const said = road.lines.map((l) => {
        const lead = [l.label, l.code].filter(Boolean).join(", ");
        return `${lead ? `${lead}: ` : ""}"${closed(l.text)}"`;
      });
      const snow = [
        road.new_snow_in !== undefined ? `Roadside new snow ${road.new_snow_in} in.` : null,
        road.roadside_snow_in !== undefined ? `Roadside snow depth ${road.roadside_snow_in} in.` : null,
      ].filter(Boolean);
      return {
        kind: "road",
        date: road.updated?.slice(0, 10),
        text: [
          `${road.agency} road report for ${place}, ` +
            `${miles(road.distance_mi)} from the pass in a straight line${set}.`,
          ...said,
          ...snow,
        ].join(" "),
      };
    });
}

export function buildEvidence(
  detail: PassEvidenceSource,
  date: string,
  now: number = Date.now(),
): Evidence {
  const status = detail.statuses[date];
  if (!status) throw new Error(`no verdict for ${detail.pass.slug} on ${date}`);
  const isLatest = date === detail.dates[detail.dates.length - 1];
  const lines: Line[] = [];

  for (const fact of status.facts) lines.push({ kind: "verdict", text: fact.text });
  for (const conflict of status.conflicts) lines.push({ kind: "disagreement", text: conflict });

  const viewed = Date.parse(`${date}T00:00:00Z`);
  const recent = detail.ledger
    .filter((e) => {
      const at = Date.parse(`${e.date.slice(0, 10)}T00:00:00Z`);
      return at <= viewed && viewed - at <= LEDGER_WINDOW_DAYS * DAY_MS;
    })
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, LEDGER_MAX_LINES);
  for (const e of recent) {
    const quote = e.detail.quote ? ` Quote: "${e.detail.quote}"` : "";
    lines.push({ kind: e.source, date: e.date.slice(0, 10), text: `${e.title}.${quote}` });
  }

  if (isLatest && detail.forecast) {
    for (const d of detail.forecast.days.filter((day) => day.date >= date).slice(0, 7)) {
      const parts = [
        `high ${d.high_f ?? "?"} F, low ${d.low_f ?? "?"} F`,
        d.snow_level_ft !== null ? `snow level ${d.snow_level_ft} ft` : null,
        `precipitation chance ${d.precip_chance ?? 0}%`,
        (d.snowfall_in ?? 0) > 0 ? `new snow ${d.snowfall_in} in` : null,
        d.gust_mph !== null ? `gusts ${d.gust_mph} mph` : null,
      ].filter(Boolean);
      lines.push({ kind: "forecast", date: d.date, text: `Forecast at pass elevation: ${parts.join(", ")}.` });
    }
  }

  if (isLatest && detail.fire) lines.push(...fireLines(detail.fire));

  if (isLatest && detail.winter) {
    const winter = detail.winter;
    if (winter.avalanche !== undefined) {
      lines.push(avalancheLine(winter.avalanche, winter.issued_for, now));
    }
    for (const fact of winter.fresh_snow?.facts ?? []) {
      lines.push({ kind: "new snow", date: winter.fresh_snow?.as_of ?? winter.issued_for, text: fact });
    }
    lines.push(...roadLines(winter.roads ?? []));
  }

  for (const t of detail.access?.trailheads ?? []) {
    const gain = t.gain_ft !== undefined ? `, ${Math.abs(t.gain_ft)} ft ${t.gain_ft >= 0 ? "below" : "above"} the pass` : "";
    lines.push({ kind: "trailhead", text: `${t.name} trailhead is ${t.distance_mi} mi away in a straight line${gain}.` });
  }

  return {
    header:
      `${detail.pass.name}, ${detail.pass.elevation_ft} ft. Conditions as of ${date}` +
      `${isLatest ? " (the present)" : " (a past date, not current)"}: ` +
      `${status.status_label}, confidence ${status.confidence}.`,
    lines: lines.map((l, i) => ({ n: i + 1, ...l })),
  };
}

export function renderEvidence(ev: Evidence): string {
  const body = ev.lines
    .map((l) => `[${l.n}] (${l.kind}${l.date ? `, ${l.date}` : ""}) ${l.text}`)
    .join("\n");
  return `${ev.header}\n\nEvidence:\n${body || "(none on file)"}`;
}

export function normalizeQuestion(question: string): string {
  return question
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[?!.\s]+$/, "");
}

export async function cacheKey(parts: string[]): Promise<string> {
  const bytes = new TextEncoder().encode(parts.join("\u0000"));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
