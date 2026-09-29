"use client";

import { Footprints } from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import s from "@/app/landing.module.css";
import PixelGlyph from "@/components/PixelGlyph";
import { type LandingData, loadLanding, STATUS_LABEL } from "@/lib/landingData";
import { flame } from "@/lib/fire";
import { creek, iceAxe, pineSnow, road, snowstake, type Sprite } from "@/lib/pixel";
import { statusColor } from "@/lib/theme";
import Reveal from "./Reveal";
import Signpost from "./Signpost";

type Reader = {
  name: string;
  role: string;
  sprite: Sprite;
  /** Whether this reader's output is fused into the verdict. */
  feeds: boolean;
  stat: (d: LandingData | null) => string;
};

// The six readers of the morning pipeline, each a real stage of it; the
// numbers beside them come from this morning's run. The first three are
// fused into the verdict. The last three are shown beside it as issued and
// never change the status, and the diagram draws them apart.
const READERS: Reader[] = [
  { name: "Sensor Watch", role: "snow sensors", sprite: snowstake, feeds: true, stat: (d) => (d ? `${d.counts.snow_stations} sensors` : "...") },
  { name: "Snowline Estimator", role: "melt-out model", sprite: iceAxe, feeds: true, stat: (d) => (d ? `${d.model.snowline_rise_ft_per_day} ft per day` : "...") },
  { name: "Gauge Watch", role: "stream flow", sprite: creek, feeds: true, stat: (d) => (d ? `${d.counts.stream_gauges} gauges` : "...") },
  { name: "Forecast Reader", role: "seven days out", sprite: pineSnow, feeds: false, stat: () => "at pass elevation" },
  { name: "Fire Watch", role: "fire and smoke", sprite: flame, feeds: false, stat: (d) => (d?.counts.fires ? `${d.counts.fires.toLocaleString()} fires mapped` : "mapped daily") },
  { name: "Road Watch", role: "road reports", sprite: road, feeds: false, stat: () => "chain controls" },
];

const W = 1000;
const H = 560;
const X0 = 300;
const XM = 620;
const XV = 760;
const YM = H / 2;
// Where the context readers meet the verdict card: its side, below the
// fused line, so they arrive beside the verdict and not through it.
const YC = YM + 34;
const ROW = (i: number) => 60 + i * 88;
const EASE = [0.16, 1, 0.3, 1] as const;

