"use client";

import { type FormEvent, useState } from "react";
import { backend, rememberPass, SIGN_IN_BY_CODE } from "@/lib/backend";
import s from "./SignIn.module.css";

// Signing in is by email: a link, and a code once the mail sender carries
// one. No password to keep.
export default function SignIn({
  id,
  prompt,
  returnTo,
}: {
  /** Prefix for the field ids, so two forms on one page stay distinct. */
  id: string;
  /** What signing in is for, as one sentence. */
  prompt: string;
  /** The pass to reopen when the emailed link lands on the map. */
  returnTo?: string | null;
}) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    if (returnTo) rememberPass(returnTo);
    const { error: sendError } = await backend().auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/map/` },
    });
    setBusy(false);
    if (sendError) {
      setError(
        sendError.status === 429
          ? "Too many sign-in emails just now. Wait a few minutes and try again."
          : "That email could not be sent. Check the address and try again.",
      );
    } else setSentTo(email.trim());
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

  const startOver = () => {
    setSentTo(null);
    setCode("");
    setError(null);
  };

  return (
    <>
      {!sentTo && (
        <form onSubmit={send} className={s.form}>
          <label htmlFor={`${id}-email`} className={`mono ${s.hint}`}>
            {prompt} We send a sign-in {SIGN_IN_BY_CODE ? "code" : "link"}, no password.
          </label>
          <div className={s.row}>
            <input
              id={`${id}-email`}
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`mono ${s.input}`}
            />
            <button className={`display ${s.go}`} disabled={busy}>
              {busy ? "Sending" : SIGN_IN_BY_CODE ? "Send code" : "Send link"}
            </button>
          </div>
        </form>
      )}

      {sentTo && !SIGN_IN_BY_CODE && (
        <div className={s.form}>
          <p className={`mono ${s.hint}`} role="status">
            Check {sentTo} for an email from us and tap the link in it. It opens the map signed
            in{returnTo ? ", on this pass" : ""}.
          </p>
          <button type="button" className={`mono ${s.link}`} onClick={startOver}>
            use a different email
          </button>
        </div>
      )}

      {sentTo && SIGN_IN_BY_CODE && (
        <form onSubmit={verify} className={s.form}>
          <label htmlFor={`${id}-code`} className={`mono ${s.hint}`}>
            Enter the code we sent to {sentTo}, or tap the link in that email.
          </label>
          <div className={s.row}>
            <input
              id={`${id}-code`}
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
          <button type="button" className={`mono ${s.link}`} onClick={startOver}>
            use a different email
          </button>
        </form>
      )}

      {error && (
        <p role="alert" className={s.error}>
          {error}
        </p>
      )}
    </>
  );
}
