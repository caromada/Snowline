import type { StyleSpecification } from "maplibre-gl";
import { mapColors as c } from "./theme";

// A clean topographic basemap: OpenFreeMap vector tiles (OpenStreetMap data,
// no key, no vendor account) for water, trails, peaks, glaciers and
// wilderness; AWS terrain tiles for hillshade, 3D relief and contours. Every
// color comes from the forest palette in theme.ts. Map labels use glyphs
// built from the spec typefaces and served from /glyphs.

export const TERRAIN_TILES =
  "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
export const VECTOR_TILEJSON = "https://tiles.openfreemap.org/planet";

const MONO = ["JetBrains Mono"];
const SERIF_ITALIC = ["Source Serif 4 Italic"];
const GROTESK = ["Space Grotesk"];

export function buildMapStyle(origin: string, contourTiles: string): StyleSpecification {
  return {
    version: 8,
    glyphs: `${origin}/glyphs/{fontstack}/{range}.pbf`,
    sources: {
      osm: { type: "vector", url: VECTOR_TILEJSON },
      hillshade: {
        type: "raster-dem",
        encoding: "terrarium",
        tiles: [TERRAIN_TILES],
        tileSize: 256,
        maxzoom: 13,
        attribution:
          "Terrain: <a href='https://registry.opendata.aws/terrain-tiles/'>AWS Open Data</a>",
      },
      // Separate DEM source for 3D relief, as MapLibre recommends.
      relief: {
        type: "raster-dem",
        encoding: "terrarium",
        tiles: [TERRAIN_TILES],
        tileSize: 256,
        maxzoom: 13,
      },
      contours: { type: "vector", tiles: [contourTiles], maxzoom: 15 },
    },
    layers: [
      { id: "ground", type: "background", paint: { "background-color": c.ground } },
      {
        id: "landcover-forest",
        type: "fill",
        source: "osm",
        "source-layer": "landcover",
        filter: ["==", ["get", "class"], "wood"],
        paint: { "fill-color": c.forest },
      },
      {
        id: "landcover-meadow",
        type: "fill",
        source: "osm",
        "source-layer": "landcover",
        filter: ["in", ["get", "class"], ["literal", ["grass", "wetland"]]],
        paint: { "fill-color": c.meadow },
      },
      {
        id: "landcover-rock",
        type: "fill",
        source: "osm",
        "source-layer": "landcover",
        filter: ["in", ["get", "class"], ["literal", ["rock", "sand"]]],
        paint: { "fill-color": c.rock },
      },
      {
        id: "hillshade",
        type: "hillshade",
        source: "hillshade",
        paint: {
          "hillshade-shadow-color": c.hillShadow,
          "hillshade-highlight-color": c.hillHighlight,
          "hillshade-accent-color": c.hillAccent,
          "hillshade-exaggeration": 0.65,
        },
      },
      {
        // Glaciers and permanent snowfields sit above the shading so they
        // read as the brightest thing on the mountain, the way they do.
        id: "landcover-ice",
        type: "fill",
        source: "osm",
        "source-layer": "landcover",
        filter: ["==", ["get", "class"], "ice"],
        paint: { "fill-color": c.ice },
      },
      {
        id: "wilderness-fill",
        type: "fill",
        source: "osm",
        "source-layer": "park",
        paint: { "fill-color": c.wildernessFill },
      },
      {
        id: "wilderness-line",
        type: "line",
        source: "osm",
        "source-layer": "park",
        minzoom: 7,
        paint: {
          "line-color": c.wildernessLine,
          "line-width": ["interpolate", ["linear"], ["zoom"], 7, 0.6, 12, 1.4],
          "line-dasharray": [3, 2],
        },
      },
      {
        id: "contour-minor",
        type: "line",
        source: "contours",
        "source-layer": "contours",
        filter: ["==", ["get", "level"], 0],
        paint: { "line-color": c.contourMinor, "line-width": 0.5 },
      },
      {
        id: "contour-major",
        type: "line",
        source: "contours",
        "source-layer": "contours",
        filter: [">", ["get", "level"], 0],
        paint: { "line-color": c.contourMajor, "line-width": 1 },
      },
      {
        id: "water",
        type: "fill",
        source: "osm",
        "source-layer": "water",
        paint: { "fill-color": c.water },
      },
      {
        id: "waterway",
        type: "line",
        source: "osm",
        "source-layer": "waterway",
        minzoom: 8,
        paint: {
          "line-color": c.waterLine,
          "line-width": [
            "interpolate",
            ["linear"],
            ["zoom"],
            8,
            ["match", ["get", "class"], "river", 0.9, 0.3],
            14,
            ["match", ["get", "class"], "river", 2.4, 1.1],
          ],
        },
      },
      {
        id: "boundary-state",
        type: "line",
        source: "osm",
        "source-layer": "boundary",
        filter: ["<=", ["get", "admin_level"], 4],
        paint: { "line-color": c.boundary, "line-width": 0.8, "line-dasharray": [4, 3] },
      },
      {
        id: "roads-minor",
        type: "line",
        source: "osm",
        "source-layer": "transportation",
        minzoom: 9,
        filter: ["in", ["get", "class"], ["literal", ["minor", "service", "track"]]],
        paint: { "line-color": c.road, "line-width": 0.6 },
      },
      {
        id: "roads-major",
        type: "line",
        source: "osm",
        "source-layer": "transportation",
        minzoom: 6,
        filter: [
          "in",
          ["get", "class"],
          ["literal", ["motorway", "trunk", "primary", "secondary", "tertiary"]],
        ],
        paint: {
          "line-color": c.roadMajor,
          "line-width": ["interpolate", ["linear"], ["zoom"], 6, 0.5, 13, 1.8],
        },
      },
      {
        // Trails: the reason anyone opens this map.
        id: "trails",
        type: "line",
        source: "osm",
        "source-layer": "transportation",
        minzoom: 10,
        filter: ["==", ["get", "class"], "path"],
        paint: {
          "line-color": c.trail,
          "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.7, 15, 1.6],
          "line-dasharray": [2, 1.5],
        },
      },
      {
        id: "contour-labels",
        type: "symbol",
        source: "contours",
        "source-layer": "contours",
        filter: [">", ["get", "level"], 0],
        minzoom: 12,
        layout: {
          "symbol-placement": "line",
          "text-field": ["concat", ["number-format", ["get", "ele"], {}], "'"],
          "text-font": MONO,
          "text-size": 9,
        },
        paint: {
          "text-color": c.contourLabel,
          "text-halo-color": c.halo,
          "text-halo-width": 1.2,
        },
      },
      {
        id: "trail-names",
        type: "symbol",
        source: "osm",
        "source-layer": "transportation_name",
        minzoom: 12,
        filter: ["==", ["get", "class"], "path"],
        layout: {
          "symbol-placement": "line",
          "text-field": ["get", "name"],
          "text-font": GROTESK,
          "text-size": 9,
          "text-letter-spacing": 0.08,
        },
        paint: { "text-color": c.trail, "text-halo-color": c.halo, "text-halo-width": 1.2 },
      },
      {
        id: "water-names",
        type: "symbol",
        source: "osm",
        "source-layer": "water_name",
        minzoom: 10,
        layout: {
          "text-field": ["get", "name"],
          "text-font": SERIF_ITALIC,
          "text-size": 11,
        },
        paint: {
          "text-color": c.waterLabel,
          "text-halo-color": c.halo,
          "text-halo-width": 1.2,
        },
      },
      {
        id: "peaks",
        type: "symbol",
        source: "osm",
        "source-layer": "mountain_peak",
        minzoom: 9,
        filter: ["has", "name"],
        layout: {
          "text-field": [
            "format",
            ["get", "name"],
            {},
            "\n",
            {},
            ["concat", ["number-format", ["get", "ele_ft"], {}], " ft"],
            { "font-scale": 0.85 },
          ],
          "text-font": MONO,
          "text-size": 10,
          "text-anchor": "top",
          "text-offset": [0, 0.4],
          "symbol-sort-key": ["get", "rank"],
        },
        paint: {
          "text-color": c.peakLabel,
          "text-halo-color": c.halo,
          "text-halo-width": 1.3,
        },
      },
      {
        id: "places",
        type: "symbol",
        source: "osm",
        "source-layer": "place",
        minzoom: 7,
        filter: ["in", ["get", "class"], ["literal", ["city", "town", "village"]]],
        layout: {
          "text-field": ["upcase", ["get", "name"]],
          "text-font": GROTESK,
          "text-size": ["match", ["get", "class"], "city", 12, "town", 10, 9],
          "text-letter-spacing": 0.18,
        },
        paint: {
          "text-color": c.placeLabel,
          "text-halo-color": c.halo,
          "text-halo-width": 1.2,
        },
      },
    ],
  };
}
