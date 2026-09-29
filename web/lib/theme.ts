// The forest set. Every color in the app comes from these seven values.
// Alpenglow is the only warm color on the page; wherever it appears, the
// eye goes first.

export const palette = {
  deepPine: "#0F1A14", // page ground, the forest floor
  moss: "#1C2B21", // raised panels and cards
  fern: "#4E7A5A", // terrain fill, healthy/open status
  sage: "#8FAE8B", // secondary type, inactive states
  granite: "#B9BEB3", // contour lines and dividers
  snowmelt: "#5B8FB9", // streams, crossings, snow data
  alpenglow: "#E8A87C", // the single warm accent
} as const;

/** A palette color at partial opacity, for map layers that must stay in the set. */
export function withAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// The topographic basemap, drawn only from the seven values above: granite
// contours, snowmelt hydrography, fern forest, granite-white ice.
export const mapColors = {
  ground: palette.deepPine,
  forest: withAlpha(palette.fern, 0.13),
  ice: withAlpha(palette.granite, 0.26),
  rock: withAlpha(palette.granite, 0.05),
  meadow: withAlpha(palette.sage, 0.06),
  wildernessFill: withAlpha(palette.fern, 0.05),
  wildernessLine: withAlpha(palette.sage, 0.45),
  hillShadow: withAlpha("#000000", 0.55),
  hillHighlight: withAlpha(palette.sage, 0.22),
  hillAccent: palette.moss,
  contourMinor: withAlpha(palette.granite, 0.16),
  contourMajor: withAlpha(palette.granite, 0.34),
  contourLabel: withAlpha(palette.granite, 0.62),
  water: withAlpha(palette.snowmelt, 0.5),
  waterLine: withAlpha(palette.snowmelt, 0.75),
  waterLabel: palette.snowmelt,
  trail: withAlpha(palette.granite, 0.6),
  road: withAlpha(palette.sage, 0.3),
  roadMajor: withAlpha(palette.sage, 0.45),
  boundary: withAlpha(palette.sage, 0.3),
  peakLabel: palette.sage,
  placeLabel: withAlpha(palette.granite, 0.75),
  halo: palette.deepPine,
} as const;

export const statusColor: Record<string, string> = {
  open: palette.fern,
  snow_caution: palette.snowmelt,
  traction_advised: palette.alpenglow,
  not_recommended: palette.alpenglow,
  unknown: palette.sage,
};

// Motion durations from the spec, milliseconds.
export const motion = {
  panelSlide: 200,
  vignetteAssemble: 350,
  ledgerExpand: 150,
  contourRing: 600,
  glyphBounce: 80,
} as const;

// The North American Public Avalanche Danger Scale's own colors, by level.
// The one exception to the seven: the scale is a public standard, and an
// official rating shown in any other color would be a different rating.
export const dangerScale = {
  1: { fill: "#50B848", ink: palette.deepPine }, // Low
  2: { fill: "#FFF200", ink: palette.deepPine }, // Moderate
  3: { fill: "#F7941E", ink: palette.deepPine }, // Considerable
  4: { fill: "#ED1C24", ink: "#FFFFFF" }, // High
  5: { fill: "#231F20", ink: "#FFFFFF" }, // Extreme
} as const;
