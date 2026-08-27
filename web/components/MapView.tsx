"use client";

import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";

// Bundlers resolve MapLibre's worker inconsistently; serving it as a plain
// static file sidesteps all of that.
maplibregl.setWorkerUrl("maplibre-gl-worker.mjs");
import { drawSprite, tent as tentSprite } from "@/lib/pixel";
import { palette, statusColor } from "@/lib/theme";
import type { PassIndexEntry } from "@/lib/types";
import { loadSaved } from "./PassPanel";

// Terrain-tinted basemap: AWS open terrain tiles hillshaded into the forest
// palette. No API key, no tile vendor account.
const MAP_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    terrain: {
      type: "raster-dem",
      encoding: "terrarium",
      tiles: ["https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 13,
      attribution:
        "Terrain: <a href='https://registry.opendata.aws/terrain-tiles/'>AWS Open Data</a>",
    },
  },
  layers: [
    { id: "ground", type: "background", paint: { "background-color": palette.deepPine } },
    {
      id: "hillshade",
      type: "hillshade",
      source: "terrain",
      paint: {
        "hillshade-shadow-color": "#08110c",
        "hillshade-highlight-color": "#59806844",
        "hillshade-accent-color": palette.moss,
        "hillshade-exaggeration": 0.7,
      },
    },
  ],
};

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
  dot.style.cssText = `position:absolute;left:50%;top:50%;width:${size}px;height:${size}px;` +
    `transform:translate(-50%,-50%);background:${color};` +
    `box-shadow:0 0 0 2px ${palette.deepPine};`;
  dotWrap.appendChild(dot);

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

export default function MapView({
  passes,
  evalDate,
  selected,
  onSelect,
}: {
  passes: PassIndexEntry[];
  evalDate: string;
  selected: string | null;
  onSelect: (slug: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const [savedVersion, setSavedVersion] = useState(0);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      bounds: [
        [-120.6, 35.8],
        [-118.0, 39.5],
      ],
      fitBoundsOptions: { padding: 40 },
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    // Below this zoom the southern passes sit label-on-label; keep only the
    // selected name until the viewer leans in.
    const syncZoom = () => {
      const near = map.getZoom() >= 8.6;
      containerRef.current?.setAttribute("data-zoom", near ? "near" : "far");
    };
    map.on("zoom", syncZoom);
    map.on("load", syncZoom);
    // Guard against initializing while the container is still being laid
    // out: track its real size, and refit until the user takes over.
    let userMoved = false;
    map.on("dragstart", () => {
      userMoved = true;
    });
    map.on("wheel", () => {
      userMoved = true;
    });
    const refit = () => {
      if (userMoved) return;
      map.resize();
      map.fitBounds(
        [
          [-120.6, 35.8],
          [-118.0, 39.5],
        ],
        { padding: 40, duration: 0 },
      );
    };
    const ro = new ResizeObserver(refit);
    ro.observe(containerRef.current);
    map.on("load", refit);
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
    const handler = () => setSavedVersion((v) => v + 1);
    window.addEventListener("sierra-saved-changed", handler);
    return () => window.removeEventListener("sierra-saved-changed", handler);
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    markersRef.current.forEach((m) => m.remove());
    const savedSet = new Set(loadSaved());
    markersRef.current = passes.map((p) => {
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
  }, [passes, evalDate, selected, onSelect, savedVersion]);

  return <div ref={containerRef} style={{ position: "absolute", inset: 0 }} aria-label="Map" />;
}
