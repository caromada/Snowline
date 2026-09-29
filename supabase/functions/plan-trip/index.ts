// POST { text, position? } with the caller's session token: reads a trip
// from what the person typed and returns the passes on it, in order, with
// its dates. POST { id } reopens a plan by its link.
//
// The model does one thing here: it chooses among passes that code found
// in the text and resolves the dates. It writes nothing the page shows.
import Anthropic from "npm:@anthropic-ai/sdk@0.129.0";
import { zodOutputFormat } from "npm:@anthropic-ai/sdk@0.129.0/helpers/zod";
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { z } from "npm:zod@4.6.5";
import { INDEX_TTL_MS, MAX_TRIP_TOKENS } from "../_shared/config.ts";
import { CORS_HEADERS, json } from "../_shared/cors.ts";
import {
  type IndexPass,
  parsePlaces,
  parseRoutes,
  type TripPlace,
  type TripRoute,
} from "../_shared/gazetteer.ts";
import { costUsd, planAllowance } from "../_shared/limits.ts";
import { planTrip, sharedView } from "../_shared/planTrip.ts";
import { ACTIVITIES, pacificToday, type TripDraft, type UnderstoodTrip } from "../_shared/trip.ts";

const Draft = z.object({
  passes: z.array(z.string()),
  start_date: z.string().nullable(),
  end_date: z.string().nullable(),
  activity: z.enum(ACTIVITIES).nullable(),
  party_size: z.number().int().nullable(),
  unplaced: z.array(z.string()),
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const anthropic = new Anthropic();

interface Spent {
  model: string;
  input: number;
  output: number;
}

async function ask(model: string, system: string, user: string, spent: Spent[]): Promise<TripDraft | "refused" | null> {
  const response = await anthropic.messages.parse({
    model,
    max_tokens: MAX_TRIP_TOKENS,
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: user }],
    output_config: { format: zodOutputFormat(Draft) },
  });
  spent.push({
    model,
    input:
      response.usage.input_tokens +
      (response.usage.cache_creation_input_tokens ?? 0) +
      (response.usage.cache_read_input_tokens ?? 0),
    output: response.usage.output_tokens,
  });
  console.log(
    JSON.stringify({
      event: "llm_call",
      model,
      input_tokens: response.usage.input_tokens,
      cache_read_input_tokens: response.usage.cache_read_input_tokens ?? 0,
      output_tokens: response.usage.output_tokens,
      stop_reason: response.stop_reason,
    }),
  );
  if (response.stop_reason === "refusal") return "refused";
  return response.parsed_output ?? null;
}

// The index is a few megabytes and changes once a day; one instance reads
// it once every few minutes, not once a request.
const held = new Map<string, { at: number; value: unknown }>();

async function site<T>(path: string, read: (doc: unknown) => T): Promise<T | null> {
  const hit = held.get(path);
  if (hit && Date.now() - hit.at < INDEX_TTL_MS) return hit.value as T | null;
  const base = (Deno.env.get("SITE_URL") ?? "").replace(/\/$/, "");
  const response = await fetch(`${base}/data/${path}`);
  if (response.status === 404) {
    held.set(path, { at: Date.now(), value: null });
    return null;
  }
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  const value = read(await response.json());
  held.set(path, { at: Date.now(), value });
  return value;
}

