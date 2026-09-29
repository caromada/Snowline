import { describe, expect, it } from "vitest";
import {
  FREE_QUESTIONS_PER_DAY,
  PLUS_QUESTIONS_PER_DAY,
} from "../../supabase/functions/_shared/config";
import { planName, questionLimit, syncLine, usageCount, utcDay } from "./account";

describe("planName", () => {
  it("names the two plans", () => {
    expect(planName("free")).toBe("Free");
    expect(planName("plus")).toBe("Plus");
  });
  it("reads anything else as free, as the endpoint does", () => {
    expect(planName(null)).toBe("Free");
    expect(planName(undefined)).toBe("Free");
    expect(planName("mystery")).toBe("Free");
  });
});

describe("questionLimit", () => {
  it("uses the backend's own limits", () => {
    expect(questionLimit("free")).toBe(FREE_QUESTIONS_PER_DAY);
    expect(questionLimit("plus")).toBe(PLUS_QUESTIONS_PER_DAY);
    expect(questionLimit("mystery")).toBe(FREE_QUESTIONS_PER_DAY);
  });
});

describe("utcDay", () => {
  it("gives the UTC calendar day, whatever the local one is", () => {
    expect(utcDay(new Date("2026-09-29T23:30:00-07:00"))).toBe("2026-09-30");
    expect(utcDay(new Date("2026-09-29T00:10:00Z"))).toBe("2026-09-29");
  });
});

describe("usageCount", () => {
  it("counts against the plan's limit", () => {
    expect(usageCount(2, "free")).toBe(`2 of ${FREE_QUESTIONS_PER_DAY}`);
    expect(usageCount(0, "plus")).toBe(`0 of ${PLUS_QUESTIONS_PER_DAY}`);
  });
  it("never shows a negative, fractional or missing count", () => {
    expect(usageCount(-3, "free")).toBe(`0 of ${FREE_QUESTIONS_PER_DAY}`);
    expect(usageCount(2.7, "free")).toBe(`2 of ${FREE_QUESTIONS_PER_DAY}`);
    expect(usageCount(Number.NaN, "free")).toBe(`0 of ${FREE_QUESTIONS_PER_DAY}`);
  });
});

describe("syncLine", () => {
  it("says when the device and the account agree", () => {
    expect(syncLine("in_step", 0)).toBe("Saved passes match your account.");
  });
  it("counts the changes still waiting", () => {
    expect(syncLine("waiting", 1)).toBe("1 change to saved passes not yet on your account.");
    expect(syncLine("waiting", 3)).toBe("3 changes to saved passes not yet on your account.");
    expect(syncLine("offline", 2)).toBe(
      "No connection. 2 changes to saved passes will be sent when it returns.",
    );
  });
  it("describes an unreachable account without inventing changes", () => {
    expect(syncLine("waiting", 0)).toBe("Your account could not be reached just now.");
    expect(syncLine("offline", 0)).toBe(
      "No connection. Saved passes are shown as this device last had them.",
    );
  });
  it("never uses an em dash", () => {
    for (const status of ["idle", "checking", "in_step", "waiting", "offline"] as const) {
      for (const n of [0, 1, 2]) expect(syncLine(status, n)).not.toContain("—");
    }
  });
});
