import type { Metadata } from "next";
import s from "@/app/landing.module.css";
import FinalCta from "@/components/landing/FinalCta";
import PageHero from "@/components/landing/PageHero";
import Reveal from "@/components/landing/Reveal";
import PixelGlyph from "@/components/PixelGlyph";
import { landingAtBuild, passAtBuild } from "@/lib/buildData";
import { flame } from "@/lib/fire";
import { photos } from "@/lib/photos";
import { glyphBySource, glyphByStatus, road, tent } from "@/lib/pixel";

export const metadata: Metadata = {
  title: "How it works",
  description:
    "Snow sensors and stream gauges, read every morning against each pass's elevation, with forecasts, fire maps, road reports and official avalanche ratings beside the verdict.",
};

export default function HowItWorks() {
  const { counts, model } = landingAtBuild();
  const aasgard = passAtBuild("aasgard").statuses["2023-06-15"];
  const snowlineFact = aasgard?.facts.find((f) => f.text.includes("snowline"));
  const fires = counts.fires ?? 0;
  const places =
    counts.trailheads !== undefined && counts.campgrounds !== undefined
      ? `${counts.trailheads.toLocaleString()} trailheads and ${counts.campgrounds.toLocaleString()} campgrounds, each linked to the passes near it.`
      : "Trailheads and campgrounds, each linked to the passes near it.";

  // What is fused into the status and the confidence grade.
  const feeds = [
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
      strong: "Flow speaks to the crossing, and the afternoon swing shows melt in action.",
      blind: "A gauge sees the whole basin, not the one ford you care about.",
    },
  ];

  // What is shown beside the verdict, as issued, and never changes the status.
  const beside = [
    {
      glyph: glyphByStatus.snow_caution,
      name: "Forecasts",
      what: "Seven days ahead at pass elevation: temperature, snow level, new snow, wind and thunder.",
      strong: "The only reader that looks forward.",
      blind: "A forecast is a forecast. It is shown for today only, never for a past date.",
    },
    {
      glyph: flame,
      name: "Fire and smoke",
      what: fires
        ? `${fires.toLocaleString()} fires on the map this morning, the nearest one measured to each pass, and smoke mapped from satellite.`
        : "Fire perimeters, the nearest one measured to each pass, and smoke mapped from satellite.",
      strong: "Where a fire is, how big, and how far, in a straight line.",
      blind: "Smoke is seen from above, so it can sit higher than the pass. A perimeter more than a day old is not drawn.",
    },
    {
      glyph: glyphByStatus.not_recommended,
      name: "Avalanche centers",
      what: "The official rating for the forecast zone a pass sits in, quoted word for word with a link.",
      strong: "The official word, from the center that issues it. Never rewritten by us.",
      blind: "Many passes sit outside every forecast zone, and centers issue no rating off season. The page says which.",
    },
    {
      glyph: road,
      name: "Road reports",
      what: "Chain controls and pass reports on California and Washington highways, in the highway agency's own words.",
      strong: "Whether you can drive to the trailhead at all.",
      blind: "Agencies change them through the day. Oregon highways are not covered yet.",
    },
    {
      glyph: tent,
      name: "Getting there",
      what: places,
      strong: "The nearest trailheads, their parking, and where to camp.",
      blind: "Distances are straight lines, not trail miles.",
    },
    {
      glyph: glyphBySource.report,
      name: "Trip reports, coming",
      what: "People will be able to file a report from the pass in the app. Each one will be shown with its date.",
      strong: "Condition exactly where it matters: the chute, the cornice, the ford.",
      blind: "One person on one day. No report feeds a verdict today.",
    },
  ];

  const card = (st: (typeof feeds)[number], i: number) => (
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
  );

  return (
    <>
      <PageHero
        title="How it works"
        lede="Two kinds of instrument set every verdict, read each morning against the elevation of the pass. The official sources sit beside it, shown as issued."
        photo={photos.spring}
        position="50% 45%"
      />

      <section className={s.section}>
        <div className={s.wrap}>
          <Reveal>
            <h2 className={`${s.display} ${s.h2}`}>What sets the verdict.</h2>
            <p className={s.body} style={{ marginTop: 20 }}>
              The status on a pass comes from snow sensors, and from a snowline estimate when the
              sensors sit too low to see it. Stream gauges add the creek below and count toward
              the confidence grade. Nothing else is fused in.
            </p>
          </Reveal>
          <div className={s.streamGrid}>{feeds.map(card)}</div>
        </div>
      </section>

      <section className={s.section} style={{ paddingTop: 0 }}>
        <div className={s.wrap}>
          <Reveal>
            <h2 className={`${s.display} ${s.h2}`}>What stands beside it.</h2>
            <p className={s.body} style={{ marginTop: 20 }}>
              These inform the page and never change the status. Official words are quoted as
              issued, with a link to where they came from.
            </p>
          </Reveal>
          <div className={s.streamGrid}>{beside.map(card)}</div>
        </div>
      </section>

      <section className={s.section} style={{ paddingTop: 0 }}>
        <div className={s.wrap}>
          <Reveal>
            <h2 className={`${s.display} ${s.h2}`}>Old readings drop out. Blind sensors stay quiet.</h2>
            <p className={s.body} style={{ marginTop: 20 }}>
              A sensor reading is used for {model.max_age_days.sensor} days and then dropped, and
              the older it is, the lower the confidence grade. Among sensors that can see a pass,
              the ones nearer to it, in distance and in elevation, count for more. With one kind
              of instrument behind a status, confidence tops out at moderate. These are the live
              settings.
            </p>
          </Reveal>
          <div className={s.tiles}>
            <Reveal className={s.tile}>
              <span className={s.mono} style={{ color: "var(--muted)" }}>
                reading window
              </span>
              <span className={s.tileValue}>{model.max_age_days.sensor} days</span>
              <p>A sensor reading older than this is not used at all.</p>
            </Reveal>
            <Reveal className={s.tile} delay={0.06}>
              <span className={s.mono} style={{ color: "var(--muted)" }}>
                blind gap
              </span>
              <span className={s.tileValue}>{model.blind_gap_ft} ft</span>
              <p>A melted-out sensor farther than this below a pass cannot call it clear.</p>
            </Reveal>
            <Reveal className={s.tile} delay={0.12}>
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

      <FinalCta title="See the evidence for yourself." />
    </>
  );
}
