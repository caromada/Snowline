import type { Metadata } from "next";
import s from "@/app/landing.module.css";
import { brand } from "@/lib/brand";

export const metadata: Metadata = { title: "Privacy" };

export default function Privacy() {
  return (
    <section className={s.doc}>
      <div className={s.wrap}>
        <article>
          <h1 className={`${s.display} ${s.h2}`}>Privacy</h1>
          <p className={s.draftBanner}>
            Draft for legal review. It describes exactly what the site does today and will be
            updated before accounts or paid features launch.
          </p>
          <h2>The short version</h2>
          <p>
            {brand.name} has no accounts, no analytics and no advertising cookies. We do not
            collect your name, email or location.
          </p>
          <h2>Your location</h2>
          <p>
            If you tap the locate button, your browser asks permission and hands your position to
            the page, which uses it on your device to find the nearest passes. It is never sent to
            us or stored.
          </p>
          <h2>What stays in your browser</h2>
          <ul>
            <li>The passes you save with the tent button.</li>
            <li>Map tiles and pass data cached for offline use.</li>
            <li>
              An Anthropic API key, only if you choose to enter one for the optional AI features.
              It is sent directly to Anthropic when you use those features, never to us.
            </li>
          </ul>
          <p>You can clear all of it by clearing this site&apos;s data in your browser.</p>
          <h2>Who else sees requests</h2>
          <p>
            Like any website, loading the page sends standard request data (such as your IP
            address and browser type) to our hosting provider and to the servers that serve map
            tiles, which see the same kind of request data.
          </p>
          <h2>Questions</h2>
          <p>
            Open an issue on the project&apos;s{" "}
            <a href={brand.repo} style={{ color: "var(--snowmelt)" }}>
              GitHub page
            </a>
            .
          </p>
        </article>
      </div>
    </section>
  );
}
