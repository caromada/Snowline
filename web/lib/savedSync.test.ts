import { describe, expect, it } from "vitest";
import {
  confirm,
  emptyState,
  expectedLocal,
  note,
  parseSaved,
  parseState,
  type Plan,
  reconcile,
  sameList,
  type ServerRow,
  type SyncState,
} from "./savedSync";

const ME = "00000000-0000-0000-0000-000000000001";
const OTHER = "00000000-0000-0000-0000-000000000002";
const T0 = Date.parse("2026-09-01T12:00:00Z");
const DAY = 86_400_000;

const row = (slug: string, savedAt = "2026-08-01T00:00:00+00:00"): ServerRow => ({ slug, savedAt });

function inStep(slugs: string[], syncedAt = T0): SyncState {
  return {
    user: ME,
    base: Object.fromEntries(slugs.map((s) => [s, row(s).savedAt])),
    pending: {},
    syncedAt,
  };
}

/** What the account holds once the plan's writes have gone through. */
function accountAfter(server: ServerRow[], plan: Plan): string[] {
  const gone = new Set(plan.remove.map((r) => r.slug));
  return [...server.map((r) => r.slug).filter((s) => !gone.has(s)), ...plan.save.map((s) => s.slug)].sort();
}

describe("parseSaved", () => {
  it("reads the list the pass panel writes", () => {
    expect(parseSaved('["glen","forester"]')).toEqual(["glen", "forester"]);
  });
  it("gives an empty list for nothing, for damage, and for the wrong shape", () => {
    expect(parseSaved(null)).toEqual([]);
    expect(parseSaved("{not json")).toEqual([]);
    expect(parseSaved('{"glen":true}')).toEqual([]);
  });
  it("leaves out repeats and anything the account would refuse", () => {
    expect(parseSaved('["glen","glen",7,null,"Bad Slug","ok-pass-2"]')).toEqual(["glen", "ok-pass-2"]);
  });
});

describe("parseState", () => {
  it("round trips a stored state", () => {
    const state: SyncState = {
      user: ME,
      base: { glen: "2026-08-01T00:00:00+00:00" },
      pending: { forester: { op: "save", at: T0 } },
      syncedAt: T0,
    };
    expect(parseState(JSON.stringify(state))).toEqual(state);
  });
  it("starts empty from nothing or from damage", () => {
    expect(parseState(null)).toEqual(emptyState());
    expect(parseState("[[[")).toEqual(emptyState());
    expect(parseState("null")).toEqual(emptyState());
  });
  it("drops entries it cannot trust", () => {
    const raw = JSON.stringify({
      user: 12,
      base: { glen: "2026-08-01T00:00:00+00:00", "Bad Slug": "x", muir: 5 },
      pending: { forester: { op: "explode", at: 1 }, pinchot: { op: "remove", at: "soon" } },
      syncedAt: "yesterday",
    });
    expect(parseState(raw)).toEqual({
      user: null,
      base: { glen: "2026-08-01T00:00:00+00:00" },
      pending: {},
      syncedAt: null,
    });
  });
});

describe("note", () => {
  it("queues a save and a removal with the time they were made", () => {
    const state = note(inStep(["glen", "muir"]), ["glen", "forester"], T0 + 5);
    expect(state.pending).toEqual({
      forester: { op: "save", at: T0 + 5 },
      muir: { op: "remove", at: T0 + 5 },
    });
  });
  it("queues nothing when the list is as expected", () => {
    expect(note(inStep(["glen"]), ["glen"], T0 + 5).pending).toEqual({});
  });
  it("keeps the first time for a change already queued", () => {
    const once = note(inStep(["glen"]), [], T0 + 5);
    expect(note(once, [], T0 + 900).pending).toEqual({ glen: { op: "remove", at: T0 + 5 } });
  });
  it("lets the newest change to a pass replace the queued one", () => {
    const removed = note(inStep(["glen"]), [], T0 + 5);
    const back = note(removed, ["glen"], T0 + 9);
    expect(back.pending).toEqual({ glen: { op: "save", at: T0 + 9 } });
  });
});

describe("reconcile on sign-in", () => {
  it("writes the union of the device and the account to both", () => {
    const server = [row("muir"), row("glen")];
    const plan = reconcile({ user: ME, local: ["glen", "forester"], server, state: emptyState(), now: T0 });
    expect(plan.local).toEqual(["glen", "forester", "muir"]);
    expect(plan.save.map((s) => s.slug)).toEqual(["forester"]);
    expect(plan.remove).toEqual([]);
    expect(plan.added).toEqual(["muir"]);
    expect(plan.dropped).toEqual([]);
    expect(accountAfter(server, plan)).toEqual(["forester", "glen", "muir"]);
  });
  it("treats a state left by another account as no state at all", () => {
    const theirs: SyncState = { ...inStep(["glen", "muir"]), user: OTHER };
    const plan = reconcile({ user: ME, local: ["glen"], server: [row("pinchot")], state: theirs, now: T0 });
    expect(plan.local).toEqual(["glen", "pinchot"]);
    expect(plan.save.map((s) => s.slug)).toEqual(["glen"]);
    expect(plan.remove).toEqual([]);
    expect(plan.state.user).toBe(ME);
  });
  it("keeps the device's order and appends arrivals oldest first", () => {
    const server = [row("zeta", "2026-08-03T00:00:00+00:00"), row("alpha", "2026-08-05T00:00:00+00:00")];
    const plan = reconcile({ user: ME, local: ["muir", "glen"], server, state: emptyState(), now: T0 });
    expect(plan.local).toEqual(["muir", "glen", "zeta", "alpha"]);
  });
  it("never sends a slug the account would refuse", () => {
    const plan = reconcile({ user: ME, local: ["glen", "Bad Slug"], server: [], state: emptyState(), now: T0 });
    expect(plan.save.map((s) => s.slug)).toEqual(["glen"]);
    expect(plan.local).toEqual(["glen"]);
  });
});

