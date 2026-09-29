import { DeviceMobile } from "@phosphor-icons/react/dist/ssr";
import s from "@/app/landing.module.css";
import { brand } from "@/lib/brand";
import { MAP_PATH } from "@/lib/paths";
import Reveal from "./Reveal";

// The download band. Honest about where it stands: it installs from the
// browser today; the App Store listing comes with the native app.
export default function GetApp() {
  return (
    <section className={s.section} id="get">
      <Reveal className={`${s.wrap} ${s.getApp}`}>
        <div className={s.getCopy}>
          <h2 className={`${s.display} ${s.h2}`}>Put {brand.name} on your phone.</h2>
          <p className={s.body}>
            Open the map in your phone&apos;s browser and add it to your home screen. It opens full
            screen, keeps your saved passes, and works with no signal. The native iPhone app with
            alerts for your saved passes is in development.
          </p>
          <div className={s.ctaRow}>
            <a href={MAP_PATH} className={`${s.btn} ${s.btnPrimary}`}>
              <DeviceMobile size={18} weight="bold" aria-hidden="true" />
              Open on your phone
            </a>
            <a href="/app/" className={`${s.btn} ${s.btnGhost}`}>
              Install steps
            </a>
          </div>
        </div>
        <div className={s.getShot}>
          <img src="/landing/phone-nearby.webp" alt="" width={780} height={1688} loading="lazy" />
        </div>
      </Reveal>
    </section>
  );
}
