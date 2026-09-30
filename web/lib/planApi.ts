// The trip planner's calls to the backend, and the reading of pass files a
// plan is built from.
import { backend } from "./backend";
import { passFile } from "./paths";
import type { PlanReply, RecentPlan, SharedPlan } from "./planTypes";
import type { PassDetail } from "./types";

export const PLAN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export class PlanError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await backend().functions.invoke<T>("plan-trip", { body });
  if (error) {
    // A refusal from the function carries its own sentence for the reader.
    const response = (error as { context?: Response }).context;
    if (response && typeof response.json === "function") {
      const said = (await response.json().catch(() => null)) as { error?: string; code?: string } | null;
      const code = said?.code ? ` (${said.code})` : "";
      throw new PlanError(`${said?.error ?? "The trip could not be sent."}${code}`, response.status);
    }
    throw new PlanError("The trip could not be sent. Check your connection.", 0);
  }
  if (!data) throw new PlanError("Nothing came back. Try again.", 0);
  return data;
}

export function planTrip(text: string, position: { lat: number; lon: number } | null): Promise<PlanReply> {
  return call<PlanReply>(position ? { text, position } : { text });
}

export function openPlan(id: string): Promise<SharedPlan> {
  return call<SharedPlan>({ id });
}

/** The person's own plans, newest first. Row level security returns no one else's. */
export async function recentPlans(limit = 8): Promise<RecentPlan[]> {
  const { data, error } = await backend()
    .from("trip_plans")
    .select("id, text, trip, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !Array.isArray(data)) return [];
  return data as RecentPlan[];
}

export async function loadDetails(slugs: string[]): Promise<Record<string, PassDetail | undefined>> {
  const files = await Promise.all(
    slugs.map((slug) =>
      fetch(passFile(slug))
        .then((r) => (r.ok ? (r.json() as Promise<PassDetail>) : undefined))
        .catch(() => undefined),
    ),
  );
  return Object.fromEntries(slugs.map((slug, i) => [slug, files[i]]));
}

export function planLink(id: string): string {
  const url = new URL("/map/", window.location.origin);
  url.searchParams.set("plan", id);
  return url.toString();
}
