"use client";

import type { Session } from "@supabase/supabase-js";
import { useSyncExternalStore } from "react";
import { backend } from "./backend";

export interface SessionState {
  session: Session | null;
  /** False until the stored session, or a sign-in link in the address, has been read. */
  ready: boolean;
}

const WAITING: SessionState = { session: null, ready: false };

let current: SessionState = WAITING;
let started = false;
const listeners = new Set<() => void>();

function set(next: SessionState): void {
  current = next;
  listeners.forEach((listener) => listener());
}

// One subscription for the whole page, so the question box and the account
// menu can never disagree about who is signed in. It starts with the first
// component that asks, which keeps the backend client from being created at
// all while nothing that needs it is on the page.
function start(): void {
  if (started) return;
  started = true;
  const auth = backend().auth;
  auth
    .getSession()
    .then(({ data }) => set({ session: data.session, ready: true }))
    .catch(() => set({ session: null, ready: true }));
  auth.onAuthStateChange((_event, session) => set({ session, ready: true }));
}

function subscribe(listener: () => void): () => void {
  start();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSession(): SessionState {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => WAITING,
  );
}

export function signOut(): Promise<unknown> {
  return backend().auth.signOut();
}
