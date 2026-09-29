import { Backpack, Boot, Footprints, Mountains, PersonSimpleSki } from "@phosphor-icons/react/dist/ssr";
import type { Icon } from "@phosphor-icons/react";
import s from "@/app/landing.module.css";
import { type Photo, photos } from "@/lib/photos";
import Pic from "./Pic";
import Reveal from "./Reveal";
import Signpost from "./Signpost";

const WHO: { name: string; photo: Photo; line: string; icon: Icon }[] = [
  { name: "Day hikers", photo: photos.dayhike, icon: Boot, line: "Is the loop snow-free yet, and is the creek crossable?" },
  { name: "Backpackers", photo: photos.summer, icon: Backpack, line: "Which passes on the route still hold snow, and how deep?" },
  { name: "Thru-hikers", photo: photos.thru, icon: Footprints, line: "The whole crest at once: what is melting out ahead of you." },
  { name: "Climbers", photo: photos.aasgard, icon: Mountains, line: "Is the approach in, and what did the last party find in the chute?" },
  { name: "Skiers", photo: photos.winter, icon: PersonSimpleSki, line: "Fresh snow, the official danger rating, and whether you can drive there." },
];

export default function Audience() {
  return (
    <section className={s.section} id="who">
      <div className={s.wrap}>
        <Reveal className={s.seasonsHead}>
          <Signpost label="Who it is for" />
          <h2 className={`${s.display} ${s.h2}`}>Same mountain. Different question.</h2>
          <p className={s.body}>
            Different trips, one worry. Snowline answers it for the pass in front of you.
          </p>
        </Reveal>
        <div className={s.seasonRail}>
          {WHO.map((w, i) => (
            <Reveal key={w.name} as="article" className={`${s.season} ${s.who}`} delay={i * 0.06}>
              <Pic photo={w.photo} sizes="(max-width: 900px) 80vw, 30vw" />
              <div className={s.whoHead}>
                <span className={s.whoIcon} aria-hidden="true">
                  <w.icon size={22} weight="fill" />
                </span>
                <h3 className={s.railTitle}>{w.name}</h3>
              </div>
              <p style={{ color: "color-mix(in srgb, var(--ink) 88%, transparent)" }}>{w.line}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
