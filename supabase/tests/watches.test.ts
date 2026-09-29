import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FREE_WATCHES, PLUS_WATCHES } from "../functions/_shared/config.ts";
import {
  FIRE_CLOSER_MI,
  firedWatches,
  WATCH_KINDS,
  watchCap,
  type WatchFire,
  watchInForce,
  type WatchRoad,
  type WatchSnowStation,
  type WatchSource,
} from "../functions/_shared/watches.ts";

const MIGRATION = readFileSync(
  new URL("../migrations/20260929120000_watches.sql", import.meta.url),
  "utf8",
);

const VERDICTS = {
  open: { status: "open", status_label: "Likely snow-free" },
  patchy: { status: "snow_caution", status_label: "Patchy snow" },
  snow: { status: "traction_advised", status_label: "Snow likely" },
  unknown: { status: "unknown", status_label: "Unknown" },
};

function detail(
  date: string,
  verdict: keyof typeof VERDICTS,
  extra: Partial<Pick<WatchSource, "fire" | "winter">> = {},
): WatchSource {
  return {
    pass: { slug: "sonora", name: "Sonora Pass" },
    dates: ["2026-08-01", date],
    statuses: { "2026-08-01": VERDICTS.open, [date]: VERDICTS[verdict] },
    ...extra,
  };
}

const YDAY = "2026-11-02";
const TODAY = "2026-11-03";

const fire = (over: Partial<WatchFire> = {}): WatchFire => ({
  name: "Marten Creek Fire",
  acres: 12400,
  percent_contained: 35,
  distance_mi: 18,
  direction: "southwest",
  inside: false,
  ...over,
});

const station = (over: Partial<WatchSnowStation> = {}): WatchSnowStation => ({
  name: "Leavitt Lake",
  elevation_ft: 9604,
  distance_mi: 4.2,
  as_of: TODAY,
  swe_24h_in: 0.8,
  depth_24h_in: 9,
  ...over,
});

const road = (over: Partial<WatchRoad> = {}): WatchRoad => ({
  agency: "Caltrans",
  road: "SR 108",
  location: "Sonora Pass",
  active: true,
  lines: [{ label: null, code: "R-2", text: "Chains are required on all vehicles except four wheel drive with snow tires" }],
  distance_mi: 0.3,
  named: true,
  ...over,
});

const winter = (on: string, over: { stations?: WatchSnowStation[]; as_of?: string | null; roads?: WatchRoad[] }) => ({
  winter: {
    issued_for: on,
    fresh_snow: { as_of: over.as_of === undefined ? on : over.as_of, stations: over.stations ?? [] },
    roads: over.roads ?? [],
  },
});

const kinds = (fired: { kind: string }[]) => fired.map((f) => f.kind);
const reason = (fired: { kind: string; reason: string }[], kind: string) =>
  fired.find((f) => f.kind === kind)?.reason;

describe("the watches migration and the code agree", () => {
  it("allows exactly the kinds the code knows", () => {
    const list = /kind in \(([^)]+)\)/.exec(MIGRATION)?.[1] ?? "";
    const allowed = Array.from(list.matchAll(/'([a-z_]+)'/g), (m) => m[1]);
    expect(allowed).toEqual([...WATCH_KINDS]);
  });
  it("caps watches at the numbers in the config", () => {
    const cap = /when person_plan = 'plus' then (\d+) else (\d+) end/.exec(MIGRATION);
    expect(cap).not.toBeNull();
    expect(Number(cap?.[1])).toBe(PLUS_WATCHES);
    expect(Number(cap?.[2])).toBe(FREE_WATCHES);
  });
  it("turns row level security on and gives each action its own policy", () => {
    expect(MIGRATION).toContain("alter table public.watches enable row level security;");
    for (const action of ["select", "insert", "update", "delete"]) {
      expect(MIGRATION).toMatch(new RegExp(`on public\\.watches for ${action} to authenticated`));
    }
    expect(MIGRATION.match(/\(select auth\.uid\(\)\) = user_id/g)?.length).toBe(5);
  });
  it("keeps the backend's columns out of a person's reach", () => {
    expect(MIGRATION).toContain("revoke insert, update, delete on public.watches from anon, authenticated;");
    expect(MIGRATION).toContain("grant insert (user_id, pass_slug, kind, until_date) on public.watches to authenticated;");
    expect(MIGRATION).toContain("grant update (until_date) on public.watches to authenticated;");
    expect(MIGRATION).not.toMatch(/^grant[^;]*last_verdict/m);
    expect(MIGRATION).not.toMatch(/^grant[^;]*last_notified_at/m);
  });
  it("follows the first migration's posture for functions", () => {
    const functions = MIGRATION.match(/create function/g)?.length ?? 0;
    expect(functions).toBe(1);
    expect(MIGRATION.match(/security definer\s+set search_path = ''/g)?.length).toBe(functions);
    expect(MIGRATION).toContain(
      "revoke execute on function public.enforce_watch_cap() from public, anon, authenticated;",
    );
  });
  it("has no em dash", () => {
    expect(MIGRATION).not.toContain(String.fromCharCode(0x2014));
  });
});

