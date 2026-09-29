import { LEDGER_MAX_LINES, LEDGER_WINDOW_DAYS } from "./config.ts";

// The model answers from this and nothing else: the verdict for the date
// being viewed and the evidence behind it, as numbered lines it can cite.

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

export function buildEvidence(detail: PassEvidenceSource, date: string): Evidence {
  const status = detail.statuses[date];
  if (!status) throw new Error(`no verdict for ${detail.pass.slug} on ${date}`);
  const isLatest = date === detail.dates[detail.dates.length - 1];
  const lines: Omit<EvidenceLine, "n">[] = [];

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
