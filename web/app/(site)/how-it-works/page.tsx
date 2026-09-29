import type { Metadata } from "next";
import s from "@/app/landing.module.css";
import FinalCta from "@/components/landing/FinalCta";
import PageHero from "@/components/landing/PageHero";
import Reveal from "@/components/landing/Reveal";
import PixelGlyph from "@/components/PixelGlyph";
import { landingAtBuild, passAtBuild } from "@/lib/buildData";
import { photos } from "@/lib/photos";
import { glyphBySource } from "@/lib/pixel";

export const metadata: Metadata = {
  title: "How it works",
  description: "Four evidence streams, weighted by trust and freshness, fused into an honest answer for every pass.",
};

const FIELD_NAMES: Record<string, string> = {
  location: "Which pass",
  date_observed: "Date seen",
  snow_condition: "Snow",
  traction_used: "Traction",
  crossing_condition: "Crossings",
  exposure_comfort: "How it felt",
  reporter_register: "Who is talking",
  quote_span: "Exact quote",
};

const pct = (x: number) => `${Math.round(x * 1000) / 10}%`;

export default function HowItWorks() {
  const { counts, model } = landingAtBuild();
  const aasgard = passAtBuild("aasgard").statuses["2023-06-15"];
  const snowlineFact = aasgard?.facts.find((f) => f.text.includes("snowline"));

  const streams = [
    {
      glyph: glyphBySource.sensor,
      name: "Snow sensors",
      what: `${counts.snow_stations} snow sensors weighing the snowpack every day.`,
      strong: "Precise, daily, and hard to argue with.",
      blind: "They sit in flats, often thousands of feet below the passes that matter.",
    },
    {
      glyph: glyphBySource.gauge,
      name: "Stream gauges",
      what: `${counts.stream_gauges} stream gauges on the creeks below the passes.`,
      strong: "Flow answers the crossing question, and the afternoon swing shows melt in action.",
      blind: "A gauge sees the whole basin, not the one ford you care about.",
    },
    {
      glyph: glyphBySource.satellite,
      name: "Satellite",
      what: "Fractional snow cover sampled over each pass bowl, with cloud gaps tracked.",
      strong: "Sees every pass, everywhere, at once.",
      blind: "Sees cover, not condition, and clouds hide it. Modeled from sensors today, and labeled so.",
    },
    {
      glyph: glyphBySource.report,
      name: "Trip reports",
      what: "Posts from people who were just there, read by AI into structured evidence.",
      strong: "Condition exactly where you care: the chute, the cornice, the ford.",
      blind: "Noisy and biased by who is talking. We calibrate for that, and keep the quote.",
    },
  ];

  return (
    <>
      <PageHero
        title="How it works"
        lede="Four streams of evidence, weighted by how far each can be trusted and how fresh it is, fused into one answer per pass."
        photo={photos.spring}
        position="50% 45%"
      />

      <section className={s.section}>
        <div className={s.wrap}>
          <Reveal>
            <h2 className={`${s.display} ${s.h2}`}>Every stream sees something the others miss.</h2>
          </Reveal>
          <div className={s.streamGrid}>
            {streams.map((st, i) => (
              <Reveal key={st.name} className={s.streamCard} delay={(i % 2) * 0.08}>
                <div className={s.cellHead}>
                  <PixelGlyph sprite={st.glyph} scale={2} title="" />
                  <h3 className={`${s.display} ${s.h3}`}>{st.name}</h3>
                </div>
                <p className={s.body}>{st.what}</p>
                <dl>
                  <dt>Good at</dt>
                  <dd>{st.strong}</dd>
                  <dt>Blind spot</dt>
                  <dd>{st.blind}</dd>
                </dl>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className={s.section} style={{ paddingTop: 0 }}>
        <div className={s.wrap}>
          <Reveal>
            <h2 className={`${s.display} ${s.h2}`}>Trust decays. Disagreement is said out loud.</h2>
            <p className={s.body} style={{ marginTop: 20 }}>
              Each stream starts with a trust weight and loses half its pull every few days. When
              two streams disagree by more than a full level, the panel says so and the
              confidence grade drops. These are the live settings.
            </p>
          </Reveal>
          <div className={s.tiles}>
            {(["sensor", "satellite", "report"] as const).map((k, i) => (
              <Reveal key={k} className={s.tile} delay={i * 0.06}>
                <span className={s.mono} style={{ color: "var(--muted)" }}>
                  {k === "report" ? "trip reports" : k === "sensor" ? "sensors" : "satellite"}
                </span>
                <span className={s.tileValue}>{model.priors[k].toFixed(2)}</span>
                <p>
                  Starting trust. Half-life {model.half_life_days[k]} days; ignored after{" "}
                  {model.max_age_days[k]}.
                </p>
              </Reveal>
            ))}
            <Reveal className={s.tile} delay={0.18}>
              <span className={s.mono} style={{ color: "var(--muted)" }}>
                snowline climb
              </span>
              <span className={s.tileValue}>{model.snowline_rise_ft_per_day} ft/day</span>
              <p>Conservative on purpose: a slower climb predicts snow up high for longer.</p>
            </Reveal>
          </div>
        </div>
      </section>

      <section className={s.section} style={{ paddingTop: 0 }}>
        <div className={`${s.wrap} ${s.honest}`}>
          <Reveal>
            <div className={s.collar}>
              <div className={s.collarInner}>
                <img
                  src="/landing/app-desktop.webp"
                  alt="The map in 3D over the Enchantments with Aasgard Pass selected"
                  width={1440}
                  height={900}
                  loading="lazy"
                  style={{ display: "block", width: "100%", height: "auto" }}
                />
              </div>
            </div>
          </Reveal>
          <Reveal className={s.honestCopy} delay={0.1}>
            <h2 className={`${s.display} ${s.h2}`}>A bare sensor proves nothing.</h2>
            <p className={s.body}>
              Snow sensors often sit far below the passes. A sensor that still holds snow says the
              pass holds more. One that has melted out only says the snowline has climbed past it.
              So a melted-out sensor more than {model.blind_gap_ft} feet below a pass never votes
              &ldquo;clear.&rdquo; It feeds a snowline estimate instead.
            </p>
            {snowlineFact && (
              <div className={s.modelVoice}>
                <span className={s.mono} style={{ color: "var(--muted)" }}>
                  Aasgard Pass, June 15, 2023
                </span>
                <p>&ldquo;{snowlineFact.text}&rdquo;</p>
              </div>
            )}
          </Reveal>
        </div>
      </section>

      {model.eval && (
        <section className={s.section} style={{ paddingTop: 0 }}>
          <div className={s.wrap}>
            <Reveal>
              <h2 className={`${s.display} ${s.h2}`}>
                One honest number: {pct(model.eval.overall)}.
              </h2>
              <p className={s.body} style={{ marginTop: 20 }}>
                How often the AI reads a trip report the way a careful human does, scored field by
                field against {model.eval.posts} hand-labeled posts it never saw. The two
                subjective fields score lowest, and we show them anyway.
              </p>
            </Reveal>
            <div className={s.tiles}>
              {Object.entries(model.eval.fields).map(([k, v], i) => (
                <Reveal key={k} className={s.tile} delay={(i % 4) * 0.05}>
                  <span className={s.mono} style={{ color: "var(--muted)" }}>
                    {FIELD_NAMES[k] ?? k}
                  </span>
                  <span className={s.tileValue} style={v < 0.75 ? { color: "var(--alpenglow)" } : undefined}>
                    {pct(v)}
                  </span>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}

      <FinalCta title="See the evidence for yourself." />
    </>
  );
}
