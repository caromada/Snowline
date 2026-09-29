"use client";

import { PersonSimpleHike } from "@phosphor-icons/react";
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from "motion/react";
import { useEffect, useState } from "react";
import s from "@/app/landing.module.css";

// A dashed trail down the left gutter on wide screens, with a hiker that
// walks it as you scroll and a tick at every section. Decorative; hidden
// from assistive tech and from phones.
export default function TrailSpine() {
  const reduce = useReducedMotion() ?? false;
  const { scrollYProgress } = useScroll();
  const eased = useSpring(scrollYProgress, { stiffness: 90, damping: 24, mass: 0.6 });
  const top = useTransform(reduce ? scrollYProgress : eased, [0, 1], ["0%", "100%"]);
  const [ticks, setTicks] = useState<{ at: number; label: string }[]>([]);

  useEffect(() => {
    const measure = () => {
      const max = document.documentElement.scrollHeight - window.innerHeight;
      if (max <= 0) return;
      const found = Array.from(document.querySelectorAll<HTMLElement>("main section[id]")).map((el) => ({
        at: Math.min(1, Math.max(0, el.offsetTop / max)),
        label: el.id,
      }));
      setTicks(found);
    };
    const t = window.setTimeout(measure, 800);
    window.addEventListener("resize", measure);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("resize", measure);
    };
  }, []);

  return (
    <div className={s.spine} aria-hidden="true">
      <div className={s.spineTrack} />
      {ticks.map((t) => (
        <span key={t.label} className={s.spineTick} style={{ top: `${t.at * 100}%` }} />
      ))}
      <motion.span className={s.spineHiker} style={{ top }}>
        <PersonSimpleHike size={14} weight="fill" />
      </motion.span>
    </div>
  );
}