describe("watchCap and watchInForce", () => {
  it("gives each plan its cap and reads anything else as free", () => {
    expect(watchCap("free")).toBe(FREE_WATCHES);
    expect(watchCap("plus")).toBe(PLUS_WATCHES);
    expect(watchCap(null)).toBe(FREE_WATCHES);
    expect(watchCap("mystery")).toBe(FREE_WATCHES);
  });
  it("keeps a watch in force through its end date", () => {
    expect(watchInForce(null, TODAY)).toBe(true);
    expect(watchInForce(TODAY, TODAY)).toBe(true);
    expect(watchInForce("2026-12-01", TODAY)).toBe(true);
    expect(watchInForce(YDAY, TODAY)).toBe(false);
  });
});

describe("firedWatches: the verdict", () => {
  it("fires nothing when nothing changed", () => {
    expect(firedWatches(detail(YDAY, "patchy"), detail(TODAY, "patchy"))).toEqual([]);
  });
  it("fires nothing when today's export carries no newer date", () => {
    expect(firedWatches(detail(YDAY, "patchy"), detail(YDAY, "open"))).toEqual([]);
    expect(firedWatches(detail(TODAY, "patchy"), detail(YDAY, "open"))).toEqual([]);
  });
  it("fires any_change and snow_free when a pass melts out", () => {
    const fired = firedWatches(detail(YDAY, "patchy"), detail(TODAY, "open"));
    expect(kinds(fired)).toEqual(["any_change", "snow_free"]);
    expect(reason(fired, "snow_free")).toBe(
      "Sonora Pass reads Likely snow-free as of Nov 3; on Nov 2 it read Patchy snow.",
    );
    expect(reason(fired, "any_change")).toBe(reason(fired, "snow_free"));
  });
  it("fires any_change alone when the verdict moves toward snow", () => {
    const fired = firedWatches(detail(YDAY, "open"), detail(TODAY, "snow"));
    expect(kinds(fired)).toEqual(["any_change"]);
    expect(fired[0].reason).toBe("Sonora Pass reads Snow likely as of Nov 3; on Nov 2 it read Likely snow-free.");
  });
  it("says what the verdict was when it was unknown before", () => {
    const fired = firedWatches(detail(YDAY, "unknown"), detail(TODAY, "open"));
    expect(kinds(fired)).toEqual(["any_change", "snow_free"]);
    expect(fired[0].reason).toContain("on Nov 2 it read Unknown");
  });
  it("does not fire snow_free for a pass that was already snow-free", () => {
    expect(firedWatches(detail(YDAY, "open"), detail(TODAY, "open"))).toEqual([]);
  });
  it("skips the verdict when one side has none on file", () => {
    const today = detail(TODAY, "open");
    today.statuses = {};
    expect(firedWatches(detail(YDAY, "patchy"), today)).toEqual([]);
  });
  it("refuses to compare two different passes", () => {
    const other = { ...detail(TODAY, "open"), pass: { slug: "ebbetts", name: "Ebbetts Pass" } };
    expect(() => firedWatches(detail(YDAY, "open"), other)).toThrow();
  });
});

describe("firedWatches: new snow", () => {
  it("fires with the station that gained the most", () => {
    const today = detail(TODAY, "snow", winter(TODAY, {
      stations: [station({ name: "Sonora Pass Bridge", depth_24h_in: 4, swe_24h_in: 0.3, distance_mi: 1.1 }), station()],
    }));
    const fired = firedWatches(detail(YDAY, "snow", winter(YDAY, {})), today);
    expect(kinds(fired)).toEqual(["any_change", "new_snow"]);
    expect(reason(fired, "new_snow")).toBe(
      "Leavitt Lake (9,604 ft, 4.2 mi away) gained 0.8 in of snow water and 9 in of snow depth in the 24 hours to Nov 3.",
    );
  });
  it("names only what was measured", () => {
    const today = detail(TODAY, "snow", winter(TODAY, { stations: [station({ depth_24h_in: null, elevation_ft: null })] }));
    const fired = firedWatches(detail(YDAY, "snow"), today);
    expect(reason(fired, "new_snow")).toBe("Leavitt Lake (4.2 mi away) gained 0.8 in of snow water in the 24 hours to Nov 3.");
  });
  it("does not fire on a rise older than 24 hours", () => {
    const today = detail(TODAY, "snow", winter(TODAY, { stations: [station({ depth_24h_in: null, swe_24h_in: null })] }));
    expect(firedWatches(detail(YDAY, "snow"), today)).toEqual([]);
  });
  it("does not fire twice on the same reading", () => {
    const same = winter(TODAY, { as_of: YDAY, stations: [station({ as_of: YDAY })] });
    expect(firedWatches(detail(YDAY, "snow", same), detail(TODAY, "snow", same))).toEqual([]);
  });
  it("does not fire when the stations measured nothing", () => {
    expect(firedWatches(detail(YDAY, "snow"), detail(TODAY, "snow", winter(TODAY, { stations: [] })))).toEqual([]);
  });
  it("does not fire when the winter sources were not read", () => {
    expect(firedWatches(detail(YDAY, "snow"), detail(TODAY, "snow", { winter: null }))).toEqual([]);
  });
});

