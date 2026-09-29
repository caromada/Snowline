import type { Metadata } from "next";
import s from "@/app/landing.module.css";
import FinalCta from "@/components/landing/FinalCta";
import Reveal from "@/components/landing/Reveal";
import Pic from "@/components/landing/Pic";
import { SEASONS } from "@/components/landing/SeasonsRail";

export const metadata: Metadata = {
  title: "Seasons",
  description: "Snowline in spring, fire and smoke in summer, first snow in fall, avalanche danger in winter.",
};

const DETAIL: Record<string, { lede: string; items: [string, string][] }> = {
  Spring: {
    lede: "The melt season. The question is simple: is there still snow on the pass, and how much?",
    items: [
      ["Snowline by pass", "Sensor readings plus a melt-out estimate for passes high above the nearest sensor."],
      ["Traction and crossings", "What recent parties used, and how deep the fords ran."],
      ["The melt pulse", "Afternoon swings in creek flow show how fast the snow is coming off."],
    ],
  },
  Summer: {
    lede: "Fire season on the West Coast. The question becomes whether the route is burning, smoked in, or about to storm.",
    items: [
      ["Fire perimeters", "Active fires near each pass from national interagency data, with a link to the closure."],
      ["Smoke from above", "Satellite-mapped smoke over your route, by density."],
      ["Storms at elevation", "Thunderstorm odds at pass height, seven days out."],
    ],
  },
  Fall: {
    lede: "Shoulder season. The first storm can close a pass that was bare the week before.",
    items: [
      ["First snow", "New snow at the sensors, read against each pass's elevation."],
      ["Weekend snow level", "Where rain turns to snow in the forecast, compared with the pass."],
      ["Road closures", "Highway passes like Tioga and Sonora close for the season."],
    ],
  },
  Winter: {
    lede: "Backcountry season. Fresh snow, official avalanche danger, and whether you can drive to the trailhead at all.",
    items: [
      ["Fresh snow", "24 and 72 hour new-snow totals from the nearest stations."],
      ["Avalanche danger", "The official rating from your avalanche center, word for word, with a link. Never ours."],
      ["Chain controls", "Chain requirements on the highway passes you drive to get there."],
    ],
  },
};

export default function Seasons() {
  return (
    <>
      <section className={`${s.pageHero} ${s.heroDark}`} style={{ minHeight: "56dvh" }}>
        <div className={s.heroScrim} aria-hidden="true" />
        <Reveal className={`${s.wrap} ${s.pageHeroInner}`}>
          <h1 className={`${s.display} ${s.h1}`}>Every season, one question.</h1>
          <p className={s.lede}>
            Can I get there, and what will I find? The evidence changes with the calendar. The
            honesty doesn&apos;t.
          </p>
        </Reveal>
      </section>
      {SEASONS.map((season) => {
        const d = DETAIL[season.name];
        return (
          <section key={season.name} className={`${s.chapter} ${s.heroDark}`} id={season.name.toLowerCase()}>
            <Pic photo={season.photo} />
            <div className={`${s.wrap} ${s.chapterInner}`}>
              <Reveal>
                <span className={`${s.seasonTag} ${season.live ? s.tagLive : s.tagSoon}`}>
                  {season.live ? "Live now" : "Coming"}
                </span>
                <h2 className={`${s.display} ${s.h1}`} style={{ marginTop: 16 }}>
                  {season.name}
                </h2>
                <p className={s.lede} style={{ marginTop: 18 }}>
                  {d.lede}
                </p>
              </Reveal>
              <Reveal delay={0.1}>
                <ul className={s.chapterList}>
                  {d.items.map(([t, body]) => (
                    <li key={t}>
                      <strong>{t}</strong>
                      <span>{body}</span>
                    </li>
                  ))}
                </ul>
              </Reveal>
            </div>
          </section>
        );
      })}
      <FinalCta />
    </>
  );
}