export default function Fusion() {
  const reduce = useReducedMotion() ?? false;
  const [data, setData] = useState<LandingData | null>(null);
  useEffect(() => {
    loadLanding().then(setData).catch(() => {});
  }, []);
  const verdict = data?.featured_today.find((p) => p.slug === "glen") ?? data?.featured_today[0] ?? null;
  const color = statusColor[verdict?.status ?? "unknown"];

  const draw = (i: number) => ({
    initial: reduce ? false : { pathLength: 0, opacity: 0 },
    whileInView: { pathLength: 1, opacity: 1 },
    viewport: { once: true, amount: 0.4 },
    transition: { duration: 1.4, delay: 0.2 + i * 0.12, ease: EASE },
  });

  const node = (r: Reader, i: number) => (
    <div key={r.name} className={s.fusionNode}>
      <PixelGlyph sprite={r.sprite} scale={2} title="" />
      <div>
        <div className={s.fusionNodeName}>{r.name}</div>
        <div className={`${s.mono} ${s.fusionNodeRole}`}>
          {r.role} · {r.stat(data)}
        </div>
      </div>
      <span className={s.mono} aria-hidden="true">
        {String(i + 1).padStart(2, "0")}
      </span>
    </div>
  );

  const verdictCard = (
    <div className={s.fusionVerdict} style={{ borderColor: color }}>
      <div className={`${s.mono} ${s.fusionVerdictKicker}`}>this morning&apos;s verdict</div>
      <div className={s.fusionVerdictName}>{verdict?.name ?? "Glen Pass"}</div>
      <div className={s.fusionVerdictStatus}>
        <span className={s.swatch} style={{ background: color }} />
        {verdict ? STATUS_LABEL[verdict.status] : "reading..."}
      </div>
      <div className={`${s.mono} ${s.fusionVerdictMeta}`}>
        {verdict ? `${verdict.elevation_ft.toLocaleString()} ft · confidence ${verdict.confidence}` : ""}
      </div>
    </div>
  );

  return (
    <section className={s.section} id="how">
      <div className={s.wrap}>
        <Reveal className={s.seasonsHead}>
          <Signpost label="How it works" />
          <h2 className={`${s.display} ${s.h2}`}>
            Three readers set the verdict. Three stand beside it.
          </h2>
          <p className={s.body}>
            Every morning six readers take in the mountain, each its own way. Snow sensors and
            the snowline estimate set the status. Stream gauges add the creek below and count
            toward confidence. The forecast, the fire map and the road reports sit beside the
            verdict, shown as issued and never folded into it. What reaches you is one status
            per pass, a confidence grade, and the readings behind both.
          </p>
        </Reveal>

        <div className={s.fusionStage} aria-hidden="true">
          <svg className={s.fusionSvg} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
            {READERS.map((r, i) => (
              <motion.path
                key={r.name}
                d={
                  r.feeds
                    ? `M${X0} ${ROW(i)} C ${X0 + 170} ${ROW(i)}, ${XM - 120} ${YM}, ${XM} ${YM}`
                    : `M${X0} ${ROW(i)} C ${X0 + 200} ${ROW(i)}, ${XV - 170} ${YC}, ${XV} ${YC}`
                }
                fill="none"
                stroke={r.feeds ? "var(--fern)" : "var(--muted)"}
                strokeWidth={r.feeds ? "2" : "1.25"}
                strokeOpacity={r.feeds ? 1 : 0.45}
                strokeLinecap="round"
                {...draw(i)}
              />
            ))}
            <motion.path
              d={`M${XM} ${YM} L${XV} ${YM}`}
              fill="none"
              stroke="var(--ink)"
              strokeWidth="3"
              strokeLinecap="round"
              initial={reduce ? false : { pathLength: 0 }}
              whileInView={{ pathLength: 1 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.8, delay: 1.3, ease: EASE }}
            />
            <motion.circle
              cx={XM}
              cy={YM}
              r="7"
              fill="var(--alpenglow)"
              initial={reduce ? false : { scale: 0, opacity: 0 }}
              whileInView={{ scale: 1, opacity: 1 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.6, delay: 1.2, type: "spring", bounce: 0.5 }}
              style={{ transformOrigin: `${XM}px ${YM}px` }}
            />
          </svg>
          {READERS.map((r, i) => (
            <motion.div
              key={r.name}
              className={s.fusionNodeWrap}
              style={{ top: `${(ROW(i) / H) * 100}%`, left: 0, width: `${(X0 / W) * 100}%` }}
              initial={reduce ? false : { opacity: 0, x: -14 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.7, delay: i * 0.1, ease: EASE }}
            >
              {node(r, i)}
            </motion.div>
          ))}
          {(
            [
              ["set the verdict", XM - 40, YM - 58],
              ["shown beside it", XV - 70, YC + 72],
            ] as const
          ).map(([label, x, y], k) => (
            <motion.span
              key={label}
              className={s.mono}
              style={{
                position: "absolute",
                left: `${(x / W) * 100}%`,
                top: `${(y / H) * 100}%`,
                transform: "translate(-50%, -50%)",
                color: "var(--muted)",
                whiteSpace: "nowrap",
              }}
              initial={reduce ? false : { opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.6, delay: 1.4 + k * 0.3 }}
            >
              {label}
            </motion.span>
          ))}
          {[0, 1, 2].map((k) => (
            <motion.span
              key={k}
              className={s.fusionPrint}
              style={{ left: `${((XM + 22 + k * 40) / W) * 100}%`, top: `calc(50% + ${k % 2 ? 9 : -9}px)` }}
              initial={reduce ? false : { opacity: 0 }}
              whileInView={{ opacity: 0.7 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.4, delay: 1.5 + k * 0.18 }}
            >
              <Footprints size={16} weight="fill" />
            </motion.span>
          ))}
          <motion.div
            className={s.fusionVerdictWrap}
            style={{ left: `${(XV / W) * 100}%`, top: "50%" }}
            initial={reduce ? false : { opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ duration: 0.8, delay: 2, ease: EASE }}
          >
            {verdictCard}
          </motion.div>
        </div>

        <div className={s.fusionMobile}>
          {READERS.map(node)}
          <div className={`${s.mono} ${s.fusionMobileArrow}`} aria-hidden="true">
            ↓ the first three set the verdict, the rest sit beside it
          </div>
          {verdictCard}
        </div>
      </div>
    </section>
  );
}
