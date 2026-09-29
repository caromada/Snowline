// POST { slug, date, text, taps, photo_path? } with the caller's session token.
// Files one report about one pass. The words are read once by the language
// model into the structured fields; the person's own taps always win.
import Anthropic from "npm:@anthropic-ai/sdk@0.129.0";
import { zodOutputFormat } from "npm:@anthropic-ai/sdk@0.129.0/helpers/zod";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.117.2";
import { z } from "npm:zod@4.6.5";
import {
  ESCALATION_MODEL,
  MAX_PHOTO_BYTES,
  MAX_READING_TOKENS,
  MODEL,
  PHOTO_BUCKET,
} from "../_shared/config.ts";
import { CORS_HEADERS, json } from "../_shared/cors.ts";
import { costUsd } from "../_shared/limits.ts";
import { stripJpegMetadata } from "../_shared/photo.ts";
import {
  databaseRefusal,
  mergeReport,
  pacificToday,
  parseReading,
  publishedPhotoPath,
  type Reading,
  reportAllowance,
  validateFiling,
} from "../_shared/report.ts";
import {
  CROSSINGS,
  EXPOSURE,
  FLAGS,
  LARCHES,
  MOSQUITOES,
  SNOW_CONDITIONS,
  TRACTION,
  WATER,
  WILDFLOWERS,
} from "../_shared/reportFields.ts";
import { FILED_HIDDEN_MESSAGE, REPORT_SYSTEM, reportUserMessage } from "../_shared/reportPrompt.ts";

const ReadingSchema = z.object({
  flag: z.enum(["none", ...FLAGS]),
  snow_condition: z.enum(SNOW_CONDITIONS).nullable(),
  traction_used: z.enum(TRACTION).nullable(),
  crossing_condition: z.enum(CROSSINGS).nullable(),
  exposure_comfort: z.enum(EXPOSURE).nullable(),
  larches: z.enum(LARCHES).nullable(),
  wildflowers: z.enum(WILDFLOWERS).nullable(),
  mosquitoes: z.enum(MOSQUITOES).nullable(),
  water_status: z.enum(WATER).nullable(),
  water_source: z.string().nullable(),
  quote_span: z.string().nullable(),
});

const PASS_FETCH_MS = 8000;

const anthropic = new Anthropic();

interface Spent {
  model: string;
  input: number;
  output: number;
}

async function read(model: string, user: string, spent: Spent[]): Promise<Reading | "refused" | null> {
  const response = await anthropic.messages.parse({
    model,
    max_tokens: MAX_READING_TOKENS,
    system: [{ type: "text", text: REPORT_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: user }],
    output_config: { format: zodOutputFormat(ReadingSchema) },
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
      purpose: "file_report",
      model,
      input_tokens: response.usage.input_tokens,
      cache_read_input_tokens: response.usage.cache_read_input_tokens ?? 0,
      output_tokens: response.usage.output_tokens,
      stop_reason: response.stop_reason,
    }),
  );
  if (response.stop_reason === "refusal") return "refused";
  return parseReading(response.parsed_output);
}

/** The pass's name, "unknown" when there is no such pass, null when the
 * site could not be reached after one more try. */
async function passName(site: string, slug: string): Promise<string | "unknown" | null> {
  for (const wait of [0, 400]) {
    if (wait) await new Promise((done) => setTimeout(done, wait));
    try {
      const response = await fetch(`${site}/data/pass/${slug}.json`, { signal: AbortSignal.timeout(PASS_FETCH_MS) });
      if (response.status === 404) return "unknown";
      if (!response.ok) continue;
      const detail = (await response.json()) as { pass?: { name?: unknown } };
      if (typeof detail.pass?.name === "string") return detail.pass.name;
    } catch {
      continue;
    }
  }
  return null;
}

/** Rebuilds the uploaded photo without metadata under the report's own
 * name. The upload is removed whatever happens. */
