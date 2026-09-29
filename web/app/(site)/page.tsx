import Agents from "@/components/landing/Agents";
import Audience from "@/components/landing/Audience";
import Faq from "@/components/landing/Faq";
import FeatureRows from "@/components/landing/FeatureRows";
import GetApp from "@/components/landing/GetApp";
import Hero from "@/components/landing/Hero";
import Honesty from "@/components/landing/Honesty";
import LegacyRedirect from "@/components/landing/LegacyRedirect";
import MeltOut from "@/components/landing/MeltOut";
import Regions from "@/components/landing/Regions";
import SeasonsRail from "@/components/landing/SeasonsRail";
import StatBand from "@/components/landing/StatBand";
import Ticker from "@/components/landing/Ticker";
import TryPass from "@/components/landing/TryPass";
import s from "../landing.module.css";

export default function Home() {
  return (
    <>
      <LegacyRedirect />
      <Hero />
      <Ticker />
      <FeatureRows />
      <Regions />
      <StatBand />
      <Agents />
      <section className={s.section} id="try">
        <div className={s.wrap}>
          <TryPass />
        </div>
      </section>
      <section className={s.section}>
        <div className={s.wrap}>
          <MeltOut />
        </div>
      </section>
      <Honesty />
      <Audience />
      <SeasonsRail />
      <GetApp />
      <Faq />
    </>
  );
}
