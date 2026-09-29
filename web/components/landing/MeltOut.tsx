"use client";

import { Pause, Play } from "@phosphor-icons/react";
import { useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import s from "@/app/landing.module.css";
import { type LandingData, loadLanding, STATUS_LABEL, type StatusKey } from "@/lib/landingData";
import { statusColor } from "@/lib/theme";

type Bounds = { west: number; east: number; south: number; north: number; width: number; height: number };

const STEP_MS = 1100;
const FADE_MS = 520;
const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function seasonLabel(date: string, isToday: boolean): string {
  if (isToday) return "Today";
  const m = Number(date.slice(5, 7));
  return m <= 5 ? `Melt season ${date.slice(0, 4)}` : `Late season ${date.slice(0, 4)}`;
}

// Every square is a real pass; every frame is what the sensors saw that week.
export default function MeltOut() {
  const reduce = useReducedMotion() ?? false;
  const [data, setData] = useState<LandingData | null>(null);
  const [bounds, setBounds] = useState<Bounds | null>(null);
  const [idx, setIdx] = useState(0);
  // null = no choice yet: autoplay while visible unless motion is reduced.
  const [wantPlay, setWantPlay] = useState<boolean | null>(null);
  const [visible, setVisible] = useState(false);
  const playing = visible && (wantPlay ?? !reduce);
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const anim = useRef({ from: 0, to: 0, start: 0 });

  useEffect(() => {
    loadLanding().then((d) => {
      setData(d);
      // Open on the heart of the 2023 melt, the season people remember.
      const start = d.dates.indexOf("2023-05-01");
      setIdx(start >= 0 ? start : 0);
      anim.current = { from: Math.max(0, start), to: Math.max(0, start), start: 0 };
    }).catch(() => {});
    fetch("/landing/meltmap.json").then((r) => r.json()).then(setBounds).catch(() => {});
  }, []);

  // Play only while the viewer can see it.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!playing || !data) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % data.dates.length), STEP_MS);
    return () => clearInterval(t);
  }, [playing, data]);

  // Kick a crossfade whenever the date changes.
  useEffect(() => {
    anim.current = { from: anim.current.to, to: idx, start: performance.now() };
  }, [idx]);

  const points = useMemo(() => {
    if (!data || !bounds) return null;
    const top = mercY(bounds.north);
    const span = top - mercY(bounds.south);
    return data.passes.map(([lon, lat, featured, st]) => ({
      x: (lon - bounds.west) / (bounds.east - bounds.west),
      y: (top - mercY(lat)) / span,
      featured: featured === 1,
      st,
    }));
  }, [data, bounds]);

  // Render loop: outside React, on the canvas, whole pixels only.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !points || !data) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const colors = data.status_keys.map((k) => rgb(statusColor[k] ?? "#8FAE8B"));
    let raf = 0;
    const draw = (now: number) => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.round(canvas.clientWidth * dpr);
      const h = Math.round(canvas.clientHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const { from, to, start } = anim.current;
      const t = reduce ? 1 : Math.min(1, (now - start) / FADE_MS);
      ctx.clearRect(0, 0, w, h);
      for (const p of points) {
        const a = colors[Number(p.st[from])] ?? colors[4];
        const b = colors[Number(p.st[to])] ?? colors[4];
        const changed = p.st[from] !== p.st[to];
        const mix = (i: number) => Math.round(a[i] + (b[i] - a[i]) * t);
        ctx.fillStyle = `rgb(${mix(0)},${mix(1)},${mix(2)})`;
        const size = Math.round((p.featured ? 5 : 3) * dpr + (changed ? (1 - t) * 3 * dpr : 0));
        const x = Math.round(p.x * w - size / 2);
        const y = Math.round(p.y * h - size / 2);
        ctx.fillRect(x, y, size, size);
      }
      if (t < 1) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    const ro = new ResizeObserver(() => requestAnimationFrame(draw));
    ro.observe(canvas);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [points, data, idx, reduce]);

  const date = data?.dates[idx] ?? "";
  const isToday = data ? idx === data.dates.length - 1 : false;
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    if (!data) return c;
    for (const [, , , st] of data.passes) {
      const k = data.status_keys[Number(st[idx])];
      c[k] = (c[k] ?? 0) + 1;
    }
    return c;
  }, [data, idx]);
  const shown: StatusKey[] = ["open", "snow_caution", "traction_advised", "not_recommended"];

  return (
    <div className={s.melt}>
      <div className={s.meltCopy}>
        <p className={s.eyebrow}>Real data, 2023 to today</p>
        <h2 className={`${s.display} ${s.h2}`}>Watch four seasons melt off the West Coast.</h2>
        <p className={s.body}>
          Every square is a real pass. Every frame is what the sensors saw that week, from the
          2023 monster snow year to this morning.
        </p>
        <div>
          <div className={`${s.mono} ${s.meltSeason}`}>{date ? seasonLabel(date, isToday) : ""}</div>
          <div className={s.meltDate} aria-live="polite">
            {date || "...."}
          </div>
        </div>
        <ul className={s.meltStats}>
          {shown.map((k) => (
            <li key={k} className={s.meltStat}>
              <span className={s.swatch} style={{ background: statusColor[k] }} />
              <span className={s.meltCount}>{(counts[k] ?? 0).toLocaleString()}</span>
              <span className={`${s.mono} ${s.meltLabel}`}>{STATUS_LABEL[k]}</span>
            </li>
          ))}
        </ul>
        <div className={s.meltControls}>
          <button
            className={s.playBtn}
            onClick={() => setWantPlay(!playing)}
            aria-label={playing ? "Pause the seasons" : "Play the seasons"}
          >
            {playing ? <Pause size={18} weight="fill" /> : <Play size={18} weight="fill" />}
          </button>
          <input
            className={s.range}
            type="range"
            min={0}
            max={Math.max(0, (data?.dates.length ?? 1) - 1)}
            value={idx}
            onChange={(e) => {
              setWantPlay(false);
              setIdx(Number(e.target.value));
            }}
            aria-label="Choose a date"
          />
        </div>
      </div>
      <div ref={boxRef}>
        <div className={`${s.collar}`}>
          <div className={`${s.collarInner} ${s.meltMap}`}>
            <img src="/landing/meltmap.webp" alt="" width={700} height={1100} loading="lazy" />
            <canvas ref={canvasRef} role="img" aria-label={`Status of every pass on ${date}`} />
          </div>
        </div>
      </div>
    </div>
  );
}
