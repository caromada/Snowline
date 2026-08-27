"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import Campfire from "@/components/Campfire";
import MapLegend from "@/components/MapLegend";
import PassPanel from "@/components/PassPanel";
import PassSearch from "@/components/PassSearch";
import SeasonScrubber from "@/components/SeasonScrubber";
import type { PassIndex } from "@/lib/types";

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => <Campfire label="lighting the fire" />,
});

export default function Home() {
  const [index, setIndex] = useState<PassIndex | null>(null);
  const [evalDate, setEvalDate] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    fetch("data/passes.json")
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
      <main style={{ display: "grid", placeItems: "center", height: "100vh" }}>
        <Campfire label="finding the trailhead" />
      </main>
    );
  }

  return (
    <main style={{ position: "relative", height: "100vh", overflow: "hidden" }}>
      <MapView
        passes={index.passes}
        evalDate={evalDate}
        selected={selected}
        onSelect={onSelect}
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
          Sierra Pass Report
        </h1>
        <p className="mono" style={{ color: "var(--sage)", marginTop: 2 }}>
          sensors + satellite + people who were just there
        </p>
      </header>
      <div style={{ position: "absolute", top: 62, left: 16, zIndex: 30 }}>
        <PassSearch passes={index.passes} onSelect={onSelect} />
      </div>
      <MapLegend />
      <SeasonScrubber dates={index.dates} value={evalDate} onChange={setEvalDate} />
      <PassPanel slug={selected} evalDate={evalDate} onClose={() => setSelected(null)} />
    </main>
  );
}
