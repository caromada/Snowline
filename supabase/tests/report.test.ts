import { describe, expect, it } from "vitest";
import {
  MAX_REPORT_CHARS,
  MAX_WATER_SOURCE_CHARS,
  REPORTS_PER_DAY,
  REPORT_WINDOW_DAYS,
} from "../functions/_shared/config.ts";
import {
  type Filing,
  mergeReport,
  pacificToday,
  parseReading,
  type Reading,
  reportAllowance,
  validateFiling,
} from "../functions/_shared/report.ts";

const USER = "00000000-0000-0000-0000-000000000001";
const TODAY = "2026-09-29";
const base = { slug: "glen", date: TODAY, text: "Dry trail to the top.", taps: {} };

function filing(over: Partial<Filing> = {}): Filing {
  return { slug: "glen", date: TODAY, text: "", taps: {}, photoPath: null, ...over };
}

function reading(over: Partial<Reading> = {}): Reading {
  return {
    flag: "none",
    snow_condition: null,
    traction_used: null,
    crossing_condition: null,
    exposure_comfort: null,
    larches: null,
    wildflowers: null,
    mosquitoes: null,
    water_status: null,
    water_source: null,
    quote_span: null,
    ...over,
  };
}

describe("pacificToday", () => {
  it("reads the date at the passes, not in UTC", () => {
    expect(pacificToday(new Date("2026-09-30T05:30:00Z"))).toBe("2026-09-29");
    expect(pacificToday(new Date("2026-09-30T07:30:00Z"))).toBe("2026-09-30");
  });
  it("follows the winter offset", () => {
    expect(pacificToday(new Date("2026-12-02T07:30:00Z"))).toBe("2026-12-01");
  });
});

