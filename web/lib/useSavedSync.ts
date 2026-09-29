"use client";

import { useEffect, useSyncExternalStore } from "react";
import { getServerSnapshot, getSnapshot, type SavedSnapshot, setUser, subscribe } from "./savedStore";

/** Keeps this device's saved passes and the signed-in account in step. */
export function useSavedSync(user: string | null): SavedSnapshot {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  useEffect(() => {
    setUser(user);
  }, [user]);
  return snapshot;
}
