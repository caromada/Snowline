"use client";

import { useEffect, useRef } from "react";
import { campfire, drawSprite } from "@/lib/pixel";

// The loading state: a three-frame pixel campfire flicker.
export default function Campfire({ label = "Loading" }: { label?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      drawSprite(ctx, campfire[frame % 3], 0, 0, 3);
    };
    draw();
    if (reduced) return;
    const id = window.setInterval(() => {
      frame += 1;
      draw();
    }, 180);
    return () => window.clearInterval(id);
  }, []);
  return (
    <div style={{ display: "grid", placeItems: "center", gap: 8, padding: 24 }}>
      <canvas ref={ref} className="pixel" width={48} height={48} aria-hidden />
      <span className="mono" style={{ color: "var(--sage)" }}>
        {label}
      </span>
    </div>
  );
}
