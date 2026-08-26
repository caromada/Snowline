"use client";

import { useEffect, useRef } from "react";
import { cloudA, cloudB, drawSprite } from "@/lib/pixel";

// The entire ambient budget: two pixel clouds drifting across the map at
// 4 px/min, stepping in whole pixels. Off under prefers-reduced-motion.
export default function Clouds() {
  const aRef = useRef<HTMLCanvasElement>(null);
  const bRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const a = aRef.current;
    const b = bRef.current;
    if (!a || !b) return;
    for (const [canvas, sprite] of [
      [a, cloudA],
      [b, cloudB],
    ] as const) {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.globalAlpha = 0.35;
        drawSprite(ctx, sprite, 0, 0, 4);
      }
    }
    let xa = -80;
    let xb = window.innerWidth * 0.55;
    const step = () => {
      // 4 px/min = 1 px every 15 s, whole pixels only.
      xa = xa + 1 > window.innerWidth + 80 ? -80 : xa + 1;
      xb = xb + 1 > window.innerWidth + 80 ? -80 : xb + 1;
      a.style.transform = `translateX(${xa}px)`;
      b.style.transform = `translateX(${xb}px)`;
    };
    step();
    const id = window.setInterval(step, 15000);
    return () => window.clearInterval(id);
  }, []);

  const style: React.CSSProperties = {
    position: "absolute",
    pointerEvents: "none",
    zIndex: 10,
  };
  return (
    <>
      <canvas ref={aRef} className="pixel" width={64} height={64} style={{ ...style, top: "12%" }} aria-hidden />
      <canvas ref={bRef} className="pixel" width={64} height={64} style={{ ...style, top: "38%" }} aria-hidden />
    </>
  );
}
