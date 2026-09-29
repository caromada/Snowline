"use client";

import { Footprints } from "@phosphor-icons/react";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import s from "@/app/landing.module.css";
import PixelGlyph from "@/components/PixelGlyph";
import { type LandingData, loadLanding, STATUS_LABEL } from "@/lib/landingData";
import { boot, creek, iceAxe, pineSnow, satellite, snowstake, type Sprite } from "@/lib/pixel";
import { statusColor } from "@/lib/theme";
import Reveal from "./Reveal";
import Signpost from "./Signpost";

type Reader = { name: string; role: string; sprite: Sprite; stat: (d: LandingData | null) => string };

// The six readers that feed every verdict. Each is a real stage of the
// morning pipeline; the numbers beside them come from this morning's run.
const READERS: Reader[] = [
  { name: "Sensor Watch", role: "snow telemetry", sprite: snowstake, stat: (d) => (d ? `${d.counts.snow_stations} sensors` : "...") },
  { name: "Gauge Watch", role: "stream flow", sprite: creek, stat: (d) => (d ? `${d.counts.stream_gauges} gauges` : "...") },
  { name: "Satellite Watch", role: "snow cover", sprite: satellite, stat: (d) => (d ? `${d.counts.passes.toLocaleString()} bowls` : "...") },
  { name: "Report Reader", role: "language model", sprite: boot, stat: (d) => (d?.model.eval ? `${Math.round(d.model.eval.overall * 1000) / 10}% accurate` : "graded weekly") },
  { name: "Snowline Estimator", role: "elevation model", sprite: iceAxe, stat: (d) => (d ? `${d.model.snowline_rise_ft_per_day} ft per day` : "...") },
  { name: "Forecast Reader", role: "seven days out", sprite: pineSnow, stat: () => "at pass elevation" },
];

const W = 1000;
const H = 560;
const X0 = 300;
const XM = 620;
const XV = 760;
const YM = H / 2;
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
          <h2 className={`${s.display} ${s.h2}`}>Six readers. One trail. One verdict.</h2>
          <p className={s.body}>
            Every morning six agents read the mountain their own way. Fusion weighs each one by
            how much it has earned and how fresh it is, says out loud when they disagree, and
            grades its own confidence. What reaches you is one sentence per pass and the evidence
            behind it.
          </p>
        </Reveal>

        <div className={s.fusionStage} aria-hidden="true">
          <svg className={s.fusionSvg} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
            {READERS.map((r, i) => (
              <motion.path
                key={r.name}
                d={`M${X0} ${ROW(i)} C ${X0 + 170} ${ROW(i)}, ${XM - 120} ${YM}, ${XM} ${YM}`}
                fill="none"
                stroke="var(--fern)"
                strokeWidth="2"
                strokeDasharray="6 7"
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
            ↓ weighed by trust and freshness
          </div>
          {verdictCard}
        </div>
      </div>
    </section>
  );
}
