import s from "@/app/landing.module.css";
import type { Photo } from "@/lib/photos";
import Reveal from "./Reveal";

// Inner-page hero: a full-bleed photo band with the page title settling in.
export default function PageHero({
  title,
  lede,
  photo,
  position = "50% 50%",
}: {
  title: string;
  lede: string;
  photo: Photo;
  position?: string;
}) {
  return (
    <section className={s.pageHero}>
      <img
        className={s.heroPhoto}
        src={photo.src}
        alt={photo.alt}
        width={photo.width}
        height={photo.height}
        fetchPriority="high"
        style={{ objectPosition: position }}
      />
      <div className={s.heroScrim} aria-hidden="true" />
      <Reveal className={`${s.wrap} ${s.pageHeroInner}`}>
        <h1 className={`${s.display} ${s.h1}`}>{title}</h1>
        <p className={s.lede}>{lede}</p>
      </Reveal>
    </section>
  );
}
