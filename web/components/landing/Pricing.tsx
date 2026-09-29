import { ArrowUpRight, Check } from "@phosphor-icons/react/dist/ssr";
import s from "@/app/landing.module.css";
import { MAP_PATH } from "@/lib/paths";
import Reveal from "./Reveal";
import Signpost from "./Signpost";

const FREE = [
  "Every pass in Washington, Oregon and California",
  "Four seasons of daily verdicts and evidence",
  "Seven-day forecast at pass elevation",
  "Nearest passes from where you stand",
  "Save passes for offline, install to your home screen",
];

const PLUS = [
  "Alerts the moment a saved pass changes",
  "Winter layer: fresh snow, official danger ratings quoted word for word",
  "Fire and smoke over your route, with the official closure",
  "Priority reads for the passes you care about",
];

// Plainly: what costs nothing now, what will cost something later, and the
// promise that the map itself stays free.
export default function Pricing() {
  return (
    <section className={s.section} id="plans">
      <div className={s.wrap}>
        <Reveal className={s.seasonsHead}>
          <Signpost label="Plans" dir="left" />
          <h2 className={`${s.display} ${s.h2}`}>Free while we earn it.</h2>
          <p className={s.body}>
            The map, the history and offline saving are free, and stay free. A paid tier arrives
            with the phone app, for the people who want the mountain to call them.
          </p>
        </Reveal>
        <div className={s.priceGrid}>
          <Reveal className={`${s.collar} ${s.priceCardHi}`}>
            <div className={`${s.collarInner} ${s.priceCard}`}>
              <div className={s.priceHead}>
                <span className={`${s.mono} ${s.priceTag}`}>Now</span>
                <h3 className={`${s.display} ${s.priceName}`}>Free</h3>
                <div className={s.priceAmount}>
                  $0<span className={s.priceUnit}>forever</span>
                </div>
              </div>
              <ul className={s.priceList}>
                {FREE.map((f) => (
                  <li key={f}>
                    <Check size={16} weight="bold" aria-hidden="true" />
                    {f}
                  </li>
                ))}
              </ul>
              <a href={MAP_PATH} className={`${s.btn} ${s.btnPrimary}`}>
                Open the map
                <span className={s.btnIcon} aria-hidden="true">
                  <ArrowUpRight size={15} weight="bold" />
                </span>
              </a>
            </div>
          </Reveal>
          <Reveal className={s.priceCard} delay={0.08}>
            <div className={s.priceHead}>
              <span className={`${s.mono} ${s.priceTag}`}>With the app</span>
              <h3 className={`${s.display} ${s.priceName}`}>Plus</h3>
              <div className={s.priceAmount}>
                <span className={s.priceSoon}>Price set at launch</span>
              </div>
            </div>
            <ul className={s.priceList}>
              {PLUS.map((f) => (
                <li key={f}>
                  <Check size={16} weight="bold" aria-hidden="true" />
                  {f}
                </li>
              ))}
            </ul>
            <a href="/app/" className={`${s.btn} ${s.btnGhost}`}>
              How the app is coming
              <span className={s.btnIcon} aria-hidden="true">
                <ArrowUpRight size={14} weight="bold" />
              </span>
            </a>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
