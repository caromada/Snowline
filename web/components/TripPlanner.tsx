"use client";

import type { Session } from "@supabase/supabase-js";
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { backend, backendLive } from "@/lib/backend";
import { pacificToday } from "@/lib/fire";
import { buildPlan, datesLabel } from "@/lib/plan";
import { loadDetails, MAX_TRIP_CHARS, openPlan, PLAN_ID, PlanError, planLink, planTrip, recentPlans } from "@/lib/planApi";
import type { PlanPass, PlanReply, RecentPlan, TripPlan, UnderstoodTrip } from "@/lib/planTypes";
import type { PassIndexEntry } from "@/lib/types";
import TripPlanView from "./TripPlanView";
import s from "./TripPlanner.module.css";

const EXAMPLES = [
  "Kearsarge Pass, Glen Pass and Forester Pass, this Friday to Sunday, two of us",
  "Enchantments through hike from Stuart Lake this Saturday",
];

export interface TripOnMap {
  /** The plan's passes in travel order. */
  slugs: string[];
  /** Changes with every plan, so the same passes planned twice frame the map twice. */
  n: number;
}

interface Shown {
  id: string | null;
  plan: TripPlan;
  empty: PlanReply["empty"];
  cached: boolean;
  /** Someone else's plan, opened from its link. */
  shared: boolean;
}

