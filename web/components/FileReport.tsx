"use client";

import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { PHOTO_ACCEPT, PhotoError, photoFileProblem, preparePhoto } from "@/lib/photo";
import { dateChoices, draftProblem, emptyDraft, fieldName, previewOf, valueWords } from "@/lib/reports";
import { discardUpload, fileReport, ReportError, uploadPhoto } from "@/lib/reportsClient";
import {
  type FiledReport,
  MAX_REPORT_CHARS,
  MAX_WATER_SOURCE_CHARS,
  type PreparedPhoto,
  type ReportDraft,
  TAP_CHOICES,
  type TapField,
} from "@/lib/reportTypes";
import s from "./FileReport.module.css";
import ReportCard from "./ReportCard";

// The browser's own speech recognition, where it has one. Only the text it
// returns is used; this code never touches the audio.
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
interface RecognitionEvent {
  resultIndex: number;
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
}
type RecognitionClass = new () => Recognition;

function recognitionClass(): RecognitionClass | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionClass; webkitSpeechRecognition?: RecognitionClass };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const CONDITION_ROWS: TapField[] = ["snow_condition", "traction_used", "crossing_condition"];
const SEASON_ROWS: TapField[] = ["larches", "wildflowers", "mosquitoes", "water_status"];

function kilobytes(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function Choices({
  field,
  draft,
  set,
}: {
  field: TapField;
  draft: ReportDraft;
  set: (field: TapField, value: string | null) => void;
}) {
  const chosen = draft[field];
  return (
    <fieldset className={s.row}>
      <legend className={`mono ${s.legend}`}>{fieldName(field)}</legend>
      <div className={s.chips}>
        {TAP_CHOICES[field].map((value) => {
          const on = chosen === value;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={on}
              className={`mono ${s.chip} ${on ? s.chipOn : ""}`}
              onClick={() => set(field, on ? null : value)}
            >
              {valueWords(value)}
              {on && (
                <span aria-hidden="true" className={s.chipClear}>
                  ×
                </span>
              )}
            </button>
          );
        })}
        {chosen && (
          <button type="button" className={`mono ${s.clear}`} onClick={() => set(field, null)}>
            clear<span className={s.srOnly}> {fieldName(field).toLowerCase()}</span>
          </button>
        )}
      </div>
    </fieldset>
  );
}

