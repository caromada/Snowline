// The account and question backend. The project address and the publishable
// key are public by design: they identify the project, and row level
// security decides what any caller may read or write.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://uiduywomodjjsrlxtjnr.supabase.co";
const PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "sb_publishable_7J1NtXIO2AuMjVjMw7Ub1Q_mGbl2mhz";

/** Off until the database and functions are deployed; the app then falls
 * back to the bring-your-own-key panel. */
export const BACKEND_LIVE = process.env.NEXT_PUBLIC_BACKEND_LIVE === "1";

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
      const body = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new AskError(body?.error ?? "The question could not be sent.", response.status);
    }
    throw new AskError("The question could not be sent. Check your connection.", 0);
  }
  if (!data) throw new AskError("No answer came back. Try again.", 0);
  return data;
}
