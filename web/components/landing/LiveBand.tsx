"use client";

import { useEffect, useState } from "react";
import s from "@/app/landing.module.css";
import { type LandingData, loadLanding } from "@/lib/landingData";
import CountUp from "./CountUp";

function ago(iso: string, now: number): string {
  const m = Math.max(0, Math.round((now - Date.parse(iso)) / 60000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 36) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

// The proof strip: how fresh the data is, ticking in real time, and the
// real counts behind the product. The sun (or moon) sits where it is in the
// visitor's own sky right now.
export default function LiveBand() {
  const [data, setData] = useState<LandingData | null>(null);
  const [now, setNow] = useState(0);
  useEffect(() => {
    loadLanding().then(setData).catch(() => {});
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const every = window.setInterval(tick, 30_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(every);
    };
  }, []);

  const d = now ? new Date(now) : null;
  const hour = d ? d.getHours() + d.getMinutes() / 60 : 12;
  const day = hour >= 6 && hour < 18;
  const t = day ? (hour - 6) / 12 : ((hour + 6) % 24) / 12;
  const ang = Math.PI * (1 - t);
  const cx = 60 + 48 * Math.cos(ang);
  const cy = 58 - 44 * Math.sin(ang);
  const eval_ = data?.model.eval;

  return (
    <div className={s.live} aria-label="Live status">
      <div className={`${s.wrap} ${s.liveInner}`}>
        <div className={`${s.mono} ${s.liveFresh}`}>
          <span className={s.liveDot} aria-hidden="true" />
          {data && now ? `Updated ${ago(data.generated_at, now)}` : "Updated this morning"}
        </div>
        <dl className={s.liveItems}>
          <div className={s.liveItem}>
            <dt className={s.liveLabel}>passes read</dt>
            <dd className={s.liveNum}>
              <CountUp value={data?.counts.passes ?? 1252} />
            </dd>
          </div>
          <div className={s.liveItem}>
            <dt className={s.liveLabel}>sensors and gauges</dt>
            <dd className={s.liveNum}>
              <CountUp value={(data?.counts.snow_stations ?? 314) + (data?.counts.stream_gauges ?? 418)} />
            </dd>
          </div>
          <div className={s.liveItem}>
            <dt className={s.liveLabel}>seasons of history</dt>
            <dd className={s.liveNum}>{data?.counts.seasons ?? 4}</dd>
          </div>
          <div className={s.liveItem}>
            <dt className={s.liveLabel}>report-reading accuracy</dt>
            <dd className={s.liveNum}>
              {eval_ ? `${Math.round(eval_.overall * 1000) / 10}%` : "87.5%"}
            </dd>
          </div>
        </dl>
        <svg className={s.liveArc} viewBox="0 0 120 64" aria-hidden="true">
          <path d="M12 58 A48 48 0 0 1 108 58" fill="none" stroke="currentColor" strokeDasharray="2 5" strokeWidth="1" />
          <line x1="4" y1="58" x2="116" y2="58" stroke="currentColor" strokeWidth="1" />
          {day ? (
            <g className={s.liveSun} style={{ transformOrigin: `${cx}px ${cy}px` }}>
              <circle cx={cx} cy={cy} r="6" fill="var(--alpenglow)" />
              {Array.from({ length: 8 }, (_, i) => {
                const a = (i * Math.PI) / 4;
                return (
                  <line
                    key={i}
                    x1={cx + 8.5 * Math.cos(a)}
                    y1={cy + 8.5 * Math.sin(a)}
                    x2={cx + 11 * Math.cos(a)}
                    y2={cy + 11 * Math.sin(a)}
                    stroke="var(--alpenglow)"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                );
              })}
            </g>
          ) : (
            <g>
              <circle cx={cx} cy={cy} r="6" fill="var(--granite)" />
              <circle cx={cx + 2.6} cy={cy - 1.5} r="5" fill="var(--surface)" />
            </g>
          )}
        </svg>
      </div>
    </div>
  );
}
