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
