"use client";

import { useEffect, useRef, useState } from "react";
import { glyphByStatus, tent } from "@/lib/pixel";
import type { Fact, PassDetail } from "@/lib/types";
import Byok from "./Byok";
import Campfire from "./Campfire";
import EvidenceLedger from "./EvidenceLedger";
import PixelGlyph from "./PixelGlyph";
import Vignette from "./Vignette";

const SAVED_KEY = "sierra-pass-report:saved";

export function loadSaved(): string[] {
  try {
    return JSON.parse(window.localStorage.getItem(SAVED_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function ConfidenceDial({ level, score }: { level: string; score: number }) {
  // The one warm dial on the page: fill fraction by confidence grade.
  const frac = level === "high" ? 1 : level === "moderate" ? 0.6 : 0.28;
  const cells = 10;
  return (
    <div
      title={`confidence score ${score}`}
      aria-label={`Confidence ${level}`}
      style={{ display: "flex", gap: 2, alignItems: "center" }}
    >
      {Array.from({ length: cells }, (_, i) => (
        <span
          key={i}
          style={{
            width: 6,
            height: 10,
            background:
              i < Math.round(frac * cells)
                ? "var(--alpenglow)"
                : "color-mix(in srgb, var(--granite) 20%, transparent)",
          }}
        />
      ))}
      <span className="mono" style={{ marginLeft: 6, color: "var(--alpenglow)" }}>
        {level}
      </span>
    </div>
  );
}

function FactLine({ fact, onTap }: { fact: Fact; onTap: (f: Fact) => void }) {
  const glyphColor: Record<string, string> = {
    sensor: "var(--granite)",
    satellite: "var(--snowmelt)",
    report: "var(--sage)",
    gauge: "var(--snowmelt)",
    none: "var(--sage)",
  };
  return (
    <button
      onClick={() => onTap(fact)}
      style={{
        display: "block",
        textAlign: "left",
        color: "var(--granite)",
        padding: "3px 0",
        width: "100%",
      }}
      title={`source: ${fact.stream}`}
    >
      <span
        aria-hidden
        style={{
          display: "inline-block",
          width: 7,
          height: 7,
          marginRight: 8,
          background: glyphColor[fact.stream],
        }}
      />
      {fact.text}
    </button>
  );
}

export default function PassPanel({
  slug,
  evalDate,
  onClose,
}: {
  slug: string | null;
  evalDate: string;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<PassDetail | null>(null);
  const [saved, setSaved] = useState<string[]>([]);
  const ledgerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSaved(loadSaved());
  }, []);

  useEffect(() => {
    if (!slug) return;
    setDetail(null);
    let cancelled = false;
    fetch(`data/pass/${slug}.json`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const toggleSaved = () => {
    if (!slug) return;
    const next = saved.includes(slug) ? saved.filter((s) => s !== slug) : [...saved, slug];
    setSaved(next);
    try {
      window.localStorage.setItem(SAVED_KEY, JSON.stringify(next));
      window.dispatchEvent(new Event("sierra-saved-changed"));
    } catch {
      // storage may be unavailable; the toggle still works for this view
    }
  };

  const status = detail?.statuses[evalDate];
  const isSaved = slug ? saved.includes(slug) : false;

  return (
    <aside className={`pass-panel ${slug ? "open" : ""}`} aria-hidden={!slug}>
      {slug && !detail && <Campfire label="reading the register" />}
      {slug && detail && status && (
        <div style={{ padding: "18px 20px 28px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
            <div>
              <h2 className="display" style={{ fontSize: 19, color: "var(--granite)" }}>
                {detail.pass.name}
              </h2>
              <div className="mono" style={{ color: "var(--sage)", marginTop: 2 }}>
                {detail.pass.elevation_ft.toLocaleString()} ft · {evalDate}
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                onClick={toggleSaved}
                className="glyph-hover"
                aria-pressed={isSaved}
                title={isSaved ? "remove from saved passes" : "save this pass"}
                style={{ opacity: isSaved ? 1 : 0.45 }}
              >
                <PixelGlyph sprite={tent} scale={2} title="saved pass tent" />
              </button>
              <button
                onClick={onClose}
                aria-label="Close panel"
                className="mono"
                style={{ color: "var(--sage)", fontSize: 16, padding: "2px 6px" }}
              >
                ✕
              </button>
            </div>
          </div>

          <div style={{ margin: "14px 0 10px" }}>
            <Vignette slug={slug} params={status.vignette} />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <PixelGlyph
              sprite={glyphByStatus[status.status]}
              scale={2}
              title={status.status_label}
            />
            <span
              className="display"
              style={{
                fontSize: 14,
                fontWeight: 600,
                color:
                  status.status === "traction_advised" || status.status === "not_recommended"
                    ? "var(--alpenglow)"
                    : status.status === "open"
                      ? "var(--fern)"
                      : status.status === "snow_caution"
                        ? "var(--snowmelt)"
                        : "var(--sage)",
              }}
            >
              {status.status_label}
            </span>
          </div>

          <ConfidenceDial level={status.confidence} score={status.confidence_score} />

          <div style={{ marginTop: 14 }}>
            {status.facts.map((f, i) => (
              <FactLine
                key={i}
                fact={f}
                onTap={() => ledgerRef.current?.scrollIntoView({ behavior: "smooth" })}
              />
            ))}
          </div>

          {status.conflicts.length > 0 && (
            <div
              role="note"
              style={{
                marginTop: 12,
                padding: "8px 12px",
                borderLeft: "3px solid var(--alpenglow)",
                background: "color-mix(in srgb, var(--alpenglow) 8%, transparent)",
                color: "var(--granite)",
              }}
            >
              <span className="display" style={{ fontSize: 10, color: "var(--alpenglow)" }}>
                Streams disagree
              </span>
              {status.conflicts.map((c, i) => (
                <p key={i} style={{ marginTop: 4 }}>
                  {c}
                </p>
              ))}
            </div>
          )}

          <p style={{ marginTop: 12, color: "var(--sage)", fontStyle: "italic" }}>
            {detail.pass.aspect_note}
          </p>

          <div ref={ledgerRef}>
            <EvidenceLedger ledger={detail.ledger} curves={detail.curves} evalDate={evalDate} />
          </div>

          <Byok detail={detail} evalDate={evalDate} />
        </div>
      )}
    </aside>
  );
}
