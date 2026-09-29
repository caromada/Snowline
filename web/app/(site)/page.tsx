import Audience from "@/components/landing/Audience";
import Changelog from "@/components/landing/Changelog";
import Faq from "@/components/landing/Faq";
import FeatureRows from "@/components/landing/FeatureRows";
import FinalCta from "@/components/landing/FinalCta";
import Fusion from "@/components/landing/Fusion";
import GetApp from "@/components/landing/GetApp";
import Hero from "@/components/landing/Hero";
import Honesty from "@/components/landing/Honesty";
import LegacyRedirect from "@/components/landing/LegacyRedirect";
import LiveBand from "@/components/landing/LiveBand";
import MeltOut from "@/components/landing/MeltOut";
import Pricing from "@/components/landing/Pricing";
import Regions from "@/components/landing/Regions";
import SceneStrip from "@/components/landing/SceneStrip";
import SeasonsRail from "@/components/landing/SeasonsRail";
import SnowlineScrub from "@/components/landing/SnowlineScrub";
import Ticker from "@/components/landing/Ticker";
import TrailSpine from "@/components/landing/TrailSpine";
import TryPass from "@/components/landing/TryPass";
import s from "../landing.module.css";

// The page runs like a trail: the live hero, then proof it is real, then how
// it works, what it does, where it covers, the snowline itself, and finally
// who it is for and how to get it. Scene strips mark the chapter changes.
export default function Home() {
  return (
    <>
      <LegacyRedirect />
      <TrailSpine />
      <Hero />
      <Ticker />
      <LiveBand />
      <Fusion />
      <SceneStrip kind="forest" />
      <FeatureRows />
      <Regions />
      <SceneStrip kind="alpine" />
      <SnowlineScrub />
      <section className={s.section} id="try">
        <div className={s.wrap}>
          <TryPass />
        </div>
      </section>
      <section className={s.section} id="melt">
        <div className={s.wrap}>
          <MeltOut />
        </div>
      </section>
      <Honesty />
      <SceneStrip kind="desert" />
      <Audience />
      <SeasonsRail />
      <Changelog />
      <Pricing />
      <GetApp />
      <Faq />
      <FinalCta title="Pick a pass." />
    </>
  );
}
