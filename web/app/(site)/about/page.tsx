import type { Metadata } from "next";
import s from "@/app/landing.module.css";
import FinalCta from "@/components/landing/FinalCta";
import PageHero from "@/components/landing/PageHero";
import Reveal from "@/components/landing/Reveal";
import { brand } from "@/lib/brand";
import { photos } from "@/lib/photos";

export const metadata: Metadata = {
  title: "About",
  description: `Why ${brand.name} exists and the rules it is built on.`,
};

const PRINCIPLES = [
  {
    title: "Show the work",
    body: "Every sentence on a pass traces back to the sensor reading, the satellite pass or the exact words of the person who was there. If you cannot check it, we should not say it.",
  },
  {
    title: "Say when we don't know",
    body: "Confidence is graded on every pass. Stale evidence counts for less, disagreement costs confidence, and when a sensor cannot see a pass we say that instead of guessing.",
  },
  {
    title: "Describe, never decide",
    body: "We tell you what the evidence shows. Whether you go is your call, made at the base of the climb with your eyes and your partners.",
  },
  {
    title: "Official means official",
    body: "Avalanche danger, fire closures and road restrictions come from the agencies that issue them, word for word with a link. We never write our own.",
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
              answer lived in a snow sensor in a meadow, a stream gauge in the canyon, a satellite
              pass two days old, and a forum post from someone whose idea of &ldquo;fine&rdquo; you
              had to guess.
            </p>
            <p className={s.body}>
              So we built one place that reads all of it every morning, weighs it honestly, and
              shows its work. It now covers {brand.region.replaceAll(" · ", ", ")}, and it gets
              better with every report people share.
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <div className={s.collar}>
              <div className={`${s.collarInner} ${s.manifestoPhoto}`}>
                <img className={s.photo} src={photos.fall.src} alt={photos.fall.alt} width={photos.fall.width} height={photos.fall.height} loading="lazy" />
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
