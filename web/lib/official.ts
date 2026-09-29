// Pure helpers for the official reports section: how old a report is on
// the day it is read, and how to print the date the agency gave it.

import type { OfficialReport } from "./officialTypes";
import type { Sprite } from "./pixel";

// Must match MAX_AGE_DAYS in fusion/official.py. The export is static, so a
// page built on Monday is still being read on Friday; the age is taken
// again here, against the reader's day.
export const MAX_AGE_DAYS = 21;

const PACIFIC = "America/Los_Angeles";
const DAY_MS = 86_400_000;
const COUNTS = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
  "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen",
  "nineteen", "twenty", "twenty-one",
];

function utcDay(iso: string): number | null {
  const m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(iso);
  if (!m) return null;
  const [year, month, day] = [+m[1], +m[2], +m[3]];
  const at = new Date(Date.UTC(year, month - 1, day));
  // Date rolls 02-30 over into March; a date that moved was never a date.
  if (at.getUTCMonth() !== month - 1 || at.getUTCDate() !== day) return null;
  return at.getTime();
}

function pacificDay(now: number): number | null {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: PACIFIC,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(now));
  return utcDay(parts);
}

/** Whole calendar days from the agency's date to today in Pacific time. */
export function daysAgo(date: string, now: number): number | null {
  const then = utcDay(date);
  const today = pacificDay(now);
  if (then === null || today === null) return null;
  return Math.round((today - then) / DAY_MS);
}

export function agoInWords(days: number): string {
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${COUNTS[days] ?? days} days ago`;
}

export function longDate(date: string): string {
  const at = utcDay(date);
  if (at === null) return date;
  return new Date(at).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function currentReports(reports: OfficialReport[], now: number): OfficialReport[] {
  return reports.filter((report) => {
    const age = daysAgo(report.date, now);
    return age !== null && age >= 0 && age <= MAX_AGE_DAYS;
  });
}

// Ranger's flat hat: crown, band and brim. Marks words that came from staff
// on the ground.
export const rangerHat: Sprite = [
  "................",
  "................",
  "................",
  "......ssss......",
  ".....ssssss.....",
  ".....ssssss.....",
  ".....ssssss.....",
  ".....aaaaaa.....",
  "..ssssssssssss..",
  ".ssssssssssssss.",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
];
