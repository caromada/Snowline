import s from "@/app/landing.module.css";
import { photos } from "@/lib/photos";
import Pic from "./Pic";
import Reveal from "./Reveal";

const WHO = [
  { name: "Day hikers", photo: photos.dayhike, line: "Is the loop snow-free yet, and is the creek crossable?" },
  { name: "Backpackers", photo: photos.summer, line: "Which passes on the route still hold snow, and how deep?" },
  { name: "Thru-hikers", photo: photos.thru, line: "The whole crest at once: what is melting out ahead of you." },
  { name: "Climbers", photo: photos.aasgard, line: "Is the approach in, and what did the last party find in the chute?" },
  { name: "Skiers", photo: photos.winter, line: "Fresh snow, the official danger rating, and whether you can drive there." },
];

export default function Audience() {
  return (
    <section className={s.section} id="who">
      <div className={s.wrap}>
        <Reveal className={s.seasonsHead}>
          <h2 className={`${s.display} ${s.h2}`}>Built for everyone who goes up.</h2>
          <p className={s.body}>
            Different trips, one question. Snowline answers it for the pass in front of you.
          </p>
        </Reveal>
        <div className={s.seasonRail}>
          {WHO.map((w, i) => (
            <Reveal key={w.name} as="article" className={s.season} delay={i * 0.06}>
              <Pic photo={w.photo} sizes="(max-width: 900px) 80vw, 30vw" />
              <h3 className={s.railTitle}>{w.name}</h3>
              <p style={{ color: "color-mix(in srgb, var(--ink) 88%, transparent)" }}>{w.line}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
