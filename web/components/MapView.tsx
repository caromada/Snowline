"use client";

import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";

// Bundlers resolve MapLibre's worker inconsistently; serving it as a plain
// static file sidesteps all of that.
maplibregl.setWorkerUrl("maplibre-gl-worker.mjs");
import { drawSprite, glyphByStatus, tent as tentSprite } from "@/lib/pixel";
import mlcontour from "maplibre-contour";
import { buildMapStyle, TERRAIN_TILES } from "@/lib/mapStyle";
import { palette, statusColor } from "@/lib/theme";
import type { PassIndexEntry } from "@/lib/types";
import { loadSaved } from "./PassPanel";

// One DEM source feeds the contour generator; isolines are computed in a
// web worker from the same terrain tiles the hillshade uses.
const demSource = new mlcontour.DemSource({
  url: TERRAIN_TILES,
  encoding: "terrarium",
  maxzoom: 13,
  // Dev-mode React Refresh instrumentation breaks the stringified worker; the
  // production bundle runs isolines off the main thread.
  worker: process.env.NODE_ENV === "production",
  cacheSize: 100,
  timeoutMs: 10_000,
});
demSource.setupMaplibre(maplibregl);

const CONTOUR_TILES = demSource.contourProtocolUrl({
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

// The whole West Coast: Cascades to the San Jacintos.
export const WEST_COAST_BOUNDS: [[number, number], [number, number]] = [
  [-124.8, 32.5],
  [-116.0, 49.0],
];

function markerElement(
  p: PassIndexEntry,
  evalDate: string,
  selected: boolean,
  saved: boolean,
): HTMLDivElement {
  const s = p.statuses[evalDate];
  const color = statusColor[s?.status ?? "unknown"] ?? palette.sage;
  const el = document.createElement("div");
  el.className = "pass-marker";
  el.style.cssText = "display:flex;flex-direction:column;align-items:center;cursor:pointer;";
  el.setAttribute("role", "button");
  el.setAttribute("aria-label", `${p.name}: ${s?.status_label ?? "unknown"}`);
  el.tabIndex = 0;

  const dotWrap = document.createElement("div");
  dotWrap.style.cssText = "position:relative;width:34px;height:34px;";
  const dot = document.createElement("div");
  const size = selected ? 12 : p.tier === "osm" ? 7 : 10;
  dot.className = "marker-dot";
  dot.style.cssText = `position:absolute;left:50%;top:50%;width:${size}px;height:${size}px;` +
    `transform:translate(-50%,-50%);background:${color};` +
    `box-shadow:0 0 0 2px ${palette.deepPine};`;
  dotWrap.appendChild(dot);

  if (p.tier !== "osm") {
    // Leaned in, the featured passes wear their condition badge: pine,
    // snowy pine, ice axe, crossed poles. Pixel-snapped, whole pixels only.
    const badge = document.createElement("canvas");
    badge.width = 16;
    badge.height = 16;
    badge.className = "pixel marker-badge";
    badge.style.cssText =
      "position:absolute;left:50%;top:50%;margin-left:-8px;margin-top:-8px;" +
      `filter:drop-shadow(0 1px 0 ${palette.deepPine});`;
    const bctx = badge.getContext("2d");
    if (bctx) drawSprite(bctx, glyphByStatus[s?.status ?? "unknown"], 0, 0, 1);
    dotWrap.appendChild(badge);
  }

  if (selected) {
    // The contour ring draws itself in like a pen stroke, 600ms.
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("width", "34");
    svg.setAttribute("height", "34");
    svg.style.cssText = "position:absolute;inset:0;overflow:visible;";
    const circle = document.createElementNS(ns, "circle");
    const r = 14;
    const c = 2 * Math.PI * r;
    circle.setAttribute("cx", "17");
    circle.setAttribute("cy", "17");
    circle.setAttribute("r", String(r));
    circle.setAttribute("fill", "none");
    circle.setAttribute("stroke", palette.alpenglow);
    circle.setAttribute("stroke-width", "1.5");
    circle.setAttribute("stroke-dasharray", String(c));
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      circle.setAttribute("stroke-dashoffset", "0");
    } else {
      circle.setAttribute("stroke-dashoffset", String(c));
      circle.style.transition = "stroke-dashoffset var(--contour-ring) ease-out";
      requestAnimationFrame(() =>
        requestAnimationFrame(() => circle.setAttribute("stroke-dashoffset", "0")),
      );
    }
    svg.appendChild(circle);
    dotWrap.appendChild(svg);
  }

  if (saved) {
    const c = document.createElement("canvas");
    c.width = 16;
    c.height = 16;
    c.className = "pixel";
    c.style.cssText = "position:absolute;right:-6px;top:-6px;";
    const ctx = c.getContext("2d");
    if (ctx) drawSprite(ctx, tentSprite, 0, 0, 1);
    dotWrap.appendChild(c);
  }

  const label = document.createElement("div");
  label.textContent = p.name.replace(/ Pass$/, "");
  label.className = `display pass-label${selected ? " selected" : ""}${p.tier === "osm" ? " osm" : ""}`;
  label.style.cssText =
    `font-size:${p.tier === "osm" ? 8 : 10}px;letter-spacing:0.14em;` +
    `color:${selected ? palette.alpenglow : p.tier === "osm" ? palette.sage : palette.granite};` +
    `text-shadow:0 1px 3px ${palette.deepPine},0 0 6px ${palette.deepPine};margin-top:-2px;` +
    "user-select:none;";
  el.appendChild(dotWrap);
  el.appendChild(label);
  return el;
}

const PASS_SOURCE = "passes";
const STATUS_KEYS = ["open", "snow_caution", "traction_advised", "not_recommended", "unknown"];

/** Pixel-square pass icon: a status-colored square in a deep pine keyline. */
function squareIcon(
  hex: string,
  core: number,
  ring: number,
): { width: number; height: number; data: Uint8Array } {
  const size = core + ring * 2;
  const data = new Uint8Array(size * size * 4);
  const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [cr, cg, cb] = rgb(hex);
  const [kr, kg, kb] = rgb(palette.deepPine);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const inCore = x >= ring && x < size - ring && y >= ring && y < size - ring;
      const i = (y * size + x) * 4;
      data.set(inCore ? [cr, cg, cb, 255] : [kr, kg, kb, 255], i);
    }
  }
  return { width: size, height: size, data };
}

