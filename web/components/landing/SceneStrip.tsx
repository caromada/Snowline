"use client";

import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";
import s from "@/app/landing.module.css";

type Kind = "forest" | "alpine" | "desert";

// Ambient dividers between the page's chapters: a forest floor, an alpine
// ridge under falling snow, a desert at sundown. Each is a few flat layers
// that slide at different speeds as you scroll past, the way distance does.
// Everything is drawn from index math so the server and the browser agree.
const W = 1440;

function trees(count: number, base: number, hMin: number, hMax: number, seed: number): string {
  const parts: string[] = [];
  for (let i = 0; i < count; i++) {
    const t = (Math.sin(i * 12.9898 + seed) * 43758.5453) % 1;
    const j = Math.abs(t);
    const cx = (i + 0.5) * (W / count) + (j - 0.5) * (W / count) * 0.6;
    const h = hMin + (hMax - hMin) * Math.abs(Math.sin(i * 7.31 + seed * 1.7));
    const w = h * 0.42;
    parts.push(
      `M${(cx - w).toFixed(1)} ${base} L${cx.toFixed(1)} ${(base - h).toFixed(1)} L${(cx + w).toFixed(1)} ${base} Z`,
      `M${(cx - w * 0.7).toFixed(1)} ${(base - h * 0.35).toFixed(1)} L${cx.toFixed(1)} ${(base - h * 1.12).toFixed(1)} L${(cx + w * 0.7).toFixed(1)} ${(base - h * 0.35).toFixed(1)} Z`,
    );
  }
  return parts.join(" ");
}

function ridge(points: number[][], base: number): string {
  return `M0 ${base} ${points.map(([px, py]) => `L${px} ${py}`).join(" ")} L${W} ${base} Z`;
}

const BACK = [[0, 120], [160, 70], [300, 96], [440, 40], [560, 82], [700, 30], [860, 86], [1000, 52], [1140, 92], [1300, 44], [1440, 100]];
const FRONT = [[0, 160], [120, 118], [260, 140], [400, 96], [520, 132], [680, 84], [800, 126], [960, 100], [1100, 140], [1260, 108], [1440, 150]];

export default function SceneStrip({ kind }: { kind: Kind }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion() ?? false;
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const back = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [18, -18]);
  const mid = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [8, -8]);
  const front = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [-10, 10]);
  const sun = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [26, -26]);

  return (
    <div ref={ref} className={`${s.scene} ${s[`scene${kind[0].toUpperCase()}${kind.slice(1)}` as keyof typeof s]}`} aria-hidden="true">
      {kind === "forest" && (
        <>
          <motion.svg className={s.sceneLayer} style={{ y: back }} viewBox={`0 0 ${W} 180`} preserveAspectRatio="xMidYMax slice">
            <path d={trees(46, 176, 50, 96, 1)} className={s.sceneBack} />
          </motion.svg>
          <motion.svg className={s.sceneLayer} style={{ y: mid }} viewBox={`0 0 ${W} 180`} preserveAspectRatio="xMidYMax slice">
            <path d={trees(30, 180, 70, 120, 2)} className={s.sceneMid} />
          </motion.svg>
          <motion.svg className={s.sceneLayer} style={{ y: front }} viewBox={`0 0 ${W} 180`} preserveAspectRatio="xMidYMax slice">
            <path d={trees(16, 184, 90, 150, 3)} className={s.sceneFront} />
          </motion.svg>
        </>
      )}
      {kind === "alpine" && (
        <>
          <motion.svg className={s.sceneLayer} style={{ y: sun }} viewBox={`0 0 ${W} 180`} preserveAspectRatio="xMidYMax slice">
            <circle cx="1080" cy="70" r="34" className={s.sceneSun} />
          </motion.svg>
          <motion.svg className={s.sceneLayer} style={{ y: back }} viewBox={`0 0 ${W} 180`} preserveAspectRatio="xMidYMax slice">
            <path d={ridge(BACK, 184)} className={s.sceneBack} />
            <path d={ridge(BACK.map(([px, py]) => [px, py]), 184)} className={s.sceneCap} style={{ clipPath: "inset(0 0 62% 0)" }} />
          </motion.svg>
          <motion.svg className={s.sceneLayer} style={{ y: front }} viewBox={`0 0 ${W} 180`} preserveAspectRatio="xMidYMax slice">
            <path d={ridge(FRONT, 184)} className={s.sceneFront} />
            <path d={ridge(FRONT, 184)} className={s.sceneCap} style={{ clipPath: "inset(0 0 40% 0)" }} />
          </motion.svg>
          {!reduce &&
            Array.from({ length: 14 }, (_, i) => (
              <span
                key={i}
                className={s.flake}
                style={{
                  left: `${(i * 7.3 + 3) % 100}%`,
                  animationDelay: `${(i * 1.37) % 9}s`,
                  animationDuration: `${9 + (i % 5) * 1.6}s`,
                  width: 3 + (i % 3),
                  height: 3 + (i % 3),
                }}
              />
            ))}
        </>
      )}
      {kind === "desert" && (
        <>
          <motion.svg className={s.sceneLayer} style={{ y: sun }} viewBox={`0 0 ${W} 180`} preserveAspectRatio="xMidYMax slice">
            <circle cx="360" cy="150" r="64" className={s.sceneSun} />
          </motion.svg>
          <motion.svg className={s.sceneLayer} style={{ y: back }} viewBox={`0 0 ${W} 180`} preserveAspectRatio="xMidYMax slice">
            <path d={`M0 184 L0 150 L220 150 L240 118 L470 118 L490 150 L760 150 L780 128 L900 128 L920 150 L${W} 150 L${W} 184 Z`} className={s.sceneBack} />
          </motion.svg>
          <motion.svg className={s.sceneLayer} style={{ y: front }} viewBox={`0 0 ${W} 180`} preserveAspectRatio="xMidYMax slice">
            <path d={`M0 184 Q 200 140 420 172 T 860 168 T ${W} 176 L${W} 184 Z`} className={s.sceneFront} />
            {[180, 640, 1120, 1330].map((cx, i) => (
              <g key={cx} className={s.sceneFront}>
                <rect x={cx - 5} y={112 + i * 6} width="10" height={64 - i * 6} rx="5" />
                <rect x={cx - 24} y={130 + i * 4} width="9" height="26" rx="4.5" />
                <rect x={cx - 24} y={150 + i * 4} width="24" height="8" rx="4" />
                <rect x={cx + 14} y={122 + i * 4} width="9" height="30" rx="4.5" />
                <rect x={cx} y={146 + i * 4} width="23" height="8" rx="4" />
              </g>
            ))}
          </motion.svg>
        </>
      )}
    </div>
  );
}
