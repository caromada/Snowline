import type { Metadata } from "next";
import s from "@/app/landing.module.css";
import FinalCta from "@/components/landing/FinalCta";
import PageHero from "@/components/landing/PageHero";
import Reveal from "@/components/landing/Reveal";
import { brand } from "@/lib/brand";
import Pic from "@/components/landing/Pic";
import { photos } from "@/lib/photos";

export const metadata: Metadata = {
  title: "About",
  description: `Why ${brand.name} exists and the rules it is built on.`,
};

const PRINCIPLES = [
  {
    title: "Show the work",
    body: "Every sentence on a pass traces back to a reading you can open: which sensor or gauge, what it measured, and when. If you cannot check it, we should not say it.",
  },
  {
    title: "Say when we don't know",
    body: "Confidence is graded on every pass. An older reading lowers it, a reading past its window is dropped, and when a sensor cannot see a pass we say that instead of guessing.",
  },
  {
    title: "Describe, never decide",
    body: "We tell you what the evidence shows. Whether you go is your call, made at the base of the climb with your eyes and your partners.",
  },
  {
    title: "Official means official",
    body: "Avalanche ratings and road restrictions come from the centers and agencies that issue them, word for word with a link. We never write our own.",
  },
];

export default function About() {
  return (
    <>
      <PageHero
        title="Why this exists"
        lede="Because the answer to “can I get over the pass this weekend?” was scattered across six sites and a forum thread."
        photo={photos.summer}
        position="50% 40%"
      />
      <section className={s.section}>
        <div className={`${s.wrap} ${s.manifesto}`}>
          <Reveal className={s.manifestoCopy}>
            <h2 className={`${s.display} ${s.h2}`}>Built at the trailhead, for the trailhead.</h2>
            <p className={s.body}>
              {brand.name} started with one backpacker&apos;s question every spring in the
              Eastern Sierra: is there still snow on the pass, and do I need an ice axe? The
              answer lived in a snow sensor in a meadow, a stream gauge in the canyon, a forecast
              written for a town an hour away, and a road report on a site of its own.
            </p>
            <p className={s.body}>
              So we built one place that reads the instruments every morning, sets the official
              sources beside them, and shows its work. It now covers{" "}
              {brand.region.replaceAll(" · ", ", ")}. Trip reports come next: people will be
              able to file one from the pass in the app, and each will be shown with its date.
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <div className={s.collar}>
              <div className={`${s.collarInner} ${s.manifestoPhoto}`}>
                <Pic photo={photos.fall} className={s.photo} sizes="(max-width: 900px) 100vw, 50vw" />
              </div>
            </div>
          </Reveal>
        </div>
      </section>
      <section className={s.section} style={{ paddingTop: 0 }}>
        <div className={s.wrap}>
          <Reveal>
            <h2 className={`${s.display} ${s.h2}`}>The rules we build by.</h2>
          </Reveal>
          <div className={s.principles}>
            {PRINCIPLES.map((p, i) => (
              <Reveal key={p.title} className={s.principle} delay={i * 0.05}>
                <h3 className={`${s.display} ${s.h3}`}>{p.title}</h3>
                <p className={s.body}>{p.body}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
      <FinalCta />
    </>
  );
}
