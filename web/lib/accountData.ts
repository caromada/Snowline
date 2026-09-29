import { utcDay } from "./account";
import { backend } from "./backend";

export interface AccountFacts {
  user: string;
  plan: string;
  /** Questions asked so far in the current UTC day. */
  asked: number;
}

/** Null when either read fails; the menu then says so rather than guess. */
export async function fetchAccount(user: string): Promise<AccountFacts | null> {
  try {
    const [profile, usage] = await Promise.all([
      backend().from("profiles").select("plan").eq("id", user).limit(1),
      backend()
        .from("usage_daily")
        .select("questions")
        .eq("user_id", user)
        .eq("day", utcDay(new Date()))
        .limit(1),
    ]);
    if (profile.error || usage.error) return null;
    const plan = profile.data?.[0]?.plan;
    const asked = usage.data?.[0]?.questions;
    return {
      user,
      plan: typeof plan === "string" ? plan : "free",
      asked: typeof asked === "number" ? asked : 0,
    };
  } catch {
    return null;
  }
}
