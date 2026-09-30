"use client";

import { type FormEvent, useState } from "react";
import { AskError, askPass, type PassAnswer } from "@/lib/backend";
import { signOut, useSession } from "@/lib/useSession";
import s from "./AskPass.module.css";
import SignIn from "./SignIn";

// Each example is one the evidence on a pass can answer: the sensors, the
// fire map and the forecast.
const EXAMPLES = ["Is there snow at the pass?", "Is there a fire nearby?", "How cold does it get this week?"];
const MAX = 300;

// One question about the open pass, answered from that pass's evidence.
export default function AskPass({ slug, name, evalDate }: { slug: string; name: string; evalDate: string }) {
  const { session, ready } = useSession();
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [asked, setAsked] = useState<{ slug: string; date: string; result: PassAnswer } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const answer = asked && asked.slug === slug && asked.date === evalDate ? asked.result : null;

  const submit = async (e: FormEvent, text = question) => {
    e.preventDefault();
    const q = text.trim();
    if (!q || busy) return;
    setBusy(true);
    setError(null);
    try {
      setAsked({ slug, date: evalDate, result: await askPass(slug, evalDate, q) });
    } catch (err) {
      setError(err instanceof AskError ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="Ask about this pass" className={s.ask}>
      <h3 className={`display ${s.head}`}>Ask about {name}</h3>

      {!ready && <p className={`mono ${s.hint}`}>...</p>}

      {ready && !session && (
        <SignIn id="ask" prompt="Sign in with your email to ask." returnTo={slug} />
      )}

      {ready && session && (
        <>
          <form onSubmit={submit} className={s.form}>
            <div className={s.row}>
              <input
                id="ask-question"
                aria-label={`Question about ${name}`}
                maxLength={MAX}
                placeholder="Ask about snow, fire, the road, the week ahead"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                className={s.input}
              />
              <button className={`display ${s.go}`} disabled={busy || !question.trim()}>
                {busy ? "Reading" : "Ask"}
              </button>
            </div>
          </form>
          {!answer && !busy && (
            <div className={s.examples}>
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  className={`mono ${s.example}`}
                  onClick={(e) => {
                    setQuestion(ex);
                    submit(e, ex);
                  }}
                >
                  {ex}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {error && (
        <p role="alert" className={s.error}>
          {error}
        </p>
      )}

      {answer && (
        <div className={s.answer} aria-live="polite">
          <p>{answer.answer}</p>
          {answer.evidence.length > 0 && (
            <ul className={s.cites}>
              {answer.evidence.map((n) => {
                const line = answer.lines.find((l) => l.n === n);
                return line ? (
                  <li key={n} className="mono">
                    <span className={s.kind}>
                      {line.kind}
                      {line.date ? ` · ${line.date}` : ""}
                    </span>
                    {line.text}
                  </li>
                ) : null;
              })}
            </ul>
          )}
          <p className={`mono ${s.hint}`}>
            Written by a language model from the evidence on this pass. It describes; the decision
            is yours.
          </p>
        </div>
      )}

      {ready && session && (
        <button className={`mono ${s.link}`} onClick={() => signOut()}>
          signed in as {session.user.email} · sign out
        </button>
      )}
    </section>
  );
}
