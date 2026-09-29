// The account and question backend. The project address and the publishable
// key are public by design: they identify the project, and row level
// security decides what any caller may read or write.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://uiduywomodjjsrlxtjnr.supabase.co";
const PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_7J1NtXIO2AuMjVjMw7Ub1Q_mGbl2mhz";

const PREVIEW_KEY = "snowline:preview-ask";

/** The question box shows for everyone once NEXT_PUBLIC_BACKEND_LIVE=1 is
 * set at build time. Until sign-in email can reach the public, it shows
 * only in a browser that has opened the map with ?preview=ask (and hides
 * again with ?preview=off). */
export function backendLive(): boolean {
  if (process.env.NEXT_PUBLIC_BACKEND_LIVE === "1") return true;
  if (typeof window === "undefined") return false;
  try {
    const want = new URLSearchParams(window.location.search).get("preview");
    if (want === "ask") window.localStorage.setItem(PREVIEW_KEY, "1");
    if (want === "off") window.localStorage.removeItem(PREVIEW_KEY);
    return window.localStorage.getItem(PREVIEW_KEY) === "1";
  } catch {
    return false;
  }
}

/** The email carries a six-digit code only once a custom mail sender and
 * template are set up; until then sign-in is by the link alone. */
export const SIGN_IN_BY_CODE = process.env.NEXT_PUBLIC_EMAIL_CODE === "1";

const RETURN_KEY = "snowline:return-pass";
const RETURN_WINDOW_MS = 30 * 60_000;

/** The sign-in link lands on the map; remember which pass was open. */
export function rememberPass(slug: string): void {
  try {
    window.localStorage.setItem(RETURN_KEY, JSON.stringify({ slug, at: Date.now() }));
  } catch {
    // Without storage the link still signs in; the pass just is not reopened.
  }
}

export function recallPass(): string | null {
  try {
    const raw = window.localStorage.getItem(RETURN_KEY);
    if (!raw) return null;
    window.localStorage.removeItem(RETURN_KEY);
    const { slug, at } = JSON.parse(raw) as { slug: string; at: number };
    return Date.now() - at < RETURN_WINDOW_MS ? slug : null;
  } catch {
    return null;
  }
}

let client: SupabaseClient | null = null;

export function backend(): SupabaseClient {
  client ??= createClient(URL, PUBLISHABLE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });
  return client;
}

export interface EvidenceLine {
  n: number;
  kind: string;
  date?: string;
  text: string;
}

export interface PassAnswer {
  answered: boolean;
  answer: string;
  evidence: number[];
  lines: EvidenceLine[];
  cached: boolean;
}

export class AskError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function askPass(slug: string, date: string, question: string): Promise<PassAnswer> {
  const { data, error } = await backend().functions.invoke<PassAnswer>("ask-pass", {
    body: { slug, date, question },
  });
  if (error) {
    // A refusal from the function carries its own sentence for the reader.
    const response = (error as { context?: Response }).context;
    if (response && typeof response.json === "function") {
      const body = (await response.json().catch(() => null)) as { error?: string; code?: string } | null;
      const code = body?.code ? ` (${body.code})` : "";
      throw new AskError(`${body?.error ?? "The question could not be sent."}${code}`, response.status);
    }
    throw new AskError("The question could not be sent. Check your connection.", 0);
  }
  if (!data) throw new AskError("No answer came back. Try again.", 0);
  return data;
}
