"use client";

import { useEffect, useRef } from "react";
import { drawVignette, VIGNETTE_H, VIGNETTE_W } from "@/lib/vignette";
import type { VignetteParams } from "@/lib/types";

const ASSEMBLE_MS = 350;

export default function Vignette({
  slug,
  params,
  scale = 4,
}: {
  slug: string;
  params: VignetteParams;
  scale?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.save();
    ctx.scale(scale, scale);

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      drawVignette(ctx, slug, params, 1);
      ctx.restore();
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const phase = Math.min(1, (now - start) / ASSEMBLE_MS);
      drawVignette(ctx, slug, params, phase);
      if (phase < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      ctx.restore();
    };
  }, [slug, params, scale]);

  return (
    <canvas
      ref={ref}
      className="pixel"
      width={VIGNETTE_W * scale}
      height={VIGNETTE_H * scale}
      role="img"
      aria-label={`Current scene for ${slug}: ${params.status.replaceAll("_", " ")}`}
      style={{ width: "100%", maxWidth: VIGNETTE_W * scale, display: "block" }}
    />
  );
}
