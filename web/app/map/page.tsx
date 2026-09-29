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
import TimeControl from "@/components/TimeControl";
import TripPlanner, { type TripOnMap } from "@/components/TripPlanner";
import { brand } from "@/lib/brand";
import { recallPass } from "@/lib/backend";
import { dataUrl } from "@/lib/paths";
import type { Access, PassIndex } from "@/lib/types";

const MapView = dynamic(() => import("@/components/MapView"), {
  ssr: false,
  loading: () => <Campfire label="lighting the fire" />,
});

export default function Home() {
  const [index, setIndex] = useState<PassIndex | null>(null);
  const [evalDate, setEvalDate] = useState<string | null>(null);
  const [selected, setSelectedSlug] = useState<string | null>(null);
  const [access, setAccess] = useState<Access | null>(null);
  const [focus, setFocus] = useState<{ lat: number; lon: number; n: number } | null>(null);
  // The map's trailhead and campground markers belong to the open pass.
  const setSelected = useCallback((slug: string | null) => {
    setSelectedSlug(slug);
    setAccess(null);
  }, []);
  const [here, setHere] = useState<{ pos: Position | null; error: string | null } | null>(null);
  const [trip, setTrip] = useState<TripOnMap | null>(null);

  useEffect(() => {
    fetch(dataUrl("passes.json"))
      .then((r) => r.json())
      .then((d: PassIndex) => {
        setIndex(d);
        const params = new URLSearchParams(window.location.search);
        const wantDate = params.get("date");
        const wantPass = params.get("pass");
        // The map opens on the present. A link can still pin a past date.
        const latest = d.dates[d.dates.length - 1];
        setEvalDate(wantDate && d.dates.includes(wantDate) ? wantDate : latest);
        // A sign-in link lands here bare; reopen the pass it was sent from.
        const open = wantPass ?? recallPass();
        if (open && d.passes.some((p) => p.slug === open)) setSelected(open);
      })
      .catch(() => {});
  }, []);

  const onSelect = useCallback((slug: string) => setSelected(slug), [setSelected]);
  const onShow = useCallback(
    (lat: number, lon: number) => setFocus((f) => ({ lat, lon, n: (f?.n ?? 0) + 1 })),
    [],
  );
  const onLocate = useCallback(
    (pos: Position | null, error?: string) => setHere({ pos, error: error ?? null }),
    [],
  );

  useEffect(() => {
    if (!evalDate) return;
    const url = new URL(window.location.href);
    if (selected) url.searchParams.set("pass", selected);
    else url.searchParams.delete("pass");
    // Only the past goes in the address: a shared link to today stays on
    // today tomorrow.
    const latest = index?.dates[index.dates.length - 1];
    if (evalDate === latest) url.searchParams.delete("date");
    else url.searchParams.set("date", evalDate);
    window.history.replaceState(null, "", url);
  }, [selected, evalDate, index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setSelected]);

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
        access={access}
        focus={focus}
        trip={trip}
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
      <TimeControl dates={index.dates} value={evalDate} onChange={setEvalDate} />
      <PassPanel
        slug={selected}
        evalDate={evalDate}
        onClose={() => setSelected(null)}
        onAccess={setAccess}
        onShow={onShow}
      />
      <TripPlanner
        passes={index.passes}
        position={here?.pos ?? null}
        selected={selected}
        onSelect={onSelect}
        onShow={onShow}
        onTrip={setTrip}
      />
      <SafetyNotice />
    </main>
  );
}
