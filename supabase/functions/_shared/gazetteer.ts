// Free text to passes. A port of gazetteer/__init__.py, widened from "which
// one pass is this report about" to "which passes might this trip cross".
//
// The rules that carry over unchanged:
// - exact alias first, then an alias inside the text as whole words, then
//   fuzzy;
// - only hand-written featured aliases and full OpenStreetMap names take
//   part in scanning free text. OSM short forms ("big" for Big Saddle)
//   match only when they are the entire text.
//
// What differs, because a trip names several passes and a report names one:
// - every pass that shares a matched name is a candidate, not only the
//   first, so the model can tell namesakes apart from the rest of the text;
// - fuzzy matching compares windows of one to four words, not the whole
//   text, and a window must start with the same letter as the name;
// - runs of spaces collapse, so "Kearsarge, Glen" scans like "kearsarge glen".
import { FUZZY_CUTOFF, MAX_TRIP_CANDIDATES } from "./config.ts";

export interface IndexPass {
  slug: string;
  name: string;
  aliases: string[];
  tier: "featured" | "osm";
  lat: number;
  lon: number;
  elevation_ft: number;
  state?: string;
}

export interface TripRoute {
  name: string;
  passes: string[];
  aliases?: string[];
  sport?: string;
}

export interface TripPlace {
  name: string;
  kind: "trailhead" | "campground";
  passes: { slug: string; distance_mi: number }[];
}

export type Why =
  | { kind: "name"; matched: string }
  | { kind: "fuzzy"; matched: string; alias: string; similarity: number }
  | { kind: "mention"; matched: string; alias: string }
  | { kind: "route"; route: string }
  | { kind: "place"; matched: string; place: string; place_kind: "trailhead" | "campground"; distance_mi: number };

export interface Candidate {
  pass: IndexPass;
  why: Why;
  /** Straight-line miles from the visitor, only when they shared a position. */
  from_you_mi?: number;
}

export interface CandidateSet {
  candidates: Candidate[];
  /** Named routes found in the text, whether or not their passes fit under the cap. */
  routes: { name: string; passes: string[] }[];
}

export function norm(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/ +/g, " ")
    .trim();
}

