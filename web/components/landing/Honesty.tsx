import s from "@/app/landing.module.css";
import { ConfidenceDial } from "@/components/PassPanel";
import { passAtBuild } from "@/lib/buildData";
import { photos } from "@/lib/photos";
import Reveal from "./Reveal";

const DATE = "2023-06-15";

export default function Honesty() {
  const aasgard = passAtBuild("aasgard");
  const st = aasgard.statuses[DATE];
  const words = st?.facts.find((f) => f.text.includes("snowline")) ?? st?.facts[0];
  return (
    <section className={s.section}>
      <div className={`${s.wrap} ${s.honest}`}>
        <Reveal>
          <div className={s.collar}>
            <div className={`${s.collarInner} ${s.honestPhoto}`}>
              <img
                className={s.photo}
                src={photos.aasgard.src}
                alt={photos.aasgard.alt}
                width={photos.aasgard.width}
                height={photos.aasgard.height}
                loading="lazy"
              />
            </div>
          </div>
        </Reveal>
        <Reveal className={s.honestCopy} delay={0.1}>
          <h2 className={`${s.display} ${s.h2}`}>It tells you when it doesn&apos;t know.</h2>
          <p className={s.body}>
            The snow sensors near Aasgard Pass sit 3,600 feet below it. When they melt out, a
            simple average calls the pass clear in June. Ours estimates where the snowline has
            climbed to since, labels it as an estimate, and grades its own confidence.
          </p>
          {st && words && (
            <div className={s.modelVoice}>
              <span className={s.mono} style={{ color: "var(--sage)" }}>
                Aasgard Pass, {DATE}, in the model&apos;s words
              </span>
              <p>&ldquo;{words.text}&rdquo;</p>
              <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
                <span className={s.mono} style={{ color: "var(--alpenglow)" }}>
                  {st.status_label}
                </span>
                <ConfidenceDial level={st.confidence} score={st.confidence_score} />
              </div>
            </div>
          )}
        </Reveal>
      </div>
    </section>
  );
}
