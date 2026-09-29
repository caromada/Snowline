import s from "@/app/landing.module.css";
import { type Photo, photos } from "@/lib/photos";
import Pic from "./Pic";
import Reveal from "./Reveal";

export type Season = {
  name: string;
  photo: Photo;
  live: boolean;
  lines: string[];
};

export const SEASONS: Season[] = [
  {
    name: "Spring",
    photo: photos.spring,
    live: true,
    lines: ["Snowline and melt-out by pass", "Snow water at the nearest sensors", "Creek flow and melt pulse"],
  },
  {
    name: "Summer",
    photo: photos.summer,
    live: true,
    lines: ["Nearest active fire to each pass", "Smoke mapped from satellite", "Thunderstorm chance at pass elevation"],
  },
  {
    name: "Fall",
    photo: photos.fall,
    live: false,
    lines: ["First snow at the nearest sensors", "Snow level in the seven-day forecast", "Highway pass closures"],
  },
  {
    name: "Winter",
    photo: photos.winter,
    live: true,
    lines: ["New snow at the nearest sensors", "Official avalanche rating by zone", "Chain controls on highway passes"],
  },
];

export default function SeasonsRail() {
  return (
    <section className={s.section} id="seasons">
      <div className={s.wrap}>
        <Reveal className={s.seasonsHead}>
          <h2 className={`${s.display} ${s.h2}`}>Built for every season.</h2>
          <p className={s.body}>
            The question changes with the calendar. The answer comes from the same place: what
            the instruments measured this morning and what the official sources report.
          </p>
        </Reveal>
        <div className={s.seasonRail}>
          {SEASONS.map((season, i) => (
            <Reveal key={season.name} as="article" className={s.season} delay={i * 0.08}>
              <Pic photo={season.photo} sizes="(max-width: 900px) 80vw, 25vw" />
              <span className={`${s.seasonTag} ${season.live ? s.tagLive : s.tagSoon}`}>
                {season.live ? "Live now" : "Coming"}
              </span>
              <h3 className={s.railTitle}>{season.name}</h3>
              <ul>
                {season.lines.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
