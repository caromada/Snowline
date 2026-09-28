"use client";

import { ArrowUpRight } from "@phosphor-icons/react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useEffect, useRef, useState } from "react";
import s from "@/app/landing.module.css";
import PixelGlyph from "@/components/PixelGlyph";
import { brand } from "@/lib/brand";
import { type LandingData, loadLanding } from "@/lib/landingData";
import { MAP_PATH } from "@/lib/paths";
import { photos } from "@/lib/photos";
import { glyphByStatus } from "@/lib/pixel";

type Contours = { viewBox: string; major: string[]; minor: string[] };

// Passes people recognize, cycled through the live readout in this order.
const MARQUEE_PASSES = [
  "glen", "aasgard", "forester", "panhandle-gap", "kearsarge", "cascade",
  "muir", "santiam", "sonora", "mather", "cispus", "bishop",
];

const SCRAMBLE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

/** Decode-in text: letters resolve left to right, written straight to the DOM. */
function useScramble(text: string, reduce: boolean) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduce) {
      el.textContent = text;
      return;
    }
    let frame = 0;
    let raf = 0;
    const total = 18;
    const tick = () => {
      frame += 1;
      const settled = Math.floor((frame / total) * text.length);
      el.textContent = text
        .split("")
        .map((ch, i) =>
          i < settled || ch === " " ? ch : SCRAMBLE[Math.floor(Math.random() * SCRAMBLE.length)],
        )
        .join("");
      if (frame < total) raf = requestAnimationFrame(tick);
      else el.textContent = text;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text, reduce]);
  return ref;
}

function Telemetry({ data, reduce }: { data: LandingData | null; reduce: boolean }) {
  const [i, setI] = useState(0);
  const featured = data
    ? MARQUEE_PASSES.map((slug) => data.featured_today.find((p) => p.slug === slug)).filter(
        (p): p is LandingData["featured_today"][number] => Boolean(p),
      )
    : [];
  useEffect(() => {
    if (reduce || featured.length < 2) return;
    const t = setInterval(() => setI((n) => (n + 1) % featured.length), 3800);
    return () => clearInterval(t);
  }, [reduce, featured.length]);
  const p = featured[i % Math.max(1, featured.length)];
  const nameRef = useScramble(p ? p.name.toUpperCase() : "", reduce);
  const updated = data
    ? new Date(data.generated_at).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : "";

  return (
    <motion.aside
      className={`${s.hud} ${s.collar}`}
      aria-label="Live pass reading"
      initial={reduce ? false : { opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 1, delay: 0.9, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className={`${s.collarInner} ${s.hudInner}`}>
        <div className={`${s.hudHead} ${s.mono}`}>
          <span className={s.live}>
            <span className={s.liveDot} aria-hidden="true" />
            Live reading
          </span>
          <span>{updated}</span>
        </div>
        <div className={s.hudPass} aria-live="polite">
          <span ref={nameRef} />
        </div>
        <dl className={`${s.hudRow} ${s.mono}`}>
          <dt>Elevation</dt>
          <dd>{p ? `${p.elevation_ft.toLocaleString()} ft` : "..."}</dd>
          <dt>Confidence</dt>
          <dd>{p?.confidence ?? "..."}</dd>
          <dt>Passes watched</dt>
          <dd>{data ? data.counts.passes.toLocaleString() : "..."}</dd>
        </dl>
        <div className={`${s.hudStatus} ${s.mono}`}>
          {p && <PixelGlyph sprite={glyphByStatus[p.status]} scale={2} title={p.status_label} />}
          <span style={{ fontSize: 13 }}>{p?.status_label ?? "reading sensors"}</span>
        </div>
      </div>
    </motion.aside>
  );
}

export default function Hero() {
  const reduce = useReducedMotion() ?? false;
  const heroRef = useRef<HTMLElement>(null);
  const [contours, setContours] = useState<Contours | null>(null);
  const [data, setData] = useState<LandingData | null>(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const mediaY = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : 140]);

  useEffect(() => {
    loadLanding().then(setData).catch(() => {});
    // Contours load after the photo: they decorate first paint, never block it.
    fetch("/landing/evolution-contours.json")
      .then((r) => (r.ok ? (r.json() as Promise<Contours>) : null))
      .then((c) => c && setContours(c))
      .catch(() => {});
  }, []);

  const lines = ["Know the pass", "before you go."];
  let word = 0;

  return (
    <section ref={heroRef} className={s.hero}>
      <motion.div className={s.heroMedia} style={{ y: mediaY }}>
        <img
          className={s.heroPhoto}
          src={photos.hero.src}
          alt={photos.hero.alt}
          width={photos.hero.width}
          height={photos.hero.height}
          fetchPriority="high"
        />
      </motion.div>
      {contours && (
        <svg
          className={`${s.heroContours} ${reduce ? "" : s.contoursDraw}`}
          viewBox={contours.viewBox}
          preserveAspectRatio="xMidYMid slice"
          aria-hidden="true"
        >
          {contours.minor.map((d, i) => (
            <path
              key={`m${i}`}
              d={d}
              pathLength={1}
              fill="none"
              stroke="var(--granite)"
              strokeWidth={0.7}
              strokeOpacity={0.5}
              vectorEffect="non-scaling-stroke"
              style={{ animationDelay: `${0.4 + (i % 40) * 0.05}s` }}
            />
          ))}
          {contours.major.map((d, i) => (
            <path
              key={`M${i}`}
              d={d}
              pathLength={1}
              fill="none"
              stroke="var(--alpenglow)"
              strokeWidth={1.2}
              vectorEffect="non-scaling-stroke"
              style={{ animationDelay: `${1.2 + i * 0.06}s` }}
            />
          ))}
        </svg>
      )}
      <div className={s.heroScrim} aria-hidden="true" />
      <div className={`${s.wrap} ${s.heroInner}`}>
        <div className={s.heroCopy}>
          <h1 className={`${s.display} ${s.h1}`}>
            {lines.map((line) => (
              <span key={line} className={s.headlineLine}>
                {line.split(" ").map((w) => {
                  const n = word++;
                  return (
                    <motion.span
                      key={w + n}
                      className={s.headlineWord}
                      initial={reduce ? false : { y: "110%" }}
                      animate={{ y: 0 }}
                      transition={{ duration: 1, delay: 0.15 + n * 0.08, ease: [0.16, 1, 0.3, 1] }}
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
            transition={{ duration: 0.9, delay: 0.7, ease: [0.16, 1, 0.3, 1] }}
          >
            Live snow and water readings for {data?.counts.passes.toLocaleString() ?? "1,252"}{" "}
            mountain passes in {brand.region.replaceAll(" · ", ", ").replace(/, (?=[^,]*$)/, " and ")}.
            Honest about what it knows.
          </motion.p>
          <motion.div
            className={s.ctaRow}
            initial={reduce ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, delay: 0.85, ease: [0.16, 1, 0.3, 1] }}
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
        <Telemetry data={data} reduce={reduce} />
      </div>
    </section>
  );
}
