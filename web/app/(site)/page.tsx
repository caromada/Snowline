import Agents from "@/components/landing/Agents";
import Audience from "@/components/landing/Audience";
import Faq from "@/components/landing/Faq";
import FinalCta from "@/components/landing/FinalCta";
import Hero from "@/components/landing/Hero";
import Honesty from "@/components/landing/Honesty";
import LegacyRedirect from "@/components/landing/LegacyRedirect";
import MeltOut from "@/components/landing/MeltOut";
import Offline from "@/components/landing/Offline";
import SeasonsRail from "@/components/landing/SeasonsRail";
import StatBand from "@/components/landing/StatBand";
import Steps from "@/components/landing/Steps";
import Ticker from "@/components/landing/Ticker";
import TryPass from "@/components/landing/TryPass";
import s from "../landing.module.css";

export default function Home() {
  return (
    <>
      <LegacyRedirect />
      <Hero />
      <Ticker />
      <section className={s.section}>
        <div className={s.wrap}>
          <MeltOut />
        </div>
      </section>
      <StatBand />
      <Agents />
      <section className={s.section} id="try">
        <div className={s.wrap}>
          <TryPass />
        </div>
      </section>
      <Steps />
      <Honesty />
      <Audience />
      <SeasonsRail />
      <Offline />
      <Faq />
      <FinalCta title="Know the snowline. Go." />
    </>
  );
}
