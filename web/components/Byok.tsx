"use client";

import { useEffect, useState } from "react";
import { askPass, extractReport, getStoredKey, setStoredKey } from "@/lib/llm";
import type { Extraction, PassDetail } from "@/lib/types";

// Bring-your-own-key features. Without a key this whole section is a single
// quiet line; with one, the live model reads reports and answers questions.
export default function Byok({ detail, evalDate }: { detail: PassDetail; evalDate: string }) {
  const [key, setKey] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  useEffect(() => {
    setKey(getStoredKey());
  }, []);

  const save = () => {
    setStoredKey(draft.trim());
    setKey(draft.trim() || null);
    setEditing(false);
    setDraft("");
  };

  return (
    <section
      aria-label="Live model features"
      style={{
        marginTop: 20,
        borderTop: "1px solid color-mix(in srgb, var(--granite) 14%, transparent)",
        paddingTop: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <h3 className="display" style={{ fontSize: 12, color: "var(--sage)" }}>
          Live model
        </h3>
        <button
          className="mono"
          style={{ color: "var(--snowmelt)", fontSize: 11 }}
          onClick={() => setEditing(!editing)}
        >
          {key ? "key saved · change" : "add your Anthropic API key"}
        </button>
      </div>
      {editing && (
        <div style={{ display: "flex", gap: 6, margin: "8px 0" }}>
          <input
            type="password"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="sk-ant-..."
            aria-label="Anthropic API key"
            className="mono"
            style={{
              flex: 1,
              background: "var(--deep-pine)",
              border: "1px solid var(--fern)",
              color: "var(--granite)",
              padding: "6px 8px",
            }}
          />
          <button
            onClick={save}
            className="mono"
            style={{ border: "1px solid var(--fern)", padding: "6px 10px", color: "var(--sage)" }}
          >
            save
          </button>
        </div>
      )}
      {!key && !editing && (
        <p className="mono" style={{ color: "var(--sage)", fontSize: 11, marginTop: 4 }}>
          everything above works without one; a key adds paste-a-report extraction and
          questions answered from this ledger. stored only in your browser.
        </p>
      )}
      {key && <PasteReport apiKey={key} />}
      {key && <AskPass apiKey={key} detail={detail} evalDate={evalDate} />}
    </section>
  );
}

function PasteReport({ apiKey }: { apiKey: string }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Extraction | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(await extractReport(apiKey, text));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ marginTop: 12 }}>
      <label className="mono" style={{ color: "var(--sage)", display: "block", marginBottom: 4 }}>
        paste any trip report, watch it become evidence
      </label>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        style={{
          width: "100%",
          background: "var(--deep-pine)",
          border: "1px solid color-mix(in srgb, var(--granite) 25%, transparent)",
          color: "var(--granite)",
          font: "inherit",
          padding: 8,
        }}
      />
      <button
        onClick={run}
        disabled={busy || text.trim().length < 20}
        className="mono"
        style={{
          marginTop: 6,
          border: "1px solid var(--fern)",
          color: busy ? "var(--sage)" : "var(--granite)",
          padding: "5px 12px",
        }}
      >
        {busy ? "reading..." : "extract"}
      </button>
      {error && (
        <p className="mono" style={{ color: "var(--alpenglow)", marginTop: 6 }}>
          {error}
        </p>
      )}
      {result && (
        <pre
          className="mono"
          style={{
            marginTop: 8,
            padding: 10,
            background: "var(--deep-pine)",
            color: "var(--snowmelt)",
            overflowX: "auto",
            fontSize: 11,
          }}
        >
          {JSON.stringify(result, null, 1)}
        </pre>
      )}
    </div>
  );
}

function AskPass({
  apiKey,
  detail,
  evalDate,
}: {
  apiKey: string;
  detail: PassDetail;
  evalDate: string;
}) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setAnswer(null);
    const status = detail.statuses[evalDate];
    const evidence = [
      `Status: ${status?.status_label} (confidence ${status?.confidence})`,
      ...(status?.facts.map((f) => `[${f.stream}] ${f.text}`) ?? []),
      ...(status?.conflicts.map((c) => `[conflict] ${c}`) ?? []),
      ...detail.ledger
        .filter((e) => e.source === "report" && e.date <= evalDate)
        .slice(0, 6)
        .map((e) => `[report ${e.date}] ${e.detail.quote ?? e.title}`),
    ].join("\n");
    try {
      setAnswer(await askPass(apiKey, detail.pass.name, evidence, q));
    } catch (e) {
      setAnswer(`error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ marginTop: 12 }}>
      <label className="mono" style={{ color: "var(--sage)", display: "block", marginBottom: 4 }}>
        ask this pass (answers only from the ledger)
      </label>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && q.trim() && run()}
          placeholder="do I need an ice axe this weekend?"
          style={{
            flex: 1,
            background: "var(--deep-pine)",
            border: "1px solid color-mix(in srgb, var(--granite) 25%, transparent)",
            color: "var(--granite)",
            font: "inherit",
            padding: "6px 8px",
          }}
        />
        <button
          onClick={run}
          disabled={busy || !q.trim()}
          className="mono"
          style={{ border: "1px solid var(--fern)", padding: "5px 12px", color: "var(--sage)" }}
        >
          {busy ? "..." : "ask"}
        </button>
      </div>
      {answer && <p style={{ marginTop: 8, color: "var(--granite)" }}>{answer}</p>}
    </div>
  );
}
