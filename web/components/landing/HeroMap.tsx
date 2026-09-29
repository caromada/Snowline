"use client";

import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import s from "@/app/landing.module.css";
import { setupContours } from "@/lib/contours";
import { buildMapStyle } from "@/lib/mapStyle";

maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");

// The product as the hero: the real 3D terrain map, tilted and slowly
// orbiting a pass, contours drawing over it. Labels off; this is scenery
// with the app's own bones. Phones and reduced-motion get the poster frame.
const CENTER: [number, number] = [-120.8225, 47.4808]; // Aasgard Pass
const ORBIT_SECONDS = 150;

export default function HeroMap({ poster }: { poster: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const phone = window.matchMedia("(max-width: 900px)").matches;
    if (reduce || phone) return;

    const contourTiles = setupContours(maplibregl);
    const style = buildMapStyle(window.location.origin, contourTiles);
    // Scenery only: no labels, roads, trails or boundaries in the hero.
    style.layers = style.layers.filter(
      (l) => l.type !== "symbol" && !/roads|trail|boundary/.test(l.id),
    );
    const map = new maplibregl.Map({
      container: el,
      style,
      center: CENTER,
      zoom: 12.4,
      pitch: 62,
      bearing: 20,
      interactive: false,
      attributionControl: false,
    });
    let raf = 0;
    map.on("load", () => {
      map.setTerrain({ source: "relief", exaggeration: 1.5 });
      map.once("idle", () => setReady(true));
      const start = performance.now();
      const spin = (now: number) => {
        map.setBearing(20 + ((now - start) / 1000 / ORBIT_SECONDS) * 360);
        raf = requestAnimationFrame(spin);
      };
      raf = requestAnimationFrame(spin);
    });
    return () => {
      cancelAnimationFrame(raf);
      map.remove();
    };
  }, []);

  return (
    <div className={s.heroMap} aria-hidden="true">
      <img className={s.heroPoster} src={poster} alt="" width={1600} height={1000} fetchPriority="high" />
      <div ref={ref} className={s.heroLive} style={{ opacity: ready ? 1 : 0 }} />
    </div>
  );
}
