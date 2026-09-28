"use client";

import { useEffect, useState } from "react";
import s from "@/app/landing.module.css";
import { type LandingData, loadLanding } from "@/lib/landingData";
import { statusColor } from "@/lib/theme";

// Today's real readings for the featured passes, drifting past.
export default function Ticker() {
  const [data, setData] = useState<LandingData | null>(null);
  useEffect(() => {
    loadLanding().then(setData).catch(() => {});
  }, []);
  const items = data?.featured_today ?? [];
  if (!items.length) return <div className={s.ticker} style={{ minHeight: 47 }} aria-hidden="true" />;
  const row = (hidden: boolean) =>
    items.map((p) => (
      <span key={`${hidden ? "b" : "a"}-${p.slug}`} className={`${s.tickerItem} ${s.mono}`} aria-hidden={hidden}>
        <span className={s.swatch} style={{ background: statusColor[p.status] }} />
        <span className={s.tickerName}>{p.name.replace(/ Pass$/, "")}</span>
        {p.elevation_ft.toLocaleString()} ft
        <span>{p.status_label.toLowerCase()}</span>
      </span>
    ));
  return (
    <div className={s.ticker} aria-label="Today's conditions at featured passes">
      <div className={s.tickerTrack}>
        {row(false)}
        {row(true)}
      </div>
    </div>
  );
}
