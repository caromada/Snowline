import type * as maplibregl from "maplibre-gl";
import mlcontour from "maplibre-contour";
import { TERRAIN_TILES } from "./mapStyle";

// One DEM source feeds the contour generator for every map on the site;
// isolines are computed in a web worker from the same terrain tiles the
// hillshade uses. Registered once per page.
let registered = false;
let contourTiles = "";

export function setupContours(gl: typeof maplibregl): string {
  if (registered) return contourTiles;
  const demSource = new mlcontour.DemSource({
    url: TERRAIN_TILES,
    encoding: "terrarium",
    maxzoom: 13,
    // Dev-mode React Refresh instrumentation breaks the stringified worker;
    // the production bundle runs isolines off the main thread.
    worker: process.env.NODE_ENV === "production",
    cacheSize: 100,
    timeoutMs: 10_000,
  });
  demSource.setupMaplibre(gl);
  contourTiles = demSource.contourProtocolUrl({
    multiplier: 3.28084,
    // zoom: [minor, index] interval in feet, USGS-quad style up close.
    thresholds: {
      9: [500, 2000],
      11: [200, 1000],
      12: [100, 500],
      13: [80, 400],
      14: [40, 200],
    },
    contourLayer: "contours",
    elevationKey: "ele",
    levelKey: "level",
  });
  registered = true;
  return contourTiles;
}
