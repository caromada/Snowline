import s from "@/app/landing.module.css";
import PixelGlyph from "@/components/PixelGlyph";
import { landingAtBuild, passAtBuild } from "@/lib/buildData";
import { photos } from "@/lib/photos";
import { glyphBySource } from "@/lib/pixel";
import CountUp from "./CountUp";
import Reveal from "./Reveal";

export default function Streams() {
  const { counts } = landingAtBuild();
  const glen = passAtBuild("glen").statuses["2023-06-15"];
  const conflict = glen?.conflicts[0];
  return (
    <section className={s.section} id="streams">
      <div className={s.wrap}>
        <Reveal>
          <h2 className={`${s.display} ${s.h2}`}>Four streams. One honest answer.</h2>
          <p className={s.body} style={{ marginTop: 20 }}>
            Sensors are precise but sparse. Satellites see everything but not the ice underfoot.
            People report exactly where it matters, with their own bias. Each covers what the
            others miss.
          </p>
        </Reveal>
        <div className={s.bento}>
          <Reveal className={`${s.cell} ${s.cellFusion}`}>
            <div className={s.cellHead}>
              <span className={s.mono} style={{ color: "var(--alpenglow)" }}>
                Fusion
              </span>
            </div>
            <div style={{ display: "grid", gap: 16 }}>
              <CountUp value={counts.passes} className={s.count} />
              <p className={s.h3 + " " + s.display}>passes, re-read every morning</p>
              <p className={s.body}>
                Each stream is weighted by how much it can be trusted and how fresh it is. Where
                they disagree, the panel says so out loud instead of averaging it away, and the
                confidence grade drops.
              </p>
              {conflict && (
                <div className={s.disagree}>
                  <p className={s.mono} style={{ color: "var(--alpenglow)" }}>
                    Streams disagree: Glen Pass, June 15, 2023
                  </p>
                  <p className={s.body}>{conflict}</p>
                </div>
              )}
            </div>
          </Reveal>
          <Reveal className={`${s.cell} ${s.cellSensors}`} delay={0.06}>
            <div className={s.cellHead}>
              <PixelGlyph sprite={glyphBySource.sensor} scale={2} title="" />
              <span className={s.mono}>Snow sensors</span>
            </div>
            <div>
              <CountUp value={counts.snow_stations} className={s.count} />
              <p className={s.body}>SNOTEL stations and snow pillows weighing the snowpack daily.</p>
            </div>
          </Reveal>
          <Reveal className={`${s.cell} ${s.cellGauges}`} delay={0.12}>
            <div className={s.cellHead}>
              <PixelGlyph sprite={glyphBySource.gauge} scale={2} title="" />
              <span className={s.mono}>Stream gauges</span>
            </div>
            <div>
              <CountUp value={counts.stream_gauges} className={s.count} />
              <p className={s.body}>
                Flow tells you the crossing. The afternoon swing tells you how fast snow is melting.
              </p>
            </div>
          </Reveal>
          <Reveal className={`${s.cell} ${s.cellSatellite}`} delay={0.06}>
            <img src={photos.smoke.src} alt="" width={photos.smoke.width} height={photos.smoke.height} loading="lazy" />
            <div className={s.cellHead}>
              <PixelGlyph sprite={glyphBySource.satellite} scale={2} title="" />
              <span className={s.mono}>Satellite</span>
            </div>
            <p className={s.body}>
              Snow cover over each pass bowl, with cloud gaps accounted for. Modeled from sensors
              today and labeled that way until live scenes land.
            </p>
          </Reveal>
          <Reveal className={`${s.cell} ${s.cellReports}`} delay={0.12}>
            <div className={s.cellHead}>
              <PixelGlyph sprite={glyphBySource.report} scale={2} title="" />
              <span className={s.mono}>Trip reports</span>
            </div>
            <p className={s.body}>
              People who were just there, read by AI into snow, traction and crossing details,
              with the exact quote kept alongside so you can check it.
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
