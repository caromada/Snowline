"use client";

import { useState } from "react";
import { agoInWords, currentReports, daysAgo, longDate, rangerHat } from "@/lib/official";
import type { Official, OfficialReport } from "@/lib/officialTypes";
import styles from "./OfficialReports.module.css";
import PixelGlyph from "./PixelGlyph";

function Report({ report, now }: { report: OfficialReport; now: number }) {
  const age = daysAgo(report.date, now);
  return (
    <li className={styles.report}>
      <div className={styles.unit}>{report.unit}</div>
      <div className={`mono ${styles.meta}`}>
        {report.agency} · {report.place}
      </div>
      <div className={`mono ${styles.meta}`}>
        dated <time dateTime={report.date}>{longDate(report.date)}</time>
        {age !== null ? ` · ${agoInWords(age)}` : ""}
      </div>
      <blockquote className={styles.words} cite={report.url}>
        {report.text}
      </blockquote>
      {report.truncated && (
        <p className={`mono ${styles.fine}`}>
          These are the opening sentences of a longer report.
        </p>
      )}
      <a className={`display ${styles.link}`} href={report.url} target="_blank" rel="noreferrer">
        Read it at the source
      </a>
    </li>
  );
}

// What the land managers published about this pass, in their words. Each
// report is quoted as written, under the name of the agency that wrote it,
// with the date that agency gave it.
export default function OfficialReports({ official }: { official: Official }) {
  // Read once per mount: a report must not age out mid-read, and render
  // has to stay pure.
  const [now] = useState(() => Date.now());
  const reports = currentReports(official.reports ?? [], now);
  if (!reports.length) return null;

  return (
    <section aria-label="Official reports" className={styles.official}>
      <h3 className={`display ${styles.head}`}>
        <PixelGlyph sprite={rangerHat} scale={1} title="" />
        From the rangers
      </h3>
      <ul className={styles.reports}>
        {reports.map((report) => (
          <Report
            key={`${report.url}-${report.place}-${report.date}-${report.text.slice(0, 24)}`}
            report={report}
            now={now}
          />
        ))}
      </ul>
      <p className={`mono ${styles.fine}`}>
        Quoted as published, with nothing added. Reports dated more than 21 days ago are not
        shown.
      </p>
    </section>
  );
}
