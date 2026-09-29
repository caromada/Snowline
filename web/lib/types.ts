export type Status =
  | "open"
  | "snow_caution"
  | "traction_advised"
  | "not_recommended"
  | "unknown";

export interface VignetteParams {
  snow_cover: number;
  snowline_frac: number;
  creek_level: number;
  sky_fresh: boolean;
  status: Status;
  elevation_ft: number;
}

export interface PassStatusSummary {
  status: Status;
  status_label: string;
  confidence: "high" | "moderate" | "low";
}

export interface PassIndexEntry {
  slug: string;
  name: string;
  elevation_ft: number;
  lat: number;
  lon: number;
  aliases: string[];
  tier: "featured" | "osm";
  statuses: Record<string, PassStatusSummary>;
}

export interface PassIndex {
  generated_at: string;
  dates: string[];
  passes: PassIndexEntry[];
}

export interface Extraction {
  location: string | null;
  date_observed: string | null;
  snow_condition: string | null;
  traction_used: string | null;
  crossing_condition: string | null;
  exposure_comfort: string | null;
  reporter_register: string;
  quote_span: string | null;
}

export interface LedgerEntry {
  date: string;
  source: "report" | "sensor" | "satellite" | "gauge";
  glyph?: string;
  title: string;
  detail: {
    author?: string;
    source?: string;
    url?: string;
    posted_date?: string;
    extraction?: Extraction;
    quote?: string | null;
    text?: string;
    model?: string;
    provenance?: string;
    station_elevation_ft?: number | null;
    distance_km?: number;
    value?: number;
    unit?: string;
    [key: string]: unknown;
  };
}

export interface Fact {
  text: string;
  stream: "sensor" | "satellite" | "report" | "gauge" | "none";
  refs: (string | number | null)[];
}

export interface FusedStatus {
  pass_slug: string;
  eval_date: string;
  status: Status;
  status_label: string;
  severity: number | null;
  confidence: "high" | "moderate" | "low";
  confidence_score: number;
  conflicts: string[];
  facts: Fact[];
  vignette: VignetteParams;
  components?: {
    sensor: { swe_in: number; age_days: number; trend_in_per_day: number | null } | null;
    satellite: { cover_frac: number; age_days: number; modeled: boolean } | null;
    reports: { n_reports: number; severity: number; age_days: number } | null;
  };
  crossing?: {
    worst_reported: string | null;
    flow_cfs: number | null;
    flow_trend: string | null;
    diurnal_swing_pct: number | null;
    active_melt: boolean;
  };
}

export interface CurvePoint {
  date: string;
  value: number;
}

export interface CurveSeries {
  provenance: string;
  points: [string, number][];
}

export interface ForecastDay {
  date: string;
  high_f: number | null;
  low_f: number | null;
  snow_level_ft: number | null;
  precip_chance: number | null;
  snowfall_in: number | null;
  thunder_chance: number | null;
  gust_mph: number | null;
}

export interface Forecast {
  days: ForecastDay[];
  facts: string[];
  grid_elevation_ft: number;
  issued_for: string;
}

export interface Trailhead {
  name: string;
  lat: number;
  lon: number;
  /** Straight-line miles from the pass. */
  distance_mi: number;
  elevation_ft?: number;
  /** Pass elevation minus trailhead elevation; negative when the road is higher. */
  gain_ft?: number;
  fee?: boolean;
  website?: string;
  operator?: string;
  parking?: { spaces?: number; fee?: boolean; surface?: string };
}

export interface Campground {
  name: string;
  lat: number;
  lon: number;
  distance_mi: number;
  elevation_ft?: number;
  reservation?: string;
  fee?: boolean;
  sites?: number;
  tents?: boolean;
  backcountry?: boolean;
  website?: string;
  operator?: string;
}

export interface Access {
  trailheads: Trailhead[];
  campgrounds: Campground[];
}

export interface PassDetail {
  pass: {
    slug: string;
    name: string;
    elevation_ft: number;
    lat: number;
    lon: number;
    creek: string;
    aspect_note: string;
    aliases: string[];
  };
  dates: string[];
  statuses: Record<string, FusedStatus>;
  ledger: LedgerEntry[];
  /** Inline per-pass curves (the modeled satellite cover). */
  curves: Record<string, CurveSeries[]>;
  /** Nearest trailheads (with their parking) and campgrounds. */
  access?: Access;
  /** Seven days ahead at pass elevation, present only when freshly issued. */
  forecast?: Forecast;
  /** Nearest active fire and smoke overhead, present only when freshly issued. */
  fire?: import("./fireTypes").PassFire | null;
  /** Official avalanche rating, new snow and road status; see winterTypes.ts. */
  winter?: import("./winterTypes").Winter | null;
  /** What land managers published about this pass, quoted; see officialTypes.ts. */
  official?: import("./officialTypes").Official | null;
  /** Shared station curves, by metric: provenance ids to load on demand. */
  stations?: Record<string, string[]>;
}

export interface StationCurves {
  provenance: string;
  curves: Record<string, [string, number][]>;
}