describe("firedWatches: fire nearby", () => {
  const burning = (on: string, over: Partial<WatchFire> = {}) => ({ fire: { issued_for: on, fire: fire(over) } });
  const clear = (on: string) => ({ fire: { issued_for: on } });

  it("fires when a fire appears within range", () => {
    const fired = firedWatches(detail(YDAY, "open", clear(YDAY)), detail(TODAY, "open", burning(TODAY)));
    expect(kinds(fired)).toEqual(["any_change", "fire_nearby"]);
    expect(reason(fired, "fire_nearby")).toBe(
      "The Marten Creek Fire, 12,400 acres, 35% contained, is 18 mi to the southwest of Sonora Pass as mapped on Nov 3.",
    );
  });
  it("stays quiet while the same fire holds its distance", () => {
    const fired = firedWatches(
      detail(YDAY, "open", burning(YDAY)),
      detail(TODAY, "open", burning(TODAY, { acres: 13100, distance_mi: 17 })),
    );
    expect(fired).toEqual([]);
  });
  it("fires when the edge comes closer by the threshold", () => {
    const fired = firedWatches(
      detail(YDAY, "open", burning(YDAY)),
      detail(TODAY, "open", burning(TODAY, { distance_mi: 18 - FIRE_CLOSER_MI })),
    );
    expect(reason(fired, "fire_nearby")).toBe(
      "The Marten Creek Fire, 12,400 acres, 35% contained, is 15 mi to the southwest of Sonora Pass as mapped on Nov 3; on Nov 2 its edge was 18 mi away.",
    );
  });
  it("fires when a different fire becomes the nearest", () => {
    const fired = firedWatches(
      detail(YDAY, "open", burning(YDAY)),
      detail(TODAY, "open", burning(TODAY, { name: "Clark Fork Fire", distance_mi: 6.4, acres: 1, percent_contained: null })),
    );
    expect(reason(fired, "fire_nearby")).toBe(
      "The Clark Fork Fire, 1 acre, containment not reported, is 6.4 mi to the southwest of Sonora Pass as mapped on Nov 3.",
    );
  });
  it("fires when the perimeter reaches the pass", () => {
    const fired = firedWatches(
      detail(YDAY, "open", burning(YDAY, { distance_mi: 1.2 })),
      detail(TODAY, "open", burning(TODAY, { distance_mi: 0, inside: true, direction: null, acres: null })),
    );
    expect(reason(fired, "fire_nearby")).toBe(
      "Sonora Pass is inside the mapped perimeter of the Marten Creek Fire, 35% contained, as mapped on Nov 3.",
    );
  });
  it("stays quiet while the pass remains inside the same perimeter", () => {
    const inside = { distance_mi: 0, inside: true, direction: null };
    expect(
      firedWatches(detail(YDAY, "open", burning(YDAY, inside)), detail(TODAY, "open", burning(TODAY, inside))),
    ).toEqual([]);
  });
  it("fires on a fire when the day before had no fire data, without calling it new", () => {
    const fired = firedWatches(detail(YDAY, "open", { fire: null }), detail(TODAY, "open", burning(TODAY)));
    expect(kinds(fired)).toEqual(["any_change", "fire_nearby"]);
    expect(reason(fired, "fire_nearby")).not.toMatch(/new|now/i);
  });
  it("does not read missing fire data as the fire going out", () => {
    expect(firedWatches(detail(YDAY, "open", burning(YDAY)), detail(TODAY, "open", { fire: null }))).toEqual([]);
    expect(firedWatches(detail(YDAY, "open", burning(YDAY)), detail(TODAY, "open"))).toEqual([]);
  });
});

