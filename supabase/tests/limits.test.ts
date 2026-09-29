import { describe, expect, it } from "vitest";
import {
  FREE_PLANS_PER_DAY,
  FREE_QUESTIONS_PER_DAY,
  MODEL,
  PLUS_PLANS_PER_DAY,
  PLUS_QUESTIONS_PER_DAY,
} from "../functions/_shared/config.ts";
import { allowance, costUsd, planAllowance } from "../functions/_shared/limits.ts";

describe("costUsd", () => {
  it("prices tokens per million for the configured model", () => {
    expect(costUsd(MODEL, 1_000_000, 0)).toBeCloseTo(1.0);
    expect(costUsd(MODEL, 0, 1_000_000)).toBeCloseTo(5.0);
    expect(costUsd(MODEL, 2_000, 300)).toBeCloseTo(0.0035);
  });
  it("refuses to guess a price for a model it does not know", () => {
    expect(() => costUsd("some-other-model", 1, 1)).toThrow();
  });
});

describe("allowance", () => {
  const base = { plan: "free", askedToday: 0, spentTodayUsd: 0, budgetUsd: 5 };
  it("lets a free user ask up to the daily limit", () => {
    expect(allowance({ ...base, askedToday: FREE_QUESTIONS_PER_DAY - 1 })).toEqual({ ok: true });
    const over = allowance({ ...base, askedToday: FREE_QUESTIONS_PER_DAY });
    expect(over.ok).toBe(false);
    expect(over).toMatchObject({ reason: "daily_limit" });
  });
  it("gives Plus a higher limit", () => {
    const plus = { ...base, plan: "plus", askedToday: FREE_QUESTIONS_PER_DAY };
    expect(allowance(plus)).toEqual({ ok: true });
    expect(allowance({ ...plus, askedToday: PLUS_QUESTIONS_PER_DAY }).ok).toBe(false);
  });
  it("stops everyone once the day's budget is spent", () => {
    expect(allowance({ ...base, spentTodayUsd: 5 })).toMatchObject({ ok: false, reason: "budget" });
  });
  it("treats an unknown plan as free", () => {
    expect(allowance({ ...base, plan: "mystery", askedToday: FREE_QUESTIONS_PER_DAY }).ok).toBe(false);
  });
});

describe("planAllowance", () => {
  const base = { plan: "free", plannedToday: 0, spentTodayUsd: 0, budgetUsd: 5 };
  it("gives a free account two plans a day and Plus thirty", () => {
    expect(FREE_PLANS_PER_DAY).toBe(2);
    expect(PLUS_PLANS_PER_DAY).toBe(30);
  });
  it("lets a free user plan up to the daily limit", () => {
    expect(planAllowance({ ...base, plannedToday: FREE_PLANS_PER_DAY - 1 })).toEqual({ ok: true });
    expect(planAllowance({ ...base, plannedToday: FREE_PLANS_PER_DAY })).toMatchObject({
      ok: false,
      reason: "daily_limit",
    });
  });
  it("gives Plus a higher limit", () => {
    const plus = { ...base, plan: "plus", plannedToday: FREE_PLANS_PER_DAY };
    expect(planAllowance(plus)).toEqual({ ok: true });
    expect(planAllowance({ ...plus, plannedToday: PLUS_PLANS_PER_DAY }).ok).toBe(false);
  });
  it("shares the day's budget with questions", () => {
    expect(planAllowance({ ...base, spentTodayUsd: 5 })).toMatchObject({ ok: false, reason: "budget" });
  });
  it("treats an unknown plan as free", () => {
    expect(planAllowance({ ...base, plan: "mystery", plannedToday: FREE_PLANS_PER_DAY }).ok).toBe(false);
  });
});
