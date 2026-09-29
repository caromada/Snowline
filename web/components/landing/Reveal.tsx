"use client";

import { motion, useReducedMotion } from "motion/react";
import { type ReactNode, useEffect, useState } from "react";

// Sections rise into place as they enter the viewport: a heavy, short
// travel that reads as terrain settling, not UI bouncing. Fail-safe: a
// few seconds after mount everything is shown regardless, so nothing can
// be left invisible if a scroll trigger never fires.
const SETTLE_MS = 2500;

export default function Reveal({
  children,
  delay = 0,
  className,
  as = "div",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: "div" | "section" | "li" | "article";
}) {
  const reduce = useReducedMotion();
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setSettled(true), SETTLE_MS);
    return () => window.clearTimeout(t);
  }, []);
  const Tag = motion[as];
  const shown = { opacity: 1, y: 0 };
  return (
    <Tag
      className={className}
      initial={reduce ? false : { opacity: 0, y: 28 }}
      whileInView={shown}
      animate={settled ? shown : undefined}
      viewport={{ once: true, amount: 0.1 }}
      transition={{ duration: 0.9, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </Tag>
  );
}