describe("validateFiling", () => {
  it("accepts words alone", () => {
    const checked = validateFiling(base, TODAY, USER);
    expect(checked).toEqual({ ok: true, value: filing({ text: "Dry trail to the top." }) });
  });
  it("accepts taps alone", () => {
    const checked = validateFiling({ ...base, text: "  ", taps: { snow_condition: "patchy" } }, TODAY, USER);
    expect(checked).toMatchObject({ ok: true, value: { text: "", taps: { snow_condition: "patchy" } } });
  });
  it("refuses a report with nothing in it", () => {
    expect(validateFiling({ ...base, text: "" }, TODAY, USER)).toMatchObject({ ok: false, code: "empty" });
  });
  it("refuses a body that is not an object", () => {
    expect(validateFiling(null, TODAY, USER)).toMatchObject({ ok: false, code: "bad_request" });
    expect(validateFiling("glen", TODAY, USER)).toMatchObject({ ok: false, code: "bad_request" });
  });
  it("refuses a slug that is not a pass slug", () => {
    expect(validateFiling({ ...base, slug: "Glen Pass" }, TODAY, USER)).toMatchObject({ ok: false, code: "bad_slug" });
    expect(validateFiling({ ...base, slug: 7 }, TODAY, USER)).toMatchObject({ ok: false, code: "bad_slug" });
  });
  it("refuses dates that are not real", () => {
    expect(validateFiling({ ...base, date: "2026-02-30" }, TODAY, USER)).toMatchObject({ ok: false, code: "bad_date" });
    expect(validateFiling({ ...base, date: "yesterday" }, TODAY, USER)).toMatchObject({ ok: false, code: "bad_date" });
    expect(validateFiling({ ...base, date: undefined }, TODAY, USER)).toMatchObject({ ok: false, code: "bad_date" });
  });
  it("refuses a date in the future", () => {
    expect(validateFiling({ ...base, date: "2026-09-30" }, TODAY, USER)).toMatchObject({
      ok: false,
      code: "date_in_future",
    });
  });
  it("accepts the oldest day in the window and refuses the day before it", () => {
    expect(REPORT_WINDOW_DAYS).toBe(30);
    expect(validateFiling({ ...base, date: "2026-08-30" }, TODAY, USER).ok).toBe(true);
    expect(validateFiling({ ...base, date: "2026-08-29" }, TODAY, USER)).toMatchObject({
      ok: false,
      code: "date_too_old",
    });
  });
  it("holds the words to the limit", () => {
    expect(validateFiling({ ...base, text: "a".repeat(MAX_REPORT_CHARS) }, TODAY, USER).ok).toBe(true);
    expect(validateFiling({ ...base, text: "a".repeat(MAX_REPORT_CHARS + 1) }, TODAY, USER)).toMatchObject({
      ok: false,
      code: "text_too_long",
    });
  });
  it("keeps the words as written apart from the ends and control characters", () => {
    const checked = validateFiling({ ...base, text: "  Snow  above\n10,000 ft.\u0000\u0007 " }, TODAY, USER);
    expect(checked).toMatchObject({ ok: true, value: { text: "Snow  above\n10,000 ft." } });
  });
  it("refuses a tap outside the allowed values", () => {
    for (const taps of [
      { snow_condition: "slushy" },
      { traction_used: "skis" },
      { crossing_condition: 3 },
      { larches: "gold" },
      { wildflowers: "lots" },
      { mosquitoes: "biblical" },
      { water_status: "frozen", water_source: "Rae Lakes outlet" },
    ]) {
      expect(validateFiling({ ...base, taps }, TODAY, USER)).toMatchObject({ ok: false, code: "bad_tap" });
    }
  });
  it("refuses a tap it does not know", () => {
    expect(validateFiling({ ...base, taps: { exposure_comfort: "sketchy" } }, TODAY, USER)).toMatchObject({
      ok: false,
      code: "bad_tap",
    });
    expect(validateFiling({ ...base, taps: { status: "visible" } }, TODAY, USER)).toMatchObject({
      ok: false,
      code: "bad_tap",
    });
  });
  it("reads a cleared tap as no tap", () => {
    const checked = validateFiling({ ...base, taps: { snow_condition: null, larches: "peak" } }, TODAY, USER);
    expect(checked).toMatchObject({ ok: true, value: { taps: { larches: "peak" } } });
    expect(checked.ok && "snow_condition" in checked.value.taps).toBe(false);
  });
  it("takes a named water source only with how it was running", () => {
    expect(
      validateFiling({ ...base, taps: { water_source: "Rae Lakes outlet" } }, TODAY, USER),
    ).toMatchObject({ ok: false, code: "water_needs_status" });
    expect(
      validateFiling({ ...base, taps: { water_status: "trickling", water_source: " Rae Lakes outlet " } }, TODAY, USER),
    ).toMatchObject({ ok: true, value: { taps: { water_status: "trickling", water_source: "Rae Lakes outlet" } } });
    expect(validateFiling({ ...base, taps: { water_status: "dry" } }, TODAY, USER).ok).toBe(true);
  });
  it("holds the water source to one short line", () => {
    const long = "a".repeat(MAX_WATER_SOURCE_CHARS + 1);
    expect(
      validateFiling({ ...base, taps: { water_status: "dry", water_source: long } }, TODAY, USER),
    ).toMatchObject({ ok: false, code: "water_source_too_long" });
    expect(
      validateFiling({ ...base, taps: { water_status: "dry", water_source: "creek\nat the junction" } }, TODAY, USER),
    ).toMatchObject({ ok: true, value: { taps: { water_source: "creek at the junction" } } });
  });
  it("takes a photo only from the filer's own folder", () => {
    const own = `${USER}/0b0e7c1e-6f1d-4d0a-9d55-3f6f5a1f0c11.jpg`;
    expect(validateFiling({ ...base, photo_path: own }, TODAY, USER)).toMatchObject({
      ok: true,
      value: { photoPath: own },
    });
    for (const path of [
      "00000000-0000-0000-0000-000000000002/0b0e7c1e-6f1d-4d0a-9d55-3f6f5a1f0c11.jpg",
      `${USER}/../x.jpg`,
      `${USER}/photo.png`,
      `/${own}`,
      42,
    ]) {
      expect(validateFiling({ ...base, photo_path: path }, TODAY, USER)).toMatchObject({
        ok: false,
        code: "bad_photo",
      });
    }
  });
});

describe("reportAllowance", () => {
  const room = { filedToday: 0, filedForPassToday: 0, spentTodayUsd: 0, budgetUsd: 5, needsReading: true };
  it("allows a first report", () => {
    expect(reportAllowance(room)).toEqual({ ok: true });
  });
  it("stops at the daily limit", () => {
    expect(REPORTS_PER_DAY).toBe(5);
    expect(reportAllowance({ ...room, filedToday: REPORTS_PER_DAY - 1 })).toEqual({ ok: true });
    expect(reportAllowance({ ...room, filedToday: REPORTS_PER_DAY })).toMatchObject({
      ok: false,
      reason: "daily_limit",
    });
  });
  it("allows one report per pass per day", () => {
    expect(reportAllowance({ ...room, filedForPassToday: 1 })).toMatchObject({ ok: false, reason: "pass_limit" });
  });
  it("pauses written reports once the day's budget is spent", () => {
    expect(reportAllowance({ ...room, spentTodayUsd: 5 })).toMatchObject({ ok: false, reason: "budget" });
  });
  it("still takes taps alone when the budget is spent, since nothing is read", () => {
    expect(reportAllowance({ ...room, spentTodayUsd: 5, needsReading: false })).toEqual({ ok: true });
  });
});

