"use client";

import { useEffect, useRef, useState } from "react";
import { snowstake } from "@/lib/pixel";
import {
  linePath,
  monthTicks,
  placeLabels,
  scaleTop,
  seasonCurves,
  seasonDay,
  valueOn,
  windowDays,
  type SeasonCurve,
} from "@/lib/seasonChart";
import type { Season, SeasonChart, SeasonFact } from "@/lib/seasonTypes";
import type { StationCurves } from "@/lib/types";
import { loadStation } from "./EvidenceLedger";
import PixelGlyph from "./PixelGlyph";
import styles from "./SeasonPanel.module.css";

const HEIGHT = 200;
const MARGIN = { top: 34, right: 10, bottom: 22, left: 30 };
const LABEL_GAP = 12;

const shortDay = (year: number, day: number) =>
  new Date(Date.UTC(year, 3, 1 + day)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

function where(station: { elevation_ft: number | null; distance_mi: number | null }): string {
  return [
    station.elevation_ft !== null ? `${station.elevation_ft.toLocaleString()} ft` : null,
    station.distance_mi !== null ? `${station.distance_mi} mi from the pass` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

function Statement({ fact }: { fact: SeasonFact }) {
  const flag = fact.disagree ? "Stations disagree" : fact.estimate ? "Estimate" : null;
  const tone = fact.disagree ? styles.disagree : fact.estimate ? styles.estimate : "";
  const n = fact.evidence.length;
  return (
    <div className={`${styles.statement} ${tone}`} role={flag ? "note" : undefined}>
      {flag && <span className={`display ${styles.flag}`}>{flag}</span>}
      <p className={styles.plain}>{fact.text}</p>
      <details className={styles.evidence}>
        <summary className="mono">
          Rests on {n} {n === 1 ? "station" : "stations"}
        </summary>
        <ul>
          {fact.evidence.map((e) => (
            <li key={e.provenance}>
              <span className={styles.station}>{e.name}</span>
              <span className={`mono ${styles.meta}`}>{where(e)}</span>
              <span className={`mono ${styles.detail}`}>{e.detail}</span>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}

function Key({ current }: { current: boolean }) {
  return (
    <svg width={26} height={10} aria-hidden className={styles.key}>
      <line
        x1={0}
        y1={5}
        x2={18}
        y2={5}
        className={current ? styles.lineCurrent : styles.lineEarlier}
      />
      {current ? (
        <rect x={17} y={1} width={8} height={8} className={styles.markCurrent} />
      ) : (
        <rect x={18} y={2} width={6} height={6} className={styles.markEarlier} />
      )}
    </svg>
  );
}

function Plot({
  chart,
  curves,
  current,
  span,
}: {
  chart: SeasonChart;
  curves: SeasonCurve[];
  current: number;
  span: Season["window"];
}) {
  const frame = useRef<HTMLDivElement>(null);
  // Drawn at the panel's own pixel width, so hairlines land on whole pixels
  // and type keeps its size on a phone.
  const [width, setWidth] = useState(390);
  const [day, setDay] = useState<number | null>(null);

  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(240, Math.floor(el.clientWidth)));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const days = windowDays(span);
  const left = MARGIN.left;
  const right = width - MARGIN.right;
  const floor = HEIGHT - MARGIN.bottom;
  const { top, step } = scaleTop(
    Math.max(0, ...curves.flatMap((c) => c.points.map((p) => p.value))),
  );
  const x = (d: number) => left + (d / days) * (right - left);
  const y = (v: number) => floor - (v / top) * (floor - MARGIN.top);
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  // The current season is drawn last so it sits on top, and labelled first
  // so it never loses its label to an earlier one.
  const ordered = [...curves].sort(
    (a, b) => Number(a.year === current) - Number(b.year === current),
  );
  const labels = placeLabels(
    [...ordered].reverse().map((c) => ({
      key: String(c.year),
      x: Math.round(x(c.points[0].day)) + 4,
      y: Math.round(y(c.points[0].value)) - 5,
    })),
    LABEL_GAP,
  );
  const marks = chart.seasons.filter(
    (s) => s.melt_out !== null && curves.some((c) => c.year === s.year),
  );
  const years = curves.map((c) => c.year);
  const readout =
    day === null
      ? null
      : [...ordered]
          .reverse()
          .map((c) => ({ year: c.year, value: valueOn(c.points, day) }))
          .filter((r): r is { year: number; value: number } => r.value !== null);

  const point = (e: React.PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const at = ((e.clientX - box.left - left) / (right - left)) * days;
    setDay(Math.min(days, Math.max(0, Math.round(at))));
  };

  return (
    <div ref={frame} className={styles.frame}>
      <svg
        width={width}
        height={HEIGHT}
        viewBox={`0 0 ${width} ${HEIGHT}`}
        role="img"
        aria-label={
          `Snow water at ${chart.name} from April through August, one line for each of ` +
          `${years.join(", ")}, with the melt-out dates marked. ` +
          "The table that follows gives each season's peak and melt-out date."
        }
        className={styles.plot}
        onPointerMove={point}
        onPointerDown={point}
        onPointerLeave={() => setDay(null)}
      >
        <text x={0} y={11} className={styles.axisText}>
          in of snow water
        </text>
        <g shapeRendering="crispEdges">
          {ticks.map((t) => (
            <line
              key={t}
              x1={left}
              x2={right}
              y1={Math.round(y(t)) + 0.5}
              y2={Math.round(y(t)) + 0.5}
              className={t === 0 ? styles.baseline : styles.grid}
            />
          ))}
          {monthTicks(span).map((m) => (
            <line
              key={m.label}
              x1={Math.round(x(m.day)) + 0.5}
              x2={Math.round(x(m.day)) + 0.5}
              y1={floor}
              y2={floor + 4}
              className={styles.baseline}
            />
          ))}
        </g>
        {ticks.map((t) => (
          <text
            key={t}
            x={left - 6}
            y={Math.round(y(t)) + 4}
            textAnchor="end"
            className={styles.axisText}
          >
            {t}
          </text>
        ))}
        {monthTicks(span).map((m) => (
          <text
            key={m.label}
            x={Math.round(x(m.day)) + 4}
            y={HEIGHT - 5}
            className={styles.axisText}
          >
            {m.label}
          </text>
        ))}

        {ordered.map((c) => (
          <path
            key={c.year}
            d={linePath(c.points, x, y)}
            className={c.year === current ? styles.lineCurrent : styles.lineEarlier}
          />
        ))}
        <g shapeRendering="crispEdges">
          {marks.map((s) => {
            const size = s.year === current ? 8 : 6;
            const at = Math.round(x(seasonDay(s.melt_out as string)));
            return (
              <rect
                key={s.year}
                x={at - size / 2}
                y={floor - size / 2}
                width={size}
                height={size}
                className={s.year === current ? styles.markCurrent : styles.markEarlier}
              />
            );
          })}
        </g>
        {labels.map((l) => (
          <text key={l.key} x={l.x} y={l.y} className={styles.yearLabel}>
            {l.key}
          </text>
        ))}
        {day !== null && (
          <line
            x1={Math.round(x(day)) + 0.5}
            x2={Math.round(x(day)) + 0.5}
            y1={MARGIN.top}
            y2={floor}
            className={styles.crosshair}
            shapeRendering="crispEdges"
          />
        )}
      </svg>
      <p className={`mono ${styles.readout}`} aria-hidden>
        {day === null || !readout
          ? "Point at the chart to read a day."
          : readout.length === 0
            ? `${shortDay(current, day)}: no reading on file`
            : `${shortDay(current, day)}: ` +
              readout.map((r) => `${r.year} ${r.value.toFixed(1)} in`).join(" · ")}
      </p>
    </div>
  );
}

function Curves({ season, chart }: { season: Season; chart: SeasonChart }) {
  const [loaded, setLoaded] = useState<{ provenance: string; data: StationCurves | null } | null>(
    null,
  );

  useEffect(() => {
    let live = true;
    loadStation(chart.provenance).then((data) => {
      if (live) setLoaded({ provenance: chart.provenance, data });
    });
    return () => {
      live = false;
    };
  }, [chart.provenance]);

  const station = loaded && loaded.provenance === chart.provenance ? loaded : null;
  const curves = station?.data
    ? seasonCurves(
        station.data.curves.swe_in ?? [],
        chart.seasons.map((s) => s.year),
        season.window,
        chart.max_swe_in,
      )
    : [];
  const rows = [...chart.seasons].reverse();

  return (
    <figure className={styles.figure}>
      <figcaption className={`display ${styles.sub}`}>
        Snow water at {chart.name}
        <span className={`mono ${styles.meta}`}>{where(chart)}</span>
      </figcaption>
      {curves.length > 0 ? (
        <Plot chart={chart} curves={curves} current={season.year} span={season.window} />
      ) : (
        <p className={`mono ${styles.readout}`}>
          {station ? "The curves for this station could not be loaded." : "Loading the curves."}
        </p>
      )}
      <table className={`mono ${styles.table}`}>
        <thead>
          <tr>
            <th scope="col">Season</th>
            <th scope="col">Peak after Apr 1</th>
            <th scope="col">Melt-out</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.year} className={s.year === season.year ? styles.current : undefined}>
              <th scope="row">
                <Key current={s.year === season.year} />
                {s.year}
              </th>
              <td>{s.peak_swe_in !== null ? `${s.peak_swe_in.toFixed(1)} in` : "not on file"}</td>
              <td>{s.melt_out_note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

// This melt season against the earlier seasons on file. The sentences are
// written by fusion/season.py with the stations they rest on; nothing here
// rewords them, and nothing here calls a season normal.
export default function SeasonPanel({ season }: { season: Season }) {
  if (!season.facts.length) return null;
  const thisYear = season.as_of.slice(0, 4) === String(season.year);
  return (
    <section aria-label="This season against the seasons on file" className={styles.season}>
      <h3 className={`display ${styles.head}`}>
        <PixelGlyph sprite={snowstake} scale={1} title="" />
        {thisYear ? "This season" : `The ${season.year} season`} · against the seasons on file
      </h3>

      {season.facts.map((fact) => (
        <Statement key={fact.kind} fact={fact} />
      ))}

      {season.chart && <Curves season={season} chart={season.chart} />}

      <p className={`mono ${styles.fine}`}>
        The record on file runs April 1 to August 31 of each season since{" "}
        {Math.min(season.year, ...season.earlier_years)}. It is a short record: it places this
        season among those seasons and says nothing about the long run.
      </p>
    </section>
  );
}
