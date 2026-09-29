"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import s from "@/app/landing.module.css";
import { type LandingData, loadLanding } from "@/lib/landingData";

type Line = { t: string; who: string; what: string; warm?: boolean };

// The pipeline's own log, typed out line by line. Every number is real:
// it comes from the same file the site's charts read.
function linesFor(d: LandingData): Line[] {
  const end = new Date(d.generated_at);
  const at = (minutesBefore: number) =>
    new Date(end.getTime() - minutesBefore * 60_000).toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  const known = d.passes.filter(([, , , st]) => st[st.length - 1] !== "4").length;
  const fires = d.counts.fires ?? 0;
  return [
    { t: at(6.2), who: "Sensor Watch", what: `${d.counts.snow_stations} snow sensors read` },
    { t: at(5.4), who: "Gauge Watch", what: `${d.counts.stream_gauges} stream gauges read` },
    {
      t: at(4.1),
      who: "Fire Watch",
      what: fires
        ? `${fires.toLocaleString()} ${fires === 1 ? "fire" : "fires"} mapped, smoke read`
        : "fire map and smoke read",
    },
    { t: at(3.3), who: "Road Watch", what: "chain controls and road reports read" },
    { t: at(2.5), who: "Snowline Estimator", what: `${d.model.snowline_rise_ft_per_day} ft/day climb applied` },
    { t: at(1.6), who: "Forecast Reader", what: "7-day grids read at pass elevation" },
    { t: at(0.7), who: "Fusion", what: `${known.toLocaleString()} of ${d.counts.passes.toLocaleString()} passes with a verdict` },
    { t: at(0), who: "Published", what: "every pass, with the readings behind it", warm: true },
  ];
}

export default function MorningRun() {
  const reduce = useReducedMotion();
  const [data, setData] = useState<LandingData | null>(null);
  const [shown, setShown] = useState(0);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    loadLanding().then(setData).catch(() => {});
  }, []);

  const lines = data ? linesFor(data) : [];

  useEffect(() => {
    if (!lines.length) return;
    let i = reduce ? lines.length - 1 : 0;
    const step = () => {
      i += 1;
      setShown(i);
      if (i < lines.length) timer.current = window.setTimeout(step, 520 + Math.random() * 380);
    };
    timer.current = window.setTimeout(step, reduce ? 0 : 900);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [lines.length, reduce]);

  const date = data
    ? new Date(data.generated_at).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
    : "";

  return (
    <div className={`${s.console} ${s.bracket}`} role="log" aria-label="This morning's run">
      <div className={`${s.consoleHead} ${s.mono}`}>
        <span className={s.live}>
          <span className={s.liveDot} aria-hidden="true" />
          morning run
        </span>
        <span>{date}</span>
      </div>
      <ol className={`${s.consoleLines} ${s.mono}`}>
        {lines.slice(0, shown).map((l) => (
          <li key={l.who} className={l.warm ? s.warm : undefined}>
            <span className={s.consoleTime}>{l.t}</span>
            <span className={s.consoleWho}>{l.who}</span>
            <span>{l.what}</span>
          </li>
        ))}
        {(!data || shown < lines.length) && (
          <li aria-hidden="true">
            <span className={s.cursor} />
          </li>
        )}
      </ol>
    </div>
  );
}
