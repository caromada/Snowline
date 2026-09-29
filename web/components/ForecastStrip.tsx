"use client";

import type { Forecast } from "@/lib/types";

const day = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });

// The week ahead at the pass's own elevation: temperatures, where the snow
// level sits against the pass, and any new snow or lightning on the way.
export default function ForecastStrip({
  forecast,
  from,
  passFt,
}: {
  forecast: Forecast;
  from: string;
  passFt: number;
}) {
  const days = forecast.days.filter((d) => d.date >= from).slice(0, 7);
  if (!days.length) return null;
  return (
    <section aria-label="Seven-day forecast" style={{ marginTop: 16 }}>
      <h3 className="display" style={{ fontSize: 10, color: "var(--sage)" }}>
        The week ahead · at {forecast.grid_elevation_ft.toLocaleString()} ft
      </h3>
      {/* The sentences say "today", so they only hold on the day they were written. */}
      {forecast.issued_for === from &&
        forecast.facts.map((f) => (
          <p key={f} style={{ marginTop: 6, color: "var(--granite)" }}>
            {f}
          </p>
        ))}
      <div className="forecast-strip">
        {days.map((d, i) => {
          const snowAtPass = d.snow_level_ft !== null && d.snow_level_ft <= passFt;
          const newSnow = (d.snowfall_in ?? 0) > 0;
          return (
            <div key={d.date} className="forecast-day">
              <div className="display" style={{ fontSize: 10, color: i === 0 ? "var(--alpenglow)" : "var(--sage)" }}>
                {i === 0 ? "Today" : day(d.date)}
              </div>
              <div className="mono forecast-temp">
                {d.high_f ?? "–"}°<span style={{ color: "var(--sage)" }}> {d.low_f ?? "–"}°</span>
              </div>
              <div className="mono" style={{ color: newSnow ? "var(--snowmelt)" : "var(--sage)" }}>
                {newSnow ? `${d.snowfall_in} in snow` : `${d.precip_chance ?? 0}% precip`}
              </div>
              <div className="mono" style={{ color: snowAtPass ? "var(--alpenglow)" : "var(--sage)" }}>
                {d.snow_level_ft !== null
                  ? `snow ${Math.round(d.snow_level_ft / 100) / 10}k ft`
                  : "no snow level"}
              </div>
              <div className="mono" style={{ color: "var(--sage)" }}>
                {(d.thunder_chance ?? 0) >= 15
                  ? `${d.thunder_chance}% thunder`
                  : `gusts ${d.gust_mph ?? "–"}`}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
