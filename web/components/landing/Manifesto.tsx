import s from "@/app/landing.module.css";
import { photos } from "@/lib/photos";
import Reveal from "./Reveal";

export default function Manifesto() {
  return (
    <section className={s.section}>
      <div className={`${s.wrap} ${s.manifesto}`}>
        <Reveal className={s.manifestoCopy}>
          <h2 className={`${s.display} ${s.h2}`}>The answer was never in one place.</h2>
          <p className={s.body}>
            Snow pillows, stream gauges, satellite passes and trip reports each hold a piece of
            it. We read all of them, every morning, and put them together pass by pass.
          </p>
          <p className={s.pullQuote}>
            A thru-hiker&apos;s &ldquo;fine&rdquo; and a first-timer&apos;s &ldquo;terrifying&rdquo;
            can describe the same snowfield. We calibrate for who is talking.
          </p>
        </Reveal>
        <Reveal delay={0.12}>
          <div className={s.collar}>
            <div className={`${s.collarInner} ${s.manifestoPhoto}`}>
              <img
                className={s.photo}
                src={photos.muir.src}
                alt={photos.muir.alt}
                width={photos.muir.width}
                height={photos.muir.height}
                loading="lazy"
              />
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