describe("parseReading", () => {
  it("accepts a complete record", () => {
    const raw = reading({ snow_condition: "patchy", quote_span: "patchy snow" });
    expect(parseReading(raw)).toEqual(raw);
  });
  it("refuses a record with a field missing", () => {
    const rest: Record<string, unknown> = { ...reading() };
    delete rest.quote_span;
    expect(parseReading(rest)).toBeNull();
  });
  it("refuses values outside the vocabulary", () => {
    expect(parseReading({ ...reading(), snow_condition: "slushy" })).toBeNull();
    expect(parseReading({ ...reading(), flag: "fine" })).toBeNull();
    expect(parseReading({ ...reading(), quote_span: 4 })).toBeNull();
  });
  it("refuses anything that is not a record", () => {
    expect(parseReading(null)).toBeNull();
    expect(parseReading("none")).toBeNull();
    expect(parseReading([])).toBeNull();
  });
});

describe("mergeReport", () => {
  const text = "Patchy snow on the north side, we used microspikes. The outlet creek is just a trickle.";

  it("publishes taps alone when nothing was read", () => {
    const merged = mergeReport(filing({ taps: { snow_condition: "none", larches: "turning" } }), null);
    expect(merged).toMatchObject({
      status: "visible",
      flag: null,
      snow_condition: "none",
      larches: "turning",
      traction_used: null,
      quote_span: null,
    });
    expect(merged.tapped).toEqual(["snow_condition", "larches"]);
  });
  it("fills what the words state", () => {
    const merged = mergeReport(
      filing({ text }),
      reading({ snow_condition: "patchy", traction_used: "microspikes", quote_span: "Patchy snow on the north side" }),
    );
    expect(merged).toMatchObject({
      status: "visible",
      snow_condition: "patchy",
      traction_used: "microspikes",
      crossing_condition: null,
      quote_span: "Patchy snow on the north side",
    });
    expect(merged.tapped).toEqual([]);
  });
  it("lets a tap win over what was read", () => {
    const merged = mergeReport(
      filing({ text, taps: { snow_condition: "continuous" } }),
      reading({ snow_condition: "patchy", traction_used: "microspikes" }),
    );
    expect(merged.snow_condition).toBe("continuous");
    expect(merged.traction_used).toBe("microspikes");
    expect(merged.tapped).toEqual(["snow_condition"]);
  });
  it("drops a quote that is not in the words", () => {
    const merged = mergeReport(filing({ text }), reading({ quote_span: "Deep snow everywhere" }));
    expect(merged.quote_span).toBeNull();
  });
  it("accepts a quote that differs only in spacing", () => {
    const merged = mergeReport(
      filing({ text: "Patchy snow\non the  north side." }),
      reading({ quote_span: "Patchy snow on the north side" }),
    );
    expect(merged.quote_span).toBe("Patchy snow on the north side");
  });
  it("drops a quote that runs long", () => {
    const long = "a".repeat(300);
    expect(mergeReport(filing({ text: long }), reading({ quote_span: long })).quote_span).toBeNull();
  });
  it("reads water from the words only when the source is named in them", () => {
    const named = mergeReport(filing({ text }), reading({ water_status: "trickling", water_source: "outlet creek" }));
    expect(named).toMatchObject({ water_status: "trickling", water_source: "outlet creek" });
    const invented = mergeReport(filing({ text }), reading({ water_status: "trickling", water_source: "Bubbs Creek" }));
    expect(invented).toMatchObject({ water_status: null, water_source: null });
    const unnamed = mergeReport(filing({ text }), reading({ water_status: "dry", water_source: null }));
    expect(unnamed).toMatchObject({ water_status: null, water_source: null });
  });
  it("keeps the person's water entry whole when they made one", () => {
    const merged = mergeReport(
      filing({ text, taps: { water_status: "dry" } }),
      reading({ water_status: "trickling", water_source: "outlet creek" }),
    );
    expect(merged).toMatchObject({ water_status: "dry", water_source: null });
    expect(merged.tapped).toEqual(["water_status"]);
  });
  it("hides flagged text and keeps nothing the model read from it", () => {
    const merged = mergeReport(
      filing({ text: "Cheap gear at example.test", taps: { mosquitoes: "bad" } }),
      reading({ flag: "advertisement", snow_condition: "deep", quote_span: "Cheap gear" }),
    );
    expect(merged).toMatchObject({
      status: "hidden",
      flag: "advertisement",
      snow_condition: null,
      quote_span: null,
      mosquitoes: "bad",
    });
  });
  it("hides text the model would not read", () => {
    expect(mergeReport(filing({ text }), "refused")).toMatchObject({ status: "hidden", flag: "unreadable" });
  });
});
