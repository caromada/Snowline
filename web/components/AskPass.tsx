"use client";

import type { Session } from "@supabase/supabase-js";
import { type FormEvent, useEffect, useState } from "react";
import { AskError, askPass, backend, type PassAnswer } from "@/lib/backend";
import s from "./AskPass.module.css";

const EXAMPLES = ["Is there snow on the north side?", "What did the last party report?", "How cold does it get this week?"];
const MAX = 300;

// One question about the open pass, answered from that pass's evidence.
// Signing in is by email code: no password to keep.
export default function AskPass({ slug, name, evalDate }: { slug: string; name: string; evalDate: string }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [asked, setAsked] = useState<{ slug: string; date: string; result: PassAnswer } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);

  useEffect(() => {
    const auth = backend().auth;
    auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

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

  const sendCode = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const { error: sendError } = await backend().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/map/` },
    });
    setBusy(false);
    if (sendError) setError("That email could not be sent. Check the address and try again.");
    else setSentTo(email.trim());
  };

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    if (!sentTo || busy) return;
    setBusy(true);
    setError(null);
    const { error: verifyError } = await backend().auth.verifyOtp({
      email: sentTo,
      token: code.trim(),
      type: "email",
    });
    setBusy(false);
    if (verifyError) setError("That code did not match. Check the newest email and try again.");
  };

  return (
    <section aria-label="Ask about this pass" className={s.ask}>
      <h3 className={`display ${s.head}`}>Ask about {name}</h3>

      {!ready && <p className={`mono ${s.hint}`}>...</p>}

      {ready && !session && !sentTo && (
        <form onSubmit={sendCode} className={s.form}>
          <label htmlFor="ask-email" className={`mono ${s.hint}`}>
            Sign in with your email to ask. We send a code, no password.
          </label>
          <div className={s.row}>
            <input
              id="ask-email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`mono ${s.input}`}
            />
            <button className={`display ${s.go}`} disabled={busy}>
              {busy ? "Sending" : "Send code"}
            </button>
          </div>
        </form>
      )}

      {ready && !session && sentTo && (
        <form onSubmit={verify} className={s.form}>
          <label htmlFor="ask-code" className={`mono ${s.hint}`}>
            Enter the code we sent to {sentTo}, or tap the link in that email.
          </label>
          <div className={s.row}>
            <input
              id="ask-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className={`mono ${s.input}`}
            />
            <button className={`display ${s.go}`} disabled={busy}>
              {busy ? "Checking" : "Sign in"}
            </button>
          </div>
          <button type="button" className={`mono ${s.link}`} onClick={() => setSentTo(null)}>
            use a different email
          </button>
        </form>
      )}

      {ready && session && (
        <>
          <form onSubmit={submit} className={s.form}>
            <div className={s.row}>
              <input
                id="ask-question"
                aria-label={`Question about ${name}`}
                maxLength={MAX}
                placeholder="Ask about snow, the crossing, the week ahead"
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
        <button className={`mono ${s.link}`} onClick={() => backend().auth.signOut()}>
          signed in as {session.user.email} · sign out
        </button>
      )}
    </section>
  );
}
