import { describe, expect, it } from "vitest";
import { buildEvidence, cacheKey, normalizeQuestion, renderEvidence } from "../functions/_shared/evidence.ts";

const DETAIL = {
  pass: { slug: "glen", name: "Glen Pass", elevation_ft: 11926 },
  dates: ["2026-07-01", "2026-09-29"],
  statuses: {
    "2026-09-29": {
      status_label: "likely snow-free",
      confidence: "low",
      facts: [{ text: "State Lakes melted out on 2026-05-01.", stream: "sensor" }],
      conflicts: ["Sensors suggest more snow than parties on the ground do."],
    },
    "2026-07-01": { status_label: "patchy snow", confidence: "moderate", facts: [], conflicts: [] },
  },
  ledger: [
    { date: "2026-09-28", source: "sensor", title: "State Lakes: 0.0 in SWE", detail: {} },
    { date: "2026-09-20", source: "report", title: "Trip report", detail: { quote: "dry all the way over" } },
    { date: "2026-06-01", source: "report", title: "Old report", detail: { quote: "postholing" } },
  ],
  forecast: {
    days: [
      { date: "2026-09-29", high_f: 48, low_f: 27, snow_level_ft: 9300, precip_chance: 7, snowfall_in: 0, gust_mph: 30 },
    ],
  },
  access: { trailheads: [{ name: "Onion Valley", distance_mi: 4.4, gain_ft: 2740 }], campgrounds: [] },
};

describe("buildEvidence", () => {
  it("numbers the verdict, disagreements, recent ledger, forecast and trailheads", () => {
    const ev = buildEvidence(DETAIL, "2026-09-29");
    expect(ev.header).toContain("Glen Pass");
    expect(ev.header).toContain("likely snow-free");
    expect(ev.header).toContain("confidence low");
    expect(ev.lines.map((l) => l.n)).toEqual(ev.lines.map((_, i) => i + 1));
    const kinds = ev.lines.map((l) => l.kind);
    expect(kinds).toEqual(["verdict", "disagreement", "sensor", "report", "forecast", "trailhead"]);
    expect(ev.lines[3].text).toContain("dry all the way over");
  });

  it("leaves out ledger entries that are stale for the date viewed", () => {
    const ev = buildEvidence(DETAIL, "2026-09-29");
    expect(ev.lines.some((l) => l.text.includes("postholing"))).toBe(false);
  });

  it("leaves the forecast out of a past date and ignores the future ledger", () => {
    const ev = buildEvidence(DETAIL, "2026-07-01");
    expect(ev.lines.some((l) => l.kind === "forecast")).toBe(false);
    expect(ev.lines.some((l) => l.text.includes("dry all the way over"))).toBe(false);
    expect(ev.lines.some((l) => l.text.includes("postholing"))).toBe(true);
  });

  it("throws for a date the pass has no verdict for", () => {
    expect(() => buildEvidence(DETAIL, "2020-01-01")).toThrow();
  });

  it("renders numbered lines the model can cite", () => {
    const text = renderEvidence(buildEvidence(DETAIL, "2026-09-29"));
    expect(text).toContain("[1] (verdict)");
    expect(text).toContain("[4] (report, 2026-09-20)");
  });
});

