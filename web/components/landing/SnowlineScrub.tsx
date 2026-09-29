"use client";

import { useInView, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import s from "@/app/landing.module.css";
import { type LandingData, loadLanding, STATUS_LABEL, type StatusKey } from "@/lib/landingData";
import { statusColor } from "@/lib/theme";
import Reveal from "./Reveal";
import Signpost from "./Signpost";

// The name made literal. The featured passes drawn as a crest profile, south
// to north, at their real elevations; scrub the date and watch the snowline
// climb and fall through four seasons of real verdicts.
const W = 1000;
const H = 420;
const L = 104;
const R = 24;
const T = 24;
const B = 46;
const LAT0 = 32.4;
const LAT1 = 49.1;
const ELEV0 = 2000;
const ELEV1 = 14500;
const STEP_MS = 950;

const x = (lat: number) => L + ((lat - LAT0) / (LAT1 - LAT0)) * (W - L - R);
const y = (ft: number) => T + ((ELEV1 - ft) / (ELEV1 - ELEV0)) * (H - T - B);

type Pt = { slug: string; name: string; lat: number; ft: number; st: string };

function fmt(date: string, isLast: boolean) {
  if (isLast) return "Today";
  const d = new Date(`${date}T12:00:00Z`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

// The elevation that best splits snow-holding passes from snow-free ones on
// a given day: the fewest passes on the wrong side of the line.
function snowline(pts: Pt[], idx: number): number | null {
  const snowy: number[] = [];
  const clear: number[] = [];
  for (const p of pts) {
    const c = p.st[idx];
    if (c === "0") clear.push(p.ft);
    else if (c === "1" || c === "2" || c === "3") snowy.push(p.ft);
  }
  if (!snowy.length && !clear.length) return null;
  if (!snowy.length) return ELEV1;
  if (!clear.length) return ELEV0;
  const cands = [...new Set([...snowy, ...clear])].sort((a, b) => a - b);
  let best = ELEV1;
  let bestErr = Infinity;
  for (let i = 0; i <= cands.length; i++) {
    const t = i < cands.length ? cands[i] : ELEV1;
    const err = snowy.filter((f) => f < t).length + clear.filter((f) => f >= t).length;
    if (err < bestErr) {
      bestErr = err;
      best = t;
    }
  }
  return best;
}

export default function SnowlineScrub() {
  const reduce = useReducedMotion() ?? false;
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.5 });
  const [data, setData] = useState<LandingData | null>(null);
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    loadLanding().then(setData).catch(() => {});
  }, []);

  const pts = useMemo<Pt[]>(() => {
    if (!data) return [];
    const ft = new Map(data.featured_today.map((p) => [p.slug, p.elevation_ft]));
    return data.passes
      .filter(([, , f, , slug]) => f === 1 && ft.has(slug))
      .map(([lon, lat, , st, slug, name]) => ({ slug, name, lat, ft: ft.get(slug)!, st, lon }))
      .sort((a, b) => a.lat - b.lat);
  }, [data]);

  const n = data?.dates.length ?? 0;
  useEffect(() => {
    if (!data || reduce || !inView || paused || touched) return;
    const t = window.setInterval(() => setIdx((i) => (i + 1) % n), STEP_MS);
    return () => window.clearInterval(t);
  }, [data, reduce, inView, paused, touched, n]);

  const line = pts.length ? snowline(pts, idx) : null;
  const ridge = useMemo(() => {
    if (!pts.length) return "";
    const first = pts[0];
    const last = pts[pts.length - 1];
    const body = pts.map((p) => `L${x(p.lat).toFixed(1)} ${y(p.ft).toFixed(1)}`).join(" ");
    return `M${x(first.lat).toFixed(1)} ${H - B} ${body} L${x(last.lat).toFixed(1)} ${H - B} Z`;
  }, [pts]);

  const key = (c: string): StatusKey => data?.status_keys[Number(c)] ?? "unknown";
  const counts = pts.reduce<Record<string, number>>((acc, p) => {
    const k = key(p.st[idx]);
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <section className={s.section} id="snowline">
      <div className={s.wrap}>
        <Reveal className={s.seasonsHead}>
          <Signpost label="Four seasons of verdicts" dir="left" />
          <h2 className={`${s.display} ${s.h2}`}>Watch the snowline move.</h2>
          <p className={s.body}>
            The {pts.length || 68} featured passes drawn as one crest, south to north, at their real
            elevations. Each dot is that pass&apos;s verdict on that day. The line is where snow
            gave way to trail.
          </p>
        </Reveal>
        <div
          ref={ref}
          className={s.snowlineStage}
          onPointerEnter={() => setPaused(true)}
          onPointerLeave={() => setPaused(false)}
        >
          <svg className={s.snowlineSvg} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Featured passes by elevation and latitude, colored by verdict for the selected date">
            <defs>
              <clipPath id="ridgeClip">
                <path d={ridge} />
              </clipPath>
            </defs>
            {[4000, 8000, 12000].map((ft) => (
              <g key={ft}>
                <line x1={L} x2={W - R} y1={y(ft)} y2={y(ft)} className={s.snowlineGrid} />
                <text x={L - 10} y={y(ft) + 4} textAnchor="end" className={s.snowlineAxis}>
                  {ft / 1000}k ft
                </text>
              </g>
            ))}
            <path d={ridge} className={s.snowlineRidge} />
            {line !== null && (
              <rect
                x={L}
                y={0}
                width={W - L - R}
                height={Math.max(0, y(line))}
                className={s.snowlineSnow}
                clipPath="url(#ridgeClip)"
                style={{ transition: reduce ? "none" : "height 700ms cubic-bezier(0.16, 1, 0.3, 1)" }}
              />
            )}
            {line !== null && line > ELEV0 && line < ELEV1 && (
              <g style={{ transition: reduce ? "none" : "transform 700ms cubic-bezier(0.16, 1, 0.3, 1)", transform: `translateY(${y(line)}px)` }}>
                <line x1={L} x2={W - R} y1={0} y2={0} className={s.snowlineLine} />
                <text x={L + 8} y={-8} textAnchor="start" className={s.snowlineLabel}>
                  snowline ≈ {Math.round(line / 100) * 100} ft
                </text>
              </g>
            )}
            {[42, 46.3].map((lat) => (
              <line key={lat} x1={x(lat)} x2={x(lat)} y1={T} y2={H - B + 6} className={s.snowlineGrid} />
            ))}
            {[
              ["California", (LAT0 + 42) / 2],
              ["Oregon", (42 + 46.3) / 2],
              ["Washington", (46.3 + LAT1) / 2],
            ].map(([name, lat]) => (
              <text key={name} x={x(Number(lat))} y={H - 14} textAnchor="middle" className={s.snowlineAxis}>
                {name}
              </text>
            ))}
            {pts.map((p) => (
              <circle
                key={p.slug}
                cx={x(p.lat)}
                cy={y(p.ft)}
                r="4.5"
                fill={statusColor[key(p.st[idx])]}
                className={s.snowlineDot}
                style={{ transition: reduce ? "none" : "fill 500ms" }}
              >
                <title>
                  {p.name}, {p.ft.toLocaleString()} ft: {STATUS_LABEL[key(p.st[idx])]}
                </title>
              </circle>
            ))}
          </svg>
          <div className={s.snowlineControls}>
            <div className={`${s.display} ${s.snowlineDate}`}>{data ? fmt(data.dates[idx], idx === n - 1) : "..."}</div>
            <input
              id="snowline-date"
              className={s.snowlineRange}
              type="range"
              min={0}
              max={Math.max(0, n - 1)}
              value={idx}
              aria-label="Date"
              onChange={(e) => {
                setTouched(true);
                setIdx(Number(e.target.value));
              }}
            />
            <ul className={`${s.mono} ${s.snowlineLegend}`}>
              {(["open", "snow_caution", "traction_advised", "not_recommended", "unknown"] as StatusKey[]).map((k) => (
                <li key={k}>
                  <span className={s.swatch} style={{ background: statusColor[k] }} />
                  {STATUS_LABEL[k]} <b>{counts[k] ?? 0}</b>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
