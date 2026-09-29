import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  MAX_QUOTE_CHARS,
  MAX_REPORT_CHARS,
  MAX_WATER_SOURCE_CHARS,
  REPORTS_PER_DAY,
  REPORT_WINDOW_DAYS,
} from "../functions/_shared/config.ts";
import { FLAGS, READ_CHOICES, READ_FIELDS } from "../functions/_shared/reportFields.ts";

// The migration cannot import the vocabulary, so it repeats it. These tests
// read the SQL as text and hold the two together. They do not run the SQL.
const sql = readFileSync(
  fileURLToPath(new URL("../migrations/20261001000000_reports.sql", import.meta.url)),
  "utf8",
);

function allowedIn(column: string): string[] {
  const found = new RegExp(`(?<![a-z_])${column} in \\(([^)]*)\\)`).exec(sql.replace(/\s+/g, " "));
  if (!found) throw new Error(`no value list for ${column} in the migration`);
  return Array.from(found[1].matchAll(/'([^']+)'/g), (m) => m[1]);
}

describe("the reports migration", () => {
  it("allows exactly the values the function can write", () => {
    for (const field of READ_FIELDS) {
      expect(allowedIn(field), field).toEqual([...READ_CHOICES[field]]);
    }
    expect(allowedIn("flag")).toEqual([...FLAGS, "unreadable"]);
    expect(allowedIn("status")).toEqual(["visible", "hidden"]);
  });
  it("holds the same limits as the function", () => {
    expect(sql).toContain(`char_length(body) <= ${MAX_REPORT_CHARS}`);
    expect(sql).toContain(`char_length(water_source) between 1 and ${MAX_WATER_SOURCE_CHARS}`);
    expect(sql).toContain(`char_length(quote_span) <= ${MAX_QUOTE_CHARS}`);
    expect(sql).toContain(`today_at_the_pass - ${REPORT_WINDOW_DAYS}`);
    expect(sql).toContain(`filed >= ${REPORTS_PER_DAY}`);
  });
  it("turns row level security on", () => {
    expect(sql).toContain("alter table public.reports enable row level security");
  });
  it("gives the publishable key nothing on the table and reading alone on the view", () => {
    expect(sql).toContain("revoke all on public.reports from anon, authenticated");
    expect(sql).toContain("revoke all on public.pass_reports from anon, authenticated");
    expect(sql).toContain("grant select on public.pass_reports to anon, authenticated");
    expect(sql).not.toMatch(/grant [^;]*\bon public\.reports to [^;]*\banon\b/);
    expect(sql).not.toMatch(/grant insert/);
  });
  it("leaves the user id out of everything a browser can read", () => {
    const view = /create view public\.pass_reports[\s\S]*?from public\.reports r/.exec(sql)?.[0] ?? "";
    const columns = view.slice(view.indexOf("select")).replace(/coalesce\([^\n]*\) as mine/, "mine");
    expect(columns).not.toContain("user_id");
    expect(columns).not.toContain("model");
    const granted = /grant select \(([^)]*)\) on public\.reports to authenticated/.exec(sql)?.[1];
    expect(granted).toBe("id");
  });
  it("closes every definer function to browser roles and pins its search path", () => {
    const functions = Array.from(sql.matchAll(/create function (public\.\w+)\(/g), (m) => m[1]);
    expect(functions).toEqual([
      "public.reports_before_insert",
      "public.reports_before_update",
      "public.record_report",
    ]);
    for (const name of functions) {
      const body = sql.slice(sql.indexOf(`create function ${name}(`));
      expect(body.slice(0, body.indexOf("$$")), name).toContain("set search_path = ''");
      expect(sql, name).toMatch(
        new RegExp(`revoke execute on function ${name.replace(".", "\\.")}\\([^)]*\\)\\s+from public, anon, authenticated`),
      );
    }
  });
  it("keeps the photo bucket private", () => {
    expect(sql).toMatch(/values \('report-photos', 'report-photos', false,/);
  });
  it("has no em dashes", () => {
    expect(sql).not.toContain(String.fromCharCode(0x2014));
  });
});
