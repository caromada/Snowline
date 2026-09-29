"use client";

import { shortDate } from "@/lib/fire";
import { dayLabel, fireLine, whyLine } from "@/lib/plan";
import type { PlanPass, PlanReply, TripPlan } from "@/lib/planTypes";
import { dangerScale } from "@/lib/theme";
import type { ForecastDay, Status } from "@/lib/types";
import type { RoadStatus } from "@/lib/winterTypes";
import s from "./TripPlanner.module.css";

const TONE: Record<Status, string> = {
  open: "var(--fern)",
  snow_caution: "var(--snowmelt)",
  traction_advised: "var(--alpenglow)",
  not_recommended: "var(--alpenglow)",
  unknown: "var(--sage)",
};

const EMPTY: Record<NonNullable<PlanReply["empty"]>, string> = {
  no_match:
    "No pass, route, trailhead or campground in the index matched this text, so there is nothing to show. Snowline knows passes by their names: a trip written with them, such as Glen Pass or Aasgard Pass, is one it can place.",
  none_chosen:
    "Names in this text matched passes in the index, but none of those passes was read as part of the trip.",
  unreadable: "This text could not be read as a trip.",
};

function Verdict({ pass, today }: { pass: PlanPass; today: string }) {
  const v = pass.verdict;
  const when = v.latest
    ? `as of ${dayLabel(v.date, today)}${v.date === today ? ", today" : ", the newest on file"}`
    : `as of ${dayLabel(v.date, today)}, the verdict on file nearest the trip`;
  return (
    <div className={s.verdict}>
      <div className={s.verdictRow}>
        <span aria-hidden="true" className={s.swatch} style={{ background: TONE[v.status] }} />
        <span className={`display ${s.label}`} style={{ color: TONE[v.status] }}>
          {v.status_label}
        </span>
        <span className={`mono ${s.confidence}`}>confidence {v.confidence}</span>
      </div>
      <div className={`mono ${s.meta}`}>{when}</div>
      {v.facts.length > 0 && (
        <ul className={s.facts}>
          {v.facts.map((f) => (
            <li key={f.text}>
              <span className={`mono ${s.stream}`}>{f.stream === "none" ? "no data" : f.stream}</span>
              {f.text}
            </li>
          ))}
        </ul>
      )}
      {v.conflicts.length > 0 && (
        <div role="note" className={s.conflict}>
          <span className={`display ${s.kicker}`}>Streams disagree</span>
          {v.conflicts.map((c) => (
            <p key={c}>{c}</p>
          ))}
        </div>
      )}
    </div>
  );
}

