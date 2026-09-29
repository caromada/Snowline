import { ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import s from "@/app/landing.module.css";
import { MAP_PATH } from "@/lib/paths";
import Reveal from "./Reveal";

const ROWS = [
  {
    title: "Read the verdict, and where it came from.",
    body: "One status and a confidence grade per pass. Every sentence links to the sensor curve, the satellite pass or the exact quote from someone who was just there. When the streams disagree, it says so.",
    shot: "/landing/app-phone.webp",
    alt: "Glen Pass in the app: status, confidence and evidence",
    href: `${MAP_PATH}?pass=glen&date=2023-06-15`,
    cta: "See Glen Pass",
  },
  {
    title: "The nearest passes, from where you stand.",
    body: "One tap drops your position and lists the five closest passes with their conditions and distance. Standing at a junction with a choice to make, this is the whole point.",
    shot: "/landing/phone-nearby.webp",
    alt: "Nearest passes from Onion Valley",
    href: MAP_PATH,
    cta: "Open the map",
  },
  {
    title: "Works where the signal doesn't.",
    body: "Tap the tent on any pass and it comes with you: the verdict, the readings and the map around it, stored on your phone for the trailhead. Install it to your home screen and it opens full screen.",
    shot: "/landing/phone-offline.webp",
    alt: "Glen Pass saved for offline",
    href: "/app/",
    cta: "Get the app",
  },
];

export default function FeatureRows() {
  return (
    <section className={s.section} id="features">
      <div className={`${s.wrap} ${s.rows}`}>
        {ROWS.map((r, i) => (
          <Reveal key={r.title} className={`${s.featureRow} ${i % 2 ? s.featureRowFlip : ""}`}>
            <div className={s.featureCopy}>
              <h2 className={`${s.display} ${s.h2}`}>{r.title}</h2>
              <p className={s.body}>{r.body}</p>
              <a href={r.href} className={`${s.btn} ${s.btnGhost}`}>
                {r.cta}
                <span className={s.btnIcon} aria-hidden="true">
                  <ArrowUpRight size={14} weight="bold" />
                </span>
              </a>
            </div>
            <div className={s.featureShot}>
              <img src={r.shot} alt={r.alt} width={780} height={1688} loading="lazy" />
            </div>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
