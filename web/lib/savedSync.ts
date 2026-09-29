// Saved passes across devices: the merge rules, with no storage and no
// network in them.
//
// The account holds one row per saved pass and nothing about passes that
// were removed. Each device instead remembers the rows it last saw on the
// account (the base) and the changes made on it since (the pending queue).
// Comparing three lists, local, base and account, tells a removal made
// elsewhere (in the base, gone from the account) apart from a save made here
// (on the device, never in the base). A device that has never been in step
// with this account has an empty base, and the same rules then give the
// union of both lists.

/** Matches the check on saved_passes.pass_slug; one bad slug would refuse a whole insert. */
export const SLUG = /^[a-z0-9-]{1,80}$/;

export interface ServerRow {
  slug: string;
  /** created_at of the account's row, by the server's clock. */
  savedAt: string;
}

export interface PendingOp {
  op: "save" | "remove";
  /** When the change was made, by this device's clock, in milliseconds. */
  at: number;
}

export interface SyncState {
  /** Whose account the base and the queue belong to. */
  user: string | null;
  /** The account's rows as this device last saw them: slug to created_at. */
  base: Record<string, string>;
  /** Changes made on this device that the account has not confirmed. */
  pending: Record<string, PendingOp>;
  /** When this device last read the account, in milliseconds. */
  syncedAt: number | null;
}

export interface Plan {
  /** What this device's list holds after the merge. */
  local: string[];
  /** Rows to write to the account. */
  save: Sent[];
  /** Rows to delete from the account. */
  remove: Sent[];
  /** Saved on another device since the last look. */
  added: string[];
  /** Removed on another device since the last look. */
  dropped: string[];
  /** The state to store before any write goes out. */
  state: SyncState;
}

export interface Sent {
  slug: string;
  /** The queued change this write carries out, so a newer change is not cleared with it. */
  at: number;
}

export function emptyState(user: string | null = null): SyncState {
  return { user, base: {}, pending: {}, syncedAt: null };
}

function unique(slugs: string[]): string[] {
  return Array.from(new Set(slugs));
}

/** The list as stored on the device, with anything that is not a pass slug left out. */
export function parseSaved(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return unique(value.filter((s): s is string => typeof s === "string" && SLUG.test(s)));
  } catch {
    return [];
  }
}

export function parseState(raw: string | null): SyncState {
  if (!raw) return emptyState();
  try {
    const value = JSON.parse(raw) as Partial<SyncState> | null;
    if (!value || typeof value !== "object") return emptyState();
    const base: Record<string, string> = {};
    for (const [slug, savedAt] of Object.entries(value.base ?? {})) {
      if (SLUG.test(slug) && typeof savedAt === "string") base[slug] = savedAt;
    }
    const pending: Record<string, PendingOp> = {};
    for (const [slug, op] of Object.entries(value.pending ?? {})) {
      if (!SLUG.test(slug) || !op || typeof op.at !== "number") continue;
      if (op.op === "save" || op.op === "remove") pending[slug] = { op: op.op, at: op.at };
    }
    return {
      user: typeof value.user === "string" ? value.user : null,
      base,
      pending,
      syncedAt: typeof value.syncedAt === "number" ? value.syncedAt : null,
    };
  } catch {
    return emptyState();
  }
}

/** A base and a queue describe one account; against any other they say nothing. */
export function stateFor(state: SyncState, user: string): SyncState {
  return state.user === user ? state : emptyState(user);
}

/** The list the state implies: the base, plus queued saves, minus queued removals. */
export function expectedLocal(state: SyncState): Set<string> {
  const expected = new Set(Object.keys(state.base));
  for (const [slug, op] of Object.entries(state.pending)) {
    if (op.op === "save") expected.add(slug);
    else expected.delete(slug);
  }
  return expected;
}

/** Queue whatever differs between the device's list and the list the state implies. */
export function note(state: SyncState, local: string[], at: number): SyncState {
  const expected = expectedLocal(state);
  const held = new Set(local.filter((s) => SLUG.test(s)));
  const pending = { ...state.pending };
  for (const slug of held) {
    if (!expected.has(slug)) pending[slug] = { op: "save", at };
  }
  for (const slug of expected) {
    if (!held.has(slug)) pending[slug] = { op: "remove", at };
  }
  return { ...state, pending };
}

export function reconcile(input: {
  user: string;
  local: string[];
  server: ServerRow[];
  state: SyncState;
  now: number;
}): Plan {
  const owned = stateFor(input.state, input.user);
  const local = unique(input.local.filter((s) => SLUG.test(s)));
  // A change nobody recorded when it happened (made signed out, or in
  // another tab) is dated to the last look at the account, the earliest it
  // can have been made. The early date lets a save made elsewhere since then
  // outlast it: a kept pass is one tap to remove again, a lost one may go
  // unnoticed.
  const state = note(owned, local, owned.syncedAt ?? 0);

  const server = new Map<string, string>();
  for (const row of input.server) {
    if (SLUG.test(row.slug)) server.set(row.slug, row.savedAt);
  }

  const live = new Set<string>();
  const pending: Record<string, PendingOp> = {};
  const save: Sent[] = [];
  const remove: Sent[] = [];
  const added: string[] = [];
  const dropped: string[] = [];
  const held = new Set(local);

  const slugs = unique([...local, ...server.keys(), ...Object.keys(state.base), ...Object.keys(state.pending)]);
  for (const slug of slugs) {
    const op = state.pending[slug];
    const onAccount = server.get(slug);
    const known = state.base[slug];

    if (op?.op === "save") {
      live.add(slug);
      if (onAccount === undefined) {
        pending[slug] = op;
        save.push({ slug, at: op.at });
      }
      continue;
    }

    if (op?.op === "remove") {
      // Device and server clocks are compared here. A device whose clock
      // runs fast can remove a pass that was saved elsewhere moments later.
      const savedElsewhereSince =
        onAccount !== undefined && onAccount !== known && Date.parse(onAccount) > op.at;
      if (savedElsewhereSince) {
        live.add(slug);
        added.push(slug);
      } else if (onAccount !== undefined) {
        pending[slug] = op;
        remove.push({ slug, at: op.at });
      }
      continue;
    }

    if (onAccount !== undefined) {
      live.add(slug);
      if (!held.has(slug)) added.push(slug);
    } else if (held.has(slug)) {
      dropped.push(slug);
    }
  }

  const arrivals = added
    .filter((slug) => !held.has(slug))
    .sort((a, b) => (server.get(a) ?? "").localeCompare(server.get(b) ?? "") || a.localeCompare(b));

  return {
    local: [...local.filter((slug) => live.has(slug)), ...arrivals],
    save,
    remove,
    added: arrivals,
    dropped,
    state: {
      user: input.user,
      base: Object.fromEntries(server),
      pending,
      syncedAt: input.now,
    },
  };
}

/** Fold the writes the account accepted into the state. */
export function confirm(
  state: SyncState,
  done: { saved: Sent[]; removed: Sent[] },
  now: number,
): SyncState {
  const base = { ...state.base };
  const pending = { ...state.pending };
  const clear = (sent: Sent, op: PendingOp["op"]) => {
    const queued = pending[sent.slug];
    if (queued && queued.op === op && queued.at === sent.at) delete pending[sent.slug];
  };
  for (const sent of done.saved) {
    base[sent.slug] ??= new Date(now).toISOString();
    clear(sent, "save");
  }
  for (const sent of done.removed) {
    delete base[sent.slug];
    clear(sent, "remove");
  }
  return { ...state, base, pending };
}

export function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((slug, i) => slug === b[i]);
}
