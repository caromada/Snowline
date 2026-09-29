"use client";

import { useState } from "react";

export function niceDate(date: string, withYear = true): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

// The map lives in the present. History is one tap away: a slider back
// through every ingested season, and while you are in the past the app says
// so plainly, with a single tap back to now.
export default function TimeControl({
  dates,
  value,
  onChange,
}: {
  dates: string[];
  value: string;
  onChange: (d: string) => void;
}) {
  const last = dates.length - 1;
  const idx = Math.max(0, dates.indexOf(value));
  const live = idx === last;
  const [open, setOpen] = useState(false);
  const expanded = open || !live;
  const seasonStarts = dates
    .map((d, i) => ({ year: d.slice(0, 4), i }))
    .filter(({ year, i }) => i === 0 || year !== dates[i - 1].slice(0, 4));
  const backToNow = () => {
    onChange(dates[last]);
    setOpen(false);
  };

  return (
    <>
      {!live && (
        <div className="past-banner mono" role="status">
          <span>
            Viewing <b>{niceDate(value)}</b>, not current conditions
          </span>
          <button onClick={backToNow} className="display">
            Back to now
          </button>
        </div>
      )}
      <div className={`season-scrubber time-control ${expanded ? "expanded" : ""}`}>
        <div className="time-head">
          <div>
            <div className="display time-kicker" style={{ color: live ? "var(--granite)" : "var(--alpenglow)" }}>
              {live && <span className="live-dot" aria-hidden="true" />}
              {live ? "Now" : "Past conditions"}
            </div>
            <div className="mono" style={{ color: "var(--granite)", marginTop: 2 }}>
              {niceDate(value, !live)}
            </div>
          </div>
          {live ? (
            <button
              className="display time-button"
              aria-expanded={expanded}
              aria-controls="history-slider"
              onClick={() => setOpen((o) => !o)}
            >
              {expanded ? "Hide history" : "History"}
            </button>
          ) : (
            <button className="display time-button time-button-warm" onClick={backToNow}>
              Back to now
            </button>
          )}
        </div>
        {expanded && (
          <div id="history-slider" style={{ marginTop: 8 }}>
            <div style={{ position: "relative", height: 12, margin: "0 2px" }}>
              {seasonStarts.map(({ year, i }) => (
                <span
                  key={year}
                  className="mono"
                  style={{
                    position: "absolute",
                    left: `${(i / last) * 100}%`,
                    fontSize: 8,
                    color: value.slice(0, 4) === year ? "var(--alpenglow)" : "var(--sage)",
                    borderLeft: "1px solid color-mix(in srgb, var(--granite) 40%, transparent)",
                    paddingLeft: 3,
                    lineHeight: "12px",
                    userSelect: "none",
                  }}
                >
                  {year}
                </span>
              ))}
            </div>
            <input
              id="season"
              type="range"
              min={0}
              max={last}
              value={idx}
              aria-label="Look back through past conditions"
              aria-valuetext={live ? "today" : niceDate(value)}
              onChange={(e) => onChange(dates[Number(e.target.value)])}
              style={{ width: "100%", accentColor: "var(--alpenglow)", display: "block", margin: "2px 0" }}
            />
            <div className="mono" style={{ color: "var(--sage)", display: "flex", justifyContent: "space-between" }}>
              <span>{dates[0].slice(0, 4)}</span>
              <span>today</span>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
