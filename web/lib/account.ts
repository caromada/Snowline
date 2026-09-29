// What the account menu says about a plan and the day's questions. The
// limits are the backend's own numbers, so the menu cannot drift from what
// the question endpoint enforces.
import {
  FREE_QUESTIONS_PER_DAY,
  PLUS_QUESTIONS_PER_DAY,
} from "../../supabase/functions/_shared/config";

export type PlanName = "Free" | "Plus";

/** Anything other than plus reads as free, the same way the endpoint treats it. */
export function planName(plan: string | null | undefined): PlanName {
  return plan === "plus" ? "Plus" : "Free";
}

export function questionLimit(plan: string | null | undefined): number {
  return plan === "plus" ? PLUS_QUESTIONS_PER_DAY : FREE_QUESTIONS_PER_DAY;
}

/** The endpoint counts questions by UTC day, so the menu asks for that day's row. */
export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** Questions asked today against the plan's limit, as "2 of 5". */
export function usageCount(asked: number, plan: string | null | undefined): string {
  const count = Number.isFinite(asked) ? Math.max(0, Math.floor(asked)) : 0;
  return `${count} of ${questionLimit(plan)}`;
}

export type SyncStatus = "idle" | "checking" | "in_step" | "waiting" | "offline";

export function syncLine(status: SyncStatus, pending: number): string {
  const changes = `${pending} ${pending === 1 ? "change" : "changes"}`;
  if (status === "offline") {
    return pending > 0
      ? `No connection. ${changes} to saved passes will be sent when it returns.`
      : "No connection. Saved passes are shown as this device last had them.";
  }
  if (status === "waiting") {
    return pending > 0
      ? `${changes} to saved passes not yet on your account.`
      : "Your account could not be reached just now.";
  }
  if (status === "in_step") return "Saved passes match your account.";
  return "Checking your account.";
}
