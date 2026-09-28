"use client";

import { ArrowUpRight, List, X } from "@phosphor-icons/react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import s from "@/app/landing.module.css";
import PixelGlyph from "@/components/PixelGlyph";
import { brand } from "@/lib/brand";
import { MAP_PATH } from "@/lib/paths";
import { pineSnow } from "@/lib/pixel";

export const NAV_LINKS = [
  { href: "/how-it-works/", label: "How it works" },
  { href: "/seasons/", label: "Seasons" },
  { href: "/app/", label: "App" },
  { href: "/about/", label: "About" },
];

export default function Nav() {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <nav className={s.nav} aria-label="Site">
        <Link href="/" className={s.brand} onClick={() => setOpen(false)}>
          <PixelGlyph sprite={pineSnow} scale={2} title="" />
          {brand.name}
        </Link>
        <ul className={s.navLinks}>
          {NAV_LINKS.map((l) => (
            <li key={l.href}>
              <Link href={l.href}>{l.label}</Link>
            </li>
          ))}
        </ul>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <a href={MAP_PATH} className={`${s.btn} ${s.btnPrimary} ${s.navCta}`}>
            Open the map
            <span className={s.btnIcon} aria-hidden="true">
              <ArrowUpRight size={14} weight="bold" />
            </span>
          </a>
          <button
            className={s.menuBtn}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X size={20} weight="light" /> : <List size={20} weight="light" />}
          </button>
        </div>
      </nav>
      <AnimatePresence>
        {open && (
          <motion.div
            className={s.menuSheet}
            initial={reduce ? { opacity: 1 } : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
          >
            <ul>
              {NAV_LINKS.map((l, i) => (
                <motion.li
                  key={l.href}
                  initial={reduce ? false : { opacity: 0, y: 36 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: 0.08 + i * 0.06, ease: [0.16, 1, 0.3, 1] }}
                >
                  <Link href={l.href} onClick={() => setOpen(false)} className={s.display}>
                    {l.label}
                  </Link>
                </motion.li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
