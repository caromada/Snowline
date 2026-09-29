"use client";

import { useState } from "react";
import { agoInWords, longDate, photoAlt, reportTags } from "@/lib/reports";
import type { PassReport } from "@/lib/reportTypes";
import s from "./PassReports.module.css";

// One visitor's report, as written. Snowline adds the date, the tags and
// the attribution line, and nothing of its own about conditions.
export default function ReportCard({
  report,
  passName,
  from,
  photoUrl,
  onRemove,
}: {
  report: PassReport;
  passName: string;
  /** The date "how long ago" counts from. */
  from: string;
  photoUrl: string | null;
  /** Present only on the reader's own reports. */
  onRemove?: () => Promise<void>;
}) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tags = reportTags(report);
  const read = tags.some((tag) => !tag.tapped);

  const remove = async () => {
    if (!onRemove || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onRemove();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The report could not be removed just now.");
      setBusy(false);
      setAsking(false);
    }
  };

  return (
    <article className={s.card} aria-label={`Report from ${longDate(report.date_observed)}`}>
      <header className={s.cardHead}>
        <p className={`mono ${s.when}`}>
          <span className={s.date}>{longDate(report.date_observed)}</span>
          <span> · {agoInWords(report.date_observed, from)}</span>
        </p>
        {onRemove && !asking && (
          <button type="button" className={`mono ${s.remove}`} onClick={() => setAsking(true)}>
            Remove
          </button>
        )}
      </header>

      {onRemove && asking && (
        <div className={s.confirm} role="group" aria-label="Remove this report">
          <span className="mono">Remove this report for good?</span>
          <button type="button" className={`mono ${s.remove}`} onClick={remove} disabled={busy}>
            {busy ? "Removing" : "Yes, remove"}
          </button>
          <button type="button" className={`mono ${s.keep}`} onClick={() => setAsking(false)} disabled={busy}>
            Keep
          </button>
        </div>
      )}

      {report.status === "hidden" && (
        <p className={`mono ${s.hidden}`}>Hidden. Only you can see this report.</p>
      )}

      {tags.length > 0 && (
        <ul className={s.tags}>
          {tags.map((tag) => (
            <li key={tag.field} className={`mono ${s.tag} ${tag.tapped ? "" : s.readTag}`}>
              {tag.text}
            </li>
          ))}
        </ul>
      )}

      {report.body && <p className={s.body}>{report.body}</p>}

      {photoUrl && (
        <img
          className={s.photo}
          src={photoUrl}
          alt={photoAlt(report, passName)}
          loading="lazy"
          decoding="async"
          width={4}
          height={3}
        />
      )}

      <p className={`mono ${s.byline}`}>Filed by a visitor. Not verified by Snowline.</p>
      {read && (
        <p className={`mono ${s.byline}`}>
          Tags with a dashed edge were read from their words by a language model.
        </p>
      )}

      {error && (
        <p role="alert" className={s.error}>
          {error}
        </p>
      )}
    </article>
  );
}
