"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { planName, syncLine, usageCount } from "@/lib/account";
import { type AccountFacts, fetchAccount } from "@/lib/accountData";
import { backendLive } from "@/lib/backend";
import type { PassIndexEntry, Status } from "@/lib/types";
import { useSavedSync } from "@/lib/useSavedSync";
import { signOut, useSession } from "@/lib/useSession";
import s from "./AccountMenu.module.css";
import SignIn from "./SignIn";

const TONE: Record<Status, string> = {
  open: s.open,
  snow_caution: s.snow,
  traction_advised: s.warm,
  not_recommended: s.warm,
  unknown: s.unknown,
};

interface Props {
  passes: PassIndexEntry[];
  /** The newest date on file: the menu shows the present, whatever date the map is on. */
  latest: string;
  /** The open pass, reopened when a sign-in link lands on the map. */
  selected: string | null;
  onSelect: (slug: string) => void;
}

const never = () => () => {};

// Nothing here renders, and the backend client is never created, until the
// preview switch or the build flag says accounts are live.
export default function AccountMenu(props: Props) {
  const live = useSyncExternalStore(never, backendLive, () => false);
  return live ? <Menu {...props} /> : null;
}

function Menu({ passes, latest, selected, onSelect }: Props) {
  const { session, ready } = useSession();
  const user = session?.user ?? null;
  const sync = useSavedSync(user?.id ?? null);
  const [open, setOpen] = useState(false);
  const [facts, setFacts] = useState<AccountFacts | "unread" | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!open || !userId) return;
    let cancelled = false;
    fetchAccount(userId).then((next) => {
      if (!cancelled) setFacts(next ?? "unread");
    });
    return () => {
      cancelled = true;
    };
  }, [open, userId]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    // The page closes the open pass on Escape, from a listener on the
    // window. With the menu open, Escape closes only the menu, so the key is
    // caught on its way down, before the window hears it.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  if (!ready) return null;

  const mine = facts && facts !== "unread" && facts.user === userId ? facts : null;
  const bySlug = new Map(passes.map((p) => [p.slug, p]));
  const saved = sync.saved.flatMap((slug) => {
    const pass = bySlug.get(slug);
    return pass ? [pass] : [];
  });

  return (
    <div ref={rootRef} className={s.account}>
      <button
        ref={buttonRef}
        type="button"
        className={`display ${s.toggle}`}
        aria-expanded={open}
        aria-controls="account-menu"
        onClick={() => setOpen((o) => !o)}
      >
        {user && <span className={`${s.mark} ${sync.pending > 0 ? s.markWaiting : ""}`} aria-hidden="true" />}
        {user ? "Account" : "Sign in"}
      </button>

      {open && (
        <section id="account-menu" aria-label="Account" className={s.menu}>
          {!user && (
            <>
              <h2 className={`display ${s.head}`}>Sign in</h2>
              <SignIn
                id="account"
                prompt="An account keeps your saved passes the same on every device."
                returnTo={selected}
              />
              {sync.saved.length > 0 && (
                <p className={`mono ${s.note}`}>
                  {sync.saved.length === 1
                    ? "The 1 pass saved on this device joins your account when you sign in."
                    : `The ${sync.saved.length} passes saved on this device join your account when you sign in.`}
                </p>
              )}
            </>
          )}

          {user && (
            <>
              <h2 className={`display ${s.head}`}>Account</h2>
              <p className={`mono ${s.email}`}>{user.email}</p>
              <dl className={`mono ${s.facts}`}>
                <div>
                  <dt>Plan</dt>
                  <dd>{mine ? planName(mine.plan) : facts === "unread" ? "not read" : "..."}</dd>
                </div>
                <div>
                  <dt>Questions asked today</dt>
                  <dd>
                    {mine
                      ? usageCount(mine.asked, mine.plan)
                      : facts === "unread"
                        ? "not read"
                        : "..."}
                  </dd>
                </div>
              </dl>
              {mine && <p className={`mono ${s.note}`}>The count resets at midnight UTC.</p>}
              {facts === "unread" && (
                <p className={`mono ${s.note}`} role="status">
                  Your plan and question count could not be read just now.
                </p>
              )}

              <h3 className={`display ${s.sub}`}>Saved passes</h3>
              {saved.length === 0 ? (
                <p className={`mono ${s.note}`}>
                  None yet. The tent button on a pass saves it here and for offline use.
                </p>
              ) : (
                <ul className={s.list}>
                  {saved.map((pass) => {
                    const verdict = pass.statuses[latest];
                    return (
                      <li key={pass.slug}>
                        <button
                          type="button"
                          className={s.pass}
                          aria-current={pass.slug === selected ? "true" : undefined}
                          onClick={() => {
                            onSelect(pass.slug);
                            setOpen(false);
                          }}
                        >
                          <span className={s.name}>{pass.name}</span>
                          <span className={`mono ${s.verdict} ${TONE[verdict?.status ?? "unknown"]}`}>
                            <span className={s.dot} aria-hidden="true" />
                            {verdict?.status_label ?? "No verdict on file"}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className={`mono ${s.note}`} role="status">
                {syncLine(sync.status, sync.pending)}
              </p>

              <button type="button" className={`mono ${s.soon}`} disabled>
                Watch this pass, coming with the app
              </button>

              <button
                type="button"
                className={`display ${s.out}`}
                onClick={() => {
                  setFacts(null);
                  void signOut();
                }}
              >
                Sign out
              </button>
            </>
          )}
        </section>
      )}
    </div>
  );
}
