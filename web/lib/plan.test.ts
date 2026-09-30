import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildPlan, datesLabel, dayLabel, fireLine, horizonOf, whyLine } from "./plan";
import type { TripPlan, TripStop, UnderstoodTrip } from "./planTypes";
import type { PassDetail } from "./types";
import type { AvalancheRating, RoadStatus } from "./winterTypes";

// Real exported pass files of 2026-09-29, trimmed and frozen.
const load = (slug: string): PassDetail =>
  JSON.parse(readFileSync(new URL(`./fixtures/plan/${slug}.json`, import.meta.url), "utf8"));
const SLUGS = ["glen", "kearsarge", "forester", "aasgard", "cooper-pass", "basalt-pass", "badger-pass", "donner"];
const DETAILS: Record<string, PassDetail> = Object.fromEntries(SLUGS.map((s) => [s, load(s)]));

const TODAY = "2026-09-29";
const NOW = Date.parse("2026-09-29T21:00:00Z");

const stop = (slug: string, why: TripStop["why"] = { kind: "name", matched: DETAILS[slug].pass.name.toLowerCase() }): TripStop => ({
  slug,
  name: DETAILS[slug].pass.name,
  why,
});

const trip = (slugs: string[], over: Partial<UnderstoodTrip> = {}): UnderstoodTrip => ({
  passes: slugs.map((s) => stop(s)),
  start: "2026-10-02",
  end: "2026-10-04",
  activity: "backpacking",
  party_size: 2,
  unplaced: [],
  ...over,
});

const build = (t: UnderstoodTrip, details: Record<string, PassDetail | undefined> = DETAILS, today = TODAY) =>
  buildPlan(t, details, { today, now: NOW });

const line = (plan: TripPlan, kind: string) => plan.summary.filter((l) => l.kind === kind).map((l) => l.text);

const SIERRA = ["kearsarge", "glen", "forester"];

