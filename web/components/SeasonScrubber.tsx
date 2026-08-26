"use client";

// Walk the 2023 melt season week by week, plus today. The demo runs on the
// monster snow year because late August holds no snow to look at.
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
        maxWidth: 360,
      }}
    >
      <label className="display" htmlFor="season" style={{ fontSize: 10, color: "var(--sage)" }}>
        Season · {isToday ? "today" : "melt 2023"}
      </label>
      <input
        id="season"
        type="range"
        min={0}
        max={dates.length - 1}
        value={idx}
        onChange={(e) => onChange(dates[Number(e.target.value)])}
        style={{ width: "100%", accentColor: "var(--alpenglow)", display: "block", margin: "6px 0 2px" }}
      />
      <div className="mono" style={{ color: "var(--granite)" }}>
        {value}
      </div>
    </div>
  );
}