describe("normalizeQuestion and cacheKey", () => {
  it("treats the same question asked two ways as one", async () => {
    expect(normalizeQuestion("  Do I need   microspikes?? ")).toBe("do i need microspikes");
    const a = await cacheKey(["m", "glen", "2026-09-29", normalizeQuestion("Any snow?")]);
    const b = await cacheKey(["m", "glen", "2026-09-29", normalizeQuestion("any  snow")]);
    const c = await cacheKey(["m", "glen", "2026-09-30", normalizeQuestion("any snow")]);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});

const FIRE = {
  fire: {
    name: "Dome Fire",
    acres: 5259,
    percent_contained: 31,
    discovered: "2026-09-15",
    updated: "2026-09-29",
    distance_mi: 20.8,
    direction: "west",
    inside: false,
  },
  smoke: "light",
  issued_for: "2026-09-29",
  smoke_date: "2026-09-28",
};

const RATING = {
  zone: "Stevens Pass",
  center: "Northwest Avalanche Center",
  level: 3,
  rating: "Considerable",
  travel_advice: "Dangerous avalanche conditions. Careful snowpack evaluation is essential.",
  valid_until: "2026-09-30T18:00:00",
  valid_until_utc: "2026-10-01T01:00:00+00:00",
  timezone: "America/Los_Angeles",
  off_season: false,
  warning: "warning",
};

const ROADS = [
  {
    agency: "Caltrans",
    road: "I-80",
    location: "Donner Summit",
    active: true,
    updated: "2026-09-29T06:10:00",
    lines: [
      { label: "East", code: "R-2", text: "Chains are required on all vehicles except four-wheel-drive vehicles." },
      { label: "West", code: "R-0", text: "No chain controls are in effect at this time." },
    ],
    distance_mi: 1.2,
    named: true,
    new_snow_in: 4,
  },
  {
    agency: "Caltrans",
    road: "SR-168",
    location: "0.3 Mi. E of Aspendell",
    active: false,
    updated: "2026-04-22T08:17:45",
    lines: [{ label: "East", code: "R-0", text: "No chain controls are in effect at this time." }],
    distance_mi: 5,
    named: false,
  },
];

const WINTER = {
  avalanche: RATING,
  fresh_snow: {
    as_of: "2026-09-28",
    facts: ["Stevens Pass measured 6 in of new snow in the 24 hours to Sep 28."],
  },
  roads: ROADS,
  issued_for: "2026-09-29",
  fetched_at: "2026-09-29T14:02:30+00:00",
};

const NOW = Date.parse("2026-09-29T15:00:00Z");
const LAYERED = { ...DETAIL, fire: FIRE, winter: WINTER };

function texts(detail: Parameters<typeof buildEvidence>[0], kind: string, date = "2026-09-29"): string[] {
  return buildEvidence(detail, date, NOW)
    .lines.filter((l) => l.kind === kind)
    .map((l) => l.text);
}

describe("buildEvidence with the fire and winter layers", () => {
  it("adds fire, smoke, avalanche, new snow and roads after the forecast, still numbered in order", () => {
    const ev = buildEvidence(LAYERED, "2026-09-29", NOW);
    expect(ev.lines.map((l) => l.n)).toEqual(ev.lines.map((_, i) => i + 1));
    expect(ev.lines.map((l) => l.kind)).toEqual([
      "verdict",
      "disagreement",
      "sensor",
      "report",
      "forecast",
      "fire",
      "smoke",
      "avalanche",
      "new snow",
      "road",
      "road",
      "trailhead",
    ]);
  });

  it("says where the nearest fire is and how big, in one plain line", () => {
    expect(texts(LAYERED, "fire")).toEqual([
      "Dome Fire is the nearest active fire: 5,259 acres, 31% contained, 21 mi to the west of the pass in a straight line. Discovered 2026-09-15, perimeter updated 2026-09-29.",
    ]);
    const ev = buildEvidence(LAYERED, "2026-09-29", NOW);
    expect(ev.lines.find((l) => l.kind === "fire")?.date).toBe("2026-09-29");
  });

  it("says when the pass is inside a perimeter and when containment is not reported", () => {
    const inside = {
      ...LAYERED,
      fire: {
        ...FIRE,
        smoke: undefined,
        fire: { ...FIRE.fire, inside: true, direction: null, distance_mi: 0, percent_contained: null, acres: 1, discovered: null },
      },
    };
    expect(texts(inside, "fire")).toEqual([
      "The pass is inside the mapped perimeter of Dome Fire: 1 acre, containment not reported. Perimeter updated 2026-09-29.",
    ]);
    expect(texts(inside, "smoke")).toEqual([]);
  });

  it("gives smoke with the date of the analysis and says it is seen from above", () => {
    expect(texts(LAYERED, "smoke")).toEqual([
      "Smoke mapped over the pass is light, from the satellite analysis of 2026-09-28. It is seen from above, so it can sit higher than the pass.",
    ]);
    const ev = buildEvidence(LAYERED, "2026-09-29", NOW);
    expect(ev.lines.find((l) => l.kind === "smoke")?.date).toBe("2026-09-28");
  });

  it("quotes the official avalanche rating as issued, with the center's name", () => {
    expect(texts(LAYERED, "avalanche")).toEqual([
      'Official avalanche rating from Northwest Avalanche Center for the Stevens Pass zone: 3 of 5, "Considerable", valid until 2026-09-30T18:00:00 (America/Los_Angeles). Northwest Avalanche Center has issued an Avalanche Warning. Its travel advice, word for word: "Dangerous avalanche conditions. Careful snowpack evaluation is essential."',
    ]);
  });

  it("never repeats a rating that has expired", () => {
    const later = Date.parse("2026-10-02T00:00:00Z");
    const line = buildEvidence(LAYERED, "2026-09-29", later).lines.find((l) => l.kind === "avalanche");
    expect(line?.text).toBe(
      "The avalanche rating Northwest Avalanche Center issued for the Stevens Pass zone expired 2026-09-30T18:00:00 (America/Los_Angeles). No current rating is on file.",
    );
    expect(line?.text).not.toContain("Considerable");
  });

  it("says plainly when there is no rating, and why", () => {
    const off = { ...LAYERED, winter: { ...WINTER, avalanche: { ...RATING, level: null, rating: "No rating", off_season: true, warning: null } } };
    expect(texts(off, "avalanche")).toEqual([
      "Northwest Avalanche Center lists the Stevens Pass zone as off season and has issued no avalanche rating.",
    ]);
    const none = { ...LAYERED, winter: { ...WINTER, avalanche: { ...RATING, level: null, rating: "No rating", off_season: false, warning: "warning" } } };
    expect(texts(none, "avalanche")).toEqual([
      "Northwest Avalanche Center has issued no avalanche rating for the Stevens Pass zone.",
    ]);
    const outside = { ...LAYERED, winter: { ...WINTER, avalanche: null } };
    expect(texts(outside, "avalanche")).toEqual([
      "This pass is outside every avalanche center's forecast zones. No official avalanche rating exists for it.",
    ]);
    const unfetched = { ...LAYERED, winter: { ...WINTER, avalanche: undefined } };
    expect(texts(unfetched, "avalanche")).toEqual([]);
  });

  it("passes the new snow facts through as written", () => {
    expect(texts(LAYERED, "new snow")).toEqual(WINTER.fresh_snow.facts);
    const ev = buildEvidence(LAYERED, "2026-09-29", NOW);
    expect(ev.lines.find((l) => l.kind === "new snow")?.date).toBe("2026-09-28");
  });

  it("quotes road reports in the agency's words, restrictions and quiet points alike", () => {
    expect(texts(LAYERED, "road")).toEqual([
      'Caltrans road report for I-80 at Donner Summit, 1.2 mi from the pass in a straight line, status set 2026-09-29T06:10:00. East, R-2: "Chains are required on all vehicles except four-wheel-drive vehicles." West, R-0: "No chain controls are in effect at this time." Roadside new snow 4 in.',
      'Caltrans road report for SR-168 at 0.3 Mi. E of Aspendell, 5 mi from the pass in a straight line, status set 2026-04-22T08:17:45. East, R-0: "No chain controls are in effect at this time."',
    ]);
  });

  it("caps road reports at the nearest four, restrictions first", () => {
    const many = Array.from({ length: 6 }, (_, i) => ({
      ...ROADS[1],
      location: `point ${i}`,
      distance_mi: i + 1,
      active: i === 5,
    }));
    const lines = texts({ ...LAYERED, winter: { ...WINTER, roads: many } }, "road");
    expect(lines).toHaveLength(4);
    expect(lines[0]).toContain("point 5");
    expect(lines[1]).toContain("point 0");
  });

  it("leaves every one of these layers out of a past date", () => {
    const ev = buildEvidence(LAYERED, "2026-07-01", NOW);
    const kinds = new Set(ev.lines.map((l) => l.kind));
    for (const kind of ["fire", "smoke", "avalanche", "new snow", "road", "forecast"]) {
      expect(kinds.has(kind)).toBe(false);
    }
  });

  it("reads a pass with no fire, no winter and no reports without inventing lines", () => {
    const bare = {
      ...DETAIL,
      fire: null,
      winter: null,
      ledger: DETAIL.ledger.filter((e) => e.source !== "report"),
      statuses: {
        ...DETAIL.statuses,
        "2026-09-29": { ...DETAIL.statuses["2026-09-29"], conflicts: [] },
      },
    };
    const ev = buildEvidence(bare, "2026-09-29", NOW);
    expect(ev.lines.map((l) => l.kind)).toEqual(["verdict", "sensor", "forecast", "trailhead"]);
    expect(renderEvidence(ev)).not.toMatch(/report|satellite|party/i);
  });

  it("keeps every line plain: one paragraph, no dashes, nothing unfilled", () => {
    for (const line of buildEvidence(LAYERED, "2026-09-29", NOW).lines) {
      expect(line.text).toMatch(/[."]$/);
      expect(line.text).not.toMatch(/\n|—|undefined|null|\[object/);
    }
  });
});
