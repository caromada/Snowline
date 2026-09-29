// The order of work for one trip plan, with everything that touches the
// network handed in. The function's entry point supplies the real pieces;
// the tests supply fixtures, the model's replies among them.
import { ESCALATION_MODEL, MAX_TRIP_CHARS, MODEL } from "./config.ts";
import { cacheKey } from "./evidence.ts";
import { findCandidates, type IndexPass, type TripPlace, type TripRoute } from "./gazetteer.ts";
import type { Allowance } from "./limits.ts";
import { readPosition, type TripDraft, tripCacheParts, type UnderstoodTrip, validateTrip } from "./trip.ts";
import { TRIP_SYSTEM, tripUserMessage } from "./tripPrompt.ts";

export interface PlanRequest {
  text?: unknown;
  position?: unknown;
}

export interface PlanDeps {
  /** Today on the Pacific coast, YYYY-MM-DD. */
  today: string;
  loadIndex(): Promise<{ passes: IndexPass[]; dataDate: string } | null>;
  /** Both files are optional on the site; a missing one is an empty list. */
  loadRoutes(): Promise<TripRoute[]>;
  loadPlaces(): Promise<TripPlace[]>;
  cached(key: string): Promise<UnderstoodTrip | null>;
  allowance(): Promise<Allowance>;
  /** One model call. null when the reply did not parse. Throws on a failed request. */
  ask(model: string, system: string, user: string): Promise<TripDraft | "refused" | null>;
  remember(row: { key: string; text: string; today: string; data_date: string; trip: UnderstoodTrip; model: string }): Promise<void>;
  /** Stores the plan for the person and returns its id. */
  save(row: { text: string; trip: UnderstoodTrip; data_date: string }): Promise<string | null>;
  log(event: Record<string, unknown>): void;
}

export interface PlanReply {
  /** null when there is nothing to reopen: no pass was placed. */
  id: string | null;
  trip: UnderstoodTrip;
  /** Why a plan holds no passes, for the page to say plainly. */
  empty: "no_match" | "none_chosen" | "unreadable" | null;
  cached: boolean;
  today: string;
  data_date: string;
}

export type PlanOutcome =
  | { status: 200; body: PlanReply }
  | { status: 400 | 429 | 502; body: { error: string; reason?: string; code?: string } };

const NOTHING: UnderstoodTrip = {
  passes: [],
  start: null,
  end: null,
  activity: null,
  party_size: null,
  unplaced: [],
};

export async function planTrip(request: PlanRequest, deps: PlanDeps): Promise<PlanOutcome> {
  const text = typeof request.text === "string" ? request.text.trim() : "";
  if (!text) return { status: 400, body: { error: "Describe the trip first." } };
  if (text.length > MAX_TRIP_CHARS) {
    return { status: 400, body: { error: `Keep the trip under ${MAX_TRIP_CHARS} characters.` } };
  }
  const position = readPosition(request.position);

  const index = await deps.loadIndex();
  if (!index) {
    return { status: 502, body: { error: "The pass data could not be read. Try again shortly.", code: "index" } };
  }
  const [routes, places] = await Promise.all([deps.loadRoutes(), deps.loadPlaces()]);
  const set = findCandidates(text, index.passes, { routes, places, position });
  const stamp = { today: deps.today, data_date: index.dataDate };

  // Nothing for the model to choose from: no call, no cost, no count
  // against the person's day.
  if (!set.candidates.length) {
    return { status: 200, body: { id: null, trip: NOTHING, empty: "no_match", cached: false, ...stamp } };
  }

  const key = await cacheKey(
    tripCacheParts({ model: MODEL, text, today: deps.today, dataDate: index.dataDate, position }),
  );
  const finish = async (trip: UnderstoodTrip, cached: boolean): Promise<PlanOutcome> => {
    const id = trip.passes.length ? await deps.save({ text, trip, data_date: index.dataDate }) : null;
    return {
      status: 200,
      body: { id, trip, empty: trip.passes.length ? null : "none_chosen", cached, ...stamp },
    };
  };

  const held = await deps.cached(key);
  if (held) return finish(held, true);

  const allowed = await deps.allowance();
  if (!allowed.ok) return { status: 429, body: { error: allowed.message, reason: allowed.reason } };

  const user = tripUserMessage(text, deps.today, set);
  let model = MODEL;
  let draft = await deps.ask(MODEL, TRIP_SYSTEM, user);
  if (draft === null) draft = await deps.ask(MODEL, TRIP_SYSTEM, user);
  if (draft === null) {
    model = ESCALATION_MODEL;
    deps.log({ event: "llm_escalation", from: MODEL, to: model });
    draft = await deps.ask(model, TRIP_SYSTEM, user);
  }
  if (draft === "refused" || draft === null) {
    return { status: 200, body: { id: null, trip: NOTHING, empty: "unreadable", cached: false, ...stamp } };
  }

  const { trip, rejected } = validateTrip(draft, set, text, deps.today);
  if (rejected.length) deps.log({ event: "trip_rejected_passes", count: rejected.length, rejected });
  await deps.remember({ key, text, today: deps.today, data_date: index.dataDate, trip, model });
  return finish(trip, false);
}

/** What anyone holding a plan's link may see: the trip as read, never the text that was typed. */
export function sharedView(
  row: { id: string; user_id: string; text: string; trip: UnderstoodTrip; data_date: string; created_at: string },
  viewer: string,
): { id: string; trip: UnderstoodTrip; data_date: string; created_at: string; mine: boolean; text?: string } {
  const mine = row.user_id === viewer;
  return {
    id: row.id,
    trip: row.trip,
    data_date: row.data_date,
    created_at: row.created_at,
    mine,
    ...(mine ? { text: row.text } : {}),
  };
}
