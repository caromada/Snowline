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
