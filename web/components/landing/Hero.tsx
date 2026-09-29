"use client";

import { ArrowUpRight } from "@phosphor-icons/react";
import dynamic from "next/dynamic";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import s from "@/app/landing.module.css";
import { brand } from "@/lib/brand";
import { type LandingData, loadLanding } from "@/lib/landingData";
import { MAP_PATH } from "@/lib/paths";
import HeroSearch from "./HeroSearch";
import MorningRun from "./MorningRun";

const HeroMap = dynamic(() => import("./HeroMap"), { ssr: false });

const EASE = [0.16, 1, 0.3, 1] as const;

// The chosen hero: the live 3D terrain orbiting a pass with contours drawing
// over it, and the morning-run console typing the real pipeline log. Dark
// by design, on its own tokens, above a light page. The pass search sits in
// a bar right under it so the AllTrails move survives.
export default function Hero() {
  const reduce = useReducedMotion() ?? false;
  const [data, setData] = useState<LandingData | null>(null);
  useEffect(() => {
    loadLanding().then(setData).catch(() => {});
  }, []);

  const lines = ["Every pass.", "Read every morning."];
  let word = 0;

  return (
    <>
      <section className={`${s.hero} ${s.heroDark}`}>
        <HeroMap poster="/landing/hero-poster.webp" />
        <div className={s.heroScrim} aria-hidden="true" />
        <div className={`${s.wrap} ${s.heroInner}`}>
          <div className={s.heroCopy}>
            <motion.p
              className={s.eyebrow}
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.1 }}
            >
              AI-native mountain conditions · {brand.region}
            </motion.p>
            <h1 className={`${s.display} ${s.h1} ${s.heroTitle}`}>
              {lines.map((line) => (
                <span key={line} className={s.headlineLine}>
                  {line.split(" ").map((w) => {
                    const n = word++;
                    return (
                      <motion.span
                        key={w + n}
                        className={`${s.headlineWord} ${w === "morning." ? s.hilite : ""}`}
                        initial={reduce ? false : { y: "110%" }}
                        animate={{ y: 0 }}
                        transition={{ duration: 1, delay: 0.15 + n * 0.08, ease: EASE }}
                      >
                        {w}
                      </motion.span>
                    );
                  })}
                </span>
              ))}
            </h1>
            <motion.p
              className={s.lede}
              initial={reduce ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, delay: 0.7, ease: EASE }}
            >
              {data?.counts.passes.toLocaleString() ?? "1,252"} mountain passes, read every
              morning from snow sensors and stream gauges, with forecasts, fire maps and road
              reports alongside. Every verdict shows its work and says when it is not sure.
            </motion.p>
            <motion.div
              className={s.ctaRow}
              initial={reduce ? false : { opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.9, delay: 0.85, ease: EASE }}
            >
              <a href={MAP_PATH} className={`${s.btn} ${s.btnPrimary}`}>
                Open the map
                <span className={s.btnIcon} aria-hidden="true">
                  <ArrowUpRight size={15} weight="bold" />
                </span>
              </a>
              <a href="#try" className={`${s.btn} ${s.btnGhost}`}>
                Try a pass
              </a>
            </motion.div>
          </div>
          <motion.div
            className={s.heroSide}
            initial={reduce ? false : { opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 1, ease: EASE }}
          >
            <MorningRun />
          </motion.div>
        </div>
      </section>
      <div className={s.searchBar}>
        <div className={`${s.wrap} ${s.searchBarInner}`}>
          <span className={`${s.display} ${s.h3}`}>Find a pass</span>
          <HeroSearch />
        </div>
      </div>
    </>
  );
}
