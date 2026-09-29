// Geometry for the season chart: one station's snow water curve cut into
// melt seasons and laid over each other by day of season. Pure functions;
// the component only draws what these return.

export interface SeasonPoint {
  /** Days since April 1 of the reading's own year. */
  day: number;
  value: number;
  date: string;
}

export interface SeasonCurve {
  year: number;
  points: SeasonPoint[];
}

export interface SeasonWindow {
  from: string;
  through: string;
}

const DAY_MS = 86_400_000;
// Same bound as MAX_STEP_IN_PER_DAY in fusion/season.py: a bigger daily step
// is a sensor fault, not snow.
const MAX_STEP_IN_PER_DAY = 10;
// Station curves are exported every third day; a wider hole than this is a
// hole in the record, and nothing is read across it.
const MAX_BRIDGE_DAYS = 10;
const STEPS = [0.5, 1, 2, 5, 10, 20, 50, 100];
const MAX_STEPS = 5;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function utc(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`);
}

export function seasonDay(iso: string): number {
  return Math.round((utc(iso) - utc(`${iso.slice(0, 4)}-04-01`)) / DAY_MS);
}

// 2025 stands in for every year: no leap day falls inside April to August.
export function windowDays(window: SeasonWindow): number {
  return seasonDay(`2025-${window.through}`) - seasonDay(`2025-${window.from}`);
}

function tooSteep(a: SeasonPoint, b: SeasonPoint): boolean {
  return Math.abs(b.value - a.value) > MAX_STEP_IN_PER_DAY * Math.max(1, b.day - a.day);
}

function withoutStrays(points: SeasonPoint[]): SeasonPoint[] {
  return points.filter((p, i) => {
    if (i === 0 || i === points.length - 1) return true;
    const before = points[i - 1];
    const after = points[i + 1];
    return !(tooSteep(before, p) && tooSteep(p, after) && !tooSteep(before, after));
  });
}

export function seasonCurves(
  points: [string, number][],
  years: number[],
  window: SeasonWindow,
  maxIn: number,
): SeasonCurve[] {
  return years
    .map((year) => {
      const lo = `${year}-${window.from}`;
      const hi = `${year}-${window.through}`;
      const inside = points
        .filter(([date, value]) => date >= lo && date <= hi && value >= 0 && value <= maxIn)
        .map(([date, value]) => ({ day: seasonDay(date), value, date }))
        .sort((a, b) => a.day - b.day);
      return { year, points: withoutStrays(inside) };
    })
    .filter((curve) => curve.points.length >= 2);
}

export function scaleTop(max: number): { top: number; step: number } {
  const need = Math.max(max, 1);
  for (const step of STEPS) {
    const top = Math.ceil(need / step) * step;
    if (top / step <= MAX_STEPS) return { top, step };
  }
  const step = STEPS[STEPS.length - 1];
  return { top: Math.ceil(need / step) * step, step };
}

export function monthTicks(window: SeasonWindow): { day: number; label: string }[] {
  const first = Number(window.from.slice(0, 2));
  const last = Number(window.through.slice(0, 2));
  const start = seasonDay(`2025-${window.from}`);
  const ticks = [];
  for (let month = first; month <= last; month++) {
    const day = seasonDay(`2025-${String(month).padStart(2, "0")}-01`) - start;
    if (day >= 0) ticks.push({ day, label: MONTHS[month - 1] });
  }
  return ticks;
}

export function linePath(
  points: SeasonPoint[],
  x: (day: number) => number,
  y: (value: number) => number,
): string {
  return points
    .map((p, i) => `${i === 0 ? "M" : "L"}${Math.round(x(p.day))} ${Math.round(y(p.value))}`)
    .join("");
}

/** The curve's value on a day, read between the two readings around it. */
export function valueOn(points: SeasonPoint[], day: number): number | null {
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (p.day === day) return p.value;
    const next = points[i + 1];
    if (next && p.day < day && day < next.day) {
      if (next.day - p.day > MAX_BRIDGE_DAYS) return null;
      return p.value + ((next.value - p.value) * (day - p.day)) / (next.day - p.day);
    }
  }
  return null;
}

/** Labels in priority order; one that would touch a placed label is dropped. */
export function placeLabels<T extends { y: number }>(labels: T[], minGap: number): T[] {
  const placed: T[] = [];
  for (const label of labels) {
    if (placed.every((other) => Math.abs(other.y - label.y) >= minGap)) placed.push(label);
  }
  return placed;
}
