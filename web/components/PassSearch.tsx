"use client";

import { useEffect, useRef, useState } from "react";
import type { PassIndexEntry } from "@/lib/types";

// Find one spot among 508. Matches name and aliases, featured first.
export default function PassSearch({
  passes,
  onSelect,
}: {
  passes: PassIndexEntry[];
  onSelect: (slug: string) => void;
}) {
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  const needle = q.trim().toLowerCase();
  const results = needle
    ? passes
        .filter(
          (p) =>
            p.name.toLowerCase().includes(needle) ||
            p.aliases.some((a) => a.includes(needle)),
        )
        .sort((a, b) =>
          a.tier === b.tier ? a.name.localeCompare(b.name) : a.tier === "featured" ? -1 : 1,
        )
        .slice(0, 8)
    : [];

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setQ("");
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, []);

  const pick = (slug: string) => {
    onSelect(slug);
    setQ("");
  };

  return (
    <div ref={boxRef} className="pass-search" style={{ position: "relative", width: 230 }}>
      <input
        className="mono"
        type="search"
        role="combobox"
        aria-expanded={results.length > 0}
        aria-controls="pass-search-results"
        aria-label="Find a pass"
        placeholder="find a pass…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setCursor(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setCursor((c) => Math.min(c + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setCursor((c) => Math.max(c - 1, 0));
          } else if (e.key === "Enter" && results[cursor]) {
            pick(results[cursor].slug);
          } else if (e.key === "Escape") {
            setQ("");
          }
        }}
        style={{
          width: "100%",
          background: "color-mix(in srgb, var(--moss) 88%, transparent)",
          border: "1px solid color-mix(in srgb, var(--granite) 20%, transparent)",
          color: "var(--granite)",
          padding: "7px 10px",
          fontSize: 12,
          outlineColor: "var(--alpenglow)",
        }}
      />
      {results.length > 0 && (
        <ul
          id="pass-search-results"
          role="listbox"
          style={{
            listStyle: "none",
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            marginTop: 4,
            background: "var(--moss)",
            border: "1px solid color-mix(in srgb, var(--granite) 24%, transparent)",
            maxHeight: 300,
            overflowY: "auto",
            zIndex: 40,
          }}
        >
          {results.map((p, i) => (
            <li key={p.slug} role="option" aria-selected={i === cursor}>
              <button
                onClick={() => pick(p.slug)}
                onMouseEnter={() => setCursor(i)}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 8,
                  width: "100%",
                  textAlign: "left",
                  padding: "7px 10px",
                  background:
                    i === cursor
                      ? "color-mix(in srgb, var(--alpenglow) 16%, transparent)"
                      : "transparent",
                }}
              >
                <span
                  className="display"
                  style={{
                    fontSize: 10,
                    color: i === cursor ? "var(--alpenglow)" : "var(--granite)",
                  }}
                >
                  {p.name}
                </span>
                <span className="mono" style={{ fontSize: 10, color: "var(--sage)" }}>
                  {p.elevation_ft.toLocaleString()} ft
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