describe("a trip inside the forecast", () => {
  const plan = build(trip(SIERRA));

  it("keeps the passes in travel order", () => {
    expect(plan.passes.map((p) => [p.order, p.slug])).toEqual([
      [1, "kearsarge"],
      [2, "glen"],
      [3, "forester"],
    ]);
    expect(build(trip(["forester", "kearsarge"])).passes.map((p) => p.slug)).toEqual(["forester", "kearsarge"]);
  });

  it("gives each pass the newest verdict, its confidence, facts and date", () => {
    const glen = plan.passes[1];
    expect(glen.verdict).toMatchObject({
      date: "2026-09-29",
      latest: true,
      status_label: "Likely snow-free",
      confidence: "low",
    });
    expect(glen.verdict.facts[0].text).toBe(DETAILS.glen.statuses["2026-09-29"].facts[0].text);
    expect(glen.elevation_ft).toBe(11926);
  });

  it("shows only the forecast days that fall inside the trip", () => {
    expect(plan.horizon).toBe("within");
    for (const p of plan.passes) {
      expect(p.forecast?.days.map((d) => d.date)).toEqual(["2026-10-02", "2026-10-03", "2026-10-04"]);
    }
    expect(plan.passes[0].forecast?.days[0]).toEqual(DETAILS.kearsarge.forecast!.days[3]);
  });

  it("names the nearest trailhead and campground from the pass file", () => {
    expect(plan.passes[0].trailhead).toMatchObject({ name: "Onion Valley Trailhead", distance_mi: 1.8 });
    expect(plan.passes[0].campground).toMatchObject({ name: "Onion Valley Campground" });
  });

  it("summarizes in counts and values the data holds", () => {
    expect(line(plan, "dates")).toEqual(["Read from the text: Fri, Oct 2 to Sun, Oct 4, backpacking, 2 people."]);
    expect(line(plan, "horizon")).toEqual(["The forecast on file reaches Mon, Oct 5. Every day of the trip is inside it."]);
    expect(line(plan, "verdicts")).toEqual([
      "3 passes on this plan, as of Tue, Sep 29, today: 3 likely snow-free. Confidence: 3 low.",
    ]);
    expect(line(plan, "highest")).toEqual(["Highest pass: Forester Pass, 13,153 ft."]);
    expect(line(plan, "precipitation")[0]).toMatch(
      /^Highest chance of precipitation in the forecast for the trip's days: \d+% on Sun, Oct 4 at /,
    );
    expect(line(plan, "thunder")[0]).toMatch(/^Highest chance of thunder in the forecast for the trip's days: \d+% on Sun, Oct 4 at /);
    expect(line(plan, "fire")).toEqual(["No mapped fire perimeter within 10 mi of these passes is on file."]);
    expect(line(plan, "road")).toEqual([]);
  });

  it("reports the true peak, with the pass and the day it falls on", () => {
    const all = SIERRA.flatMap((s) =>
      DETAILS[s].forecast!.days
        .filter((d) => d.date >= "2026-10-02" && d.date <= "2026-10-04")
        .map((d) => ({ name: DETAILS[s].pass.name, date: d.date, value: d.precip_chance ?? 0 })),
    );
    const peak = Math.max(...all.map((d) => d.value));
    expect(line(plan, "precipitation")[0]).toContain(`${peak}% on`);
    for (const hit of all.filter((d) => d.value === peak && d.date === "2026-10-04")) {
      expect(line(plan, "precipitation")[0]).toContain(hit.name);
    }
  });

  it("says a flat zero plainly", () => {
    const dry = build(trip(SIERRA, { start: "2026-10-01", end: "2026-10-03" }));
    expect(line(dry, "precipitation")).toEqual([
      "The forecast for the trip's days shows a 0% chance of precipitation at every pass that has one.",
    ]);
  });
});

describe("a trip beyond the forecast", () => {
  const far = build(trip(SIERRA, { start: "2027-07-12", end: "2027-07-15" }));

  it("shows no forecast at all", () => {
    expect(far.horizon).toBe("beyond");
    expect(far.passes.every((p) => p.forecast === null)).toBe(true);
    expect(line(far, "precipitation")).toEqual([]);
    expect(line(far, "thunder")).toEqual([]);
  });

  it("says plainly that conditions that far ahead are not known", () => {
    expect(line(far, "horizon")).toEqual([
      "The trip starts 286 days from today. The forecast on file reaches Mon, Oct 5. Conditions that far ahead are not known. Everything below describes Tue, Sep 29, today, and no forecast is shown.",
    ]);
    expect(far.summary.find((l) => l.kind === "horizon")?.warm).toBe(true);
    expect(line(far, "dates")[0]).toContain("Mon, Jul 12, 2027 to Thu, Jul 15, 2027");
  });

  it("labels today's verdict as today's, never last season's", () => {
    for (const p of far.passes) expect(p.verdict).toMatchObject({ date: "2026-09-29", latest: true });
    expect(line(far, "verdicts")[0]).toContain("as of Tue, Sep 29, today");
  });

  it("still shows what describes the present: fire and road status", () => {
    const burning = build(trip(["cooper-pass"], { start: "2027-07-12", end: "2027-07-15" }));
    expect(burning.passes[0].fire?.close).toBe(true);
  });
});

describe("a trip that runs past the end of the forecast", () => {
  const plan = build(trip(SIERRA, { start: "2026-10-04", end: "2026-10-08" }));
  it("shows the days it has and says where knowledge stops", () => {
    expect(plan.horizon).toBe("partly");
    expect(plan.passes[0].forecast?.days.map((d) => d.date)).toEqual(["2026-10-04", "2026-10-05"]);
    expect(line(plan, "horizon")).toEqual([
      "The forecast on file reaches Mon, Oct 5. Conditions after that day are not known, and the trip runs to Thu, Oct 8.",
    ]);
  });
});

describe("a trip with no dates", () => {
  const plan = build(trip(SIERRA, { start: null, end: null, activity: null, party_size: null }));
  it("shows the week ahead and says no dates were read", () => {
    expect(plan.horizon).toBe("undated");
    expect(plan.passes[0].forecast?.days).toHaveLength(7);
    expect(line(plan, "horizon")).toEqual([
      "No dates were read from the text. The forecast shown is the week ahead, through Mon, Oct 5.",
    ]);
    expect(line(plan, "dates")).toEqual([]);
    expect(line(plan, "precipitation")[0]).toContain("for the week ahead");
  });
});

describe("a trip that is already over", () => {
  const plan = build(trip(["glen", "cooper-pass"], { start: "2026-07-12", end: "2026-07-15" }));
  it("shows the verdict on file nearest its dates and nothing about the present", () => {
    expect(plan.horizon).toBe("past");
    expect(plan.passes[0].verdict).toMatchObject({ date: "2026-07-15", latest: false });
    expect(plan.passes.every((p) => p.forecast === null && p.fire === null && p.roads.length === 0)).toBe(true);
    expect(line(plan, "fire")).toEqual([]);
    expect(line(plan, "horizon")[0]).toMatch(/^These dates are in the past\./);
  });
});

describe("fire and smoke", () => {
  it("names a pass within ten miles of a perimeter", () => {
    const plan = build(trip(["cooper-pass", "aasgard"]));
    expect(line(plan, "fire")).toEqual([
      "Cooper Pass is 0.2 mi in a straight line from the mapped perimeter of the Three Queens Fire.",
    ]);
    expect(plan.passes[0].fire).toMatchObject({ close: true, smoke: null });
    // Aasgard's nearest fire is 10.4 mi off: shown on the pass, not in the summary.
    expect(plan.passes[1].fire).toMatchObject({ close: false });
    expect(plan.passes[1].fire?.fire?.name).toBe("Goat Fire");
    expect(fireLine(plan.passes[0].fire!)).toBe("Three Queens Fire, 9,575 acres, 33% contained, 0.2 mi to the south");
  });

  it("names a pass inside a perimeter", () => {
    const plan = build(trip(["basalt-pass"]));
    expect(line(plan, "fire")).toEqual(["Basalt Pass is inside the mapped perimeter of the Little Giant Fire."]);
    expect(plan.summary.find((l) => l.kind === "fire")?.warm).toBe(true);
  });

  it("carries smoke over the pass", () => {
    const plan = build(trip(["badger-pass"]));
    expect(plan.passes[0].fire).toMatchObject({ smoke: "light", smoke_date: "2026-09-29" });
  });

  it("drops fire facts that are no longer current", () => {
    const later = build(trip(["cooper-pass"], { start: null, end: null }), DETAILS, "2026-10-03");
    expect(later.passes[0].fire).toBeNull();
    expect(later.passes[0].forecast).toBeNull();
    expect(line(later, "horizon")).toEqual(["No dates were read from the text. No forecast is on file."]);
  });
});

describe("official avalanche ratings and road status", () => {
  const rating: AvalancheRating = {
    zone: "Central Sierra Nevada",
    center: "Sierra Avalanche Center",
    center_link: "https://www.sierraavalanchecenter.org/",
    link: "https://www.sierraavalanchecenter.org/forecasts/avalanche/central-sierra-nevada",
    level: 3,
    rating: "Considerable",
    travel_advice: "Dangerous avalanche conditions. Careful snowpack evaluation, cautious route-finding and conservative decision-making essential.",
    valid_from: "2026-09-29T07:00:00",
    valid_until: "2026-09-30T07:00:00",
    valid_until_utc: "2026-09-30T14:00:00+00:00",
    timezone: "America/Los_Angeles",
    off_season: false,
    warning: null,
  };
  const chains: RoadStatus = {
    agency: "Caltrans",
    agency_link: "https://roads.dot.ca.gov/",
    road: "I-80",
    location: "Donner Summit",
    lat: 39.34,
    lon: -120.33,
    active: true,
    updated: "2026-09-29T10:05:08",
    lines: [{ label: "East", code: "R-2", text: "Chains or traction devices are required on all vehicles except four-wheel-drive vehicles with snow tires." }],
    distance_mi: 2.1,
    named: true,
  };
  const winter: Record<string, PassDetail> = {
    ...DETAILS,
    donner: {
      ...DETAILS.donner,
      winter: { ...DETAILS.donner.winter!, avalanche: rating, roads: [chains, ...(DETAILS.donner.winter!.roads ?? [])] },
    },
  };

  it("carries the rating as issued, with the center's name and link", () => {
    const plan = build(trip(["donner"]), winter);
    expect(plan.passes[0].avalanche).toEqual({ rating, expired: false });
    expect(line(plan, "avalanche")).toEqual([
      "Avalanche danger at Donner Pass, as issued by Sierra Avalanche Center: Considerable.",
    ]);
  });

  it("marks a rating whose window has passed and keeps it out of the summary", () => {
    const plan = buildPlan(trip(["donner"]), winter, { today: "2026-09-30", now: Date.parse("2026-09-30T20:00:00Z") });
    expect(plan.passes[0].avalanche?.expired).toBe(true);
    expect(line(plan, "avalanche")).toEqual([]);
  });

  it("tells a pass outside every zone from one whose zones were not read", () => {
    expect(build(trip(["glen"])).passes[0].avalanche).toBeNull();
    const unread = { ...DETAILS.glen, winter: { issued_for: TODAY, fetched_at: null } };
    expect("avalanche" in build(trip(["glen"]), { glen: unread }).passes[0]).toBe(false);
    expect(build(trip(["aasgard"])).passes[0].avalanche).toMatchObject({
      expired: false,
      rating: { center: "Northwest Avalanche Center", level: null, off_season: true },
    });
  });

  it("reports a road restriction with the agency that issued it", () => {
    const plan = build(trip(["donner"]), winter);
    expect(line(plan, "road")).toEqual([
      "Caltrans reports a restriction on I-80 at Donner Summit, 2.1 mi in a straight line from Donner Pass.",
    ]);
    expect(plan.passes[0].roads[0].lines[0].text).toBe(chains.lines[0].text);
  });

  it("says when the highway points on file report nothing", () => {
    expect(line(build(trip(["donner"])), "road")).toEqual([
      "No road restriction is on file at the highway points near these passes.",
    ]);
  });
});

describe("disagreement and missing files", () => {
  it("carries the streams' disagreement onto the plan", () => {
    const latest = DETAILS.glen.statuses["2026-09-29"];
    const split = {
      ...DETAILS.glen,
      statuses: {
        ...DETAILS.glen.statuses,
        "2026-09-29": { ...latest, conflicts: ["Sensors suggest more snow than parties on the ground do."] },
      },
    };
    expect(build(trip(["glen"]), { glen: split }).passes[0].verdict.conflicts).toEqual([
      "Sensors suggest more snow than parties on the ground do.",
    ]);
  });

  it("says which pass file could not be read and plans the rest", () => {
    const plan = build(trip(SIERRA), { ...DETAILS, glen: undefined });
    expect(plan.passes.map((p) => [p.order, p.slug])).toEqual([
      [1, "kearsarge"],
      [2, "forester"],
    ]);
    expect(plan.missing.map((m) => m.slug)).toEqual(["glen"]);
    expect(line(plan, "missing")).toEqual(["The file for Glen Pass could not be read, so nothing is shown for it."]);
  });

  it("holds together with no passes at all", () => {
    const plan = build(trip([], { unplaced: ["Rae Lakes loop"] }));
    expect(plan.passes).toEqual([]);
    expect(line(plan, "verdicts")).toEqual([]);
    expect(line(plan, "fire")).toEqual([]);
  });
});

describe("how a pass came to be on the plan", () => {
  it("separates passes the person named from passes picked for them", () => {
    const plan = build(
      trip([], {
        passes: [
          stop("glen", { kind: "mention", matched: "rae lakes", alias: "the pass after rae lakes" }),
          stop("kearsarge"),
          stop("aasgard", { kind: "place", matched: "stuart lake", place: "Stuart Lake Trailhead", place_kind: "trailhead", distance_mi: 3.2 }),
        ],
      }),
    );
    expect(plan.passes.map((p) => p.named)).toEqual([false, true, false]);
  });

  it("says so in a sentence", () => {
    expect(whyLine({ kind: "name", matched: "glen pass" })).toBe('Named in the text as "glen pass".');
    expect(whyLine({ kind: "place", matched: "stuart lake", place: "Stuart Lake Trailhead", place_kind: "trailhead", distance_mi: 3.2 })).toBe(
      "Not named in the text. It is 3.2 mi in a straight line from Stuart Lake Trailhead, which the text names. A language model picked it as part of this trip.",
    );
    expect(whyLine({ kind: "route", route: "John Muir Trail" })).toContain("It is on John Muir Trail, which the text names.");
    expect(whyLine({ kind: "fuzzy", matched: "asgaard", alias: "aasgard", similarity: 0.86 })).toContain('resembles "aasgard"');
    expect(whyLine({ kind: "mention", matched: "rae lakes", alias: "the pass after rae lakes" })).toContain('the text says "rae lakes"');
  });

  it("counts namesakes from the index", () => {
    const plan = buildPlan(trip(["glen"]), DETAILS, { today: TODAY, now: NOW, nameCounts: { "Glen Pass": 3 } });
    expect(plan.passes[0].namesakes).toBe(3);
    expect(build(trip(["glen"])).passes[0].namesakes).toBe(1);
  });
});

describe("dates", () => {
  it("labels days, adding the year only when it is not this one", () => {
    expect(dayLabel("2026-10-03", TODAY)).toBe("Sat, Oct 3");
    expect(dayLabel("2027-07-12", TODAY)).toBe("Mon, Jul 12, 2027");
    expect(datesLabel(trip([], { start: "2026-10-03", end: "2026-10-03" }), TODAY)).toBe("Sat, Oct 3");
    expect(datesLabel(trip([], { start: null, end: null }), TODAY)).toBeNull();
  });
  it("places a trip against the forecast", () => {
    const t = (start: string | null, end: string | null) => trip([], { start, end });
    expect(horizonOf(t(null, null), TODAY, "2026-10-05")).toBe("undated");
    expect(horizonOf(t("2026-09-29", "2026-10-05"), TODAY, "2026-10-05")).toBe("within");
    expect(horizonOf(t("2026-10-05", "2026-10-06"), TODAY, "2026-10-05")).toBe("partly");
    expect(horizonOf(t("2026-10-06", "2026-10-07"), TODAY, "2026-10-05")).toBe("beyond");
    expect(horizonOf(t("2026-10-02", "2026-10-03"), TODAY, null)).toBe("beyond");
    expect(horizonOf(t("2026-09-20", "2026-09-28"), TODAY, "2026-10-05")).toBe("past");
    expect(horizonOf(t("2026-09-27", "2026-09-29"), TODAY, "2026-10-05")).toBe("within");
  });
});

describe("voice", () => {
  // Snowline's own sentences: every summary line and every line saying how a
  // pass got on the plan, across every kind of trip above. Official text is
  // quoted from the data and is not Snowline's voice.
  const plans = [
    build(trip(SIERRA)),
    build(trip(SIERRA, { start: "2027-07-12", end: "2027-07-15" })),
    build(trip(SIERRA, { start: "2026-10-04", end: "2026-10-08" })),
    build(trip(SIERRA, { start: null, end: null })),
    build(trip(["glen"], { start: "2026-07-12", end: "2026-07-15" })),
    build(trip(["cooper-pass", "basalt-pass", "badger-pass", "donner", "aasgard"])),
    build(trip(SIERRA), { ...DETAILS, glen: undefined }),
  ];
  const own = [
    ...plans.flatMap((p) => p.summary.map((l) => l.text)),
    ...plans.flatMap((p) => p.passes.map((x) => whyLine(x.why))),
    whyLine({ kind: "route", route: "John Muir Trail" }),
    whyLine({ kind: "fuzzy", matched: "a", alias: "b", similarity: 0.8 }),
  ];

  it("describes and never advises, recommends, reassures or warns", () => {
    const banned =
      /\b(should|must|bring|avoid|safe|safely|unsafe|danger(?:ous)?|recommend\w*|advis\w*|warn\w*|careful|caution|good to go|best|worst|ideal|perfect|enjoy|beware|consider|expect|plan to|be sure|make sure|don't|do not)\b/i;
    for (const text of own) {
      // The one allowed use: naming the official rating, which is "Avalanche danger ... as issued by".
      const checked = text.replace(/^Avalanche danger at .* as issued by .*$/, "");
      expect(checked, text).not.toMatch(banned);
    }
  });

  it("claims nothing Snowline has no data for", () => {
    const absent = /\b(hours?|minutes?|mileage|miles of trail|trail miles|difficult\w*|strenuous|easy|moderate hike|permit\w*|quota|water sources?|elevation gain)\b/i;
    for (const text of own) expect(text, text).not.toMatch(absent);
  });

  it("calls every distance a straight line", () => {
    for (const text of own) {
      if (/\d mi\b/.test(text) && !/within 10 mi/.test(text)) expect(text, text).toContain("straight line");
    }
  });

  it("uses no em dashes and ends every sentence", () => {
    for (const text of own) {
      expect(text).not.toMatch(/[—–]/);
      expect(text).toMatch(/\.$/);
    }
  });
});
