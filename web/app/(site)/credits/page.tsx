import type { Metadata } from "next";
import s from "@/app/landing.module.css";
import { photos } from "@/lib/photos";

export const metadata: Metadata = { title: "Credits" };

const DATA = [
  ["Snow water equivalent", "USDA NRCS SNOTEL, via the AWDB REST API", "https://www.nrcs.usda.gov/wps/portal/wcc/home/"],
  ["California snow sensors", "California Department of Water Resources, CDEC", "https://cdec.water.ca.gov/"],
  ["Stream flow", "U.S. Geological Survey, Water Services", "https://waterservices.usgs.gov/"],
  ["Pass locations", "OpenStreetMap contributors (ODbL)", "https://www.openstreetmap.org/copyright"],
  ["Elevations", "USGS Elevation Point Query Service", "https://epqs.nationalmap.gov/"],
  ["Vector map tiles", "OpenFreeMap, OpenMapTiles schema", "https://openfreemap.org/"],
  ["Terrain", "AWS Open Data Terrain Tiles", "https://registry.opendata.aws/terrain-tiles/"],
];

export default function Credits() {
  return (
    <section className={s.doc}>
      <div className={s.wrap}>
        <article>
          <h1 className={`${s.display} ${s.h2}`}>Credits</h1>
          <p>
            This site stands on public data and openly licensed photography. Thank you to every
            agency, mapper and photographer below.
          </p>
          <h2>Photography</h2>
          <ul>
            {Object.values(photos).map((p) => (
              <li key={p.key}>
                <a href={p.source} style={{ color: "var(--snowmelt)" }}>
                  {p.alt}
                </a>
                , by {p.credit}, {p.license}
              </li>
            ))}
          </ul>
          <h2>Data</h2>
          <ul>
            {DATA.map(([what, who, url]) => (
              <li key={what}>
                {what}:{" "}
                <a href={url} style={{ color: "var(--snowmelt)" }}>
                  {who}
                </a>
              </li>
            ))}
          </ul>
          <h2>Software</h2>
          <p>
            Built with Next.js, MapLibre GL, maplibre-contour, Motion and Phosphor Icons.
            Questions asked about a pass are answered by Anthropic&apos;s Claude, from the
            evidence on that pass.
          </p>
        </article>
      </div>
    </section>
  );
}
