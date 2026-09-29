// The winter layer as ingest/winter.py writes it and pipeline.py merges it
// into each pass file. Snowline copies official text; it never writes its
// own avalanche assessment, so nothing here is derived on the client except
// whether a rating's valid window has passed.

/** North American Public Avalanche Danger Scale levels. */
export type DangerLevel = 1 | 2 | 3 | 4 | 5;

export type DangerWord = "Low" | "Moderate" | "Considerable" | "High" | "Extreme";

export interface AvalancheRating {
  zone: string | null;
  center: string | null;
  center_link: string | null;
  /** The center's full forecast for this zone. */
  link: string | null;
  /** null when the center issued no rating. */
  level: DangerLevel | null;
  rating: DangerWord | "No rating";
  /** The center's travel advice, word for word. */
  travel_advice: string | null;
  /** Local to `timezone`, exactly as issued. */
  valid_from: string | null;
  valid_until: string | null;
  valid_until_utc: string | null;
  timezone: string | null;
  off_season: boolean;
  warning: "warning" | "watch" | "special" | null;
}

export interface FreshSnowStation {
  provenance: string;
  name: string;
  elevation_ft: number | null;
  distance_mi: number;
  as_of: string;
  confirmed_by: "depth" | "nearby station";
  swe_24h_in: number | null;
  swe_72h_in: number | null;
  depth_24h_in: number | null;
  depth_72h_in: number | null;
}

export interface FreshSnow {
  as_of: string | null;
  stations_checked: number;
  /** Only stations where a rise cleared the noise rules. */
  stations: FreshSnowStation[];
  forecast: { from: string; through: string; total_in: number; source: string | null } | null;
  facts: string[];
}

export interface RoadLine {
  /** Travel direction, or which field of the agency's report this is. */
  label: string | null;
  /** The agency's own status code, such as Caltrans R-2. */
  code: string | null;
  /** The agency's wording, untouched. */
  text: string;
}

export interface RoadStatus {
  agency: string;
  agency_link: string;
  road: string | null;
  location: string;
  lat: number;
  lon: number;
  /** The agency reports a restriction, advisory or closure in effect. */
  active: boolean;
  /** As the agency stamped it: local without an offset, or with one. */
  updated: string | null;
  lines: RoadLine[];
  /** Straight-line miles from the pass. */
  distance_mi: number;
  /** The report names this pass. */
  named: boolean;
  new_snow_in?: number;
  roadside_snow_in?: number;
}

export interface Winter {
  /** null: outside every forecast zone. Absent: zones were not fetched. */
  avalanche?: AvalancheRating | null;
  fresh_snow?: FreshSnow;
  roads?: RoadStatus[];
  issued_for: string;
  /** When the sources were read, UTC. */
  fetched_at: string | null;
}