// Type a trip, get one page: every pass on it with its verdict and the
// evidence behind it. The model only reads the text; code builds the page.
export default function TripPlanner({
  passes,
  position,
  selected,
  onSelect,
  onShow,
  onTrip,
}: {
  passes: PassIndexEntry[];
  /** Where the visitor is, only if they used the map's locate control. */
  position: { lat: number; lon: number } | null;
  selected: string | null;
  onSelect: (slug: string) => void;
  onShow: (lat: number, lon: number) => void;
  onTrip: (trip: TripOnMap | null) => void;
}) {
  const [live, setLive] = useState(false);
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [text, setText] = useState("");
  const [share, setShare] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState<Shown | null>(null);
  const [recent, setRecent] = useState<RecentPlan[]>([]);
  const [copied, setCopied] = useState<string | null>(null);
  const [linked, setLinked] = useState<string | null>(null);
  const count = useRef(0);
  const opened = useRef<string | null>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // Hydration-safe: the preview switch lives in the address and in storage.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLive(backendLive());
    const want = new URLSearchParams(window.location.search).get("plan");
    if (want && PLAN_ID.test(want)) {
      setLinked(want);
      setOpen(true);
    }
  }, []);

  useEffect(() => {
    if (!live) return;
    const auth = backend().auth;
    auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, [live]);

  const nameCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of passes) counts[p.name] = (counts[p.name] ?? 0) + 1;
    return counts;
  }, [passes]);

  const address = (id: string | null) => {
    const url = new URL(window.location.href);
    if (id) url.searchParams.set("plan", id);
    else url.searchParams.delete("plan");
    window.history.replaceState(null, "", url);
  };

  const show = useCallback(
    async (trip: UnderstoodTrip, meta: Omit<Shown, "plan">) => {
      const details = await loadDetails(trip.passes.map((p) => p.slug));
      const plan = buildPlan(trip, details, { today: pacificToday(), now: Date.now(), nameCounts });
      setShown({ ...meta, plan });
      setCopied(null);
      address(meta.id);
      count.current += 1;
      onTrip(plan.passes.length ? { slugs: plan.passes.map((p) => p.slug), n: count.current } : null);
    },
    [nameCounts, onTrip],
  );

  const userId = session?.user.id ?? null;
  useEffect(() => {
    if (!userId || !open) return;
    let cancelled = false;
    recentPlans().then((rows) => {
      if (!cancelled) setRecent(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, open, shown?.id]);

  useEffect(() => {
    // A link is opened once, after sign-in is known. The ref, not a cleanup,
    // guards it: the plan it loads changes `show`, which would otherwise
    // cancel the request that is loading it.
    if (!userId || !linked || opened.current === linked) return;
    opened.current = linked;
    setBusy(true);
    openPlan(linked)
      .then(async (row) => {
        if (row.text) setText(row.text);
        await show(row.trip, { id: row.id, empty: null, cached: true, shared: !row.mine });
      })
      .catch((err) => setError(err instanceof PlanError ? err.message : "That plan could not be opened."))
      .finally(() => setBusy(false));
  }, [userId, linked, show]);

  const submit = async (e: FormEvent, typed = text) => {
    e.preventDefault();
    const trip = typed.trim();
    if (!trip || busy) return;
    setBusy(true);
    setError(null);
    try {
      const reply = await planTrip(trip, share && position ? { lat: position.lat, lon: position.lon } : null);
      await show(reply.trip, { id: reply.id, empty: reply.empty, cached: reply.cached, shared: false });
    } catch (err) {
      setError(err instanceof PlanError ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const reopen = async (row: RecentPlan) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    setText(row.text);
    try {
      await show(row.trip, { id: row.id, empty: null, cached: true, shared: false });
    } finally {
      setBusy(false);
    }
  };

  const clear = () => {
    setShown(null);
    setError(null);
    setText("");
    address(null);
    onTrip(null);
    boxRef.current?.focus();
  };

  const close = () => {
    setOpen(false);
    address(null);
    onTrip(null);
  };

  const reveal = () => {
    setOpen(true);
    if (shown) {
      address(shown.id);
      count.current += 1;
      if (shown.plan.passes.length) onTrip({ slugs: shown.plan.passes.map((p) => p.slug), n: count.current });
    }
  };

  const copy = async () => {
    if (!shown?.id) return;
    const link = planLink(shown.id);
    try {
      await navigator.clipboard.writeText(link);
      setCopied("Link copied.");
    } catch {
      // Clipboard access can be refused; the link is shown to copy by hand.
      setCopied(link);
    }
  };

  // Sign-in lives in the question box of a pass panel. This opens a pass and
  // brings that box into view; it knows nothing else about how sign-in works.
  const toSignIn = () => {
    const slug = selected ?? passes.find((p) => p.tier === "featured")?.slug ?? passes[0]?.slug;
    if (!slug) return;
    onSelect(slug);
    let tries = 0;
    const seek = window.setInterval(() => {
      const box = document.querySelector("section[aria-label='Ask about this pass']");
      if (box || ++tries > 40) window.clearInterval(seek);
      if (!box) return;
      box.scrollIntoView({ block: "center" });
      box.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
    }, 100);
  };

  const openPass = (pass: PlanPass) => {
    onSelect(pass.slug);
    onShow(pass.lat, pass.lon);
  };

  if (!live) return null;

  const dates = shown ? datesLabel(shown.plan.trip, shown.plan.today) : null;

  return (
    <>
      {!open && (
        <button className={`display ${s.control}`} onClick={reveal} aria-haspopup="dialog">
          Plan a trip
        </button>
      )}
      {open && (
        <aside className={s.panel} aria-label="Trip planner">
          <header className={s.top}>
            <div>
              <h2 className={`display ${s.title}`}>Plan a trip</h2>
              <p className={`mono ${s.meta}`}>
                {shown && shown.plan.passes.length
                  ? [`${shown.plan.passes.length === 1 ? "1 pass" : `${shown.plan.passes.length} passes`}`, dates]
                      .filter(Boolean)
                      .join(" · ")
                  : "Washington, Oregon and California"}
              </p>
            </div>
            <button onClick={close} aria-label="Close trip planner" className={`mono ${s.close}`}>
              ✕
            </button>
          </header>

          {!ready && <p className={`mono ${s.meta}`}>...</p>}

          {ready && !session && (
            <p className={s.signin}>
              <button className={s.signinLink} onClick={toSignIn}>
                Sign in to plan a trip
              </button>
              <span className={`mono ${s.meta}`}> Sign-in is by email, in the question box on any pass.</span>
            </p>
          )}

          {ready && session && !shown?.shared && (
            <form onSubmit={submit} className={s.form}>
              <label htmlFor="trip-text" className={`mono ${s.meta}`}>
                Name the passes and the dates, in your own words.
              </label>
              <textarea
                id="trip-text"
                ref={boxRef}
                rows={3}
                maxLength={MAX_TRIP_CHARS}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) submit(e);
                }}
                placeholder="Glen Pass and Kearsarge Pass, this weekend, two of us"
                className={s.input}
              />
              {position && (
                <label className={`mono ${s.share}`}>
                  <input type="checkbox" checked={share} onChange={(e) => setShare(e.target.checked)} />
                  Use my position to tell apart passes that share a name. It is rounded before it is used and
                  never stored.
                </label>
              )}
              <div className={s.actions}>
                <button className={`display ${s.go}`} disabled={busy || !text.trim()}>
                  {busy ? "Reading" : "Plan"}
                </button>
                {shown && (
                  <button type="button" className={`display ${s.plain}`} onClick={clear}>
                    New plan
                  </button>
                )}
                {shown?.id && (
                  <button type="button" className={`display ${s.plain}`} onClick={copy}>
                    Copy link
                  </button>
                )}
              </div>
              {copied && (
                <p className={`mono ${s.meta}`} role="status">
                  {copied} It opens for anyone signed in who has it, and carries the passes and dates, not your
                  text.
                </p>
              )}
              {!shown && !busy && (
                <div className={s.examples}>
                  <span className={`mono ${s.meta}`}>For example</span>
                  {EXAMPLES.map((ex) => (
                    <button
                      key={ex}
                      type="button"
                      className={`mono ${s.example}`}
                      onClick={(e) => {
                        setText(ex);
                        submit(e, ex);
                      }}
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              )}
            </form>
          )}

          {ready && session && shown?.shared && (
            <div className={s.form}>
              <p className={`mono ${s.meta}`}>
                A plan shared by its link. It shows the passes and dates of someone else&apos;s trip, built from
                today&apos;s data.
              </p>
              <div className={s.actions}>
                <button type="button" className={`display ${s.plain}`} onClick={clear}>
                  New plan
                </button>
              </div>
            </div>
          )}

          {error && (
            <p role="alert" className={s.error}>
              {error}
            </p>
          )}

          {busy && !shown && <p className={`mono ${s.meta}`}>reading the trip</p>}

          {ready && session && shown && (
            <TripPlanView plan={shown.plan} empty={shown.empty} selected={selected} onOpen={openPass} />
          )}

          {ready && session && !shown && recent.length > 0 && (
            <section aria-label="Recent plans" className={s.recent}>
              <h3 className={`display ${s.head}`}>Recent plans</h3>
              <ul>
                {recent.map((row) => (
                  <li key={row.id}>
                    <button onClick={() => reopen(row)} className={s.recentRow}>
                      <span>{row.text}</span>
                      <span className={`mono ${s.meta}`}>
                        {row.trip.passes.map((p) => p.name).join(", ")}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </aside>
      )}
    </>
  );
}
