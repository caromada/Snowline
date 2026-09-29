"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { backend } from "@/lib/backend";
import { longDate, pacificToday, seasonWatch, shortDate, splitByWindow, windowEnd } from "@/lib/reports";
import { loadReports, removeReport, signPhotos } from "@/lib/reportsClient";
import type { FiledReport, PassReport } from "@/lib/reportTypes";
import FileReport from "./FileReport";
import s from "./PassReports.module.css";
import ReportCard from "./ReportCard";

interface Loaded {
  key: string;
  reports: PassReport[];
  failed: boolean;
}

// What visitors found on the open pass, newest first, with the form to
// file one. Read live; nothing here feeds the verdict above it.
export default function PassReports({
  slug,
  name,
  evalDate,
  isNow,
}: {
  slug: string;
  name: string;
  evalDate: string;
  /** False while the history slider is on a past date. */
  isNow: boolean;
}) {
  const [today] = useState(() => pacificToday(new Date()));
  const [userId, setUserId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [showEarlier, setShowEarlier] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeRef = useRef<HTMLParagraphElement>(null);
  const localPhotos = useRef<string[]>([]);

  const until = windowEnd(evalDate, isNow, today);
  const key = `${slug} ${until} ${userId ?? ""}`;

  useEffect(() => {
    const auth = backend().auth;
    auth.getSession().then(({ data }) => setUserId(data.session?.user.id ?? null));
    const { data } = auth.onAuthStateChange((_event, next) => setUserId(next?.user.id ?? null));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    let live = true;
    loadReports(slug, until)
      .then(async (reports) => {
        if (!live) return;
        setLoaded({ key, reports, failed: false });
        const paths = reports.flatMap((r) => (r.photo_path ? [r.photo_path] : []));
        const urls = await signPhotos(paths);
        if (live) setPhotos((held) => ({ ...held, ...urls }));
      })
      .catch(() => {
        if (live) setLoaded({ key, reports: [], failed: true });
      });
    return () => {
      live = false;
    };
  }, [slug, until, key]);

  useEffect(() => {
    const held = localPhotos.current;
    return () => held.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  const say = useCallback((text: string) => {
    setNotice(text);
    requestAnimationFrame(() => noticeRef.current?.focus());
  }, []);

  const current = loaded && loaded.key === key ? loaded : null;
  const { recent, earlier } = splitByWindow(current?.reports ?? [], until);
  const season = seasonWatch(current?.reports ?? [], until);

  const filed = (result: FiledReport, localPhotoUrl: string | null) => {
    const { report } = result;
    if (localPhotoUrl && report.photo_path) {
      localPhotos.current.push(localPhotoUrl);
      setPhotos((held) => ({ ...held, [report.photo_path as string]: localPhotoUrl }));
    }
    setLoaded((held) => ({
      key,
      failed: false,
      reports: [report, ...(held && held.key === key ? held.reports : [])],
    }));
    say(result.message ?? "Published. Your report is at the top of the list.");
  };

  const remove = async (report: PassReport) => {
    await removeReport(report);
    setLoaded((held) => (held ? { ...held, reports: held.reports.filter((r) => r.id !== report.id) } : held));
    say("Removed.");
  };

  const card = (report: PassReport) => (
    <li key={report.id}>
      <ReportCard
        report={report}
        passName={name}
        from={until}
        photoUrl={report.photo_path ? (photos[report.photo_path] ?? null) : null}
        onRemove={report.mine ? () => remove(report) : undefined}
      />
    </li>
  );

  return (
    <section aria-label="Reports from the pass" className={s.reports}>
      <h3 className={`display ${s.head}`}>Reports from the pass</h3>
      {!isNow && (
        <p className={`mono ${s.hint}`}>
          Reports from the 30 days up to {longDate(until)}. Reports are filed from the present.
        </p>
      )}

      {notice && (
        <p ref={noticeRef} tabIndex={-1} role="status" className={s.notice}>
          {notice}
        </p>
      )}

      {!current && <p className={`mono ${s.hint}`}>...</p>}
      {current?.failed && (
        <p role="alert" className={s.error}>
          Reports could not be loaded just now.
        </p>
      )}
      {current && !current.failed && recent.length === 0 && (
        <p className={s.empty}>
          {earlier.length === 0
            ? "No reports filed for this pass yet."
            : `No reports filed for this pass in the 30 days up to ${longDate(until)}.`}
        </p>
      )}

      {isNow && <FileReport slug={slug} name={name} today={today} userId={userId} onFiled={filed} />}

      {season.length > 0 && (
        <div className={s.season}>
          <h4 className={`display ${s.seasonHead}`}>
            {isNow ? "Season watch, last 14 days" : `Season watch, 14 days up to ${shortDate(until)}`}
          </h4>
          <ul className={s.seasonLines}>
            {season.map((line) => (
              <li key={line} className="mono">
                {line}
              </li>
            ))}
          </ul>
          <p className={`mono ${s.hint}`}>From visitors&apos; reports. Not verified by Snowline.</p>
        </div>
      )}

      {recent.length > 0 && <ul className={s.list}>{recent.map(card)}</ul>}

      {earlier.length > 0 && (
        <>
          <button
            type="button"
            className={`mono ${s.earlier}`}
            aria-expanded={showEarlier}
            aria-controls="earlier-reports"
            onClick={() => setShowEarlier((shown) => !shown)}
          >
            Earlier reports ({earlier.length})
          </button>
          {showEarlier && (
            <ul id="earlier-reports" className={s.list}>
              {earlier.map(card)}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
