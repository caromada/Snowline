import {
  FREE_PLANS_PER_DAY,
  FREE_QUESTIONS_PER_DAY,
  PLUS_PLANS_PER_DAY,
  PLUS_QUESTIONS_PER_DAY,
  PRICE_PER_MTOK,
} from "./config.ts";

export function costUsd(model: string, inputTokens: number, outputTokens: number): number {
  const price = PRICE_PER_MTOK[model];
  if (!price) throw new Error(`no price on file for model ${model}`);
  return (inputTokens * price[0] + outputTokens * price[1]) / 1_000_000;
}

export type Allowance =
  | { ok: true }
  | { ok: false; reason: "daily_limit" | "budget"; message: string };

export function allowance(input: {
  plan: string;
  askedToday: number;
  spentTodayUsd: number;
  budgetUsd: number;
}): Allowance {
  if (input.spentTodayUsd >= input.budgetUsd) {
    return {
      ok: false,
      reason: "budget",
      message: "Questions are paused for today. The evidence on this pass is all still here.",
    };
  }
  const limit = input.plan === "plus" ? PLUS_QUESTIONS_PER_DAY : FREE_QUESTIONS_PER_DAY;
  if (input.askedToday >= limit) {
    return {
      ok: false,
      reason: "daily_limit",
      message: `You have asked ${limit} questions today, which is the daily limit. It resets at midnight UTC.`,
    };
  }
  return { ok: true };
}

export function planAllowance(input: {
  plan: string;
  plannedToday: number;
  spentTodayUsd: number;
  budgetUsd: number;
}): Allowance {
  if (input.spentTodayUsd >= input.budgetUsd) {
    return {
      ok: false,
      reason: "budget",
      message: "Trip plans are paused for today. Every pass on the map is still here.",
    };
  }
  const limit = input.plan === "plus" ? PLUS_PLANS_PER_DAY : FREE_PLANS_PER_DAY;
  if (input.plannedToday >= limit) {
    return {
      ok: false,
      reason: "daily_limit",
      message:
        `You have made ${limit} trip plans today, which is the daily limit. It resets at midnight UTC. ` +
        "Plans you already made stay open to you.",
    };
  }
  return { ok: true };
}