function passCollection(
  passes: PassIndexEntry[],
  evalDate: string,
  asHtml: Set<string>,
): GeoJSON.FeatureCollection<GeoJSON.Point> {
  return {
    type: "FeatureCollection",
    features: passes
      .filter((p) => !asHtml.has(p.slug))
      .map((p) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [p.lon, p.lat] },
        properties: {
          slug: p.slug,
          label: p.name.replace(/ Pass$/, "").toUpperCase(),
          status: p.statuses[evalDate]?.status ?? "unknown",
        },
      })),
  };
}

function addPassLayer(map: maplibregl.Map, onPick: (slug: string) => void): void {
  // Two drawn sizes rather than one scaled icon: fractional icon scaling
  // would smear the pixels.
  for (const status of STATUS_KEYS) {
    const color = statusColor[status] ?? palette.sage;
    if (!map.hasImage(`pass-${status}`)) map.addImage(`pass-${status}`, squareIcon(color, 7, 2));
    if (!map.hasImage(`pass-${status}-s`)) map.addImage(`pass-${status}-s`, squareIcon(color, 4, 1));
  }
  map.addSource(PASS_SOURCE, { type: "geojson", data: { type: "FeatureCollection", features: [] } });
  map.addLayer({
    id: "pass-squares",
    type: "symbol",
    source: PASS_SOURCE,
    layout: {
      // Zoom expressions must sit at the top of a layout property.
      "icon-image": [
        "step",
        ["zoom"],
        ["concat", "pass-", ["get", "status"], "-s"],
        8,
        ["concat", "pass-", ["get", "status"]],
      ],
      "icon-allow-overlap": true,
      "icon-ignore-placement": true,
    },
  });
  map.addLayer({
    id: "pass-names",
    type: "symbol",
    source: PASS_SOURCE,
    minzoom: 10.8,
    layout: {
      "text-field": ["get", "label"],
      "text-font": ["Space Grotesk"],
      "text-size": 8,
      "text-letter-spacing": 0.14,
      "text-anchor": "top",
      "text-offset": [0, 0.9],
      "text-optional": true,
    },
    paint: {
      "text-color": palette.sage,
      "text-halo-color": palette.deepPine,
      "text-halo-width": 1.4,
    },
  });
  map.on("click", "pass-squares", (e) => {
    const slug = e.features?.[0]?.properties?.slug;
    if (typeof slug === "string") onPick(slug);
  });
  map.on("mouseenter", "pass-squares", () => (map.getCanvas().style.cursor = "pointer"));
  map.on("mouseleave", "pass-squares", () => (map.getCanvas().style.cursor = ""));
}

