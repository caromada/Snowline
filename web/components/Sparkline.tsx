"use client";

import { useEffect, useRef } from "react";
import type { CurvePoint } from "@/lib/types";

// Raw curve rendering for expanded ledger entries: the actual SNOTEL/gauge
// series, drawn plainly in snowmelt blue on moss.
export default function Sparkline({
  points,
  unit,
  color = "var(--snowmelt)",
  highlightDate,
}: {
  points: CurvePoint[];
  unit: string;
  color?: string;
  highlightDate?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const W = 360;
  const H = 84;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const styles = getComputedStyle(document.documentElement);
    const resolve = (v: string) =>
      v.startsWith("var(") ? styles.getPropertyValue(v.slice(4, -1)).trim() : v;
    ctx.clearRect(0, 0, W, H);
    if (points.length < 2) return;
    const vals = points.map((p) => p.value);
    const min = Math.min(...vals, 0);
    const max = Math.max(...vals, 1);
    const x = (i: number) => 6 + (i / (points.length - 1)) * (W - 12);
    const y = (v: number) => H - 14 - ((v - min) / (max - min)) * (H - 24);

    ctx.strokeStyle = resolve("var(--moss)") || "#1C2B21";
    ctx.beginPath();
    ctx.moveTo(6, y(0));
    ctx.lineTo(W - 6, y(0));
    ctx.stroke();

    ctx.strokeStyle = resolve(color) || color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    points.forEach((p, i) => {
      if (i === 0) ctx.moveTo(x(i), y(p.value));
      else ctx.lineTo(x(i), y(p.value));
    });
    ctx.stroke();

    if (highlightDate) {
      const idx = points.findIndex((p) => p.date === highlightDate);
      if (idx >= 0) {
        ctx.fillStyle = resolve("var(--alpenglow)") || "#E8A87C";
        ctx.fillRect(Math.round(x(idx)) - 2, Math.round(y(points[idx].value)) - 2, 4, 4);
      }
    }
  }, [points, color, highlightDate]);

  if (points.length < 2) {
    return (
      <span className="mono" style={{ color: "var(--sage)" }}>
        not enough data for a curve
      </span>
    );
  }
  const last = points[points.length - 1];
  return (
    <figure>
      <canvas ref={ref} width={W} height={H} style={{ width: "100%", display: "block" }} />
      <figcaption className="mono" style={{ color: "var(--sage)", marginTop: 2 }}>
        {points[0].date} to {last.date} · latest {Math.round(last.value * 10) / 10} {unit}
      </figcaption>
    </figure>
  );
}
