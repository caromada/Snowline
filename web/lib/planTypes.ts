// The trip planner's shapes: what the plan-trip function returns, and the
// plan the page assembles from the exported pass files.

import type { NearestFire, SmokeDensity } from "./fireTypes";
import type { Campground, Fact, ForecastDay, Status, Trailhead } from "./types";
import type { AvalancheRating, RoadStatus } from "./winterTypes";

/** How a pass came to be on a plan. Mirrors supabase/functions/_shared/gazetteer.ts. */
export type Why =
  | { kind: "name"; matched: string }
  | { kind: "fuzzy"; matched: string; alias: string; similarity: number }
  | { kind: "mention"; matched: string; alias: string }
  | { kind: "route"; route: string }
  | { kind: "place"; matched: string; place: string; place_kind: "trailhead" | "campground"; distance_mi: number };

// The app cannot import the backend's modules, so it repeats these.
// supabase/tests/trip-parity.test.ts holds the two copies together.
export const MAX_TRIP_CHARS = 400;
export const ACTIVITIES = [
  "hiking",
  "backpacking",
  "trail running",
  "climbing",
  "skiing",
  "snowshoeing",
  "cycling",
  "driving",
  "other",
] as const;
export type Activity = (typeof ACTIVITIES)[number];

export interface TripStop {
  slug: string;
  name: string;
  why: Why;
}

/** The trip as the function read it. Mirrors supabase/functions/_shared/trip.ts. */
export interface UnderstoodTrip {
  passes: TripStop[];
  start: string | null;
  end: string | null;
  activity: Activity | null;
  party_size: number | null;
  /** Place names from the person's own text that matched nothing. */
  unplaced: string[];
}

export interface PlanReply {
  /** null when no pass was placed, so there is nothing to reopen. */
  id: string | null;
  trip: UnderstoodTrip;
  empty: "no_match" | "none_chosen" | "unreadable" | null;
  cached: boolean;
  today: string;
  data_date: string;
}

/** A plan reopened from its link. The typed text comes back only to its owner. */
export interface SharedPlan {
  id: string;
  trip: UnderstoodTrip;
  data_date: string;
  created_at: string;
  mine: boolean;
  text?: string;
}

export interface RecentPlan {
  id: string;
  text: string;
  trip: UnderstoodTrip;
  created_at: string;
}

/**
 * Where the trip's dates sit against what is known.
 * - undated: no dates were read; the week ahead is shown.
 * - within: every day of the trip has a forecast.
 * - partly: the trip starts inside the forecast and runs past its end.
 * - beyond: the trip starts after the forecast ends; no forecast is shown.
 * - past: the trip has ended; only verdicts on file are shown.
 */
export type Horizon = "undated" | "within" | "partly" | "beyond" | "past";

export interface PlanVerdict {
  /** The date this verdict describes. */
  date: string;
  /** It is the newest verdict on file for the pass. */
  latest: boolean;
  status: Status;
  status_label: string;
  confidence: "high" | "moderate" | "low";
  facts: Fact[];
  conflicts: string[];
}

export interface PlanFire {
  fire: NearestFire | null;
  /** Inside the mapped perimeter, or within ten straight-line miles of its edge. */
  close: boolean;
  smoke: SmokeDensity | null;
  smoke_date: string | null;
  issued_for: string;
}

export interface PlanAvalanche {
  rating: AvalancheRating;
  /** The rating's valid window has passed; its level is no longer shown. */
  expired: boolean;
}

export interface PlanPass {
  slug: string;
  name: string;
  elevation_ft: number;
  lat: number;
  lon: number;
  /** Position in travel order, from 1. */
  order: number;
  why: Why;
  /** Whether the person wrote this pass's name, or it was picked from what they wrote. */
  named: boolean;
  /** How many passes in the index carry this name, this one included. */
  namesakes: number;
  verdict: PlanVerdict;
  forecast: { days: ForecastDay[]; grid_elevation_ft: number; issued_for: string } | null;
  fire: PlanFire | null;
  /** undefined: zones were not read. null: outside every forecast zone. */
  avalanche?: PlanAvalanche | null;
  roads: RoadStatus[];
  roads_read_at: string | null;
  trailhead: Trailhead | null;
  campground: Campground | null;
}

export interface SummaryLine {
  kind: "dates" | "horizon" | "verdicts" | "highest" | "precipitation" | "thunder" | "fire" | "avalanche" | "road" | "missing";
  text: string;
  /** The line reports something the eye should find first. */
  warm?: boolean;
}

export interface TripPlan {
  trip: UnderstoodTrip;
  today: string;
  horizon: Horizon;
  /** The last day the forecast on file covers, if any pass has one. */
  forecast_through: string | null;
  passes: PlanPass[];
  /** Passes on the trip whose files could not be read. */
  missing: TripStop[];
  summary: SummaryLine[];
}
