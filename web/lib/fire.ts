// Wording and freshness rules for the fire and smoke layer. The sentences
// say where a fire is and how big; they never say what to do about it.

import type { NearestFire } from "./fireTypes";
import type { Sprite } from "./pixel";

export const FIRE_SOURCE_URL =
  "https://data-nifc.opendata.arcgis.com/datasets/nifc::wfigs-current-interagency-fire-perimeters/about";
export const SMOKE_SOURCE_URL = "https://www.ospo.noaa.gov/products/land/hms.html";

// Flame with a pale core. The only sprite drawn mostly in alpenglow.
export const flame: Sprite = [
  "................",
  ".......a........",
  ".......aa.......",
  "......aaa.......",
  "......aaaa......",
  ".....aaaaa..a...",
  "....aaaaaa.aa...",
  "....aaaaaaaaa...",
  "...aaaagaaaaa...",
  "...aaaggaaaaaa..",
  "...aaagggaaaaa..",
  "...aaaggggaaaa..",
  "....aaggggaaa...",
  "....aaagggaa....",
  ".....aaaaaa.....",
  "................",
];

export function pacificToday(now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return now.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000);
}

/**
 * Whether fire data issued on a date may be drawn as the present: no more
 * than a day old by the viewer's clock, and the map is showing that day
 * rather than a past season.
 */
export function isCurrent(issuedFor: string, today: string, evalDate: string): boolean {
  return (
    Math.abs(daysBetween(issuedFor, today)) <= 1 &&
    Math.abs(daysBetween(issuedFor, evalDate)) <= 1
  );
}

export function shortDate(iso: string): string {
  return new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function miles(mi: number): string {
  if (mi < 0.1) return "less than 0.1 mi";
  return mi >= 10 ? `${Math.round(mi)} mi` : `${mi} mi`;
}

/** "Marten Creek Fire, 12,400 acres, 35% contained, 18 mi to the southwest" */
export function fireSentence(f: NearestFire): string {
  const bits = [f.name];
  if (f.acres !== null) {
    bits.push(`${f.acres.toLocaleString("en-US")} ${f.acres === 1 ? "acre" : "acres"}`);
  }
  bits.push(
    f.percent_contained !== null ? `${f.percent_contained}% contained` : "containment not reported",
  );
  bits.push(
    f.inside || !f.direction
      ? "the pass is inside the mapped perimeter"
      : `${miles(f.distance_mi)} to the ${f.direction}`,
  );
  return bits.join(", ");
}