describe("reconcile between devices", () => {
  it("does not bring back a pass removed on another device", () => {
    // This device last saw glen and muir. Another device removed muir.
    const server = [row("glen")];
    const plan = reconcile({ user: ME, local: ["glen", "muir"], server, state: inStep(["glen", "muir"]), now: T0 + DAY });
    expect(plan.local).toEqual(["glen"]);
    expect(plan.dropped).toEqual(["muir"]);
    expect(plan.save).toEqual([]);
    expect(plan.remove).toEqual([]);
    expect(accountAfter(server, plan)).toEqual(["glen"]);
  });
  it("does not bring it back after signing out and in again on the stale device", () => {
    // Signing out leaves the state in place, so the base still names muir.
    const stale = inStep(["glen", "muir"]);
    const plan = reconcile({ user: ME, local: ["glen", "muir"], server: [row("glen")], state: stale, now: T0 + DAY });
    expect(plan.local).toEqual(["glen"]);
    expect(plan.save).toEqual([]);
  });
  it("picks up a pass saved on another device", () => {
    const plan = reconcile({
      user: ME,
      local: ["glen"],
      server: [row("glen"), row("muir")],
      state: inStep(["glen"]),
      now: T0 + DAY,
    });
    expect(plan.local).toEqual(["glen", "muir"]);
    expect(plan.added).toEqual(["muir"]);
    expect(plan.save).toEqual([]);
  });
  it("keeps a save made here while another device removed a different pass", () => {
    const server = [row("glen")];
    const state = note(inStep(["glen", "muir"]), ["glen", "muir", "forester"], T0 + 10);
    const plan = reconcile({ user: ME, local: ["glen", "muir", "forester"], server, state, now: T0 + DAY });
    expect(plan.local).toEqual(["glen", "forester"]);
    expect(plan.dropped).toEqual(["muir"]);
    expect(plan.save).toEqual([{ slug: "forester", at: T0 + 10 }]);
    expect(accountAfter(server, plan)).toEqual(["forester", "glen"]);
  });
  it("changes nothing when both sides already agree", () => {
    const plan = reconcile({
      user: ME,
      local: ["glen", "muir"],
      server: [row("muir"), row("glen")],
      state: inStep(["glen", "muir"]),
      now: T0 + DAY,
    });
    expect(plan.local).toEqual(["glen", "muir"]);
    expect([plan.save, plan.remove, plan.added, plan.dropped]).toEqual([[], [], [], []]);
    expect(plan.state.syncedAt).toBe(T0 + DAY);
  });
});

