"use client";

import { useEffect } from "react";

// Production only: a caching service worker under the dev server would serve
// stale bundles and fight hot reload.
export default function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("sw.js", { scope: "./" }).catch(() => {
      // offline mode is a bonus; the site works without it
    });
  }, []);
  return null;
}
