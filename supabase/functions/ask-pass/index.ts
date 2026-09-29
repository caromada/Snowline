// POST { slug, date?, question } with the caller's session token.
// Answers one question about one pass from that pass's own evidence.
import Anthropic from "npm:@anthropic-ai/sdk@0.129.0";
import { zodOutputFormat } from "npm:@anthropic-ai/sdk@0.129.0/helpers/zod";
import { createClient } from "npm:@supabase/supabase-js@2.117.2";
import { z } from "npm:zod@4.6.5";
import { ESCALATION_MODEL, MAX_ANSWER_TOKENS, MAX_QUESTION_CHARS, MODEL } from "../_shared/config.ts";
import { CORS_HEADERS, json } from "../_shared/cors.ts";
import {
  buildEvidence,
  cacheKey,
  normalizeQuestion,
  type PassEvidenceSource,
  renderEvidence,
} from "../_shared/evidence.ts";
import { allowance, costUsd } from "../_shared/limits.ts";
import { ASK_SYSTEM, askUserMessage } from "../_shared/prompt.ts";

const Answer = z.object({
  answered: z.boolean(),
  answer: z.string(),
  evidence: z.array(z.number().int()),
});
type Answer = z.infer<typeof Answer>;

const SLUG = /^[a-z0-9-]{1,80}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const anthropic = new Anthropic();

interface Spent {
  model: string;
  input: number;
  output: number;
}

async function ask(model: string, user: string, spent: Spent[]): Promise<Answer | "refused" | null> {
  const response = await anthropic.messages.parse({
    model,
    max_tokens: MAX_ANSWER_TOKENS,
    system: [{ type: "text", text: ASK_SYSTEM, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: user }],
    output_config: { format: zodOutputFormat(Answer) },
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
  if (whoError || !who.user) return json({ error: "Sign in to ask a question." }, 401);
  const userId = who.user.id;

  let body: { slug?: unknown; date?: unknown; question?: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: "The request was not valid JSON." }, 400);
  }
  const slug = typeof body.slug === "string" ? body.slug : "";
  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!SLUG.test(slug)) return json({ error: "Unknown pass." }, 400);
  if (!question) return json({ error: "Type a question first." }, 400);
  if (question.length > MAX_QUESTION_CHARS) {
    return json({ error: `Keep the question under ${MAX_QUESTION_CHARS} characters.` }, 400);
  }
  if (body.date !== undefined && (typeof body.date !== "string" || !DATE.test(body.date))) {
    return json({ error: "That date is not valid." }, 400);
  }

  const today = new Date().toISOString().slice(0, 10);
  const [{ data: profile }, { data: usage }, { data: spend }] = await Promise.all([
    supabase.from("profiles").select("plan").eq("id", userId).maybeSingle(),
    supabase.from("usage_daily").select("questions").eq("user_id", userId).eq("day", today).maybeSingle(),
    supabase.from("llm_spend_daily").select("cost_usd").eq("day", today).maybeSingle(),
  ]);
  const allowed = allowance({
    plan: profile?.plan ?? "free",
    askedToday: usage?.questions ?? 0,
    spentTodayUsd: Number(spend?.cost_usd ?? 0),
    budgetUsd: Number(Deno.env.get("LLM_BUDGET_USD") ?? "5"),
  });
  if (!allowed.ok) return json({ error: allowed.message, reason: allowed.reason }, 429);

  const site = (Deno.env.get("SITE_URL") ?? "").replace(/\/$/, "");
  const passResponse = await fetch(`${site}/data/pass/${slug}.json`);
  if (passResponse.status === 404) return json({ error: "Unknown pass." }, 404);
  if (!passResponse.ok) return json({ error: "The pass data could not be read. Try again shortly." }, 502);
  const detail = (await passResponse.json()) as PassEvidenceSource;
  const date = typeof body.date === "string" ? body.date : detail.dates[detail.dates.length - 1];
  if (!detail.statuses[date]) return json({ error: "There is no verdict for that date." }, 400);

  const evidence = buildEvidence(detail, date);
  const key = await cacheKey([MODEL, slug, date, detail.dates[detail.dates.length - 1], normalizeQuestion(question)]);
  const { data: cached } = await supabase.from("answers_cache").select("answer").eq("key", key).maybeSingle();
  if (cached) return json({ ...(cached.answer as Answer), lines: evidence.lines, cached: true });

  const user = askUserMessage(renderEvidence(evidence), question);
  const spent: Spent[] = [];
  let answer: Answer | "refused" | null = null;
  let model = MODEL;
  try {
    answer = await ask(MODEL, user, spent);
    if (answer === null) answer = await ask(MODEL, user, spent);
    if (answer === null) {
      model = ESCALATION_MODEL;
      console.log(JSON.stringify({ event: "llm_escalation", from: MODEL, to: model, slug }));
      answer = await ask(model, user, spent);
    }
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return json({ error: "Too many questions at once. Try again in a minute." }, 429);
    }
    if (error instanceof Anthropic.APIError) {
      console.error(JSON.stringify({ event: "llm_error", status: error.status, message: error.message }));
      return json({ error: "The answer could not be written. Try again shortly." }, 502);
    }
    throw error;
  } finally {
    if (spent.length) {
      const { error: recordError } = await supabase.rpc("record_question", {
        p_user: userId,
        p_input_tokens: spent.reduce((n, s) => n + s.input, 0),
        p_output_tokens: spent.reduce((n, s) => n + s.output, 0),
        p_cost_usd: spent.reduce((n, s) => n + costUsd(s.model, s.input, s.output), 0),
      });
      if (recordError) console.error(JSON.stringify({ event: "usage_error", message: recordError.message }));
    }
  }

  if (answer === "refused" || answer === null) {
    return json({ answered: false, answer: "That question could not be answered here.", evidence: [], lines: [] });
  }
  const known = new Set(evidence.lines.map((l) => l.n));
  const clean: Answer = { ...answer, evidence: answer.evidence.filter((n) => known.has(n)) };
  await supabase.from("answers_cache").upsert({
    key,
    pass_slug: slug,
    eval_date: date,
    question: normalizeQuestion(question),
    answer: clean,
    model,
  });
  return json({ ...clean, lines: evidence.lines, cached: false });
});
