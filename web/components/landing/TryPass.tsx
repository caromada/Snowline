"use client";

import { ArrowUpRight } from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import s from "@/app/landing.module.css";
import { ConfidenceDial } from "@/components/PassPanel";
import PixelGlyph from "@/components/PixelGlyph";
import Vignette from "@/components/Vignette";
import { loadLanding } from "@/lib/landingData";
import { MAP_PATH, passFile } from "@/lib/paths";
import { glyphByStatus } from "@/lib/pixel";
import type { PassDetail } from "@/lib/types";

const PASSES = [
  { slug: "aasgard", state: "WA" },
  { slug: "glen", state: "CA" },
  { slug: "panhandle-gap", state: "WA" },
  { slug: "forester", state: "CA" },
  { slug: "cascade", state: "WA" },
  { slug: "santiam", state: "OR" },
  { slug: "kearsarge", state: "CA" },
];
const BIG_YEAR = "2023-06-15";

const NAMES: Record<string, string> = {
  aasgard: "Aasgard",
  glen: "Glen",
  "panhandle-gap": "Panhandle Gap",
  forester: "Forester",
  cascade: "Cascade",
  santiam: "Santiam",
  kearsarge: "Kearsarge",
};

export default function TryPass() {
  const reduce = useReducedMotion() ?? false;
  const [slug, setSlug] = useState("aasgard");
  const [when, setWhen] = useState<"big" | "today">("big");
  const [today, setToday] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ slug: string; data: PassDetail } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    loadLanding()
      .then((d) => setToday(d.dates[d.dates.length - 1]))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let live = true;
    fetch(passFile(slug))
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<PassDetail>;
      })
      .then((data) => live && setDetail({ slug, data }))
      .catch(() => live && setFailed(slug));
    return () => {
      live = false;
    };
  }, [slug]);

  const date = when === "big" ? BIG_YEAR : (today ?? BIG_YEAR);
  const ready = detail && detail.slug === slug;
  const status = ready ? detail.data.statuses[date] : undefined;
  const pass = ready ? detail.data.pass : undefined;
  const loadFailed = failed === slug && !ready;

  return (
    <div className={s.try}>
      <p className={s.eyebrow} style={{ marginBottom: 0 }}>
        Interactive
      </p>
      <h2 className={`${s.display} ${s.h2}`}>Pick a pass. See the verdict.</h2>
      <div className={s.chips} role="group" aria-label="Choose a pass">
        {PASSES.map((p) => (
          <button
            key={p.slug}
            className={s.chip}
            aria-pressed={slug === p.slug}
            onClick={() => {
              setFailed(null);
              setSlug(p.slug);
            }}
          >
            {NAMES[p.slug]}
            <span className={s.chipState}>{p.state}</span>
          </button>
        ))}
      </div>
      <div className={s.dateToggle} role="group" aria-label="Choose a date">
        <button aria-pressed={when === "big"} onClick={() => setWhen("big")}>
          June 15, 2023
        </button>
        <button aria-pressed={when === "today"} onClick={() => setWhen("today")}>
          Today
        </button>
      </div>

      <div className={`${s.collar} ${s.verdict}`}>
        <div className={`${s.collarInner} ${s.verdictInner}`}>
          {loadFailed ? (
            <div className={s.verdictFacts} style={{ gridColumn: "1 / -1" }}>
              <p>This pass didn&apos;t load. The full map has every pass.</p>
            </div>
          ) : !status || !pass ? (
            <>
              <div className={s.verdictScene}>
                <div className={s.skeleton} style={{ width: "60%", height: 22 }} />
                <div className={s.skeleton} style={{ aspectRatio: "3 / 1", height: "auto" }} />
                <div className={s.skeleton} style={{ width: "45%" }} />
              </div>
              <div className={s.verdictFacts}>
                <div className={s.skeleton} />
                <div className={s.skeleton} style={{ width: "85%" }} />
                <div className={s.skeleton} style={{ width: "70%" }} />
              </div>
            </>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={`${slug}-${date}`}
                style={{ display: "contents" }}
                initial={reduce ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
              >
                <div className={s.verdictScene}>
                  <div>
                    <h3 className={`${s.display} ${s.h3}`}>{pass.name}</h3>
                    <p className={s.mono} style={{ color: "var(--sage)", marginTop: 4 }}>
                      {pass.elevation_ft.toLocaleString()} ft · {date}
                    </p>
                  </div>
                  <Vignette slug={pass.slug} params={status.vignette} />
                  <div style={{ display: "grid", gap: 10 }}>
                    <div className={s.verdictStatus}>
                      <PixelGlyph sprite={glyphByStatus[status.status]} scale={2} title="" />
                      {status.status_label}
                    </div>
                    <ConfidenceDial level={status.confidence} score={status.confidence_score} />
                  </div>
                </div>
                <div className={s.verdictFacts}>
                  {status.facts.slice(0, 3).map((f, i) => (
                    <motion.p
                      key={f.text}
                      initial={reduce ? false : { opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.5, delay: 0.25 + i * 0.12, ease: [0.16, 1, 0.3, 1] }}
                    >
                      {f.text}
                    </motion.p>
                  ))}
                  {status.conflicts.length > 0 && (
                    <div className={s.disagree}>
                      <p className={s.mono} style={{ color: "var(--alpenglow)" }}>
                        Streams disagree
                      </p>
                      <p>{status.conflicts[0]}</p>
                    </div>
                  )}
                </div>
              </motion.div>
            </AnimatePresence>
          )}
          <div className={s.verdictFoot}>
            <span className={s.mono} style={{ color: "var(--sage)" }}>
              Every sentence links to its source on the map.
            </span>
            <a
              href={`${MAP_PATH}?pass=${slug}&date=${date}`}
              className={`${s.btn} ${s.btnPrimary}`}
            >
              See {NAMES[slug]} on the map
              <span className={s.btnIcon} aria-hidden="true">
                <ArrowUpRight size={15} weight="bold" />
              </span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
