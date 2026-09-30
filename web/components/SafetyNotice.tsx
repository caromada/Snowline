"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { brand } from "@/lib/brand";

const ACK_KEY = "spr-safety-ack-v1";

// Shown once before the map: the tap-to-accept is deliberate. A notice you
// must acknowledge carries far more weight than a footer link.
export default function SafetyNotice() {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let acked = false;
    try {
      acked = window.localStorage.getItem(ACK_KEY) === "1";
    } catch {
      // storage unavailable: show the notice every visit
    }
    // Hydration-safe: the server render cannot know what this browser accepted.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpen(!acked);
  }, []);

  useEffect(() => {
    if (open) btn.current?.focus();
  }, [open]);

  if (!open) return null;
  const accept = () => {
    try {
      window.localStorage.setItem(ACK_KEY, "1");
    } catch {
      // still close for this visit
    }
    setOpen(false);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="safety-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        display: "grid",
        placeItems: "center",
        padding: 16,
        background: "color-mix(in srgb, var(--deep-pine) 82%, transparent)",
        backdropFilter: "blur(6px)",
      }}
    >
      <div
        style={{
          width: "min(460px, 100%)",
          padding: 24,
          background: "var(--moss)",
          border: "1px solid color-mix(in srgb, var(--granite) 22%, transparent)",
          display: "grid",
          gap: 14,
        }}
      >
        <h2 id="safety-title" className="display" style={{ fontSize: 15, color: "var(--granite)" }}>
          A planning aid, not a safety tool
        </h2>
        <p style={{ color: "var(--granite)" }}>
          Mountain conditions change by the hour, and snow, ice, moving water, fire and
          avalanches can kill. {brand.name} shows what snow sensors and stream gauges measured
          and what official sources report, and how sure it is of its own reading. It can be
          late or wrong.
        </p>
        <p style={{ color: "var(--granite)" }}>
          Check official sources for your route, carry the right gear, and make your own call.
        </p>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <Link href="/terms/" className="mono" style={{ color: "var(--sage)" }}>
            Read the terms
          </Link>
          <button
            ref={btn}
            onClick={accept}
            className="display"
            style={{
              padding: "12px 18px",
              background: "var(--alpenglow)",
              color: "var(--deep-pine)",
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            I understand
          </button>
        </div>
      </div>
    </div>
  );
}
