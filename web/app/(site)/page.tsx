import Faq from "@/components/landing/Faq";
import FinalCta from "@/components/landing/FinalCta";
import Hero from "@/components/landing/Hero";
import LegacyRedirect from "@/components/landing/LegacyRedirect";
import Manifesto from "@/components/landing/Manifesto";
import MeltOut from "@/components/landing/MeltOut";
import Offline from "@/components/landing/Offline";
import SeasonsRail from "@/components/landing/SeasonsRail";
import Streams from "@/components/landing/Streams";
import Ticker from "@/components/landing/Ticker";
import TryPass from "@/components/landing/TryPass";
import Honesty from "@/components/landing/Honesty";
import s from "../landing.module.css";

export default function Home() {
  return (
    <>
      <LegacyRedirect />
      <Hero />
      <Ticker />
      <Manifesto />
      <section className={s.section}>
        <div className={s.wrap}>
          <MeltOut />
        </div>
      </section>
      <section className={s.section} id="try">
        <div className={s.wrap}>
          <TryPass />
        </div>
      </section>
      <Streams />
      <Honesty />
      <SeasonsRail />
      <Offline />
      <Faq />
      <FinalCta />
    </>
  );
}
