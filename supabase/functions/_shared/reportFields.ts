// The vocabulary of a filed report. The first four lists are the pipeline's
// (extraction/schema.py) value for value, so a report filed in the app and a
// report read by the pipeline mean the same thing by the same word. The
// database check constraints and web/lib/reportTypes.ts repeat these lists;
// tests hold all of them together.
export const SNOW_CONDITIONS = ["none", "patchy", "continuous", "deep"] as const;
export const TRACTION = ["none", "microspikes", "crampons", "ice_axe", "spikes_and_axe"] as const;
export const CROSSINGS = ["dry", "low", "knee_high", "thigh_high", "dangerous"] as const;
export const EXPOSURE = ["relaxed", "cautious", "sketchy", "terrifying"] as const;

export const LARCHES = ["not_turning", "turning", "peak", "dropped"] as const;
export const WILDFLOWERS = ["none", "starting", "peak", "fading"] as const;
export const MOSQUITOES = ["none", "some", "bad"] as const;
export const WATER = ["flowing", "trickling", "dry"] as const;

/** Why the model set text aside. "unreadable" is ours, for text the model
 * declined to read at all; the model itself never returns it. */
export const FLAGS = ["spam", "abuse", "advertisement", "personal_information", "not_conditions"] as const;

export type SnowCondition = (typeof SNOW_CONDITIONS)[number];
export type Traction = (typeof TRACTION)[number];
export type Crossing = (typeof CROSSINGS)[number];
export type Exposure = (typeof EXPOSURE)[number];
export type Larches = (typeof LARCHES)[number];
export type Wildflowers = (typeof WILDFLOWERS)[number];
export type Mosquitoes = (typeof MOSQUITOES)[number];
export type Water = (typeof WATER)[number];
export type Flag = (typeof FLAGS)[number];

/** The one-tap choices, in the order the form shows them. */
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
export const TAP_FIELDS = Object.keys(TAP_CHOICES) as TapField[];

/** What the model may fill from the words: the taps plus how the travel felt. */
export const READ_CHOICES = { ...TAP_CHOICES, exposure_comfort: EXPOSURE } as const;
export type ReadField = keyof typeof READ_CHOICES;
export const READ_FIELDS = Object.keys(READ_CHOICES) as ReadField[];