const APOSTROPHE = /['’]/g;

// "Devil's Gate Pass" is also written "Devils Gate Pass".
const spelled = (name: string) => [norm(name), norm(name.replace(APOSTROPHE, ""))];

function keys(p: IndexPass, freeText: boolean): string[] {
  if (freeText && p.tier === "osm") return spelled(p.name);
  return [...spelled(p.name), norm(p.slug), ...p.aliases.flatMap(spelled)];
}

/** Every pass behind each key, in index order (featured passes come first). */
function aliasIndex(passes: IndexPass[], freeText: boolean): Map<string, IndexPass[]> {
  const index = new Map<string, IndexPass[]>();
  for (const p of passes) {
    for (const key of new Set(keys(p, freeText))) {
      if (!key) continue;
      const held = index.get(key);
      if (held) held.push(p);
      else index.set(key, [p]);
    }
  }
  return index;
}

function longestMatch(
  a: string,
  b: string,
  alo: number,
  ahi: number,
  blo: number,
  bhi: number,
): [number, number, number] {
  let besti = alo;
  let bestj = blo;
  let bestsize = 0;
  let prev = new Map<number, number>();
  for (let i = alo; i < ahi; i++) {
    const next = new Map<number, number>();
    for (let j = blo; j < bhi; j++) {
      if (a[i] !== b[j]) continue;
      const k = (prev.get(j - 1) ?? 0) + 1;
      next.set(j, k);
      if (k > bestsize) {
        besti = i - k + 1;
        bestj = j - k + 1;
        bestsize = k;
      }
    }
    prev = next;
  }
  return [besti, bestj, bestsize];
}

/** Ratcliff and Obershelp similarity, as Python's difflib.SequenceMatcher(None, a, b).ratio(). */
export function ratio(a: string, b: string): number {
  if (!a.length && !b.length) return 1;
  let matched = 0;
  const queue: [number, number, number, number][] = [[0, a.length, 0, b.length]];
  while (queue.length) {
    const [alo, ahi, blo, bhi] = queue.pop()!;
    const [i, j, k] = longestMatch(a, b, alo, ahi, blo, bhi);
    if (!k) continue;
    matched += k;
    if (alo < i && blo < j) queue.push([alo, i, blo, j]);
    if (i + k < ahi && j + k < bhi) queue.push([i + k, ahi, j + k, bhi]);
  }
  return (2 * matched) / (a.length + b.length);
}

function bestFuzzy(q: string, index: Map<string, IndexPass[]>, sameInitial: boolean): { key: string; score: number } | null {
  let best: { key: string; score: number } | null = null;
  for (const key of index.keys()) {
    if (sameInitial && key[0] !== q[0]) continue;
    // The most two strings of these lengths could score; skips most names.
    if ((2 * Math.min(key.length, q.length)) / (key.length + q.length) < FUZZY_CUTOFF) continue;
    const score = ratio(key, q);
    if (score >= FUZZY_CUTOFF && (!best || score > best.score)) best = { key, score };
  }
  return best;
}

/** One pass for a piece of text that is about one pass, or null. The Python rule, unchanged. */
export function resolve(text: string | null | undefined, passes: IndexPass[]): string | null {
  if (!text) return null;
  const q = norm(text);
  if (!q) return null;
  const exact = aliasIndex(passes, false).get(q);
  if (exact) return exact[0].slug;
  const index = aliasIndex(passes, true);
  const padded = ` ${q} `;
  let best: { length: number; slug: string } | null = null;
  for (const [alias, held] of index) {
    if (padded.includes(` ${alias} `) && (!best || alias.length > best.length)) {
      best = { length: alias.length, slug: held[0].slug };
    }
  }
  if (best) return best.slug;
  const fuzzy = bestFuzzy(q, index, false);
  return fuzzy ? index.get(fuzzy.key)![0].slug : null;
}

interface Span {
  start: number;
  end: number;
}

function occurrences(padded: string, key: string): Span[] {
  const spans: Span[] = [];
  const needle = ` ${key} `;
  let at = padded.indexOf(needle);
  while (at !== -1) {
    // Offsets are into the unpadded text.
    spans.push({ start: at, end: at + key.length });
    at = padded.indexOf(needle, at + 1);
  }
  return spans;
}

const inside = (inner: Span, outer: Span) =>
  inner.start >= outer.start && inner.end <= outer.end && inner.end - inner.start < outer.end - outer.start;
const overlaps = (a: Span, b: Span) => a.start < b.end && b.start < a.end;

// Words that say what kind of thing a name is, not which one. A window or a
// place made only of these matches nothing.
const GENERIC = new Set([
  "the", "a", "an", "and", "of", "to", "from", "on", "in", "at", "via", "over", "after", "then", "with",
  "pass", "gap", "saddle", "summit", "col", "divide", "notch", "lake", "lakes", "creek", "river", "fork",
  "peak", "mountain", "mount", "mt", "trail", "trailhead", "loop", "camp", "campground", "camping",
  "area", "backcountry", "meadow", "meadows", "valley", "north", "south", "east", "west", "upper", "lower",
  "big", "little", "old", "new",
]);

const PLACE_SUFFIX = [
  "backcountry camping", "camping area", "family campground", "group campground", "horse campground",
  "horse camp", "campground", "trailhead", "camp",
];

/** "Stuart Lake Trailhead" is named in a text that says "Stuart Lake". */
export function placeKey(name: string): string | null {
  let key = norm(name.replace(APOSTROPHE, ""));
  for (const suffix of PLACE_SUFFIX) {
    if (key.endsWith(` ${suffix}`)) {
      key = key.slice(0, -suffix.length - 1);
      break;
    }
  }
  const words = key.split(" ").filter(Boolean);
  const telling = words.filter((w) => !GENERIC.has(w));
  // One telling word beside a generic one ("stuart lake") is a name; a lone
  // word must be long enough not to be an everyday one.
  if (!telling.length) return null;
  if (words.length === 1 && words[0].length < 7) return null;
  return words.join(" ");
}

/** What a hand-written alias mentions once the generic words are gone: "the pass after rae lakes" mentions "rae lakes". */
export function aliasMention(alias: string): string | null {
  const words = norm(alias).split(" ");
  if (words.length < 3) return null;
  const drop = new Set(["the", "pass", "after", "on", "gap"]);
  const kept = words.filter((w) => !drop.has(w));
  if (kept.length < 2 || kept.length === words.length) return null;
  // The mention must be one unbroken run of the alias.
  const joined = kept.join(" ");
  return ` ${words.join(" ")} `.includes(` ${joined} `) ? joined : null;
}

/** routes.json as the routes export writes it; anything malformed is skipped. */
export function parseRoutes(doc: unknown): TripRoute[] {
  const list = (doc as { routes?: unknown } | null)?.routes;
  if (!Array.isArray(list)) return [];
  const routes: TripRoute[] = [];
  for (const r of list as Record<string, unknown>[]) {
    if (!r || typeof r.name !== "string" || !Array.isArray(r.passes)) continue;
    const passes = r.passes.filter((slug): slug is string => typeof slug === "string");
    if (!passes.length) continue;
    routes.push({
      name: r.name,
      passes,
      ...(Array.isArray(r.aliases)
        ? { aliases: r.aliases.filter((a): a is string => typeof a === "string") }
        : {}),
      ...(typeof r.sport === "string" ? { sport: r.sport } : {}),
    });
  }
  return routes;
}

/** places.json as scripts/build_trip_places.py writes it. */
export function parsePlaces(doc: unknown): TripPlace[] {
  const list = (doc as { places?: unknown } | null)?.places;
  if (!Array.isArray(list)) return [];
  const places: TripPlace[] = [];
  for (const p of list as Record<string, unknown>[]) {
    if (!p || typeof p.name !== "string" || !Array.isArray(p.passes)) continue;
    if (p.kind !== "trailhead" && p.kind !== "campground") continue;
    const passes = (p.passes as unknown[]).flatMap((pair) =>
      Array.isArray(pair) && typeof pair[0] === "string" && typeof pair[1] === "number"
        ? [{ slug: pair[0], distance_mi: pair[1] }]
        : [],
    );
    if (passes.length) places.push({ name: p.name, kind: p.kind, passes });
  }
  return places;
}

const EARTH_MI = 3958.8;

export function milesBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_MI * Math.asin(Math.sqrt(h));
}

