"use client";

import { MagnifyingGlass } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import s from "@/app/landing.module.css";
import { type LandingData, loadLanding, STATUS_LABEL, type StatusKey } from "@/lib/landingData";
import { MAP_PATH } from "@/lib/paths";
import { statusColor } from "@/lib/theme";

type Hit = { slug: string; name: string; state: string; status: StatusKey; featured: boolean };

const POPULAR = ["glen", "aasgard", "forester", "panhandle-gap", "kearsarge", "cascade"];

// The one thing AllTrails gets right: the search is the hero. Every pass by
// name, today's verdict beside it, straight into the map.
export default function HeroSearch() {
  const [data, setData] = useState<LandingData | null>(null);
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadLanding().then(setData).catch(() => {});
  }, []);
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, []);

  const today = data ? data.dates.length - 1 : 0;
  const all: Hit[] = data
    ? data.passes.map(([, , f, st, slug, name, state]) => ({
        slug,
        name,
        state,
        status: data.status_keys[Number(st[today])] ?? "unknown",
        featured: f === 1,
      }))
    : [];
  const needle = q.trim().toLowerCase();
  const hits = needle
    ? all
        .filter((h) => h.name.toLowerCase().includes(needle))
        .sort((a, b) => Number(b.featured) - Number(a.featured) || a.name.localeCompare(b.name))
        .slice(0, 7)
    : all.filter((h) => POPULAR.includes(h.slug)).sort((a, b) => POPULAR.indexOf(a.slug) - POPULAR.indexOf(b.slug));

  const go = (slug: string) => {
    window.location.href = `${MAP_PATH}?pass=${slug}`;
  };

  return (
    <div ref={box} className={s.search}>
      <div className={s.searchBox}>
        <MagnifyingGlass size={22} weight="bold" aria-hidden="true" />
        <input
          id="hero-search"
          type="search"
          role="combobox"
          aria-expanded={open}
          aria-controls="hero-search-results"
          aria-label="Find a pass"
          placeholder="Find a pass: Glen, Aasgard, Forester..."
          autoComplete="off"
          value={q}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQ(e.target.value);
            setCursor(0);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setCursor((c) => Math.min(c + 1, hits.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setCursor((c) => Math.max(c - 1, 0));
            } else if (e.key === "Enter" && hits[cursor]) {
              go(hits[cursor].slug);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
        />
        <button className={s.searchGo} onClick={() => hits[cursor] && go(hits[cursor].slug)}>
          Check conditions
        </button>
      </div>
      {open && hits.length > 0 && (
        <ul id="hero-search-results" role="listbox" className={s.searchList}>
          {!needle && (
            <li className={`${s.mono} ${s.searchHint}`} aria-hidden="true">
              Popular this week
            </li>
          )}
          {hits.map((h, i) => (
            <li key={h.slug} role="option" aria-selected={i === cursor}>
              <button
                className={i === cursor ? s.searchRowOn : s.searchRow}
                onMouseEnter={() => setCursor(i)}
                onClick={() => go(h.slug)}
              >
                <span className={s.swatch} style={{ background: statusColor[h.status] }} />
                <span className={s.searchName}>{h.name}</span>
                <span className={`${s.mono} ${s.searchMeta}`}>
                  {h.state} · {STATUS_LABEL[h.status]}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