function readIndex(doc: unknown): { passes: IndexPass[]; dataDate: string } {
  const index = doc as { dates: string[]; passes: (IndexPass & { statuses?: unknown })[] };
  return {
    dataDate: index.dates[index.dates.length - 1],
    passes: index.passes.map(({ slug, name, aliases, tier, lat, lon, elevation_ft, state }) => ({
      slug,
      name,
      aliases,
      tier,
      lat,
      lon,
      elevation_ft,
      ...(typeof state === "string" ? { state } : {}),
    })),
  };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Use POST." }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const { data: who, error: whoError } = await supabase.auth.getUser(token);
  if (whoError || !who.user) return json({ error: "Sign in to plan a trip." }, 401);
  const userId = who.user.id;

  let body: { id?: unknown; text?: unknown; position?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "The request was not valid JSON." }, 400);
  }

  if (body.id !== undefined) {
    if (typeof body.id !== "string" || !UUID.test(body.id)) return json({ error: "That plan link is not valid." }, 400);
    const { data: row } = await supabase
      .from("trip_plans")
      .select("id, user_id, text, trip, data_date, created_at")
      .eq("id", body.id)
      .maybeSingle();
    if (!row) return json({ error: "That plan is no longer on file." }, 404);
    return json(sharedView(row as Parameters<typeof sharedView>[0], userId));
  }

  const spent: Spent[] = [];
  const day = new Date().toISOString().slice(0, 10);
  try {
    const outcome = await planTrip(body, {
      today: pacificToday(),
      loadIndex: () => site("passes.json", readIndex).catch(() => null),
      loadRoutes: async () => (await site<TripRoute[]>("routes.json", parseRoutes).catch(() => null)) ?? [],
      loadPlaces: async () => (await site<TripPlace[]>("places.json", parsePlaces).catch(() => null)) ?? [],
      cached: async (key) => {
        const { data } = await supabase.from("trip_cache").select("trip").eq("key", key).maybeSingle();
        return (data?.trip as UnderstoodTrip | undefined) ?? null;
      },
      allowance: async () => {
        const [{ data: profile }, { data: usage }, { data: spend }] = await Promise.all([
          supabase.from("profiles").select("plan").eq("id", userId).maybeSingle(),
          supabase.from("usage_daily").select("plans").eq("user_id", userId).eq("day", day).maybeSingle(),
          supabase.from("llm_spend_daily").select("cost_usd").eq("day", day).maybeSingle(),
        ]);
        return planAllowance({
          plan: profile?.plan ?? "free",
          plannedToday: usage?.plans ?? 0,
          spentTodayUsd: Number(spend?.cost_usd ?? 0),
          budgetUsd: Number(Deno.env.get("LLM_BUDGET_USD") ?? "5"),
        });
      },
      ask: (model, system, user) => ask(model, system, user, spent),
      remember: async (row) => {
        const { error } = await supabase.from("trip_cache").upsert(row);
        if (error) console.error(JSON.stringify({ event: "cache_error", message: error.message }));
      },
      save: async (row) => {
        const { data, error } = await supabase
          .from("trip_plans")
          .insert({ user_id: userId, ...row })
          .select("id")
          .single();
        if (error) console.error(JSON.stringify({ event: "save_error", message: error.message }));
        return (data?.id as string | undefined) ?? null;
      },
      log: (event) => console.log(JSON.stringify(event)),
    });
    return json(outcome.body, outcome.status);
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return json({ error: "Too many trips at once. Try again in a minute.", code: "model_429" }, 429);
    }
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      console.error(JSON.stringify({ event: "llm_error", status: error.status, message: error.message }));
      return json({ error: "The trip planner is not set up correctly yet.", code: `model_${error.status}` }, 502);
    }
    if (error instanceof Anthropic.APIError) {
      console.error(JSON.stringify({ event: "llm_error", status: error.status, message: error.message }));
      return json(
        { error: "The trip could not be read. Try again shortly.", code: `model_${error.status ?? "network"}` },
        502,
      );
    }
    const message = error instanceof Error ? error.message : String(error);
    console.error(JSON.stringify({ event: "plan_error", message }));
    return json({ error: "The trip could not be read. Try again shortly.", code: "internal" }, 500);
  } finally {
    if (spent.length) {
      const { error: recordError } = await supabase.rpc("record_plan", {
        p_user: userId,
        p_input_tokens: spent.reduce((n, s) => n + s.input, 0),
        p_output_tokens: spent.reduce((n, s) => n + s.output, 0),
        p_cost_usd: spent.reduce((n, s) => n + costUsd(s.model, s.input, s.output), 0),
      });
      if (recordError) console.error(JSON.stringify({ event: "usage_error", message: recordError.message }));
    }
  }
});
