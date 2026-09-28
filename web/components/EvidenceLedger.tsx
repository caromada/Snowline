"use client";

import { useEffect, useState } from "react";
import { stationFile } from "@/lib/paths";
import { glyphBySource } from "@/lib/pixel";
import type { CurvePoint, CurveSeries, LedgerEntry, StationCurves } from "@/lib/types";
import PixelGlyph from "./PixelGlyph";
import Sparkline from "./Sparkline";

// Station curves are shared across passes, so each loads once per visit.
const stationCache = new Map<string, Promise<StationCurves | null>>();

function loadStation(provenance: string): Promise<StationCurves | null> {
  let p = stationCache.get(provenance);
  if (!p) {
    p = fetch(stationFile(provenance))
      .then((r) => (r.ok ? (r.json() as Promise<StationCurves>) : null))
      .catch(() => null);
    stationCache.set(provenance, p);
  }
  return p;
}

const CURVE_BY_SOURCE: Record<string, { key: string; unit: string }> = {
  sensor: { key: "swe_in", unit: "in SWE" },
  satellite: { key: "snow_cover_frac", unit: "cover" },
  gauge: { key: "discharge_cfs", unit: "cfs" },
};

function Entry({
  entry,
  curves,
  isNew,
}: {
  entry: LedgerEntry;
  curves: Record<string, CurveSeries[]>;
  isNew: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [station, setStation] = useState<StationCurves | null>(null);
  const d = entry.detail;
  const curveSpec = CURVE_BY_SOURCE[entry.source];
  const inline = curveSpec ? (curves[curveSpec.key] ?? []) : [];
  const needsStation = open && !!curveSpec && inline.length === 0 && !!d.provenance;

  useEffect(() => {
    if (!needsStation || !d.provenance) return;
    let live = true;
    loadStation(d.provenance).then((s) => {
      if (live) setStation(s);
    });
    return () => {
      live = false;
    };
  }, [needsStation, d.provenance]);

  const inlineMatch = inline.find((s) => s.provenance === d.provenance) ?? inline[0];
  const points =
    inlineMatch?.points ?? (curveSpec ? station?.curves[curveSpec.key] : undefined) ?? [];
  const curve: CurvePoint[] = points.map(([date, value]) => ({ date, value }));

  return (
    <li
      className={isNew ? "new-this-week" : undefined}
      style={{
        borderBottom: "1px solid color-mix(in srgb, var(--granite) 14%, transparent)",
      }}
    >
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="glyph-hover"
        style={{
          display: "grid",
          gridTemplateColumns: "32px 84px 1fr",
          gap: 10,
          alignItems: "center",
          width: "100%",
          textAlign: "left",
          padding: "9px 2px",
        }}
      >
        <PixelGlyph sprite={glyphBySource[entry.source]} scale={2} title={entry.source} />
        <span className="mono" style={{ color: "var(--sage)" }}>
          {entry.date}
        </span>
        <span style={{ color: "var(--granite)" }}>{entry.title}</span>
      </button>
      <div
        className="ledger-entry-body"
        style={{ maxHeight: open ? 600 : 0, opacity: open ? 1 : 0 }}
      >
        <div
          style={{
            margin: "0 2px 12px 42px",
            padding: "10px 12px",
            background: "var(--deep-pine)",
            border: "1px solid color-mix(in srgb, var(--granite) 18%, transparent)",
          }}
        >
          {entry.source === "report" ? (
            <ReportDetail entry={entry} />
          ) : (
            <>
              <div className="mono" style={{ color: "var(--sage)", marginBottom: 6 }}>
                {d.provenance}
                {typeof d.distance_km === "number" ? ` · ${d.distance_km} km from the pass` : ""}
                {d.station_elevation_ft ? ` · ${d.station_elevation_ft} ft` : ""}
              </div>
              <Sparkline
                points={curve}
                unit={curveSpec?.unit ?? ""}
                highlightDate={entry.date}
              />
              {d.modeled === true && (
                <p className="mono" style={{ color: "var(--sage)", marginTop: 6 }}>
                  modeled from sensor SWE, not a real scene; see README
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </li>
  );
}

function ReportDetail({ entry }: { entry: LedgerEntry }) {
  const d = entry.detail;
  const ex = d.extraction;
  const text = d.text ?? "";
  const quote = d.quote ?? null;
  let before = text;
  let after = "";
  if (quote && text.includes(quote)) {
    const i = text.indexOf(quote);
    before = text.slice(0, i);
    after = text.slice(i + quote.length);
  }
  return (
    <div>
      <div className="mono" style={{ color: "var(--sage)", marginBottom: 6 }}>
        {d.author} · {d.source} · posted {d.posted_date}
        {d.model ? ` · read by ${d.model}` : ""}
      </div>
      <p style={{ color: "var(--granite)", marginBottom: 8 }}>
        {before}
        {quote && (
          <mark
            style={{
              background: "color-mix(in srgb, var(--alpenglow) 30%, transparent)",
              color: "var(--alpenglow)",
              padding: "0 2px",
            }}
          >
            {quote}
          </mark>
        )}
        {after}
      </p>
      {ex && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {(
            [
              ["snow", ex.snow_condition],
              ["traction", ex.traction_used],
              ["crossing", ex.crossing_condition],
              ["felt", ex.exposure_comfort],
              ["voice", ex.reporter_register],
            ] as const
          )
            .filter(([, v]) => v && v !== "unknown")
            .map(([k, v]) => (
              <span
                key={k}
                className="mono"
                style={{
                  border: "1px solid color-mix(in srgb, var(--sage) 45%, transparent)",
                  color: "var(--sage)",
                  padding: "1px 7px",
                }}
              >
                {k}: {String(v).replaceAll("_", " ")}
              </span>
            ))}
        </div>
      )}
    </div>
  );
}

export default function EvidenceLedger({
  ledger,
  curves,
  evalDate,
}: {
  ledger: LedgerEntry[];
  curves: Record<string, CurveSeries[]>;
  evalDate: string;
}) {
  // The register shows what existed by the selected date, newest first.
  const visible = ledger.filter((e) => e.date && e.date <= evalDate).slice(0, 40);
  const weekAgo = new Date(new Date(evalDate).getTime() - 7 * 86400e3)
    .toISOString()
    .slice(0, 10);
  return (
    <section aria-label="Evidence ledger">
      <h3
        className="display"
        style={{ fontSize: 12, color: "var(--sage)", margin: "18px 0 4px" }}
      >
        Evidence ledger
      </h3>
      <ul style={{ listStyle: "none" }}>
        {visible.map((e, i) => (
          <Entry
            key={`${e.source}-${e.date}-${i}`}
            entry={e}
            curves={curves}
            isNew={e.date >= weekAgo}
          />
        ))}
        {visible.length === 0 && (
          <li className="mono" style={{ color: "var(--sage)", padding: "8px 0" }}>
            nothing in the register before this date
          </li>
        )}
      </ul>
    </section>
  );
}
