"use client";

import { glyphByStatus } from "@/lib/pixel";
import { statusColor } from "@/lib/theme";
import PixelGlyph from "./PixelGlyph";

const ITEMS: { status: string; label: string }[] = [
  { status: "open", label: "open" },
  { status: "snow_caution", label: "snow, caution" },
  { status: "traction_advised", label: "traction advised" },
  { status: "not_recommended", label: "not recommended" },
  { status: "unknown", label: "no data" },
];

// What the colors mean, in the corner where the eye looks for it.
export default function MapLegend() {
  return (
    <div
      className="map-legend"
      aria-label="Status legend"
      style={{
        position: "absolute",
        left: 16,
        bottom: 118,
        zIndex: 20,
        background: "color-mix(in srgb, var(--moss) 88%, transparent)",
        border: "1px solid color-mix(in srgb, var(--granite) 20%, transparent)",
        padding: "8px 12px",
        display: "grid",
        rowGap: 4,
      }}
    >
      {ITEMS.map((it) => (
        <div key={it.status} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <PixelGlyph sprite={glyphByStatus[it.status]} scale={1} title={it.label} />
          <span
            style={{
              width: 8,
              height: 8,
              background: statusColor[it.status],
              boxShadow: "0 0 0 1px var(--deep-pine)",
            }}
          />
          <span className="mono" style={{ fontSize: 10, color: "var(--sage)" }}>
            {it.label}
          </span>
        </div>
      ))}
    </div>
  );
}
