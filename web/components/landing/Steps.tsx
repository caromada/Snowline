import s from "@/app/landing.module.css";
import { photos } from "@/lib/photos";
import Pic from "./Pic";
import Reveal from "./Reveal";

const STEPS = [
  {
    n: "1",
    title: "Pick your pass",
    body: "Search any of 1,252 passes, or tap locate and see the five closest to where you stand.",
  },
  {
    n: "2",
    title: "Read the verdict",
    body: "One status, one confidence grade, and every sentence traceable to the sensor, the satellite or the person who was there.",
  },
  {
    n: "3",
    title: "Save it for the trailhead",
    body: "Tap the tent. The pass, its readings and the map around it stay on your phone where there is no signal.",
  },
];

export default function Steps() {
  return (
    <section className={s.section} id="how">
      <div className={`${s.wrap} ${s.steps}`}>
        <Reveal>
          <div className={s.collar}>
            <div className={`${s.collarInner} ${s.stepsPhoto}`}>
              <Pic photo={photos.dayhike} className={s.photo} sizes="(max-width: 900px) 100vw, 45vw" />
            </div>
          </div>
        </Reveal>
        <div>
          <Reveal>
            <h2 className={`${s.display} ${s.h2}`}>How it works</h2>
          </Reveal>
          <ol className={s.stepList}>
            {STEPS.map((st, i) => (
              <Reveal key={st.n} as="li" className={s.step} delay={0.1 + i * 0.1}>
                <span className={s.stepNum}>{st.n}</span>
                <div>
                  <h3 className={`${s.display} ${s.h3}`}>{st.title}</h3>
                  <p className={s.body}>{st.body}</p>
                </div>
              </Reveal>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
