// Saved passes on this device and on the account: storage, the network, and
// the moments a sync runs. The rules themselves are in savedSync.ts.

import type { SyncStatus } from "./account";
import { backend } from "./backend";
import { offlineSupported, removeOffline } from "./offline";
import { passFile } from "./paths";
import {
  confirm,
  note,
  parseSaved,
  parseState,
  reconcile,
  sameList,
  type Sent,
  stateFor,
  type SyncState,
} from "./savedSync";
import type { PassDetail } from "./types";

// Both must match PassPanel.tsx and MapView.tsx, which own the list and the
// event; this module is a second reader and writer of the same key.
const SAVED_KEY = "sierra-pass-report:saved";
const SAVED_EVENT = "sierra-saved-changed";

const STATE_KEY = "snowline:saved-sync";
const RETRY_MS = 60_000;

export interface SavedSnapshot {
  saved: string[];
  status: SyncStatus;
  /** Changes made on this device that the account has not confirmed. */
  pending: number;
}

const EMPTY: SavedSnapshot = { saved: [], status: "idle", pending: 0 };

let snapshot: SavedSnapshot = EMPTY;
let user: string | null = null;
let running = false;
let again = false;
let writing = false;
let retry: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

function readSaved(): string[] {
  try {
    return parseSaved(window.localStorage.getItem(SAVED_KEY));
  } catch {
    return [];
  }
}

function writeSaved(list: string[]): void {
  try {
    window.localStorage.setItem(SAVED_KEY, JSON.stringify(list));
  } catch {
    // Without storage the account still holds the list; this view shows it.
  }
  writing = true;
  try {
    window.dispatchEvent(new Event(SAVED_EVENT));
  } finally {
    writing = false;
  }
}

function readState(): SyncState {
  try {
    return parseState(window.localStorage.getItem(STATE_KEY));
  } catch {
    return parseState(null);
  }
}

function writeState(state: SyncState): void {
  try {
    window.localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    // An unsaved state makes the next sync a union, which loses nothing.
  }
}

function publish(next: Partial<SavedSnapshot>): void {
  snapshot = { ...snapshot, ...next };
  listeners.forEach((listener) => listener());
}

function count(state: SyncState): number {
  return Object.keys(state.pending).length;
}

function online(): boolean {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

async function signedInAs(target: string): Promise<boolean> {
  const { data } = await backend().auth.getSession();
  return data.session?.user.id === target;
}

/** A pass removed on another device gives up its pinned data here, as the tent button would. */
async function dropOffline(slugs: string[]): Promise<void> {
  if (!slugs.length || !offlineSupported()) return;
  for (const slug of slugs) {
    try {
      const detail = (await (await fetch(passFile(slug))).json()) as PassDetail;
      await removeOffline(slug, Object.values(detail.stations ?? {}).flat());
    } catch {
      // The pinned data stays until the pass is saved and removed again.
    }
  }
}

async function once(target: string): Promise<void> {
  if (!online()) {
    publish({ status: "offline" });
    return;
  }
  publish({ status: snapshot.status === "in_step" ? "in_step" : "checking" });

  // Row level security answers a caller with no session with an empty list,
  // not an error. Read as the account's list, that would remove every pass
  // from this device, so the session is checked on both sides of the read.
  if (!(await signedInAs(target))) return;
  const { data, error } = await backend()
    .from("saved_passes")
    .select("pass_slug, created_at")
    .eq("user_id", target);
  if (error || !Array.isArray(data)) {
    publish({ status: online() ? "waiting" : "offline" });
    return;
  }
  if (!(await signedInAs(target)) || user !== target) return;

  // Nothing awaits between reading the device's list and writing it back,
  // so a tap on the tent cannot land in between and be overwritten.
  const local = readSaved();
  const plan = reconcile({
    user: target,
    local,
    server: data.map((row) => ({ slug: String(row.pass_slug), savedAt: String(row.created_at) })),
    state: readState(),
    now: Date.now(),
  });
  writeState(plan.state);
  if (!sameList(plan.local, local)) writeSaved(plan.local);
  publish({ saved: plan.local, pending: count(plan.state) });

  let saved: Sent[] = [];
  let removed: Sent[] = [];
  if (plan.save.length) {
    const { error: saveError } = await backend()
      .from("saved_passes")
      .upsert(
        plan.save.map((s) => ({ user_id: target, pass_slug: s.slug })),
        { onConflict: "user_id,pass_slug", ignoreDuplicates: true },
      );
    if (!saveError) saved = plan.save;
  }
  if (plan.remove.length) {
    const { error: removeError } = await backend()
      .from("saved_passes")
      .delete()
      .eq("user_id", target)
      .in(
        "pass_slug",
        plan.remove.map((r) => r.slug),
      );
    if (!removeError) removed = plan.remove;
  }

  const settled = confirm(stateFor(readState(), target), { saved, removed }, Date.now());
  writeState(settled);
  const pending = count(settled);
  if (user === target) {
    publish({ pending, status: pending === 0 ? "in_step" : online() ? "waiting" : "offline" });
  }
  void dropOffline(plan.dropped);
}

async function run(): Promise<void> {
  if (!user) return;
  if (running) {
    again = true;
    return;
  }
  running = true;
  if (retry) clearTimeout(retry);
  retry = null;
  try {
    do {
      again = false;
      const target = user;
      if (!target) break;
      try {
        await once(target);
      } catch {
        publish({ status: online() ? "waiting" : "offline" });
      }
    } while (again);
  } finally {
    running = false;
  }
  if (user && snapshot.status === "waiting" && listeners.size > 0) {
    retry = setTimeout(() => void run(), RETRY_MS);
  }
}

function onSavedChanged(): void {
  if (writing) return;
  const saved = readSaved();
  if (!user) {
    publish({ saved });
    return;
  }
  const state = note(stateFor(readState(), user), saved, Date.now());
  writeState(state);
  publish({ saved, pending: count(state) });
  void run();
}

function onOnline(): void {
  void run();
}

function onOffline(): void {
  if (user) publish({ status: "offline" });
}

function onVisible(): void {
  if (document.visibilityState === "visible") void run();
}

export function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) {
    snapshot = { ...snapshot, saved: readSaved() };
    window.addEventListener(SAVED_EVENT, onSavedChanged);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    window.removeEventListener(SAVED_EVENT, onSavedChanged);
    window.removeEventListener("online", onOnline);
    window.removeEventListener("offline", onOffline);
    document.removeEventListener("visibilitychange", onVisible);
    if (retry) clearTimeout(retry);
    retry = null;
  };
}

export function getSnapshot(): SavedSnapshot {
  return snapshot;
}

export function getServerSnapshot(): SavedSnapshot {
  return EMPTY;
}

/** Signing out leaves the list and the state on the device; only the syncing stops. */
export function setUser(next: string | null): void {
  if (next === user) return;
  user = next;
  if (!user) {
    if (retry) clearTimeout(retry);
    retry = null;
    publish({ status: "idle", pending: 0, saved: readSaved() });
    return;
  }
  publish({ status: "checking", pending: count(stateFor(readState(), user)) });
  void run();
}

export function syncNow(): void {
  void run();
}
