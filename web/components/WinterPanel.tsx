"use client";

import { useState } from "react";
import { pineSnow } from "@/lib/pixel";
import type { AvalancheRating, DangerLevel, RoadStatus, Winter } from "@/lib/winterTypes";
import PixelGlyph from "./PixelGlyph";
import styles from "./WinterPanel.module.css";

// The North American Public Avalanche Danger Scale's own colors. They are
// the one place the panel leaves the forest palette: the scale is a public
// standard, and a rating shown in any other color is a different rating.
const DANGER: Record<DangerLevel, { fill: string; ink: string }> = {
  1: { fill: "#50b848", ink: "#0f1a14" },
  2: { fill: "#fff200", ink: "#0f1a14" },
  3: { fill: "#f7941e", ink: "#0f1a14" },
  4: { fill: "#ed1c24", ink: "#ffffff" },
  5: { fill: "#231f20", ink: "#ffffff" },
};

const WARNING: Record<NonNullable<AvalancheRating["warning"]>, string> = {
  warning: "Avalanche Warning",
  watch: "Avalanche Watch",
  special: "Special Avalanche Bulletin",
};

const PACIFIC = "America/Los_Angeles";

function moment(iso: string, timeZone: string): string | null {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  try {
    return at.toLocaleString("en-US", {
      timeZone,
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    });
  } catch {
    return null;
  }
}

// Agencies stamp reports two ways. A stamp with an offset is a moment and
// converts to Pacific time; one without is already local wall-clock time
// and is printed as written, since converting it would move it.
function stamped(value: string): string | null {
  if (/(Z|[+-]\d\d:?\d\d)$/.test(value)) return moment(value, PACIFIC);
  const m = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)/.exec(value);
  if (!m) return null;
  const at = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
  return at.toLocaleString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function Avalanche({ rating, now }: { rating: AvalancheRating | null; now: number }) {
  if (!rating) {
    return (
      <p className={styles.plain}>
        This pass is outside every avalanche center&apos;s forecast zones. No official rating
        exists for it.
      </p>
    );
  }
  const until = rating.valid_until_utc ? Date.parse(rating.valid_until_utc) : NaN;
  const expired = rating.level !== null && !Number.isNaN(until) && until < now;
  const level = expired ? null : rating.level;
  const colors = level ? DANGER[level] : null;
  const untilText =
    rating.valid_until_utc && rating.timezone
      ? moment(rating.valid_until_utc, rating.timezone)
      : null;
  const center = rating.center ?? "the avalanche center";

  return (
    <div className={styles.avalanche}>
      <div
        className={`${styles.rating} ${colors ? "" : styles.unrated}`}
        style={colors ? { background: colors.fill, color: colors.ink } : undefined}
      >
        {level && <span className={styles.level}>{level}</span>}
        <span className={`display ${styles.word}`}>
          {expired ? "No current rating" : level ? rating.rating : "No rating issued"}
        </span>
      </div>

      <div className={`mono ${styles.meta}`}>
        {rating.center}
        {rating.zone && rating.zone !== rating.center ? ` · ${rating.zone} zone` : ""}
      </div>
      {level && untilText && (
        <div className={`mono ${styles.meta}`}>valid until {untilText}</div>
      )}
      {expired && untilText && (
        <p className={styles.plain}>
          The rating {center} issued for this zone expired {untilText}.
        </p>
      )}
      {!level && !expired && rating.off_season && (
        <p className={styles.plain}>{center} lists this zone as off season.</p>
      )}

      {level && rating.warning && (
        <div className={`display ${styles.warning}`} role="note">
          {WARNING[rating.warning]} issued by {center}
        </div>
      )}

      {level && rating.travel_advice && (
        <figure className={styles.advice}>
          <blockquote>{rating.travel_advice}</blockquote>
          <figcaption className="mono">Travel advice from {center}, quoted in full</figcaption>
        </figure>
      )}

      {rating.link && (
        <a className={`display ${styles.link}`} href={rating.link} target="_blank" rel="noreferrer">
          Read the full forecast
        </a>
      )}
      <p className={`mono ${styles.fine}`}>
        Snowline shows the center&apos;s rating as issued and makes no avalanche assessment of
        its own.
      </p>
    </div>
  );
}

function Road({ road }: { road: RoadStatus }) {
  const when = road.updated ? stamped(road.updated) : null;
  const snow = [
    road.new_snow_in !== undefined ? `${road.new_snow_in} in new roadside snow` : null,
    road.roadside_snow_in !== undefined ? `${road.roadside_snow_in} in roadside depth` : null,
  ].filter(Boolean);
  return (
    <li className={`${styles.road} ${road.active ? styles.active : ""}`}>
      <div className={styles.roadName}>
        {road.road && <span className="mono">{road.road}</span>}
        <span>{road.location}</span>
      </div>
      <div className={`mono ${styles.meta}`}>{road.distance_mi} mi away in a straight line</div>
      <ul className={styles.lines}>
        {road.lines.map((line, i) => (
          <li key={i}>
            {line.label && <span className={`display ${styles.lineLabel}`}>{line.label}</span>}
            {line.code && <span className={`mono ${styles.code}`}>{line.code}</span>}
            <q>{line.text}</q>
          </li>
        ))}
      </ul>
      {snow.length > 0 && <div className={`mono ${styles.meta}`}>{snow.join(" · ")}</div>}
      <div className={`mono ${styles.meta}`}>
        {road.agency}
        {when ? ` · status set ${when}` : ""} ·{" "}
        <a href={road.agency_link} target="_blank" rel="noreferrer">
          live road conditions
        </a>
      </div>
    </li>
  );
}

// Winter at the pass: the avalanche center's rating, what the snow sensors
// measured, and what the highway agencies report. Official words are quoted
// and attributed; Snowline's own lines only describe.
export default function WinterPanel({ winter }: { winter: Winter }) {
  // Read once per mount: a rating must not flip to expired mid-read, and
  // render has to stay pure.
  const [now] = useState(() => Date.now());
  const read = winter.fetched_at ? moment(winter.fetched_at, PACIFIC) : null;
  const roads = winter.roads ?? [];
  const facts = winter.fresh_snow?.facts ?? [];
  if (winter.avalanche === undefined && !facts.length && !roads.length) return null;

  return (
    <section aria-label="Winter conditions" className={styles.winter}>
      <h3 className={`display ${styles.head}`}>
        <PixelGlyph sprite={pineSnow} scale={1} title="" />
        Winter
      </h3>

      {winter.avalanche !== undefined && (
        <>
          <h4 className={`display ${styles.sub}`}>Avalanche danger · official</h4>
          <Avalanche rating={winter.avalanche} now={now} />
        </>
      )}

      {facts.length > 0 && (
        <>
          <h4 className={`display ${styles.sub}`}>New snow</h4>
          {facts.map((fact) => (
            <p key={fact} className={styles.plain}>
              {fact}
            </p>
          ))}
        </>
      )}

      {roads.length > 0 && (
        <>
          <h4 className={`display ${styles.sub}`}>Road status</h4>
          <ul className={styles.roads}>
            {roads.map((road) => (
              <Road key={`${road.agency}-${road.road}-${road.location}`} road={road} />
            ))}
          </ul>
          {read && (
            <p className={`mono ${styles.fine}`}>
              Road reports were read {read}. Agencies change them through the day.
            </p>
          )}
        </>
      )}
    </section>
  );
}
