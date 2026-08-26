"use client";

import { useEffect, useRef } from "react";
import { drawSprite, type Sprite } from "@/lib/pixel";

export default function PixelGlyph({
  sprite,
  scale = 1,
  title,
}: {
  sprite: Sprite;
  scale?: number;
  title?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawSprite(ctx, sprite, 0, 0, scale);
  }, [sprite, scale]);
  return (
    <canvas
      ref={ref}
      className="pixel"
      width={16 * scale}
      height={16 * scale}
      role={title ? "img" : undefined}
      aria-label={title}
      style={{ display: "block" }}
    />
  );
}
