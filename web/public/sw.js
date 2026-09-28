// Offline support. There is no signal at the trailhead, so the app has to
// work from whatever it last saw:
// - the app shell and hashed build assets: cache first (they never change)
// - pass data: network first, cached copy when offline
// - map tiles: served from cache when present, refreshed in the background,
//   and trimmed so casual browsing cannot fill the phone
// - passes saved with the tent button: tiles and data pinned in their own
//   cache (written by lib/offline.ts), never trimmed

const VERSION = "v2";
const SHELL = `shell-${VERSION}`;
const DATA = `data-${VERSION}`;
const TILES = `tiles-${VERSION}`;
const OFFLINE = "offline-passes"; // unversioned on purpose: saved trips survive upgrades
const KEEP = new Set([SHELL, DATA, TILES, OFFLINE]);
const MAX_TILES = 2500;

const TILE_HOSTS = ["tiles.openfreemap.org", "s3.amazonaws.com"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) =>
        c.addAll([
          "/",
          "/map/",
          "/manifest.webmanifest",
          "/maplibre-gl-worker.mjs",
          "/maplibre-gl-shared.mjs",
          "/icons/icon-192.png",
        ]),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !KEEP.has(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// One bar of signal can hang a request for a minute. Give the network a few
// seconds, then answer from cache while the request finishes in the
// background and refreshes it.
async function networkFirst(request, cacheName, fallbackUrl, timeoutMs = 5000) {
  const cache = await caches.open(cacheName);
  const network = fetch(request).then((response) => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  });
  try {
    return await Promise.race([
      network,
      new Promise((_, reject) => setTimeout(() => reject(new Error("slow network")), timeoutMs)),
    ]);
  } catch {
    const hit = (await caches.match(request)) || (fallbackUrl && (await caches.match(fallbackUrl)));
    if (hit) return hit;
    return network;
  }
}

async function cacheFirst(request, cacheName) {
  const hit = await caches.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) (await caches.open(cacheName)).put(request, response.clone());
  return response;
}

let trimScheduled = false;
async function trimTiles() {
  trimScheduled = false;
  const cache = await caches.open(TILES);
  const keys = await cache.keys();
  // Cache keys come back in insertion order: drop the oldest first.
  for (const key of keys.slice(0, Math.max(0, keys.length - MAX_TILES))) await cache.delete(key);
}

async function tile(request, event) {
  const hit = await caches.match(request);
  const refresh = fetch(request)
    .then(async (response) => {
      if (response.ok) {
        await (await caches.open(TILES)).put(request, response.clone());
        if (!trimScheduled) {
          trimScheduled = true;
          setTimeout(trimTiles, 5000);
        }
      }
      return response;
    })
    .catch(() => undefined);
  if (hit) {
    event.waitUntil(refresh);
    return hit;
  }
  const response = await refresh;
  if (response) return response;
  return new Response("", { status: 504, statusText: "offline" });
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (request.mode === "navigate") {
    // Offline, any page falls back to the map: it is what you came for.
    event.respondWith(networkFirst(request, SHELL, "/map/"));
    return;
  }
  if (TILE_HOSTS.includes(url.hostname)) {
    // The TileJSON describes where tiles live; keep the latest copy.
    if (url.pathname === "/planet") event.respondWith(networkFirst(request, DATA));
    else event.respondWith(tile(request, event));
    return;
  }
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes("/_next/static/") || url.pathname.includes("/glyphs/")) {
    event.respondWith(cacheFirst(request, SHELL));
  } else if (url.pathname.includes("/data/")) {
    event.respondWith(networkFirst(request, DATA));
  }
});
