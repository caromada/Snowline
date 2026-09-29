import { ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import s from "@/app/landing.module.css";
import changes from "@/lib/changelog.json";
import Reveal from "./Reveal";
import Signpost from "./Signpost";

const REPO = "https://github.com/caromada/Snowline/commits/main";

function fmt(date: string) {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

// What shipped lately, straight from the commit log. Mile markers on the
// trail: a real, dated record that the product is alive.
export default function Changelog() {
  return (
    <section className={s.section} id="shipped">
      <div className={`${s.wrap} ${s.changelog}`}>
        <Reveal>
          <Signpost label="Recently shipped" />
          <h2 className={`${s.display} ${s.h2}`}>Built in the open, shipped most days.</h2>
          <p className={s.body}>
            Every change is public. The data refreshes every morning; the product moves almost as
            often.
          </p>
          <a href={REPO} className={`${s.btn} ${s.btnGhost}`} style={{ marginTop: 28 }} rel="noreferrer">
            Full history
            <span className={s.btnIcon} aria-hidden="true">
              <ArrowUpRight size={14} weight="bold" />
            </span>
          </a>
        </Reveal>
        <ol className={s.changeList}>
          {changes.map((c, i) => (
            <Reveal as="li" key={c.date + c.title} className={s.changeItem} delay={i * 0.06}>
              <span className={s.changeMark} aria-hidden="true" />
              <time className={`${s.mono} ${s.changeDate}`} dateTime={c.date}>
                {fmt(c.date)}
              </time>
              <span className={s.changeTitle}>{c.title}</span>
            </Reveal>
          ))}
        </ol>
      </div>
    </section>
  );
}
