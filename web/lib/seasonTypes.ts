// The season comparison as fusion/season.py writes it and pipeline.py merges
// it into each pass file. Every sentence is written there, with the stations
// it rests on; the client only draws the curves.

export type SeasonStatus = "melted" | "snow" | "bare_at_start" | "unusable";

export interface StationSeason {
  year: number;
  /** "bare_at_start": already bare when the record begins on April 1.
   *  "snow": still under snow at the end of the record. */
  status: SeasonStatus;
  /** Why an unusable season has no date: a sensor fault or a hole in the record. */
  reason: string | null;
  melt_out: string | null;
  /** Days since April 1 of the season's own year. */
  melt_out_day: number | null;
  /** Highest reading on or after April 1; a peak before that is not on file. */
  peak_swe_in: number | null;
  peak_date: string | null;
  last_reading: string | null;
  last_swe_in: number | null;
}

export interface SeasonStation {
  provenance: string;
  name: string;
  elevation_ft: number | null;
  distance_mi: number | null;
  seasons: StationSeason[];
  comparison: "exact" | "before_record" | "still_snow" | null;
  /** Against the middle of the earlier seasons. Negative is earlier. For
   *  "before_record" it is a bound: at least this many days earlier. */
  days_vs_earlier: number | null;
  earlier_years: number[];
  earlier_median_day: number | null;
  /** 1 is the highest peak among `peak_of` seasons. */
  peak_rank: number | null;
  peak_of: number | null;
  peak_years: number[];
}

export interface SeasonEvidence {
  provenance: string;
  name: string;
  elevation_ft: number | null;
  distance_mi: number | null;
  detail: string;
}

export interface SeasonFact {
  kind: "melt_out" | "still_snow" | "peak" | "pass_window";
  text: string;
  /** True for the pass window: inferred for the pass, measured nowhere. */
  estimate: boolean;
  /** The stations differ by more than the threshold, so each is given. */
  disagree: boolean;
  evidence: SeasonEvidence[];
}

export interface PassWindow {
  /** "underway" until the last day of the window has passed. */
  state: "melted" | "underway";
  from: string;
  through: string;
  stations: string[];
}

export interface SeasonChart {
  provenance: string;
  name: string;
  elevation_ft: number | null;
  distance_mi: number | null;
  /** Readings above this are sensor faults and are not drawn. */
  max_swe_in: number;
  /** Seasons worth drawing, oldest first. */
  seasons: SeasonChartYear[];
}

export interface SeasonChartYear {
  year: number;
  melt_out: string | null;
  /** The date in short form, or why the season has none. */
  melt_out_note: string;
  peak_swe_in: number | null;
}

export interface Season {
  as_of: string;
  /** The melt season compared, which in winter is last year's. */
  year: number;
  /** Month-day bounds every season is read over. */
  window: { from: string; through: string };
  earlier_years: number[];
  melt_out: {
    kind: "exact" | "before_record";
    agree: boolean;
    spread_days: number;
    min_days: number;
    max_days: number;
    earlier_years: number[];
    stations: string[];
  } | null;
  pass_window: PassWindow | null;
  chart: SeasonChart | null;
  facts: SeasonFact[];
  stations: SeasonStation[];
}