function ForecastRows({ days, gridFt, passFt, today }: { days: ForecastDay[]; gridFt: number; passFt: number; today: string }) {
  return (
    <div className={s.block}>
      <h4 className={`display ${s.sub}`}>Forecast for these days · at {gridFt.toLocaleString("en-US")} ft</h4>
      <div className={s.scroll}>
        <table className={`mono ${s.forecast}`}>
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col">High</th>
              <th scope="col">Low</th>
              <th scope="col">Precip</th>
              <th scope="col">Thunder</th>
              <th scope="col">Snow level</th>
              <th scope="col">New snow</th>
              <th scope="col">Gusts</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => {
              const atPass = d.snow_level_ft !== null && d.snow_level_ft <= passFt;
              return (
                <tr key={d.date}>
                  <th scope="row">{dayLabel(d.date, today)}</th>
                  <td>{d.high_f !== null ? `${d.high_f}°F` : "none"}</td>
                  <td>{d.low_f !== null ? `${d.low_f}°F` : "none"}</td>
                  <td>{d.precip_chance !== null ? `${d.precip_chance}%` : "none"}</td>
                  <td>{d.thunder_chance !== null ? `${d.thunder_chance}%` : "none"}</td>
                  <td className={atPass ? s.warmCell : undefined}>
                    {d.snow_level_ft !== null ? `${Math.round(d.snow_level_ft).toLocaleString("en-US")} ft` : "none"}
                  </td>
                  <td>{d.snowfall_in !== null ? `${d.snowfall_in} in` : "none"}</td>
                  <td>{d.gust_mph !== null ? `${d.gust_mph} mph` : "none"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Fire({ pass }: { pass: PlanPass }) {
  const fire = pass.fire;
  if (!fire) return null;
  const line = fireLine(fire);
  const near = fire.fire;
  return (
    <div className={`${s.block} ${s.note} ${fire.close ? s.warm : ""}`}>
      <h4 className={`display ${s.sub}`}>Fire and smoke</h4>
      {line && <p>{line}</p>}
      {near && (
        <div className={`mono ${s.meta}`}>
          {[
            "distance is a straight line to the perimeter's edge",
            near.updated ? `perimeter updated ${shortDate(near.updated)}` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
          {near.url && (
            <>
              {" · "}
              <a href={near.url} target="_blank" rel="noreferrer">
                official incident page
              </a>
            </>
          )}
        </div>
      )}
      {fire.smoke && (
        <>
          <p>Smoke overhead: {fire.smoke}</p>
          <div className={`mono ${s.meta}`}>
            {fire.smoke_date ? `satellite analysis of ${shortDate(fire.smoke_date)} · ` : ""}
            seen from above, so it can sit higher than the pass
          </div>
        </>
      )}
    </div>
  );
}

function Avalanche({ pass }: { pass: PlanPass }) {
  if (pass.avalanche === undefined) return null;
  const held = pass.avalanche;
  if (held === null) {
    return (
      <div className={s.block}>
        <h4 className={`display ${s.sub}`}>Avalanche danger · official</h4>
        <p>This pass is outside every avalanche center&apos;s forecast zones. No official rating exists for it.</p>
      </div>
    );
  }
  const { rating, expired } = held;
  const level = expired ? null : rating.level;
  const colors = level ? dangerScale[level] : null;
  const center = rating.center ?? "the avalanche center";
  return (
    <div className={s.block}>
      <h4 className={`display ${s.sub}`}>Avalanche danger · official</h4>
      <div className={s.rating}>
        <span
          className={`display ${s.ratingWord}`}
          style={colors ? { background: colors.fill, color: colors.ink } : undefined}
        >
          {expired ? "No current rating" : level ? `${level} ${rating.rating}` : "No rating issued"}
        </span>
        <span className={`mono ${s.meta}`}>
          {center}
          {rating.zone && rating.zone !== rating.center ? ` · ${rating.zone} zone` : ""}
        </span>
      </div>
      {!level && !expired && rating.off_season && <p>{center} lists this zone as off season.</p>}
      {expired && <p>The rating {center} issued for this zone has expired.</p>}
      {level && rating.travel_advice && (
        <figure className={s.quote}>
          <blockquote>{rating.travel_advice}</blockquote>
          <figcaption className="mono">Travel advice from {center}, quoted in full</figcaption>
        </figure>
      )}
      <div className={`mono ${s.meta}`}>
        {rating.link && (
          <a href={rating.link} target="_blank" rel="noreferrer">
            the full forecast at {center}
          </a>
        )}
        {rating.link ? " · " : ""}
        shown as issued; Snowline makes no avalanche assessment of its own
      </div>
    </div>
  );
}

function Roads({ roads }: { roads: RoadStatus[] }) {
  if (!roads.length) return null;
  const active = roads.filter((r) => r.active);
  const quiet = roads.filter((r) => !r.active);
  return (
    <div className={`${s.block} ${active.length ? `${s.note} ${s.warm}` : ""}`}>
      <h4 className={`display ${s.sub}`}>Road status</h4>
      {active.map((road) => (
        <div key={`${road.agency}-${road.road}-${road.location}`} className={s.road}>
          <p>
            {[road.road, road.location].filter(Boolean).join(" · ")}
            <span className={`mono ${s.meta}`}> {road.distance_mi} mi away in a straight line</span>
          </p>
          {road.lines.map((l) => (
            <p key={`${l.label}-${l.text}`}>
              {l.label && <span className={`mono ${s.stream}`}>{l.label}</span>}
              {l.code && <span className={`mono ${s.stream}`}>{l.code}</span>}
              <q>{l.text}</q>
            </p>
          ))}
          <div className={`mono ${s.meta}`}>
            as reported by {road.agency} ·{" "}
            <a href={road.agency_link} target="_blank" rel="noreferrer">
              live road conditions
            </a>
          </div>
        </div>
      ))}
      {quiet.length > 0 && (
        <p>
          No restrictions reported at {active.length ? "the other " : "the "}
          {quiet.length === 1 ? "nearest highway point" : `${quiet.length} nearest highway points`}
          {": "}
          {quiet.map((r) => r.location).join(", ")}.{" "}
          <span className={`mono ${s.meta}`}>
            {quiet[0].agency} ·{" "}
            <a href={quiet[0].agency_link} target="_blank" rel="noreferrer">
              live road conditions
            </a>
          </span>
        </p>
      )}
    </div>
  );
}

function Access({ pass }: { pass: PlanPass }) {
  const { trailhead, campground } = pass;
  if (!trailhead && !campground) return null;
  return (
    <div className={s.block}>
      <h4 className={`display ${s.sub}`}>Nearest start and nearest camp</h4>
      <dl className={s.access}>
        {trailhead && (
          <>
            <dt className="mono">trailhead</dt>
            <dd>
              {trailhead.name}
              <span className={`mono ${s.meta}`}>
                {" "}
                {trailhead.distance_mi} mi away in a straight line
                {trailhead.elevation_ft !== undefined ? ` · ${trailhead.elevation_ft.toLocaleString("en-US")} ft` : ""}
              </span>
            </dd>
          </>
        )}
        {campground && (
          <>
            <dt className="mono">campground</dt>
            <dd>
              {campground.name}
              <span className={`mono ${s.meta}`}>
                {" "}
                {campground.distance_mi} mi away in a straight line
                {campground.backcountry ? " · backcountry" : ""}
              </span>
            </dd>
          </>
        )}
      </dl>
    </div>
  );
}

function PassBlock({
  pass,
  today,
  open,
  onOpen,
}: {
  pass: PlanPass;
  today: string;
  open: boolean;
  onOpen: (pass: PlanPass) => void;
}) {
  return (
    <li>
      <article
        className={`${s.pass} ${open ? s.passOpen : ""}`}
        aria-label={`${pass.order}. ${pass.name}`}
        onClick={(e) => {
          // Links inside the block go where they say; everything else opens the pass.
          if (!(e.target as HTMLElement).closest("a, button")) onOpen(pass);
        }}
      >
        <button className={s.passHead} onClick={() => onOpen(pass)} aria-pressed={open}>
          <span className={`mono ${s.order}`} aria-hidden="true">
            {pass.order}
          </span>
          <span>
            <span className={`display ${s.passName}`}>{pass.name}</span>
            <span className={`mono ${s.meta}`}>
              {pass.elevation_ft.toLocaleString("en-US")} ft · {pass.lat.toFixed(2)}, {pass.lon.toFixed(2)}
            </span>
          </span>
          <span className={`display ${s.openHint}`}>{open ? "Open on the map" : "Open"}</span>
        </button>
        <p className={`mono ${s.why} ${pass.named ? "" : s.whyPicked}`}>{whyLine(pass.why)}</p>
        {pass.namesakes > 1 && (
          <p className={`mono ${s.why}`}>
            {pass.namesakes} passes in the index are named {pass.name}. This is the one at the elevation and
            position shown.
          </p>
        )}
        <Verdict pass={pass} today={today} />
        {pass.forecast && (
          <ForecastRows
            days={pass.forecast.days}
            gridFt={pass.forecast.grid_elevation_ft}
            passFt={pass.elevation_ft}
            today={today}
          />
        )}
        <Fire pass={pass} />
        <Avalanche pass={pass} />
        <Roads roads={pass.roads} />
        <Access pass={pass} />
      </article>
    </li>
  );
}

// One page for one trip: the summary, what could not be placed, then a block
// per pass in travel order. Code wrote every sentence from the pass files.
export default function TripPlanView({
  plan,
  empty,
  selected,
  onOpen,
}: {
  plan: TripPlan;
  empty: PlanReply["empty"];
  selected: string | null;
  onOpen: (pass: PlanPass) => void;
}) {
  const { trip, today } = plan;
  return (
    <div className={s.plan} aria-live="polite">
      {plan.passes.length > 0 && (
        <section aria-label="Summary" className={s.summary}>
          <h3 className={`display ${s.head}`}>Summary</h3>
          <ul>
            {plan.summary.map((l) => (
              <li key={l.text} className={l.warm ? s.warmLine : undefined} data-kind={l.kind}>
                {l.text}
              </li>
            ))}
          </ul>
        </section>
      )}

      {(trip.unplaced.length > 0 || empty) && (
        <section aria-label="What I could not place" className={s.unplaced}>
          <h3 className={`display ${s.head}`}>What I could not place</h3>
          {empty && <p>{EMPTY[empty]}</p>}
          {trip.unplaced.length > 0 && (
            <>
              <ul className={s.names}>
                {trip.unplaced.map((u) => (
                  <li key={u} className="mono">
                    {u}
                  </li>
                ))}
              </ul>
              <p className={`mono ${s.meta}`}>
                {trip.unplaced.length === 1 ? "This name is" : "These names are"} from your text and matched no
                pass on this plan, so nothing here describes {trip.unplaced.length === 1 ? "it" : "them"}.
              </p>
            </>
          )}
        </section>
      )}

      {plan.passes.length > 0 && (
        <section aria-label="Passes in travel order">
          <h3 className={`display ${s.head}`}>
            {plan.passes.length === 1 ? "The pass" : `${plan.passes.length} passes, in travel order`}
          </h3>
          <ol className={s.passes}>
            {plan.passes.map((p) => (
              <PassBlock key={p.slug} pass={p} today={today} open={selected === p.slug} onOpen={onOpen} />
            ))}
          </ol>
        </section>
      )}

      <p className={`mono ${s.foot}`}>
        Assembled by code from the same data the map shows. A language model read the text to find the passes
        and the dates, and wrote none of the words on this plan. Distances are straight lines. Snowline holds
        nothing on trail distance, travel time, difficulty, permits or water, so this plan says nothing about
        them. It describes; the decision is yours.
      </p>
    </div>
  );
}
