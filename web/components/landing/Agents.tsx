"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import s from "@/app/landing.module.css";
import PixelGlyph from "@/components/PixelGlyph";
import { type LandingData, loadLanding } from "@/lib/landingData";
import {
  boot, campfire, creek, crossedPoles, iceAxe, pineSnow, satellite, snowstake, tent,
  type Sprite,
} from "@/lib/pixel";

type Agent = {
  name: string;
  role: string;
  does: string;
  sprite: Sprite;
  live: boolean;
  stat: (d: LandingData | null) => string;
};

// The crew that reads the mountain every morning. Each one is a real
// component of the pipeline; the ones marked Coming are built next.
const AGENTS: Agent[] = [
  {
    name: "Report Reader",
    role: "Language model",
    does: "Reads every new trip report into snow, traction, crossing and who-is-talking fields, keeping the exact quote.",
    sprite: boot,
    live: true,
    stat: (d) => (d?.model.eval ? `${Math.round(d.model.eval.overall * 1000) / 10}% field accuracy` : "graded weekly"),
  },
  {
    name: "Sensor Watch",
    role: "Telemetry",
    does: "Pulls every snow sensor in three states before dawn and links each pass to its nearest ones.",
    sprite: snowstake,
    live: true,
    stat: (d) => (d ? `${d.counts.snow_stations} sensors` : "..."),
  },
  {
    name: "Gauge Watch",
    role: "Telemetry",
    does: "Reads stream flow below each pass and spots the afternoon melt pulse.",
    sprite: creek,
    live: true,
    stat: (d) => (d ? `${d.counts.stream_gauges} gauges` : "..."),
  },
  {
    name: "Snowline Estimator",
    role: "Model",
    does: "When sensors sit far below a pass, infers where the snowline has climbed from their melt-out dates.",
    sprite: iceAxe,
    live: true,
    stat: (d) => (d ? `${d.model.snowline_rise_ft_per_day} ft per day` : "..."),
  },
  {
    name: "Satellite Watch",
    role: "Imagery",
    does: "Tracks snow cover over each pass bowl and marks the days clouds hid it.",
    sprite: satellite,
    live: true,
    stat: (d) => (d ? `${d.counts.passes.toLocaleString()} bowls` : "..."),
  },
  {
    name: "Forecast Reader",
    role: "Model",
    does: "Turns the seven-day forecast into pass-elevation facts: snow level, new snow, lightning, wind.",
    sprite: pineSnow,
    live: true,
    stat: () => "7 days ahead",
  },
  {
    name: "Fusion",
    role: "Model",
    does: "Weighs every stream by trust and freshness, says out loud when they disagree, grades its own confidence.",
    sprite: campfire[0],
    live: true,
    stat: (d) => (d ? `${d.counts.passes.toLocaleString()} verdicts a day` : "..."),
  },
  {
    name: "Fire Watch",
    role: "Imagery",
    does: "Active fire perimeters and satellite smoke over your route, with the official closure.",
    sprite: crossedPoles,
    live: false,
    stat: () => "summer",
  },
  {
    name: "Alert Runner",
    role: "Agent",
    does: "Watches your saved passes and tells you the moment a verdict changes.",
    sprite: tent,
    live: false,
    stat: () => "with the app",
  },
];

export default function Agents() {
  const reduce = useReducedMotion();
  const [data, setData] = useState<LandingData | null>(null);
  useEffect(() => {
    loadLanding().then(setData).catch(() => {});
  }, []);
  return (
    <section className={s.section} id="agents">
      <div className={s.wrap}>
        <h2 className={`${s.display} ${s.h2}`}>AI is not a feature here. It is the morning shift.</h2>
        <p className={s.body} style={{ marginTop: 20 }}>
          Nine agents read the mountain before you wake up. Each has one job, shows its work, and
          hands off to the next. Together they produce one honest verdict per pass.
        </p>
        <ul className={s.agentGrid}>
          {AGENTS.map((a, i) => (
            <motion.li
              key={a.name}
              className={`${s.agent} ${a.live ? "" : s.agentSoon}`}
              initial={reduce ? false : { opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.7, delay: (i % 3) * 0.07, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className={s.agentHead}>
                <PixelGlyph sprite={a.sprite} scale={2} title="" />
                <span className={`${s.seasonTag} ${a.live ? s.tagLive : s.tagSoon}`}>
                  {a.live ? "Live" : "Coming"}
                </span>
              </div>
              <h3 className={`${s.display} ${s.h3}`}>{a.name}</h3>
              <span className={s.mono} style={{ color: "var(--sage)" }}>
                {a.role}
              </span>
              <p>{a.does}</p>
              <span className={`${s.mono} ${s.agentStat}`}>{a.stat(data)}</span>
            </motion.li>
          ))}
        </ul>
      </div>
    </section>
  );
}
