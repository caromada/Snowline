// Every data and asset URL goes through here. Root-absolute so pages at any
// depth (/, /map/, /terms/) resolve the same files, and prefixable with
// NEXT_PUBLIC_DATA_BASE so the iOS app shell can read the live site's data.

export const DATA_BASE = process.env.NEXT_PUBLIC_DATA_BASE ?? "";

export const MAP_PATH = "/map/";

export function dataUrl(path: string): string {
  return `${DATA_BASE}/data/${path}`;
}

export function stationFile(provenance: string): string {
  return dataUrl(`station/${provenance.replace(/[^A-Za-z0-9_-]+/g, "_")}.json`);
}

export function passFile(slug: string): string {
  return dataUrl(`pass/${slug}.json`);
}
