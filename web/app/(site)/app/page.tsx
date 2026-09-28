import { AppleLogo, AndroidLogo, Desktop } from "@phosphor-icons/react/dist/ssr";
import type { Metadata } from "next";
import s from "@/app/landing.module.css";
import FinalCta from "@/components/landing/FinalCta";
import Offline from "@/components/landing/Offline";
import Reveal from "@/components/landing/Reveal";
import { brand } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Get the app",
  description: `Install ${brand.name} on iPhone, Android or desktop. Works offline for saved passes.`,
};

const PLATFORMS = [
  {
    icon: AppleLogo,
    name: "iPhone and iPad",
    steps: ["Open the map in Safari.", "Tap the Share button.", "Choose Add to Home Screen."],
  },
  {
    icon: AndroidLogo,
    name: "Android",
    steps: ["Open the map in Chrome.", "Tap the menu, then Install app.", "Find it in your app drawer."],
  },
  {
    icon: Desktop,
    name: "Laptop and desktop",
    steps: ["Open the map in Chrome or Edge.", "Click the install icon in the address bar.", "It opens in its own window."],
  },
];

export default function AppPage() {
  return (
    <>
      <section className={s.pageHero} style={{ minHeight: "58dvh" }}>
        <div className={s.heroScrim} aria-hidden="true" />
        <Reveal className={`${s.wrap} ${s.pageHeroInner}`}>
          <h1 className={`${s.display} ${s.h1}`}>In your pocket at the trailhead.</h1>
          <p className={s.lede}>
            Install it once. It opens full screen, remembers your passes, and keeps working when
            the bars drop to zero.
          </p>
        </Reveal>
      </section>
      <section className={s.section} style={{ paddingTop: 0 }}>
        <div className={s.wrap}>
          <div className={s.platforms}>
            {PLATFORMS.map(({ icon: Icon, name, steps }, i) => (
              <Reveal key={name} className={s.platform} delay={i * 0.08}>
                <span className={s.featureIcon}>
                  <Icon size={22} weight="light" />
                </span>
                <h2 className={`${s.display} ${s.h3}`}>{name}</h2>
                <ol>
                  {steps.map((st) => (
                    <li key={st}>{st}</li>
                  ))}
                </ol>
              </Reveal>
            ))}
          </div>
          <Reveal>
            <p className={s.body} style={{ marginTop: 28 }}>
              A native iPhone app with push alerts for your saved passes is in development.
            </p>
          </Reveal>
        </div>
      </section>
      <Offline />
      <FinalCta />
    </>
  );
}
