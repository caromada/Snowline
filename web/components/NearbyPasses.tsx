"use client";

import { statusColor } from "@/lib/theme";
import type { PassIndexEntry } from "@/lib/types";
import type { Position } from "./MapView";

const EARTH_MI = 3958.8;

export function milesBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_MI * Math.asin(Math.sqrt(h));
}

// Standing at a junction: which passes are closest, and how are they?
export default function NearbyPasses({
  position,
  error,
  passes,
  evalDate,
  onSelect,
  onClose,
}: {
  position: Position | null;
  error: string | null;
  passes: PassIndexEntry[];
  evalDate: string;
  onSelect: (slug: string) => void;
  onClose: () => void;
}) {
  if (!position && !error) return null;
  const nearest = position
    ? passes
        .map((p) => ({ p, mi: milesBetween(position, p) }))
        .sort((a, b) => a.mi - b.mi)
        .slice(0, 5)
    : [];
  return (
    <section
      aria-label="Nearest passes"
      className="nearby"
      style={{
        position: "absolute",
        left: 16,
        top: 100,
        zIndex: 25,
        width: 250,
        maxWidth: "calc(100vw - 32px)",
        background: "color-mix(in srgb, var(--moss) 94%, transparent)",
        border: "1px solid color-mix(in srgb, var(--granite) 22%, transparent)",
        padding: "8px 10px 10px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 className="display" style={{ fontSize: 10, color: "var(--sage)" }}>
          Nearest passes
        </h3>
        <button onClick={onClose} aria-label="Close nearest passes" className="mono" style={{ color: "var(--sage)" }}>
          ✕
        </button>
      </div>
      {error && (
        <p className="mono" style={{ color: "var(--sage)", fontSize: 11, marginTop: 6 }}>
          {error}
        </p>
      )}
      {position && nearest[0] && nearest[0].mi > 60 && (
        <p className="mono" style={{ color: "var(--sage)", fontSize: 10, marginTop: 4 }}>
          you are {Math.round(nearest[0].mi)} mi from the nearest covered pass
        </p>
      )}
      <ul style={{ listStyle: "none", marginTop: 4 }}>
        {nearest.map(({ p, mi }) => {
          const s = p.statuses[evalDate];
          return (
            <li key={p.slug}>
              <button
                onClick={() => onSelect(p.slug)}
                style={{
                  display: "grid",
                  gridTemplateColumns: "10px 1fr auto",
                  gap: 8,
                  alignItems: "center",
                  width: "100%",
                  textAlign: "left",
                  padding: "5px 0",
                }}
              >
                <span
                  aria-hidden="true"
                  style={{ width: 8, height: 8, background: statusColor[s?.status ?? "unknown"] }}
                />
                <span>
                  <span className="display" style={{ fontSize: 10, color: "var(--granite)" }}>
                    {p.name}
                  </span>
                  <span className="mono" style={{ display: "block", fontSize: 10, color: "var(--sage)" }}>
                    {s?.status_label ?? "no data"}
                  </span>
                </span>
                <span className="mono" style={{ fontSize: 10, color: "var(--sage)" }}>
                  {mi < 10 ? mi.toFixed(1) : Math.round(mi)} mi
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
