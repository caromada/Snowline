"use client";

import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef } from "react";
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
  el.style.cssText = "display:flex;flex-direction:column;align-items:center;cursor:pointer;";
  el.setAttribute("role", "button");
  el.setAttribute("aria-label", `${p.name}: ${s?.status_label ?? "unknown"}`);
  el.tabIndex = 0;

  const dotWrap = document.createElement("div");
  dotWrap.style.cssText = "position:relative;width:34px;height:34px;";
  const dot = document.createElement("div");
  const size = selected ? 12 : 10;
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
  label.className = "display";
  label.style.cssText =
    `font-size:10px;letter-spacing:0.14em;color:${selected ? palette.alpenglow : palette.granite};` +
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

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE,
      bounds: [
        [-119.55, 36.5],
        [-118.05, 37.95],
      ],
      fitBoundsOptions: { padding: 40 },
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "bottom-right");
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
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
  }, [passes, evalDate, selected, onSelect]);

  // Re-render markers when saved passes change (the tent badges).
  useEffect(() => {
    const handler = () => {
      const map = mapRef.current;
      if (!map) return;
      markersRef.current.forEach((m) => m.remove());
      const savedSet = new Set(loadSaved());
      markersRef.current = passes.map((p) => {
        const el = markerElement(p, evalDate, p.slug === selected, savedSet.has(p.slug));
        el.addEventListener("click", (e) => {
          e.stopPropagation();
          onSelect(p.slug);
        });
        return new maplibregl.Marker({ element: el, anchor: "center" })
          .setLngLat([p.lon, p.lat])
          .addTo(map);
      });
    };
    window.addEventListener("sierra-saved-changed", handler);
    return () => window.removeEventListener("sierra-saved-changed", handler);
  }, [passes, evalDate, selected, onSelect]);

  return <div ref={containerRef} style={{ position: "absolute", inset: 0 }} aria-label="Map" />;
}
