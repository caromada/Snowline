"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import s from "@/app/landing.module.css";
import { type LandingData, loadLanding } from "@/lib/landingData";
import { statusColor } from "@/lib/theme";
import CountUp from "./CountUp";

const BIG_DAY = "2023-06-15";

// The scale of the problem, in real numbers, with one pixel-matrix showing
// how much of the West Coast still held snow in mid-June of the big year.
export default function StatBand() {
  const reduce = useReducedMotion();
  const [data, setData] = useState<LandingData | null>(null);
  useEffect(() => {
    loadLanding().then(setData).catch(() => {});
  }, []);

  const idx = data ? data.dates.indexOf(BIG_DAY) : -1;
  const snowy = data && idx >= 0
    ? data.passes.filter(([, , , st]) => ["2", "3"].includes(st[idx])).length
    : 0;
  const known = data && idx >= 0
    ? data.passes.filter(([, , , st]) => st[idx] !== "4").length
    : 0;
  const pct = known ? Math.round((snowy / known) * 100) : 0;
  const cells = 100;

  return (
    <section className={s.section} style={{ paddingTop: 0 }}>
      <div className={`${s.wrap} ${s.statBand}`}>
        <div>
          <div className={s.statBig}>
            <CountUp value={data?.counts.passes ?? 1252} className={s.count} />
          </div>
          <h2 className={`${s.display} ${s.h2}`}>
            passes, read every morning across{" "}
            <span className={s.warm}>three states.</span>
          </h2>
          <p className={s.body} style={{ marginTop: 18 }}>
            Every one carries its own verdict, its own confidence grade, and the evidence behind
            both.
          </p>
        </div>
        <div className={s.statTiles}>
          <div className={`${s.collar}`}>
            <div className={`${s.collarInner} ${s.statTile}`}>
              <div className={s.statNum} style={{ color: "var(--alpenglow)" }}>
                {pct}%
              </div>
              <p className={s.body}>
                of passes with a reading still held snow on June 15, 2023, the big year.
              </p>
              <div className={s.matrix} aria-hidden="true">
                {Array.from({ length: cells }, (_, i) => (
                  <motion.span
                    key={i}
                    style={{ background: i < pct ? statusColor.traction_advised : "color-mix(in srgb, var(--ink) 16%, transparent)" }}
                    initial={reduce ? false : { opacity: 0 }}
                    whileInView={{ opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.2 + i * 0.006 }}
                  />
                ))}
              </div>
            </div>
          </div>
          <div className={`${s.collar}`}>
            <div className={`${s.collarInner} ${s.statTile}`}>
              <div className={s.statNum}>
                <CountUp value={(data?.counts.snow_stations ?? 0) + (data?.counts.stream_gauges ?? 0)} />
              </div>
              <p className={s.body}>sensors and gauges feeding the model, from the Kern to the Canadian line.</p>
            </div>
          </div>
          <div className={`${s.collar}`}>
            <div className={`${s.collarInner} ${s.statTile}`}>
              <div className={s.statNum}>
                {data?.counts.seasons ?? 4}
                <span className={s.statUnit}>seasons</span>
              </div>
              <p className={s.body}>of history, from the 2023 monster snow year to this morning.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
