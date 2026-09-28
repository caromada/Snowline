// Save a pass for the backcountry: its data, its stations' curves, and the
// map tiles around it, pinned in a cache the service worker never trims.

import { TERRAIN_TILES, VECTOR_TILEJSON } from "./mapStyle";

const OFFLINE_CACHE = "offline-passes";
const RADIUS_KM = 6;
const ZOOMS = [10, 11, 12, 13, 14];
const TERRAIN_MAXZOOM = 13;

export function offlineSupported(): boolean {
  return typeof window !== "undefined" && "caches" in window && "serviceWorker" in navigator;
}

function tileRange(lat: number, lon: number, z: number): { x: number[]; y: number[] } {
  const n = 2 ** z;
  const dLat = RADIUS_KM / 111;
  const dLon = RADIUS_KM / (111 * Math.cos((lat * Math.PI) / 180));
  const tx = (lo: number) => Math.floor(((lo + 180) / 360) * n);
  const ty = (la: number) => {
    const r = (la * Math.PI) / 180;
    return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
  };
  const span = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
  return { x: span(tx(lon - dLon), tx(lon + dLon)), y: span(ty(lat + dLat), ty(lat - dLat)) };
}

function fill(template: string, z: number, x: number, y: number): string {
  return template.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));
}

export function stationFile(provenance: string): string {
  return `data/station/${provenance.replace(/[^A-Za-z0-9_-]+/g, "_")}.json`;
}

function passUrls(slug: string, stations: string[]): string[] {
  return ["./", "data/passes.json", `data/pass/${slug}.json`, ...stations.map(stationFile)];
}

async function tileUrls(lat: number, lon: number): Promise<string[]> {
  const tilejson = (await (await fetch(VECTOR_TILEJSON)).json()) as { tiles: string[] };
  const urls: string[] = [];
  for (const z of ZOOMS) {
    const { x, y } = tileRange(lat, lon, z);
    for (const tx of x) {
      for (const ty of y) {
        urls.push(fill(tilejson.tiles[0], z, tx, ty));
        if (z <= TERRAIN_MAXZOOM) urls.push(fill(TERRAIN_TILES, z, tx, ty));
      }
    }
  }
  return urls;
}

/** Download everything a pass needs offline. Resolves to the number of files saved. */
export async function saveForOffline(
  pass: { slug: string; lat: number; lon: number },
  stations: string[],
  onProgress: (done: number, total: number) => void,
): Promise<number> {
  const cache = await caches.open(OFFLINE_CACHE);
  const urls = [...passUrls(pass.slug, stations), ...(await tileUrls(pass.lat, pass.lon))];
  let done = 0;
  let saved = 0;
  const queue = [...urls];
  // A few at a time: fast on wifi, polite to the tile servers.
  const worker = async () => {
    for (let url = queue.shift(); url; url = queue.shift()) {
      try {
        const response = await fetch(url, { mode: "cors" });
        if (response.ok) {
          await cache.put(url, response);
          saved += 1;
        }
      } catch {
        // one missing tile degrades the map, it does not fail the save
      }
      done += 1;
      onProgress(done, urls.length);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return saved;
}

/** Drop a pass's pinned data. Tiles stay: a neighbor pass may share them. */
export async function removeOffline(slug: string, stations: string[]): Promise<void> {
  const cache = await caches.open(OFFLINE_CACHE);
  await Promise.all(
    [`data/pass/${slug}.json`, ...stations.map(stationFile)].map((u) => cache.delete(u)),
  );
}