export type Position = { lat: number; lon: number; accuracyM: number };

function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function MapView({
  passes,
  evalDate,
  selected,
  onSelect,
  onLocate,
}: {
  passes: PassIndexEntry[];
  evalDate: string;
  selected: string | null;
  onSelect: (slug: string) => void;
  onLocate?: (pos: Position | null, error?: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const youRef = useRef<maplibregl.Marker | null>(null);
  // Once the viewer or the app has framed something (a drag, a search, a
  // deep link, locate-me), the startup fit-to-region stands down for good.
  const framedRef = useRef(false);
  const [savedVersion, setSavedVersion] = useState(0);
  const [layerReady, setLayerReady] = useState(false);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);
  const [relief, setRelief] = useState(false);
  const [locating, setLocating] = useState(false);

  const toggleRelief = () => {
    const map = mapRef.current;
    if (!map) return;
    const on = !relief;
    // Real relief from the same DEM, lightly exaggerated so ridgelines read.
    map.setTerrain(on ? { source: "relief", exaggeration: 1.4 } : null);
    map.easeTo({ pitch: on ? 62 : 0, duration: reducedMotion() ? 0 : 700 });
    setRelief(on);
  };

  const locate = () => {
    const map = mapRef.current;
    if (!map || !("geolocation" in navigator)) {
      onLocate?.(null, "location is not available on this device");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (g) => {
        setLocating(false);
        const pos = { lat: g.coords.latitude, lon: g.coords.longitude, accuracyM: g.coords.accuracy };
        if (!youRef.current) {
          const el = document.createElement("div");
          el.className = "you-are-here";
          el.setAttribute("aria-label", "your location");
          youRef.current = new maplibregl.Marker({ element: el });
        }
        youRef.current.setLngLat([pos.lon, pos.lat]).addTo(map);
        framedRef.current = true;
        map.easeTo({
          center: [pos.lon, pos.lat],
          zoom: Math.max(map.getZoom(), 10),
          duration: reducedMotion() ? 0 : 900,
        });
        onLocate?.(pos);
      },
      (err) => {
        setLocating(false);
        onLocate?.(null, err.code === err.PERMISSION_DENIED ? "location permission denied" : "could not get a fix");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildMapStyle(window.location.origin, CONTOUR_TILES),
      bounds: WEST_COAST_BOUNDS,
      fitBoundsOptions: { padding: 40 },
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    // Below this zoom the southern passes sit label-on-label; keep only the
    // selected name until the viewer leans in.
    const syncZoom = () => {
      const z = map.getZoom();
      const band = z >= 10.8 ? "near" : z >= 8.6 ? "mid" : "far";
      containerRef.current?.setAttribute("data-zoom", band);
    };
    map.on("zoom", syncZoom);
    map.on("load", syncZoom);
    syncZoom();
    // Guard against initializing while the container is still being laid
    // out: track its real size, and refit until the user takes over.
    map.on("dragstart", () => {
      framedRef.current = true;
    });
    map.on("wheel", () => {
      framedRef.current = true;
    });
    const refit = () => {
      if (framedRef.current) return;
      map.resize();
      map.fitBounds(WEST_COAST_BOUNDS, { padding: 40, duration: 0 });
    };
    const ro = new ResizeObserver(refit);
    ro.observe(containerRef.current);
    map.on("load", refit);
    map.on("load", () => {
      addPassLayer(map, (slug) => onSelectRef.current(slug));
      setLayerReady(true);
    });
    map.once("idle", refit);
    mapRef.current = map;
    (window as unknown as { __map?: maplibregl.Map }).__map = map;
    map.on("error", (e) => {
      (window as unknown as { __maperr?: string[] }).__maperr ??= [];
      (window as unknown as { __maperr?: string[] }).__maperr?.push(String(e.error));
    });
    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selected) return;
    const p = passes.find((x) => x.slug === selected);
    if (!p) return;
    if (!map.getBounds().contains([p.lon, p.lat]) || map.getZoom() < 7.5) {
      framedRef.current = true;
      map.easeTo({
        center: [p.lon, p.lat],
        zoom: Math.max(map.getZoom(), 9),
        duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 700,
      });
    }
  }, [selected, passes]);

  useEffect(() => {
    const handler = () => setSavedVersion((v) => v + 1);
    window.addEventListener("sierra-saved-changed", handler);
    return () => window.removeEventListener("sierra-saved-changed", handler);
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    const savedSet = new Set(loadSaved());
    // 1,252 DOM markers reposition every frame (in 3D, with a terrain
    // lookup each), which stutters on a phone. Only the passes that wear
    // pixel badges or state (featured, selected, saved) stay HTML; the rest
    // draw on the GPU as pixel squares in the same palette.
    const asHtml = new Set(
      passes
        .filter((p) => p.tier === "featured" || p.slug === selected || savedSet.has(p.slug))
        .map((p) => p.slug),
    );
    const src = layerReady ? (map.getSource(PASS_SOURCE) as maplibregl.GeoJSONSource) : undefined;
    src?.setData(passCollection(passes, evalDate, asHtml));
    markersRef.current = passes.filter((p) => asHtml.has(p.slug)).map((p) => {
      const el = markerElement(p, evalDate, p.slug === selected, savedSet.has(p.slug));
      const activate = (e: Event) => {
        e.stopPropagation();
        onSelect(p.slug);
      };
      el.addEventListener("click", activate);
      el.addEventListener("keydown", (e) => {
        if ((e as KeyboardEvent).key === "Enter") activate(e);
      });
      return new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([p.lon, p.lat])
        .addTo(map);
    });
  }, [passes, evalDate, selected, onSelect, savedVersion, layerReady]);

  return (
    <>
      <div ref={containerRef} style={{ position: "absolute", inset: 0 }} aria-label="Map" />
      <div className="map-tools" role="toolbar" aria-label="Map tools">
        <button
          onClick={locate}
          aria-label="Show my location and the nearest passes"
          title="where am I? nearest passes"
          disabled={locating}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <circle cx="9" cy="9" r="5" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="9" cy="9" r="1.8" fill="currentColor" />
            <path d="M9 0v3M9 15v3M0 9h3M15 9h3" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
        <button
          onClick={toggleRelief}
          aria-pressed={relief}
          title={relief ? "flat map" : "3D terrain"}
          className="mono"
        >
          {relief ? "2D" : "3D"}
        </button>
      </div>
    </>
  );
}
