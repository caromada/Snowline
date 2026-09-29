"use client";

import type { Map as MapLibreMap } from "maplibre-gl";
import { type RefObject, useEffect, useState } from "react";
import { flame, isCurrent, pacificToday, shortDate } from "@/lib/fire";
import type { FireMap } from "@/lib/fireTypes";
import { dataUrl } from "@/lib/paths";
import { drawSprite } from "@/lib/pixel";
import { palette } from "@/lib/theme";
import PixelGlyph from "./PixelGlyph";

const LAYERS = ["smoke-wash", "fire-fill", "fire-line", "fire-marks", "fire-names"] as const;
// Everything here draws beneath the pass squares, so a pass is never hidden
// by the fire it sits in.
const BELOW = "pass-squares";

function flameImage(): ImageData | null {
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 16;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  drawSprite(ctx, flame, 0, 0, 1);
  return ctx.getImageData(0, 0, 16, 16);
}

function addFireLayers(map: MapLibreMap, doc: FireMap): void {
  if (map.getSource("fire-perimeters")) return;
  const before = map.getLayer(BELOW) ? BELOW : undefined;
  map.addSource("smoke", { type: "geojson", data: doc.smoke });
  map.addSource("fire-perimeters", { type: "geojson", data: doc.fires });
  map.addSource("fire-labels", { type: "geojson", data: doc.fire_labels });
  map.addLayer(
    {
      id: "smoke-wash",
      type: "fill",
      source: "smoke",
      paint: {
        "fill-color": palette.granite,
        "fill-opacity": ["match", ["get", "density"], "heavy", 0.34, "medium", 0.22, 0.12],
        "fill-antialias": false,
      },
    },
    before,
  );
  map.addLayer(
    {
      id: "fire-fill",
      type: "fill",
      source: "fire-perimeters",
      paint: { "fill-color": palette.alpenglow, "fill-opacity": 0.26 },
    },
    before,
  );
  map.addLayer(
    {
      id: "fire-line",
      type: "line",
      source: "fire-perimeters",
      paint: {
        "line-color": palette.alpenglow,
        // Zoom expressions must sit at the top of a paint property.
        "line-width": ["interpolate", ["linear"], ["zoom"], 5, 1, 10, 1.5, 14, 2.5],
      },
    },
    before,
  );
  const icon = flameImage();
  if (icon && !map.hasImage("fire-flame")) map.addImage("fire-flame", icon);
  // From far out a perimeter is a few pixels wide; the flame marks where
  // it is until the shape itself can be seen.
  map.addLayer(
    {
      id: "fire-marks",
      type: "symbol",
      source: "fire-labels",
      maxzoom: 9,
      layout: {
        "icon-image": "fire-flame",
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
      },
    },
    before,
  );
  map.addLayer(
    {
      id: "fire-names",
      type: "symbol",
      source: "fire-labels",
      minzoom: 7,
      layout: {
        "text-field": ["upcase", ["get", "name"]],
        "text-font": ["Space Grotesk"],
        "text-size": 10,
        "text-letter-spacing": 0.14,
        "text-anchor": "top",
        "text-offset": [0, 1.1],
        "text-optional": true,
      },
      paint: {
        // The name often sits on its own warm fill, so the halo carries it.
        "text-color": palette.alpenglow,
        "text-halo-color": palette.deepPine,
        "text-halo-width": 2,
      },
    },
    before,
  );
}

type Load = { state: "loading" } | { state: "none" } | { state: "ready"; doc: FireMap };

// Active fire perimeters and satellite-mapped smoke, with the toolbar
// button that shows and hides them.
export default function FireLayer({
  mapRef,
  ready,
  evalDate,
}: {
  mapRef: RefObject<MapLibreMap | null>;
  /** True once the base layers exist; layers cannot be added before that. */
  ready: boolean;
  evalDate: string;
}) {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [on, setOn] = useState(true);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    let cancelled = false;
    fetch(dataUrl("fire.json"))
      .then((r) => (r.ok ? (r.json() as Promise<FireMap>) : Promise.reject(new Error("no file"))))
      .then((doc) => {
        if (cancelled || mapRef.current !== map) return;
        addFireLayers(map, doc);
        setLoad({ state: "ready", doc });
      })
      .catch(() => {
        if (!cancelled) setLoad({ state: "none" });
      });
    return () => {
      cancelled = true;
    };
  }, [mapRef, ready]);

  const doc = load.state === "ready" ? load.doc : null;
  // Yesterday's perimeter drawn as today's, or today's drawn over a past
  // season, would both be wrong; neither is drawn.
  const current = !!doc && isCurrent(doc.issued_for, pacificToday(), evalDate);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !doc) return;
    for (const id of LAYERS) {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, "visibility", on && current ? "visible" : "none");
      }
    }
  }, [mapRef, doc, on, current]);

  const missing = doc
    ? [!doc.fires_available && "fire perimeters", !doc.smoke_available && "smoke"].filter(Boolean)
    : [];
  const title = !doc
    ? load.state === "loading"
      ? "loading fire perimeters and smoke"
      : "no fire or smoke data"
    : !current
      ? `fire and smoke are shown for the present only; last data ${shortDate(doc.issued_for)}`
      : `${on ? "hide" : "show"} fire perimeters and smoke, ${shortDate(doc.issued_for)}` +
        (missing.length ? ` (${missing.join(" and ")} unavailable today)` : "");

  return (
    <button
      onClick={() => setOn((v) => !v)}
      aria-pressed={on && current}
      aria-label="Fire perimeters and smoke"
      title={title}
      disabled={!current}
    >
      <PixelGlyph sprite={flame} scale={1} />
    </button>
  );
}
