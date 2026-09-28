"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import Campfire from "@/components/Campfire";
import MapLegend from "@/components/MapLegend";
import type { Position } from "@/components/MapView";
import NearbyPasses from "@/components/NearbyPasses";
import PassPanel from "@/components/PassPanel";
import PassSearch from "@/components/PassSearch";
import SafetyNotice from "@/components/SafetyNotice";
import SeasonScrubber from "@/components/SeasonScrubber";
import { brand } from "@/lib/brand";
import { dataUrl } from "@/lib/paths";
import type { PassIndex } from "@/lib/types";

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => <Campfire label="lighting the fire" />,
});

export default function Home() {
  const [index, setIndex] = useState<PassIndex | null>(null);
  const [evalDate, setEvalDate] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [here, setHere] = useState<{ pos: Position | null; error: string | null } | null>(null);

  useEffect(() => {
    fetch(dataUrl("passes.json"))
      .then((r) => r.json())
      .then((d: PassIndex) => {
        setIndex(d);
        const params = new URLSearchParams(window.location.search);
        const wantDate = params.get("date");
        const wantPass = params.get("pass");
        // Open on the heart of the 2023 melt: the season's most interesting week.
        setEvalDate(
          wantDate && d.dates.includes(wantDate)
            ? wantDate
            : d.dates.includes("2023-06-15")
              ? "2023-06-15"
              : d.dates[0],
        );
        if (wantPass && d.passes.some((p) => p.slug === wantPass)) setSelected(wantPass);
      })
      .catch(() => {});
  }, []);

  const onSelect = useCallback((slug: string) => setSelected(slug), []);
  const onLocate = useCallback(
    (pos: Position | null, error?: string) => setHere({ pos, error: error ?? null }),
    [],
  );

  useEffect(() => {
    if (!evalDate) return;
    const url = new URL(window.location.href);
    if (selected) url.searchParams.set("pass", selected);
    else url.searchParams.delete("pass");
    url.searchParams.set("date", evalDate);
    window.history.replaceState(null, "", url);
  }, [selected, evalDate]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (!index || !evalDate) {
    return (
      <main className="map-page" style={{ display: "grid", placeItems: "center", height: "100dvh" }}>
        <Campfire label="finding the trailhead" />
      </main>
    );
  }

  return (
    <main className="map-page" style={{ position: "relative", height: "100dvh", overflow: "hidden" }}>
      <MapView
        passes={index.passes}
        evalDate={evalDate}
        selected={selected}
        onSelect={onSelect}
        onLocate={onLocate}
      />
      <header
        style={{
          position: "absolute",
          top: 14,
          left: 16,
          zIndex: 20,
          pointerEvents: "none",
        }}
      >
        <h1 className="display" style={{ fontSize: 17, color: "var(--granite)" }}>
          {brand.name}
        </h1>
        <p className="mono" style={{ color: "var(--sage)", marginTop: 2 }}>
          {brand.region}
        </p>
      </header>
      <div style={{ position: "absolute", top: 62, left: 16, zIndex: 30 }}>
        <PassSearch passes={index.passes} onSelect={onSelect} />
      </div>
      {here && (
        <NearbyPasses
          position={here.pos}
          error={here.error}
          passes={index.passes}
          evalDate={evalDate}
          onSelect={onSelect}
          onClose={() => setHere(null)}
        />
      )}
      <MapLegend />
      <SeasonScrubber dates={index.dates} value={evalDate} onChange={setEvalDate} />
      <PassPanel slug={selected} evalDate={evalDate} onClose={() => setSelected(null)} />
      <SafetyNotice />
    </main>
  );
}
