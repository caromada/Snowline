import Link from "next/link";
import s from "@/app/landing.module.css";
import { brand } from "@/lib/brand";
import { MAP_PATH } from "@/lib/paths";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { href: MAP_PATH, label: "Open the map", external: true },
      { href: "/how-it-works/", label: "How it works" },
      { href: "/seasons/", label: "Seasons" },
      { href: "/app/", label: "Get the app" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about/", label: "About" },
      { href: brand.repo, label: "Source on GitHub", external: true },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/terms/", label: "Terms" },
      { href: "/privacy/", label: "Privacy" },
      { href: "/credits/", label: "Credits" },
    ],
  },
];

export default function Footer() {
  return (
    <footer className={s.footer}>
      <div className={s.wrap}>
        <div className={s.footerGrid}>
          <div style={{ display: "grid", gap: 14, alignContent: "start" }}>
            <p className={s.display} style={{ fontSize: 15, letterSpacing: "0.18em" }}>
              {brand.name}
            </p>
            <p className={s.body} style={{ maxWidth: "38ch" }}>
              Mountain pass conditions for {brand.region.replaceAll(" · ", ", ")}, fused from
              sensors, satellites and the people who were just there.
            </p>
          </div>
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h4>{col.title}</h4>
              <ul>
                {col.links.map((l) =>
                  l.external ? (
                    <li key={l.href}>
                      <a href={l.href}>{l.label}</a>
                    </li>
                  ) : (
                    <li key={l.href}>
                      <Link href={l.href}>{l.label}</Link>
                    </li>
                  ),
                )}
              </ul>
            </div>
          ))}
        </div>
        <p className={`${s.mono} ${s.disclaimer}`}>
          {brand.name} is a planning aid, not a safety tool. Conditions in the mountains change by
          the hour; snow, ice, moving water, fire and avalanches can kill. Check the official
          sources for your route, carry the right gear, and make your own call.
        </p>
      </div>
    </footer>
  );
}