describe("firedWatches: road restrictions", () => {
  it("fires when an agency begins reporting a restriction, in the agency's words", () => {
    const fired = firedWatches(
      detail(YDAY, "snow", winter(YDAY, { as_of: null, roads: [road({ active: false, lines: [] })] })),
      detail(TODAY, "snow", winter(TODAY, { as_of: null, roads: [road()] })),
    );
    expect(kinds(fired)).toEqual(["any_change", "road_restriction"]);
    expect(reason(fired, "road_restriction")).toBe(
      'Caltrans reports on SR 108 at Sonora Pass as of Nov 3: "R-2: Chains are required on all vehicles except four wheel drive with snow tires"',
    );
  });
  it("stays quiet while the report is unchanged", () => {
    const same = [road()];
    expect(
      firedWatches(
        detail(YDAY, "snow", winter(YDAY, { as_of: null, roads: same })),
        detail(TODAY, "snow", winter(TODAY, { as_of: null, roads: same })),
      ),
    ).toEqual([]);
  });
  it("fires when the wording of an active report changes", () => {
    const closed = road({ lines: [{ label: null, code: null, text: "Closed for the winter" }] });
    const fired = firedWatches(
      detail(YDAY, "snow", winter(YDAY, { as_of: null, roads: [road()] })),
      detail(TODAY, "snow", winter(TODAY, { as_of: null, roads: [closed] })),
    );
    expect(reason(fired, "road_restriction")).toBe(
      'Caltrans changed its report for SR 108 at Sonora Pass as of Nov 3: "Closed for the winter"',
    );
  });
  it("fires when a restriction is no longer reported", () => {
    const fired = firedWatches(
      detail(YDAY, "snow", winter(YDAY, { as_of: null, roads: [road()] })),
      detail(TODAY, "snow", winter(TODAY, { as_of: null, roads: [road({ active: false, lines: [] })] })),
    );
    expect(reason(fired, "road_restriction")).toBe(
      "Caltrans no longer reports a restriction on SR 108 at Sonora Pass as of Nov 3.",
    );
  });
  it("prefers the report that names the pass over a nearer one that does not", () => {
    const near = road({ road: "SR 4", location: "Lake Alpine", named: false, distance_mi: 0.1 });
    const fired = firedWatches(
      detail(YDAY, "snow", winter(YDAY, { as_of: null })),
      detail(TODAY, "snow", winter(TODAY, { as_of: null, roads: [near, road({ distance_mi: 2 })] })),
    );
    expect(reason(fired, "road_restriction")).toContain("SR 108 at Sonora Pass");
  });
  it("does not read a report missing from today's list as lifted", () => {
    expect(
      firedWatches(
        detail(YDAY, "snow", winter(YDAY, { as_of: null, roads: [road()] })),
        detail(TODAY, "snow", winter(TODAY, { as_of: null, roads: [] })),
      ),
    ).toEqual([]);
  });
  it("does not read missing winter data as lifted", () => {
    expect(
      firedWatches(detail(YDAY, "snow", winter(YDAY, { as_of: null, roads: [road()] })), detail(TODAY, "snow")),
    ).toEqual([]);
  });
  it("cuts a long report at a word", () => {
    const long = road({ lines: [{ label: null, code: null, text: "Chains required ".repeat(30).trim() }] });
    const fired = firedWatches(
      detail(YDAY, "snow", winter(YDAY, { as_of: null })),
      detail(TODAY, "snow", winter(TODAY, { as_of: null, roads: [long] })),
    );
    const text = reason(fired, "road_restriction") ?? "";
    expect(text.length).toBeLessThan(230);
    expect(text).toMatch(/(Chains|required)\.\.\."$/);
  });
  it("names the place alone when the agency gives no road", () => {
    const fired = firedWatches(
      detail(YDAY, "snow", winter(YDAY, { as_of: null })),
      detail(TODAY, "snow", winter(TODAY, { as_of: null, roads: [road({ road: null, lines: [] })] })),
    );
    expect(reason(fired, "road_restriction")).toBe("Caltrans reports on Sonora Pass as of Nov 3.");
  });
});

describe("firedWatches: everything at once", () => {
  const before = detail(YDAY, "open", { fire: { issued_for: YDAY }, ...winter(YDAY, { roads: [road({ active: false, lines: [] })] }) });
  const after = detail(TODAY, "snow", {
    fire: { issued_for: TODAY, fire: fire() },
    ...winter(TODAY, { stations: [station()], roads: [road()] }),
  });
  const fired = firedWatches(before, after);

  it("lists kinds in the fixed order, each once", () => {
    expect(kinds(fired)).toEqual(["any_change", "new_snow", "fire_nearby", "road_restriction"]);
  });
  it("gives any_change the verdict's sentence first", () => {
    expect(reason(fired, "any_change")).toContain("Sonora Pass reads Snow likely");
  });
  it("writes one sentence that describes and never advises", () => {
    for (const f of fired) {
      expect(f.reason).not.toContain(String.fromCharCode(0x2014));
      expect(f.reason).toMatch(/[."]$/);
      expect(f.reason).not.toMatch(/\b(should|recommend|avoid|safe|unsafe|careful|caution|must|do not|don't)\b/i);
    }
  });
});
