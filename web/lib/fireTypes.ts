// Fire perimeters and smoke: the per-pass facts merged into each pass
// detail, and the map file the fire layer draws from.

export type SmokeDensity = "light" | "medium" | "heavy";

export type Compass =
  | "north"
  | "northeast"
  | "east"
  | "southeast"
  | "south"
  | "southwest"
  | "west"
  | "northwest";

export interface NearestFire {
  name: string;
  acres: number | null;
  percent_contained: number | null;
  /** Pacific calendar dates. */
  discovered: string | null;
  updated: string | null;
  /** Straight-line miles from the pass to the perimeter's edge; 0 inside it. */
  distance_mi: number;
  /** Which way the fire lies from the pass; null when the pass is inside. */
  direction: Compass | null;
  inside: boolean;
  /** The incident's public page, present only when the agency record has one. */
  url?: string;
}

export interface PassFire {
  /** Nearest active fire within 50 km. */
  fire?: NearestFire;
  /** Heaviest smoke mapped over the pass. */
  smoke?: SmokeDensity;
  issued_for: string;
  /** The UTC day of the satellite smoke analysis, which can trail by one. */
  smoke_date: string | null;
}

export interface FireMap {
  generated_at: string;
  issued_for: string;
  smoke_date: string | null;
  fires_available: boolean;
  smoke_available: boolean;
  sources: { fires: string; smoke: string };
  fires: GeoJSON.FeatureCollection<GeoJSON.MultiPolygon>;
  fire_labels: GeoJSON.FeatureCollection<GeoJSON.Point>;
  smoke: GeoJSON.FeatureCollection<GeoJSON.Polygon>;
}
