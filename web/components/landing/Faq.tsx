import s from "@/app/landing.module.css";
import { brand } from "@/lib/brand";
import Reveal from "./Reveal";

const QA = [
  {
    q: "Is it free?",
    a: "Yes. Every pass, every season of history and offline saving are free while we build. A paid tier with alerts and forecasts comes later, and the core map stays free.",
  },
  {
    q: "Can I rely on it for safety?",
    a: `No, and no single source should carry that weight. ${brand.name} is a planning aid that shows you what the sensors, satellites and recent parties saw, and how sure it is. Check official sources, carry the right gear, and make your own call at the base of the climb.`,
  },
  {
    q: "Does it cover avalanches?",
    a: "It is not an avalanche forecast. In winter we will show the official danger rating from your region's avalanche center, word for word with a link, never our own assessment.",
  },
  {
    q: "Where does the data come from?",
    a: "Hundreds of snow sensors and stream gauges across the three states, read every morning, plus trip reports and satellite snow cover. Every sentence on a pass links back to the reading or the report behind it.",
  },
  {
    q: "How fresh is it?",
    a: "Sensor data refreshes every morning. Each fact shows how old it is, and older evidence counts for less.",
  },
];

export default function Faq() {
  return (
    <section className={s.section} id="faq">
      <div className={`${s.wrap} ${s.faq}`}>
        <Reveal>
          <h2 className={`${s.display} ${s.h2}`}>Questions from the trailhead.</h2>
        </Reveal>
        <Reveal className={s.faqList} delay={0.08}>
          {QA.map(({ q, a }) => (
            <details key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
