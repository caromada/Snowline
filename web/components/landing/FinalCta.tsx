import { ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import s from "@/app/landing.module.css";
import { MAP_PATH } from "@/lib/paths";
import { photos } from "@/lib/photos";
import Reveal from "./Reveal";

export default function FinalCta({ title = "See every pass, right now." }: { title?: string }) {
  return (
    <section className={s.final}>
      <img src={photos.whitney.src} alt={photos.whitney.alt} width={photos.whitney.width} height={photos.whitney.height} loading="lazy" />
      <Reveal className={`${s.wrap} ${s.finalInner}`}>
        <h2 className={`${s.display} ${s.h2}`}>{title}</h2>
        <a href={MAP_PATH} className={`${s.btn} ${s.btnPrimary}`}>
          Open the map
          <span className={s.btnIcon} aria-hidden="true">
            <ArrowUpRight size={15} weight="bold" />
          </span>
        </a>
      </Reveal>
    </section>
  );
}