const PASSES_PER_PLACE = 5;
const PASSES_PER_SHARED_PLACE = 3;

const RANK: Record<Why["kind"], number> = { name: 0, fuzzy: 1, mention: 2, route: 3, place: 4 };

interface Found {
  pass: IndexPass;
  why: Why;
  at: number;
}

export function findCandidates(
  text: string,
  passes: IndexPass[],
  options: {
    routes?: TripRoute[];
    places?: TripPlace[];
    position?: { lat: number; lon: number } | null;
    limit?: number;
  } = {},
): CandidateSet {
  const q = norm(text);
  if (!q) return { candidates: [], routes: [] };
  const limit = options.limit ?? MAX_TRIP_CANDIDATES;
  const bySlug = new Map(passes.map((p) => [p.slug, p]));
  const found: Found[] = [];

  const whole = aliasIndex(passes, false).get(q);
  if (whole) for (const pass of whole) found.push({ pass, why: { kind: "name", matched: q }, at: 0 });

  const index = aliasIndex(passes, true);
  const padded = ` ${q} `;
  const hits: { key: string; span: Span }[] = [];
  for (const key of index.keys()) {
    for (const span of occurrences(padded, key)) hits.push({ key, span });
  }
  // "new army pass" also contains "army pass"; the longer name is the one written.
  const named = hits.filter((h) => !hits.some((other) => inside(h.span, other.span)));
  for (const hit of named) {
    for (const pass of index.get(hit.key)!) {
      found.push({ pass, why: { kind: "name", matched: hit.key }, at: hit.span.start });
    }
  }

  const words: Span[] = [];
  for (const m of q.matchAll(/[a-z0-9]+/g)) words.push({ start: m.index, end: m.index + m[0].length });
  const fuzzy: { key: string; span: Span; score: number }[] = [];
  for (let i = 0; i < words.length; i++) {
    for (let n = 1; n <= 4 && i + n <= words.length; n++) {
      const span = { start: words[i].start, end: words[i + n - 1].end };
      if (named.some((h) => overlaps(h.span, span))) continue;
      const window = q.slice(span.start, span.end);
      if (window.length < 5) continue;
      if (window.split(" ").every((w) => GENERIC.has(w) || /^\d+$/.test(w))) continue;
      const best = bestFuzzy(window, index, true);
      if (!best) continue;
      // "glacier peak" is not a misspelled "glacier pass": it ends in a
      // different kind of thing.
      const last = window.slice(window.lastIndexOf(" ") + 1);
      if (GENERIC.has(last) && last !== best.key.slice(best.key.lastIndexOf(" ") + 1)) continue;
      fuzzy.push({ key: best.key, span, score: best.score });
    }
  }
  for (const hit of fuzzy) {
    const beaten = fuzzy.some((o) => o !== hit && overlaps(o.span, hit.span) && o.score > hit.score);
    if (beaten) continue;
    for (const pass of index.get(hit.key)!) {
      found.push({
        pass,
        why: {
          kind: "fuzzy",
          matched: q.slice(hit.span.start, hit.span.end),
          alias: hit.key,
          similarity: Math.round(hit.score * 100) / 100,
        },
        at: hit.span.start,
      });
    }
  }

  for (const pass of passes) {
    if (pass.tier !== "featured") continue;
    for (const alias of pass.aliases) {
      const mention = aliasMention(alias);
      if (!mention) continue;
      const at = padded.indexOf(` ${mention} `);
      if (at !== -1) found.push({ pass, why: { kind: "mention", matched: mention, alias }, at });
    }
  }

  const routes: CandidateSet["routes"] = [];
  for (const route of options.routes ?? []) {
    const names = [route.name, ...(route.aliases ?? [])].map(norm).filter((n) => n.length >= 3);
    const at = Math.min(...names.map((n) => padded.indexOf(` ${n} `)).filter((i) => i !== -1));
    if (!Number.isFinite(at)) continue;
    const known = route.passes.filter((slug) => bySlug.has(slug));
    routes.push({ name: route.name, passes: known });
    known.forEach((slug, i) =>
      // Fractions keep a route's passes in the route's own order.
      found.push({ pass: bySlug.get(slug)!, why: { kind: "route", route: route.name }, at: at + i / 1000 }),
    );
  }

  const position = options.position ?? null;
  const fromYou = (p: IndexPass) => (position ? milesBetween(position, p) : 0);

  const placeQ = ` ${norm(text.replace(APOSTROPHE, ""))} `;
  const namedKeys = [...(whole ? [q] : []), ...named.map((h) => h.key)];
  const placeHits: { place: TripPlace; key: string; at: number }[] = [];
  for (const place of options.places ?? []) {
    const key = placeKey(place.name);
    if (!key) continue;
    // "White Pass Camp" is not what a text that says "White Pass" is naming.
    if (namedKeys.some((name) => ` ${name} `.includes(` ${key} `))) continue;
    const at = placeQ.indexOf(` ${key} `);
    if (at !== -1) placeHits.push({ place, key, at });
  }
  const byPlace = new Map<string, { pass: IndexPass; why: Why & { kind: "place" }; at: number }>();
  const sharedBy = new Map<string, number>();
  for (const hit of placeHits) sharedBy.set(hit.key, (sharedBy.get(hit.key) ?? 0) + 1);
  for (const hit of placeHits) {
    const span = { start: hit.at, end: hit.at + hit.key.length };
    // "snow lake" inside "upper snow lake" is the shorter name of another place.
    const shadowed = placeHits.some((o) =>
      inside(span, { start: o.at, end: o.at + o.key.length }),
    );
    if (shadowed) continue;
    const near = hit.place.passes
      .flatMap((n) => {
        const pass = bySlug.get(n.slug);
        return pass ? [{ pass, distance_mi: n.distance_mi }] : [];
      })
      .sort(
        (x, y) =>
          (x.pass.tier === y.pass.tier ? 0 : x.pass.tier === "featured" ? -1 : 1) ||
          x.distance_mi - y.distance_mi,
      )
      // A name several places share speaks less surely for any one of them.
      .slice(0, (sharedBy.get(hit.key) ?? 1) > 2 ? PASSES_PER_SHARED_PLACE : PASSES_PER_PLACE);
    for (const { pass, distance_mi } of near) {
      const why: Why & { kind: "place" } = {
        kind: "place",
        matched: hit.key,
        place: hit.place.name,
        place_kind: hit.place.kind,
        distance_mi,
      };
      // One pass, several places of the same name: the trailhead speaks
      // before the campground, and the nearer before the farther.
      const held = byPlace.get(pass.slug);
      const better =
        !held ||
        (held.why.place_kind !== why.place_kind
          ? why.place_kind === "trailhead"
          : distance_mi < held.why.distance_mi);
      if (better) byPlace.set(pass.slug, { pass, why, at: hit.at });
    }
  }
  const tierFirst = (p: IndexPass) => (p.tier === "featured" ? 0 : 1);
  found.push(
    ...[...byPlace.values()]
      .sort(
        (x, y) =>
          x.at - y.at ||
          fromYou(x.pass) - fromYou(y.pass) ||
          tierFirst(x.pass) - tierFirst(y.pass) ||
          x.why.distance_mi - y.why.distance_mi,
      )
      .map((f, i) => ({ ...f, at: i })),
  );

  found.sort(
    (a, b) =>
      RANK[a.why.kind] - RANK[b.why.kind] ||
      a.at - b.at ||
      fromYou(a.pass) - fromYou(b.pass) ||
      tierFirst(a.pass) - tierFirst(b.pass),
  );
  const seen = new Set<string>();
  const candidates: Candidate[] = [];
  for (const f of found) {
    if (seen.has(f.pass.slug)) continue;
    seen.add(f.pass.slug);
    if (candidates.length >= limit) break;
    candidates.push({
      pass: f.pass,
      why: f.why,
      // Rounded to ten miles: enough to tell namesakes apart, too coarse to say where someone is.
      ...(position ? { from_you_mi: Math.round(fromYou(f.pass) / 10) * 10 } : {}),
    });
  }
  return { candidates, routes };
}
