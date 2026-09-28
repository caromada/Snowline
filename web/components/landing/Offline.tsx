import { Crosshair, DeviceMobile, WifiSlash } from "@phosphor-icons/react/dist/ssr";
import s from "@/app/landing.module.css";
import Reveal from "./Reveal";

const FEATURES = [
  {
    icon: WifiSlash,
    title: "Save a pass for no signal",
    body: "Tap the tent on any pass. Its data, sensor curves and the map around it stay on your phone for the trailhead.",
  },
  {
    icon: Crosshair,
    title: "The nearest passes, from where you stand",
    body: "One tap drops your position and lists the five closest passes with their conditions and distance.",
  },
  {
    icon: DeviceMobile,
    title: "Installs like an app",
    body: "Add it to your home screen on iPhone or Android. It opens full screen and keeps the last data it saw.",
  },
];

export default function Offline() {
  return (
    <section className={s.section} id="offline">
      <div className={`${s.wrap} ${s.offline}`}>
        <Reveal>
          <div className={`${s.collar} ${s.phone}`}>
            <div className={s.collarInner}>
              <img
                src="/landing/app-phone.webp"
                alt="The app on a phone, showing Glen Pass in June 2023"
                width={780}
                height={1688}
                loading="lazy"
              />
            </div>
          </div>
        </Reveal>
        <Reveal delay={0.1}>
          <h2 className={`${s.display} ${s.h2}`}>Works where the signal doesn&apos;t.</h2>
          <ul className={s.features}>
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <li key={title} className={s.feature}>
                <span className={s.featureIcon}>
                  <Icon size={22} weight="light" />
                </span>
                <h3>{title}</h3>
                <p>{body}</p>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
