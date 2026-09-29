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
    a: `No, and no single source should carry that weight. ${brand.name} is a planning aid that shows you what snow sensors and stream gauges measured, what the official sources report, and how sure it is. Check official sources, carry the right gear, and make your own call at the base of the climb.`,
  },
  {
    q: "Does it cover avalanches?",
    a: "It is not an avalanche forecast. Where a pass sits inside an avalanche center's forecast zone, it shows that center's official rating, word for word with a link, and says so when no rating has been issued. It never makes an assessment of its own.",
  },
  {
    q: "Where does the data come from?",
    a: "Hundreds of snow sensors and stream gauges across the three states, read every morning. Beside the verdict sit seven-day forecasts, fire maps, road reports and official avalanche ratings, each shown as issued. Trip reports are coming: people will be able to file one from the pass in the app, and each will be shown with its date.",
  },
  {
    q: "How fresh is it?",
    a: "Sensor data refreshes every morning. Each fact shows how old it is. An older reading lowers the confidence grade, and one more than ten days old is not used.",
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
