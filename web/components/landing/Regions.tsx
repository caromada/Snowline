"use client";

import { useEffect, useState } from "react";
import s from "@/app/landing.module.css";
import { type LandingData, loadLanding } from "@/lib/landingData";
import { MAP_PATH } from "@/lib/paths";
import { type Photo, photos } from "@/lib/photos";
import Pic from "./Pic";
import Reveal from "./Reveal";
import Signpost from "./Signpost";

type Region = { name: string; photo: Photo; box: [number, number, number, number]; center: [number, number] };

// Rough boxes [south, west, north, east]; counts come from the real pass list.
const REGIONS: Region[] = [
  { name: "High Sierra", photo: photos.hero, box: [35.9, -119.6, 38.2, -117.9], center: [-118.6, 37.1] },
  { name: "Tahoe and the northern Sierra", photo: photos.spring, box: [38.2, -121.0, 40.4, -119.5], center: [-120.2, 39.2] },
  { name: "Washington Cascades", photo: photos.aasgard, box: [45.6, -122.4, 49.1, -119.8], center: [-121.2, 47.9] },
  { name: "Oregon Cascades", photo: photos.dayhike, box: [42.0, -122.6, 45.6, -121.0], center: [-121.8, 44.4] },
  { name: "Southern California", photo: photos.whitney, box: [32.5, -118.6, 35.9, -115.5], center: [-116.9, 34.1] },
  { name: "Olympics and the coast", photo: photos.summer, box: [46.0, -124.9, 48.5, -122.4], center: [-123.6, 47.8] },
];

export default function Regions() {
  const [data, setData] = useState<LandingData | null>(null);
  useEffect(() => {
    loadLanding().then(setData).catch(() => {});
  }, []);
  const count = (r: Region) =>
    data
      ? data.passes.filter(([lon, lat]) => lat >= r.box[0] && lat <= r.box[2] && lon >= r.box[1] && lon <= r.box[3]).length
      : 0;
  return (
    <section className={s.section} id="regions">
      <div className={s.wrap}>
        <Reveal className={s.seasonsHead}>
          <Signpost label="Explore by range" dir="left" />
          <h2 className={`${s.display} ${s.h2}`}>Pick a range. The map opens there.</h2>
          <p className={s.body}>Every named pass and saddle from the southern Kern to the Canadian line.</p>
        </Reveal>
        <div className={s.regionGrid}>
          {REGIONS.map((r, i) => (
            <Reveal key={r.name} as="article" className={s.region} delay={(i % 3) * 0.07}>
              <a href={`${MAP_PATH}?lat=${r.center[1]}&lon=${r.center[0]}&zoom=8`} className={s.regionLink}>
                <div className={s.regionPhoto}>
                  <Pic photo={r.photo} sizes="(max-width: 900px) 100vw, 33vw" />
                </div>
                <div className={s.regionMeta}>
                  <h3 className={`${s.display} ${s.h3} ${s.regionBoard}`}>{r.name}</h3>
                  <span className={s.mono}>{data ? `${count(r).toLocaleString()} passes` : "..."}</span>
                </div>
              </a>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
