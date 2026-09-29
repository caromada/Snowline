// A trip plan, assembled from the exported pass files by code. Every
// sentence here states a value the data holds. Nothing advises, and nothing
// is said about what Snowline has no data for: distances along a trail,
// times, difficulty, permits, water.

import { daysBetween, fireSentence } from "./fire";
import type {
  Horizon,
  PlanAvalanche,
  PlanFire,
  PlanPass,
  PlanVerdict,
  SummaryLine,
  TripPlan,
  TripStop,
  UnderstoodTrip,
  Why,
} from "./planTypes";
import type { ForecastDay, PassDetail } from "./types";

/** A perimeter this near, in straight-line miles, is named in the summary. */
export const FIRE_NEAR_MI = 10;

export function dayLabel(date: string, today: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(date.slice(0, 4) !== today.slice(0, 4) ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

export function datesLabel(trip: UnderstoodTrip, today: string): string | null {
  if (!trip.start || !trip.end) return null;
  if (trip.start === trip.end) return dayLabel(trip.start, today);
  return `${dayLabel(trip.start, today)} to ${dayLabel(trip.end, today)}`;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function listed(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** How a pass came to be on the plan, in a sentence. */
export function whyLine(why: Why): string {
  const picked = "A language model picked it as part of this trip.";
  switch (why.kind) {
    case "name":
      return `Named in the text as "${why.matched}".`;
    case "fuzzy":
      return `Read from "${why.matched}" in the text, which resembles "${why.alias}". ${picked}`;
    case "mention":
      return `Not named in the text. The index also knows this pass as "${why.alias}", and the text says "${why.matched}". ${picked}`;
    case "route":
      return `Not named in the text. It is on ${why.route}, which the text names. ${picked}`;
    case "place":
      return `Not named in the text. It is ${why.distance_mi} mi in a straight line from ${why.place}, which the text names. ${picked}`;
  }
}

function nearestDate(dates: string[], target: string): string {
  let best = dates[dates.length - 1];
  for (const d of dates) {
    if (Math.abs(daysBetween(d, target)) < Math.abs(daysBetween(best, target))) best = d;
  }
  return best;
}

/** Sources issued for a day stay current through the day after, the pipeline's own rule. */
const current = (issuedFor: string | undefined | null, today: string) =>
  !!issuedFor && Math.abs(daysBetween(issuedFor, today)) <= 1;

function forecastDays(detail: PassDetail, today: string): ForecastDay[] {
  if (!detail.forecast || !current(detail.forecast.issued_for, today)) return [];
  return detail.forecast.days.filter((d) => d.date >= today);
}

export function horizonOf(trip: UnderstoodTrip, today: string, through: string | null): Horizon {
  if (!trip.start || !trip.end) return "undated";
  if (trip.end < today) return "past";
  if (!through || trip.start > through) return "beyond";
  return trip.end > through ? "partly" : "within";
}

function buildPass(
  stop: TripStop,
  order: number,
  detail: PassDetail,
  trip: UnderstoodTrip,
  horizon: Horizon,
  today: string,
  now: number,
  namesakes: number,
): PlanPass {
  const latest = detail.dates[detail.dates.length - 1];
  // A trip ahead of today is described by the newest verdict; only a trip
  // already over is described by the verdict nearest its dates.
  const date = horizon === "past" && trip.start ? nearestDate(detail.dates, trip.start) : latest;
  const status = detail.statuses[date];
  const verdict: PlanVerdict = {
    date,
    latest: date === latest,
    status: status.status,
    status_label: status.status_label,
    confidence: status.confidence,
    facts: status.facts,
    conflicts: status.conflicts,
  };

  const present = horizon !== "past";
  const days = present ? forecastDays(detail, today) : [];
  const inTrip =
    horizon === "undated"
      ? days
      : horizon === "beyond"
        ? []
        : days.filter((d) => d.date >= trip.start! && d.date <= trip.end!);

  let fire: PlanFire | null = null;
  if (present && detail.fire && current(detail.fire.issued_for, today) && (detail.fire.fire || detail.fire.smoke)) {
    const near = detail.fire.fire ?? null;
    fire = {
      fire: near,
      close: !!near && (near.inside || near.distance_mi <= FIRE_NEAR_MI),
      smoke: detail.fire.smoke ?? null,
      smoke_date: detail.fire.smoke_date,
      issued_for: detail.fire.issued_for,
    };
  }

  const winter = present && detail.winter && current(detail.winter.issued_for, today) ? detail.winter : null;
  let avalanche: PlanAvalanche | null | undefined;
  if (winter && winter.avalanche !== undefined) {
    const rating = winter.avalanche;
    if (rating === null) avalanche = null;
    else {
      const until = rating.valid_until_utc ? Date.parse(rating.valid_until_utc) : NaN;
      avalanche = { rating, expired: rating.level !== null && !Number.isNaN(until) && until < now };
    }
  }

  return {
    slug: stop.slug,
    name: detail.pass.name,
    elevation_ft: detail.pass.elevation_ft,
    lat: detail.pass.lat,
    lon: detail.pass.lon,
    order,
    why: stop.why,
    named: stop.why.kind === "name",
    namesakes,
    verdict,
    forecast:
      inTrip.length && detail.forecast
        ? { days: inTrip, grid_elevation_ft: detail.forecast.grid_elevation_ft, issued_for: detail.forecast.issued_for }
        : null,
    fire,
    ...(avalanche !== undefined ? { avalanche } : {}),
    roads: winter?.roads ?? [],
    roads_read_at: winter?.fetched_at ?? null,
    trailhead: detail.access?.trailheads[0] ?? null,
    campground: detail.access?.campgrounds[0] ?? null,
  };
}

function highest(
  passes: PlanPass[],
  field: "precip_chance" | "thunder_chance",
): { value: number; date: string; passes: string[] } | null {
  let best: { value: number; date: string; passes: string[] } | null = null;
  for (const p of passes) {
    for (const d of p.forecast?.days ?? []) {
      const value = d[field];
      if (value === null || value === undefined) continue;
      if (!best || value > best.value) best = { value, date: d.date, passes: [p.name] };
      else if (value === best.value && d.date === best.date && !best.passes.includes(p.name)) best.passes.push(p.name);
    }
  }
  return best;
}

function summarize(plan: Omit<TripPlan, "summary">): SummaryLine[] {
  const { trip, today, horizon, passes, forecast_through: through } = plan;
  const lines: SummaryLine[] = [];
  const dates = datesLabel(trip, today);
  const who = [
    trip.activity && trip.activity !== "other" ? trip.activity : null,
    trip.party_size ? plural(trip.party_size, "person", "people") : null,
  ].filter(Boolean);
  if (dates || who.length) {
    lines.push({ kind: "dates", text: `Read from the text: ${[dates, ...who].filter(Boolean).join(", ")}.` });
  }

  const reach = through ? `The forecast on file reaches ${dayLabel(through, today)}.` : "No forecast is on file.";
  if (horizon === "undated") {
    lines.push({
      kind: "horizon",
      text: `No dates were read from the text. ${through ? `The forecast shown is the week ahead, through ${dayLabel(through, today)}.` : reach}`,
    });
  } else if (horizon === "past") {
    lines.push({
      kind: "horizon",
      warm: true,
      text: "These dates are in the past. Each verdict shown is the one on file nearest those dates. Forecast, fire, avalanche and road information describes the present only and is left out.",
    });
  } else if (horizon === "beyond") {
    const away = daysBetween(today, trip.start!);
    lines.push({
      kind: "horizon",
      warm: true,
      text: `The trip starts ${plural(away, "day", "days")} from today. ${reach} Conditions that far ahead are not known. Everything below describes ${dayLabel(today, today)}, today, and no forecast is shown.`,
    });
  } else if (horizon === "partly") {
    lines.push({
      kind: "horizon",
      warm: true,
      text: `${reach} Conditions after that day are not known, and the trip runs to ${dayLabel(trip.end!, today)}.`,
    });
  } else {
    lines.push({ kind: "horizon", text: `${reach} Every day of the trip is inside it.` });
  }

  if (passes.length) {
    const byLabel = new Map<string, number>();
    const byConfidence = new Map<string, number>();
    for (const p of passes) {
      byLabel.set(p.verdict.status_label, (byLabel.get(p.verdict.status_label) ?? 0) + 1);
      byConfidence.set(p.verdict.confidence, (byConfidence.get(p.verdict.confidence) ?? 0) + 1);
    }
    const counts = [...byLabel].map(([label, n]) => `${n} ${label.toLowerCase()}`);
    const sure = [...byConfidence].map(([level, n]) => `${n} ${level}`);
    const asOf = [...new Set(passes.map((p) => p.verdict.date))];
    const when =
      asOf.length === 1
        ? `as of ${dayLabel(asOf[0], today)}${asOf[0] === today ? ", today" : ""}`
        : "each as of the date shown on it";
    lines.push({
      kind: "verdicts",
      text: `${plural(passes.length, "pass", "passes")} on this plan, ${when}: ${listed(counts)}. Confidence: ${listed(sure)}.`,
    });

    const top = passes.reduce((a, b) => (b.elevation_ft > a.elevation_ft ? b : a));
    if (passes.length > 1) {
      lines.push({ kind: "highest", text: `Highest pass: ${top.name}, ${top.elevation_ft.toLocaleString("en-US")} ft.` });
    }
  }

  const span = horizon === "undated" ? "the week ahead" : "the trip's days";
  for (const [kind, field, word] of [
    ["precipitation", "precip_chance", "precipitation"],
    ["thunder", "thunder_chance", "thunder"],
  ] as const) {
    const peak = highest(passes, field);
    if (!peak) continue;
    lines.push({
      kind,
      text:
        peak.value > 0
          ? `Highest chance of ${word} in the forecast for ${span}: ${peak.value}% on ${dayLabel(peak.date, today)} at ${listed(peak.passes)}.`
          : `The forecast for ${span} shows a 0% chance of ${word} at every pass that has one.`,
    });
  }

  if (horizon !== "past") {
    const close = passes.filter((p) => p.fire?.close);
    for (const p of close) {
      const f = p.fire!.fire!;
      lines.push({
        kind: "fire",
        warm: true,
        text: f.inside
          ? `${p.name} is inside the mapped perimeter of the ${f.name}.`
          : `${p.name} is ${f.distance_mi} mi in a straight line from the mapped perimeter of the ${f.name}.`,
      });
    }
    if (!close.length && passes.length) {
      lines.push({
        kind: "fire",
        text: `No mapped fire perimeter within ${FIRE_NEAR_MI} mi of ${passes.length === 1 ? "this pass" : "these passes"} is on file.`,
      });
    }

    const rated = passes.filter((p) => p.avalanche && !p.avalanche.expired && p.avalanche.rating.level !== null);
    for (const p of rated) {
      const r = p.avalanche!.rating;
      lines.push({
        kind: "avalanche",
        warm: true,
        text: `Avalanche danger at ${p.name}, as issued by ${r.center ?? "the avalanche center"}: ${r.rating}.`,
      });
    }

    const restricted = passes.flatMap((p) => p.roads.filter((r) => r.active).map((r) => ({ p, r })));
    for (const { p, r } of restricted) {
      lines.push({
        kind: "road",
        warm: true,
        text: `${r.agency} reports a restriction on ${[r.road, r.location].filter(Boolean).join(" at ")}, ${r.distance_mi} mi in a straight line from ${p.name}.`,
      });
    }
    if (!restricted.length && passes.some((p) => p.roads.length)) {
      lines.push({ kind: "road", text: "No road restriction is on file at the highway points near these passes." });
    }
  }

  if (plan.missing.length) {
    lines.push({
      kind: "missing",
      warm: true,
      text: `The file for ${listed(plan.missing.map((m) => m.name))} could not be read, so nothing is shown for ${plan.missing.length === 1 ? "it" : "them"}.`,
    });
  }
  return lines;
}

export function buildPlan(
  trip: UnderstoodTrip,
  details: Record<string, PassDetail | undefined>,
  options: {
    /** Today on the Pacific coast, YYYY-MM-DD. */
    today: string;
    /** The moment of reading, for whether an avalanche rating has expired. */
    now: number;
    /** How many passes in the index carry each name. */
    nameCounts?: Record<string, number>;
  },
): TripPlan {
  const { today, now } = options;
  const known = trip.passes.filter((stop) => {
    const d = details[stop.slug];
    return !!d && d.dates.length > 0;
  });
  const missing = trip.passes.filter((stop) => !known.includes(stop));

  let through: string | null = null;
  for (const stop of known) {
    const days = forecastDays(details[stop.slug]!, today);
    const last = days[days.length - 1]?.date;
    if (last && (!through || last > through)) through = last;
  }
  const horizon = horizonOf(trip, today, through);
  const passes = known.map((stop, i) => {
    const detail = details[stop.slug]!;
    return buildPass(stop, i + 1, detail, trip, horizon, today, now, options.nameCounts?.[detail.pass.name] ?? 1);
  });
  const plan = { trip, today, horizon, forecast_through: horizon === "past" ? null : through, passes, missing };
  return { ...plan, summary: summarize(plan) };
}

/** The nearest fire as the pass panel words it. */
export function fireLine(fire: PlanFire): string | null {
  return fire.fire ? fireSentence(fire.fire) : null;
}
