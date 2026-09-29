// Reports filed by visitors. The field names and allowed values are the
// pipeline's (extraction/schema.py) and the backend's
// (supabase/functions/_shared/reportFields.ts); supabase/tests/report-parity
// holds this copy to the backend's.

export const SNOW_CONDITIONS = ["none", "patchy", "continuous", "deep"] as const;
export const TRACTION = ["none", "microspikes", "crampons", "ice_axe", "spikes_and_axe"] as const;
export const CROSSINGS = ["dry", "low", "knee_high", "thigh_high", "dangerous"] as const;
export const EXPOSURE = ["relaxed", "cautious", "sketchy", "terrifying"] as const;
export const LARCHES = ["not_turning", "turning", "peak", "dropped"] as const;
export const WILDFLOWERS = ["none", "starting", "peak", "fading"] as const;
export const MOSQUITOES = ["none", "some", "bad"] as const;
export const WATER = ["flowing", "trickling", "dry"] as const;

export type SnowCondition = (typeof SNOW_CONDITIONS)[number];
export type Traction = (typeof TRACTION)[number];
export type Crossing = (typeof CROSSINGS)[number];
export type Exposure = (typeof EXPOSURE)[number];
export type Larches = (typeof LARCHES)[number];
export type Wildflowers = (typeof WILDFLOWERS)[number];
export type Mosquitoes = (typeof MOSQUITOES)[number];
export type Water = (typeof WATER)[number];

export const TAP_CHOICES = {
  snow_condition: SNOW_CONDITIONS,
  traction_used: TRACTION,
  crossing_condition: CROSSINGS,
  larches: LARCHES,
  wildflowers: WILDFLOWERS,
  mosquitoes: MOSQUITOES,
  water_status: WATER,
} as const;

export type TapField = keyof typeof TAP_CHOICES;

export const MAX_REPORT_CHARS = 1000;
export const MAX_WATER_SOURCE_CHARS = 60;
/** How far back the day someone was at the pass may be, and how far back
 * the list reaches before "Earlier reports". */
export const REPORT_WINDOW_DAYS = 30;
export const SEASON_WINDOW_DAYS = 14;
export const PHOTO_BUCKET = "report-photos";

export interface ReportConditions {
  snow_condition: SnowCondition | null;
  traction_used: Traction | null;
  crossing_condition: Crossing | null;
  exposure_comfort: Exposure | null;
  larches: Larches | null;
  wildflowers: Wildflowers | null;
  mosquitoes: Mosquitoes | null;
  water_status: Water | null;
  water_source: string | null;
}

/** One row of the public view. It carries no user id and no email; `mine`
 * says only whether the person reading is the person who filed it. */
export interface PassReport extends ReportConditions {
  id: string;
  pass_slug: string;
  date_observed: string;
  body: string;
  quote_span: string | null;
  photo_path: string | null;
  status: "visible" | "hidden";
  /** The fields the filer set by hand; the rest were read from their words. */
  tapped: string[];
  created_at: string;
  mine: boolean;
}

/** The form as the person has it, before anything is sent. */
export interface ReportDraft {
  date: string;
  text: string;
  snow_condition: SnowCondition | null;
  traction_used: Traction | null;
  crossing_condition: Crossing | null;
  larches: Larches | null;
  wildflowers: Wildflowers | null;
  mosquitoes: Mosquitoes | null;
  water_status: Water | null;
  water_source: string;
}

export type ReportTaps = Partial<Record<TapField | "water_source", string>>;

export interface PreparedPhoto {
  blob: Blob;
  width: number;
  height: number;
}

export interface FiledReport {
  report: PassReport;
  hidden: boolean;
  photo: "none" | "attached" | "not_attached";
  message: string | null;
}

export interface ReportTag {
  field: string;
  text: string;
  tapped: boolean;
}