export default function FileReport({
  slug,
  name,
  today,
  userId,
  onFiled,
}: {
  slug: string;
  name: string;
  /** Today at the passes. */
  today: string;
  /** Null when no one is signed in. */
  userId: string | null;
  onFiled: (filed: FiledReport, localPhotoUrl: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"edit" | "preview">("edit");
  const [draft, setDraft] = useState<ReportDraft>(() => emptyDraft(today));
  const [photo, setPhoto] = useState<(PreparedPhoto & { url: string }) | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [canDictate, setCanDictate] = useState(false);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState("");
  const [micError, setMicError] = useState<string | null>(null);

  const recognition = useRef<Recognition | null>(null);
  const firstField = useRef<HTMLSelectElement>(null);
  const previewHead = useRef<HTMLHeadingElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Feature detection needs the window, which the server render lacks.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCanDictate(recognitionClass() !== null);
    return () => recognition.current?.abort();
  }, []);

  useEffect(() => {
    if (!open) return;
    if (step === "edit") firstField.current?.focus();
    else previewHead.current?.focus();
  }, [open, step]);

  const change = (patch: Partial<ReportDraft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setError(null);
  };
  const setTap = (field: TapField, value: string | null) => change({ [field]: value } as Partial<ReportDraft>);

  const stopListening = () => {
    recognition.current?.stop();
    setListening(false);
    setHeard("");
  };

  const toggleDictation = () => {
    if (listening) return stopListening();
    const Available = recognitionClass();
    if (!Available) return;
    setMicError(null);
    const r = new Available();
    r.lang = "en-US";
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (event) => {
      let finished = "";
      let pending = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) finished += result[0].transcript;
        else pending += result[0].transcript;
      }
      setHeard(pending.trim());
      const said = finished.trim();
      if (!said) return;
      setDraft((d) => {
        const joined = d.text.trim() ? `${d.text.trimEnd()} ${said}` : said;
        return { ...d, text: joined.slice(0, MAX_REPORT_CHARS) };
      });
    };
    r.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setMicError("The microphone is not allowed for this site. Typing still works.");
      } else if (event.error !== "aborted" && event.error !== "no-speech") {
        setMicError("Dictation stopped. Typing still works.");
      }
    };
    r.onend = () => {
      setListening(false);
      setHeard("");
    };
    recognition.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      setMicError("Dictation could not start. Typing still works.");
    }
  };

  const dropPhoto = () => {
    if (photo) URL.revokeObjectURL(photo.url);
    setPhoto(null);
    setPhotoError(null);
    if (fileInput.current) fileInput.current.value = "";
  };

  const choosePhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    dropPhoto();
    const problem = photoFileProblem(file);
    if (problem) {
      setPhotoError(problem);
      return;
    }
    setPhotoBusy(true);
    try {
      const prepared = await preparePhoto(file);
      setPhoto({ ...prepared, url: URL.createObjectURL(prepared.blob) });
    } catch (err) {
      setPhotoError(err instanceof PhotoError ? err.message : "That photo could not be read.");
      if (fileInput.current) fileInput.current.value = "";
    } finally {
      setPhotoBusy(false);
    }
  };

  const close = () => {
    stopListening();
    dropPhoto();
    setDraft(emptyDraft(today));
    setStep("edit");
    setError(null);
    setMicError(null);
    setOpen(false);
    requestAnimationFrame(() => opener.current?.focus());
  };

  const toPreview = () => {
    stopListening();
    const problem = draftProblem(draft);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    setStep("preview");
  };

  const publish = async () => {
    if (busy || !userId) return;
    setBusy(true);
    setError(null);
    let uploaded: string | null = null;
    try {
      if (photo) uploaded = await uploadPhoto(photo, userId);
      const filed = await fileReport(slug, draft, uploaded);
      // The list shows the local copy of the photo at once; the published
      // copy is fetched the next time the list loads.
      const keep = filed.photo === "attached" && photo ? photo.url : null;
      if (photo && !keep) URL.revokeObjectURL(photo.url);
      setPhoto(null);
      setDraft(emptyDraft(today));
      setStep("edit");
      setOpen(false);
      onFiled(filed, keep);
    } catch (err) {
      if (uploaded) void discardUpload(uploaded);
      setError(err instanceof ReportError ? err.message : "Something went wrong. Nothing was published.");
    } finally {
      setBusy(false);
    }
  };

  if (!userId) {
    return <p className={`mono ${s.signIn}`}>Sign in above to file a report</p>;
  }

  if (!open) {
    return (
      <button ref={opener} type="button" className={`display ${s.open}`} onClick={() => setOpen(true)}>
        File a report
      </button>
    );
  }

  const left = MAX_REPORT_CHARS - draft.text.length;

  return (
    <div className={s.form} role="group" aria-label={`File a report for ${name}`}>
      {step === "edit" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            toPreview();
          }}
          noValidate
        >
          <div className={s.field}>
            <label htmlFor="report-date" className={`mono ${s.label}`}>
              Day you were there
            </label>
            <select
              id="report-date"
              ref={firstField}
              className={`mono ${s.select}`}
              value={draft.date}
              onChange={(e) => change({ date: e.target.value })}
            >
              {dateChoices(today).map((choice) => (
                <option key={choice.value} value={choice.value}>
                  {choice.label}
                </option>
              ))}
            </select>
          </div>

          <div className={s.field}>
            <div className={s.labelRow}>
              <label htmlFor="report-text" className={`mono ${s.label}`}>
                What did you find?
              </label>
              {canDictate && (
                <button
                  type="button"
                  className={`mono ${s.mic} ${listening ? s.micOn : ""}`}
                  aria-pressed={listening}
                  onClick={toggleDictation}
                >
                  <span aria-hidden="true" className={s.micDot} />
                  {listening ? "Stop dictating" : "Dictate"}
                </button>
              )}
            </div>
            <textarea
              id="report-text"
              className={s.textarea}
              rows={5}
              maxLength={MAX_REPORT_CHARS}
              placeholder="Snow, the trail, water crossings, what you used, in your own words"
              aria-describedby="report-text-notes"
              value={draft.text}
              onChange={(e) => change({ text: e.target.value })}
            />
            <div id="report-text-notes" className={`mono ${s.notes}`}>
              <span>{left} characters left</span>
              {canDictate && (
                <span>Dictation is done by your browser and its speech service. Snowline receives the text only, never audio.</span>
              )}
            </div>
            <p className={`mono ${s.heard}`} aria-live="polite">
              {listening ? (heard ? `Hearing: ${heard}` : "Listening") : ""}
            </p>
            {micError && (
              <p role="alert" className={s.error}>
                {micError}
              </p>
            )}
          </div>

          <p className={`mono ${s.hint}`}>Every choice below is optional. Tap a choice again to clear it.</p>
          {CONDITION_ROWS.map((field) => (
            <Choices key={field} field={field} draft={draft} set={setTap} />
          ))}

          <div className={s.season} role="group" aria-labelledby="report-season">
            <h4 id="report-season" className={`display ${s.seasonHead}`}>
              Season watch
            </h4>
            {SEASON_ROWS.map((field) => (
              <Choices key={field} field={field} draft={draft} set={setTap} />
            ))}
            <div className={s.field}>
              <label htmlFor="report-water" className={`mono ${s.label}`}>
                Which water source
              </label>
              <input
                id="report-water"
                className={s.input}
                maxLength={MAX_WATER_SOURCE_CHARS}
                placeholder="For example, the outlet creek below the pass"
                value={draft.water_source}
                onChange={(e) => change({ water_source: e.target.value })}
              />
            </div>
          </div>

          <div className={s.field}>
            <label htmlFor="report-photo" className={`mono ${s.label}`}>
              One photo, if you have one
            </label>
            <input
              id="report-photo"
              ref={fileInput}
              type="file"
              accept={PHOTO_ACCEPT}
              className={`mono ${s.file}`}
              aria-describedby="report-photo-notes"
              onChange={choosePhoto}
              disabled={photoBusy}
            />
            <p id="report-photo-notes" className={`mono ${s.notes}`}>
              JPEG, PNG, HEIC or WebP, up to 15 MB. It is made smaller here, on your device, and its location, camera
              and time details are removed before it is sent.
            </p>
            {photoBusy && (
              <p className={`mono ${s.hint}`} role="status">
                Preparing the photo
              </p>
            )}
            {photoError && (
              <p role="alert" className={s.error}>
                {photoError}
              </p>
            )}
            {photo && (
              <div className={s.photoRow}>
                <img src={photo.url} alt="The photo you chose, as it will be sent" className={s.thumb} />
                <div className={`mono ${s.photoFacts}`}>
                  <span>
                    {photo.width} × {photo.height} px, {kilobytes(photo.blob.size)}
                  </span>
                  <span>Location and camera details removed</span>
                  <button type="button" className={`mono ${s.clear}`} onClick={dropPhoto}>
                    remove photo
                  </button>
                </div>
              </div>
            )}
          </div>

          {error && (
            <p role="alert" className={s.error}>
              {error}
            </p>
          )}

          <div className={s.actions}>
            <button type="submit" className={`display ${s.go}`} disabled={photoBusy}>
              Preview
            </button>
            <button type="button" className={`mono ${s.cancel}`} onClick={close}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {step === "preview" && (
        <div>
          <h4 ref={previewHead} tabIndex={-1} className={`display ${s.previewHead}`}>
            This is what will be published
          </h4>
          <ReportCard report={previewOf(draft, slug, null)} passName={name} from={today} photoUrl={photo?.url ?? null} />
          <ul className={`mono ${s.terms}`}>
            <li>Anyone can read it. Your name and email are not shown.</li>
            <li>
              After you publish, a language model reads your words and adds tags for what they state. Your own
              choices are kept as you made them.
            </li>
            <li>You can remove it at any time.</li>
          </ul>
          {error && (
            <p role="alert" className={s.error}>
              {error}
            </p>
          )}
          <div className={s.actions}>
            <button type="button" className={`display ${s.go}`} onClick={publish} disabled={busy}>
              {busy ? "Publishing" : "Publish"}
            </button>
            <button type="button" className={`mono ${s.cancel}`} onClick={() => setStep("edit")} disabled={busy}>
              Back to edit
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
