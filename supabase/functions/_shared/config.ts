// Model names, prices and limits live here and nowhere else.
export const MODEL = "claude-haiku-4-5";
// Used for one call only, when the default model twice fails to return a
// valid answer.
export const ESCALATION_MODEL = "claude-sonnet-5";

/** US dollars per million tokens: [input, output]. */
export const PRICE_PER_MTOK: Record<string, [number, number]> = {
  "claude-haiku-4-5": [1.0, 5.0],
  "claude-sonnet-5": [2.0, 10.0],
};

export const FREE_QUESTIONS_PER_DAY = 5;
export const PLUS_QUESTIONS_PER_DAY = 100;
export const MAX_QUESTION_CHARS = 300;
export const MAX_ANSWER_TOKENS = 1024;

// A trip plan is one model call that reads the typed text and picks passes
// from a list. It draws on the same daily budget as questions.
export const FREE_PLANS_PER_DAY = 2;
export const PLUS_PLANS_PER_DAY = 30;
export const MAX_TRIP_CHARS = 400;
export const MAX_TRIP_TOKENS = 1024;
/** The most passes the model is shown, and the most a plan may hold. */
export const MAX_TRIP_CANDIDATES = 40;
export const MAX_TRIP_PASSES = 20;
/** Whole-word windows of the text are compared with pass names at this similarity or better. */
export const FUZZY_CUTOFF = 0.78;
/** How long a function instance may reuse the pass index it fetched. */
export const INDEX_TTL_MS = 10 * 60_000;

/** Ledger entries older than this, relative to the date viewed, are not evidence. */
export const LEDGER_WINDOW_DAYS = 30;
export const LEDGER_MAX_LINES = 12;
