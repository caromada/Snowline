"use client";

import { FIRE_SOURCE_URL, SMOKE_SOURCE_URL, fireSentence, flame, shortDate } from "@/lib/fire";
import type { PassFire } from "@/lib/fireTypes";
import styles from "./FirePanel.module.css";
import PixelGlyph from "./PixelGlyph";

// The nearest active fire and any smoke over the pass, as the agencies
// mapped them. Distances are straight lines to the perimeter's edge.
export default function FirePanel({ fire }: { fire: PassFire }) {
  const near = fire.fire;
  if (!near && !fire.smoke) return null;
  const dates = near
    ? [
        near.discovered ? `discovered ${shortDate(near.discovered)}` : null,
        near.updated ? `perimeter updated ${shortDate(near.updated)}` : null,
      ].filter(Boolean)
    : [];
  return (
    <section
      aria-label="Fire and smoke"
      className={`${styles.fire}${near ? ` ${styles.burning}` : ""}`}
    >
      <h3 className={`display ${styles.head}`}>
        <PixelGlyph sprite={flame} scale={1} title="" />
        {near ? "Active fire nearby" : "Smoke"}
      </h3>
      {near && (
        <>
          <p className={styles.line}>{fireSentence(near)}</p>
          {dates.length > 0 && <div className={`mono ${styles.meta}`}>{dates.join(" · ")}</div>}
          {near.url && (
            <a className={`mono ${styles.link}`} href={near.url} target="_blank" rel="noreferrer">
              official incident page
            </a>
          )}
        </>
      )}
      {fire.smoke && (
        <>
          <p className={styles.line}>Smoke overhead: {fire.smoke}</p>
          <div className={`mono ${styles.meta}`}>
            {fire.smoke_date ? `satellite analysis of ${shortDate(fire.smoke_date)} · ` : ""}
            seen from above, so it can sit higher than the pass
          </div>
        </>
      )}
      <p className={`mono ${styles.sources}`}>
        {near && (
          <>
            perimeters:{" "}
            <a href={FIRE_SOURCE_URL} target="_blank" rel="noreferrer">
              National Interagency Fire Center
            </a>
          </>
        )}
        {near && fire.smoke && " · "}
        {fire.smoke && (
          <>
            smoke:{" "}
            <a href={SMOKE_SOURCE_URL} target="_blank" rel="noreferrer">
              NOAA Hazard Mapping System
            </a>
          </>
        )}
      </p>
    </section>
  );
}
