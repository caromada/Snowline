// The marketing page reads one compact file (data/landing.json, ~18 KB over
// the wire) instead of the 1.4 MB map index. Fetched once, shared by every
// section that needs it.
import { dataUrl } from "./paths";

export type StatusKey = "open" | "snow_caution" | "traction_advised" | "not_recommended" | "unknown";

export interface LandingData {
  generated_at: string;
  dates: string[];
  status_keys: StatusKey[];
  counts: {
    passes: number;
    featured: number;
    snow_stations: number;
    stream_gauges: number;
    seasons: number;
  };
  /** [lon, lat, featured, one status digit per date, slug, name, state] */
  passes: [number, number, 0 | 1, string, string, string, string][];
  featured_today: {
    slug: string;
    name: string;
    elevation_ft: number;
    status: StatusKey;
    status_label: string;
    confidence: "high" | "moderate" | "low";
  }[];
  model: {
    priors: Record<"sensor" | "satellite" | "report", number>;
    half_life_days: Record<"sensor" | "satellite" | "report", number>;
    max_age_days: Record<"sensor" | "satellite" | "report", number>;
    snowline_rise_ft_per_day: number;
    blind_gap_ft: number;
    eval: { posts: number; overall: number; fields: Record<string, number> } | null;
  };
}

let pending: Promise<LandingData> | null = null;

export function loadLanding(): Promise<LandingData> {
  pending ??= fetch(dataUrl("landing.json")).then((r) => {
    if (!r.ok) throw new Error(`landing data ${r.status}`);
    return r.json() as Promise<LandingData>;
  });
  return pending;
}

export const STATUS_LABEL: Record<StatusKey, string> = {
  open: "likely snow-free",
  snow_caution: "patchy snow",
  traction_advised: "snow likely",
  not_recommended: "deep snow or hazards",
  unknown: "unknown",
};
