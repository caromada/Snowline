import { describe, expect, it } from "vitest";
import { pacificToday as appToday } from "../../web/lib/fire";
import * as app from "../../web/lib/planTypes";
import type { UnderstoodTrip as AppTrip } from "../../web/lib/planTypes";
import * as limits from "../functions/_shared/config.ts";
import { ACTIVITIES, pacificToday, type UnderstoodTrip } from "../functions/_shared/trip.ts";

// The app cannot import the backend's modules, so it repeats the trip's
// vocabulary and limits. These tests hold the two copies together.
describe("the trip planner's app and backend", () => {
  it("hold the same limit on the typed text", () => {
    expect(app.MAX_TRIP_CHARS).toBe(limits.MAX_TRIP_CHARS);
  });
  it("know the same activities", () => {
    expect(app.ACTIVITIES).toEqual(ACTIVITIES);
  });
  it("agree on what day it is at the passes", () => {
    for (const at of ["2026-09-30T05:30:00Z", "2026-09-30T07:30:00Z", "2026-12-02T07:30:00Z"]) {
      expect(appToday(new Date(at))).toBe(pacificToday(new Date(at)));
    }
  });
  it("give a trip the same shape", () => {
    const sent: UnderstoodTrip = {
      passes: [{ slug: "glen", name: "Glen Pass", why: { kind: "name", matched: "glen pass" } }],
      start: "2026-10-02",
      end: "2026-10-04",
      activity: "backpacking",
      party_size: 2,
      unplaced: [],
    };
    // Assignable both ways, or the type check of this file fails.
    const received: AppTrip = sent;
    const back: UnderstoodTrip = received;
    expect(Object.keys(back).sort()).toEqual(["activity", "end", "party_size", "passes", "start", "unplaced"]);
  });
});
