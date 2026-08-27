"use client";

// Walk every ingested melt season week by week, plus today. Tick marks show
// where one season hands off to the next.
export default function SeasonScrubber({
  dates,
  value,
  onChange,
}: {
  dates: string[];
  value: string;
  onChange: (d: string) => void;
}) {
  const idx = Math.max(0, dates.indexOf(value));
  const isToday = idx === dates.length - 1;
  const seasonStarts = dates
    .map((d, i) => ({ year: d.slice(0, 4), i }))
    .filter(({ year, i }) => i === 0 || year !== dates[i - 1].slice(0, 4));
  return (
    <div
      style={{
        position: "absolute",
        left: 16,
        bottom: 16,
        zIndex: 20,
        background: "color-mix(in srgb, var(--moss) 88%, transparent)",
        border: "1px solid color-mix(in srgb, var(--granite) 20%, transparent)",
        padding: "10px 14px",
        width: 300,
        maxWidth: "calc(100vw - 32px)",
      }}
    >
      <label className="display" htmlFor="season" style={{ fontSize: 10, color: "var(--sage)" }}>
        Season · {isToday ? "today" : `melt ${value.slice(0, 4)}`}
      </label>
      <div style={{ position: "relative", height: 12, margin: "4px 2px 0" }}>
        {seasonStarts.map(({ year, i }) => (
          <span
            key={year}
            className="mono"
            style={{
              position: "absolute",
              left: `${(i / (dates.length - 1)) * 100}%`,
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
        max={dates.length - 1}
        value={idx}
        onChange={(e) => onChange(dates[Number(e.target.value)])}
        style={{ width: "100%", accentColor: "var(--alpenglow)", display: "block", margin: "2px 0" }}
      />
      <div className="mono" style={{ color: "var(--granite)" }}>
        {value}
      </div>
    </div>
  );
}