async function publishPhoto(supabase: SupabaseClient, uploaded: string, reportId: string): Promise<boolean> {
  const bucket = supabase.storage.from(PHOTO_BUCKET);
  try {
    const { data: blob, error: downloadError } = await bucket.download(uploaded);
    if (downloadError || !blob || blob.size > MAX_PHOTO_BYTES) return false;
    const clean = stripJpegMetadata(new Uint8Array(await blob.arrayBuffer()));
    if (!clean) return false;
    const path = publishedPhotoPath(reportId);
    const { error: uploadError } = await bucket.upload(path, clean, { contentType: "image/jpeg", upsert: false });
    if (uploadError) return false;
    const { error: updateError } = await supabase.from("reports").update({ photo_path: path }).eq("id", reportId);
    if (updateError) {
      await bucket.remove([path]);
      return false;
    }
    return true;
  } catch (error) {
    console.error(JSON.stringify({ event: "photo_error", message: error instanceof Error ? error.message : String(error) }));
    return false;
  } finally {
    await bucket.remove([uploaded]).catch(() => {});
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return json({ error: "Use POST.", code: "method" }, 405);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // The filer is whoever the session says, never anything in the request.
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const { data: who, error: whoError } = await supabase.auth.getUser(token);
  if (whoError || !who.user) return json({ error: "Sign in to file a report.", code: "signed_out" }, 401);
  const userId = who.user.id;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ error: "The request was not valid JSON.", code: "bad_request" }, 400);
  }
  const checked = validateFiling(body, pacificToday(new Date()), userId);
  if (!checked.ok) return json({ error: checked.message, code: checked.code }, 400);
  const filing = checked.value;
  const needsReading = filing.text !== "" || filing.taps.water_source !== undefined;

  const todayUtc = new Date().toISOString().slice(0, 10);
  const [filedToday, sameDayThere, usage, spend] = await Promise.all([
    supabase.from("reports").select("pass_slug").eq("user_id", userId).eq("filed_day", todayUtc),
    supabase
      .from("reports")
      .select("id")
      .eq("user_id", userId)
      .eq("pass_slug", filing.slug)
      .eq("date_observed", filing.date),
    supabase.from("usage_daily").select("reports").eq("user_id", userId).eq("day", todayUtc).maybeSingle(),
    supabase.from("llm_spend_daily").select("cost_usd").eq("day", todayUtc).maybeSingle(),
  ]);
  const readError = filedToday.error ?? sameDayThere.error ?? usage.error ?? spend.error;
  if (readError) {
    console.error(JSON.stringify({ event: "ledger_error", message: readError.message }));
    return json({ error: "The report could not be filed just now. Try again shortly.", code: "ledger" }, 500);
  }
  if ((sameDayThere.data ?? []).length > 0) {
    const refusal = databaseRefusal({ code: "23505", message: "reports_one_per_pass_per_day_there" });
    return json({ error: refusal.message, code: refusal.code }, refusal.status);
  }
  const rows = filedToday.data ?? [];
  const allowed = reportAllowance({
    // Readings are counted as well as rows, so removing a report does not
    // buy another reading the same day.
    filedToday: Math.max(rows.length, usage.data?.reports ?? 0),
    filedForPassToday: rows.filter((r) => r.pass_slug === filing.slug).length,
    spentTodayUsd: Number(spend.data?.cost_usd ?? 0),
    budgetUsd: Number(Deno.env.get("LLM_BUDGET_USD") ?? "5"),
    needsReading,
  });
  if (!allowed.ok) return json({ error: allowed.message, code: allowed.reason }, 429);

  const site = (Deno.env.get("SITE_URL") ?? "").replace(/\/$/, "");
  const name = await passName(site, filing.slug);
  if (name === "unknown") return json({ error: "Unknown pass.", code: "bad_slug" }, 404);
  if (name === null) {
    return json({ error: "The pass could not be looked up. Try again shortly.", code: "pass_data" }, 502);
  }

  let reading: Reading | "refused" | null = null;
  let model: string | null = null;
  if (needsReading) {
    const user = reportUserMessage({
      passName: name,
      date: filing.date,
      text: filing.text,
      waterSource: filing.taps.water_source ?? null,
    });
    const spent: Spent[] = [];
    model = MODEL;
    try {
      reading = await read(MODEL, user, spent);
      if (reading === null) reading = await read(MODEL, user, spent);
      if (reading === null) {
        model = ESCALATION_MODEL;
        console.log(JSON.stringify({ event: "llm_escalation", purpose: "file_report", from: MODEL, to: model }));
        reading = await read(model, user, spent);
      }
    } catch (error) {
      if (error instanceof Anthropic.RateLimitError) {
        return json({ error: "Too many reports at once. Nothing was published. Try again in a minute.", code: "model_429" }, 429);
      }
      if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
        console.error(JSON.stringify({ event: "llm_error", status: error.status, message: error.message }));
        return json(
          { error: "Report filing is not set up correctly yet. Nothing was published.", code: `model_${error.status}` },
          502,
        );
      }
      if (error instanceof Anthropic.APIError) {
        console.error(JSON.stringify({ event: "llm_error", status: error.status, message: error.message }));
        return json(
          {
            error: "Your words could not be read just now. Nothing was published. Try again shortly.",
            code: `model_${error.status ?? "network"}`,
          },
          502,
        );
      }
      const message = error instanceof Error ? error.message : String(error);
      console.error(JSON.stringify({ event: "report_error", message }));
      return json(
        { error: "Your words could not be read just now. Nothing was published. Try again shortly.", code: "internal" },
        500,
      );
    } finally {
      if (spent.length) {
        const { error: recordError } = await supabase.rpc("record_report", {
          p_user: userId,
          p_input_tokens: spent.reduce((n, s) => n + s.input, 0),
          p_output_tokens: spent.reduce((n, s) => n + s.output, 0),
          p_cost_usd: spent.reduce((n, s) => n + costUsd(s.model, s.input, s.output), 0),
        });
        if (recordError) console.error(JSON.stringify({ event: "usage_error", message: recordError.message }));
      }
    }
    if (reading === null) {
      return json(
        { error: "Your words could not be read just now. Nothing was published. Try again shortly.", code: "unread" },
        502,
      );
    }
  }

  const { status, flag, tapped, ...conditions } = mergeReport(filing, reading);
  const id = crypto.randomUUID();
  const { data: saved, error: saveError } = await supabase
    .from("reports")
    .insert({
      id,
      user_id: userId,
      pass_slug: filing.slug,
      date_observed: filing.date,
      body: filing.text,
      ...conditions,
      status,
      flag,
      tapped,
      model,
    })
    .select("created_at")
    .single();
  if (saveError || !saved) {
    const refusal = databaseRefusal(saveError ?? {});
    if (refusal.code === "not_saved") {
      console.error(JSON.stringify({ event: "save_error", code: saveError?.code, message: saveError?.message }));
    }
    return json({ error: refusal.message, code: refusal.code }, refusal.status);
  }

  let photo: "none" | "attached" | "not_attached" = "none";
  let photoPath: string | null = null;
  if (filing.photoPath) {
    if (status === "visible" && (await publishPhoto(supabase, filing.photoPath, id))) {
      photo = "attached";
      photoPath = publishedPhotoPath(id);
    } else {
      photo = "not_attached";
      if (status !== "visible") {
        await supabase.storage.from(PHOTO_BUCKET).remove([filing.photoPath]).catch(() => {});
      }
    }
  }

  const notes: string[] = [];
  if (status === "hidden") notes.push(FILED_HIDDEN_MESSAGE);
  else if (photo === "not_attached") notes.push("The report is published. The photo could not be attached.");

  return json({
    report: {
      id,
      pass_slug: filing.slug,
      date_observed: filing.date,
      ...conditions,
      body: filing.text,
      photo_path: photoPath,
      status,
      tapped,
      created_at: saved.created_at,
      mine: true,
    },
    hidden: status === "hidden",
    photo,
    message: notes.length ? notes.join(" ") : null,
  });
});