describe("reconcile after time offline", () => {
  it("replays a queued save and a queued removal", () => {
    const server = [row("glen"), row("muir")];
    let state = note(inStep(["glen", "muir"]), ["glen", "muir", "forester"], T0 + 10);
    state = note(state, ["glen", "forester"], T0 + 20);
    const plan = reconcile({ user: ME, local: ["glen", "forester"], server, state, now: T0 + DAY });
    expect(plan.save).toEqual([{ slug: "forester", at: T0 + 10 }]);
    expect(plan.remove).toEqual([{ slug: "muir", at: T0 + 20 }]);
    expect(plan.local).toEqual(["glen", "forester"]);
    expect(accountAfter(server, plan)).toEqual(["forester", "glen"]);
  });
  it("sends nothing for a pass saved and removed again before the account heard of it", () => {
    let state = note(inStep(["glen"]), ["glen", "forester"], T0 + 10);
    state = note(state, ["glen"], T0 + 20);
    const plan = reconcile({ user: ME, local: ["glen"], server: [row("glen")], state, now: T0 + DAY });
    expect([plan.save, plan.remove]).toEqual([[], []]);
    expect(plan.state.pending).toEqual({});
  });
  it("carries out a removal made while signed out, which nobody recorded", () => {
    const server = [row("glen"), row("muir")];
    const plan = reconcile({ user: ME, local: ["glen"], server, state: inStep(["glen", "muir"]), now: T0 + DAY });
    expect(plan.remove.map((r) => r.slug)).toEqual(["muir"]);
    expect(plan.local).toEqual(["glen"]);
  });
  it("sends a save made while signed out", () => {
    const plan = reconcile({
      user: ME,
      local: ["glen", "forester"],
      server: [row("glen")],
      state: inStep(["glen"]),
      now: T0 + DAY,
    });
    expect(plan.save.map((s) => s.slug)).toEqual(["forester"]);
  });
  it("keeps a pass saved again elsewhere after it was removed here", () => {
    const removedAt = T0 + 10;
    const state = note(inStep(["glen", "muir"]), ["glen"], removedAt);
    const server = [row("glen"), row("muir", new Date(removedAt + 60_000).toISOString())];
    const plan = reconcile({ user: ME, local: ["glen"], server, state, now: T0 + DAY });
    expect(plan.local).toEqual(["glen", "muir"]);
    expect(plan.remove).toEqual([]);
    expect(plan.state.pending).toEqual({});
  });
  it("removes a pass saved again elsewhere before it was removed here", () => {
    const removedAt = T0 + DAY / 2;
    const state = note(inStep(["glen", "muir"]), ["glen"], removedAt);
    const server = [row("glen"), row("muir", new Date(T0 + 60_000).toISOString())];
    const plan = reconcile({ user: ME, local: ["glen"], server, state, now: T0 + DAY });
    expect(plan.local).toEqual(["glen"]);
    expect(plan.remove).toEqual([{ slug: "muir", at: removedAt }]);
  });
  it("sends a pass saved here again even though another device removed it meanwhile", () => {
    let state = note(inStep(["glen", "muir"]), ["glen"], T0 + 10);
    state = note(state, ["glen", "muir"], T0 + 20);
    const plan = reconcile({ user: ME, local: ["glen", "muir"], server: [row("glen")], state, now: T0 + DAY });
    expect(plan.local).toEqual(["glen", "muir"]);
    expect(plan.save).toEqual([{ slug: "muir", at: T0 + 20 }]);
  });
});

describe("the state a plan leaves behind", () => {
  it("implies exactly the list the plan wrote", () => {
    const state = note(inStep(["glen", "muir", "pinchot"]), ["glen", "muir", "forester"], T0 + 10);
    const plan = reconcile({
      user: ME,
      local: ["glen", "muir", "forester"],
      server: [row("glen"), row("pinchot"), row("mather")],
      state,
      now: T0 + DAY,
    });
    expect([...expectedLocal(plan.state)].sort()).toEqual([...plan.local].sort());
  });
  it("gives an empty plan when run a second time after its writes are confirmed", () => {
    const server = [row("glen"), row("muir")];
    const state = note(inStep(["glen", "muir"]), ["glen", "forester"], T0 + 10);
    const first = reconcile({ user: ME, local: ["glen", "forester"], server, state, now: T0 + DAY });
    const settled = confirm(first.state, { saved: first.save, removed: first.remove }, T0 + DAY);
    const second = reconcile({
      user: ME,
      local: first.local,
      server: [row("glen"), row("forester", new Date(T0 + DAY).toISOString())],
      state: settled,
      now: T0 + 2 * DAY,
    });
    expect([second.save, second.remove, second.added, second.dropped]).toEqual([[], [], [], []]);
    expect(second.local).toEqual(first.local);
  });
  it("sends the same writes again when none of them got through", () => {
    const server = [row("glen"), row("muir")];
    const state = note(inStep(["glen", "muir"]), ["glen", "forester"], T0 + 10);
    const first = reconcile({ user: ME, local: ["glen", "forester"], server, state, now: T0 + DAY });
    const second = reconcile({ user: ME, local: first.local, server, state: first.state, now: T0 + 2 * DAY });
    expect(second.save).toEqual(first.save);
    expect(second.remove).toEqual(first.remove);
  });
});

describe("confirm", () => {
  const queued: SyncState = {
    user: ME,
    base: { glen: row("glen").savedAt, muir: row("muir").savedAt },
    pending: { forester: { op: "save", at: 10 }, muir: { op: "remove", at: 20 } },
    syncedAt: T0,
  };
  it("moves confirmed writes out of the queue and into the base", () => {
    const state = confirm(queued, { saved: [{ slug: "forester", at: 10 }], removed: [{ slug: "muir", at: 20 }] }, T0);
    expect(state.pending).toEqual({});
    expect(Object.keys(state.base).sort()).toEqual(["forester", "glen"]);
  });
  it("leaves a change made while the write was on its way", () => {
    const toggled: SyncState = { ...queued, pending: { ...queued.pending, forester: { op: "remove", at: 30 } } };
    const state = confirm(toggled, { saved: [{ slug: "forester", at: 10 }], removed: [] }, T0);
    expect(state.pending.forester).toEqual({ op: "remove", at: 30 });
    expect(state.base.forester).toBeDefined();
  });
  it("leaves the queue alone when nothing was confirmed", () => {
    expect(confirm(queued, { saved: [], removed: [] }, T0)).toEqual(queued);
  });
});

describe("sameList", () => {
  it("compares order as well as content", () => {
    expect(sameList(["a", "b"], ["a", "b"])).toBe(true);
    expect(sameList(["a", "b"], ["b", "a"])).toBe(false);
    expect(sameList(["a"], ["a", "b"])).toBe(false);
  });
});
