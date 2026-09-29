import { describe, expect, it } from "vitest";
import {
  agoInWords,
  dateChoices,
  draftProblem,
  emptyDraft,
  photoAlt,
  reportTags,
  seasonWatch,
  shortDate,
  splitByWindow,
  tapsOf,
  windowEnd,
} from "./reports";
import { MAX_REPORT_CHARS, type PassReport, SEASON_WINDOW_DAYS } from "./reportTypes";

const TODAY = "2026-10-04";
let made = 0;

function report(over: Partial<PassReport> = {}): PassReport {
  made += 1;
  return {
    id: `00000000-0000-0000-0000-${String(made).padStart(12, "0")}`,
    pass_slug: "glen",
    date_observed: TODAY,
    snow_condition: null,
    traction_used: null,
    crossing_condition: null,
    exposure_comfort: null,
    larches: null,
    wildflowers: null,
    mosquitoes: null,
    water_status: null,
    water_source: null,
    body: "",
    quote_span: null,
    photo_path: null,
    status: "visible",
    tapped: [],
    created_at: `${TODAY}T18:00:00Z`,
    mine: false,
    ...over,
  };
}

describe("dateChoices", () => {
  const choices = dateChoices(TODAY);
  it("starts today and reaches back thirty days", () => {
    expect(choices).toHaveLength(31);
    expect(choices[0]).toEqual({ value: "2026-10-04", label: "Today, Sun Oct 4" });
    expect(choices[1]).toEqual({ value: "2026-10-03", label: "Yesterday, Sat Oct 3" });
    expect(choices[2]).toEqual({ value: "2026-10-02", label: "Fri Oct 2" });
    expect(choices[30].value).toBe("2026-09-04");
  });
  it("crosses a year", () => {
    expect(dateChoices("2027-01-02")[3].value).toBe("2026-12-30");
  });
});

describe("agoInWords", () => {
  it("counts in days, then weeks, then months", () => {
    expect(agoInWords("2026-10-04", TODAY)).toBe("today");
    expect(agoInWords("2026-10-03", TODAY)).toBe("yesterday");
    expect(agoInWords("2026-10-01", TODAY)).toBe("3 days ago");
    expect(agoInWords("2026-09-21", TODAY)).toBe("13 days ago");
    expect(agoInWords("2026-09-20", TODAY)).toBe("2 weeks ago");
    expect(agoInWords("2026-09-04", TODAY)).toBe("4 weeks ago");
    expect(agoInWords("2026-08-01", TODAY)).toBe("2 months ago");
    expect(agoInWords("2025-10-01", TODAY)).toBe("over a year ago");
  });
  it("counts from the date being viewed, which can be before the report", () => {
    expect(agoInWords("2026-10-06", TODAY)).toBe("2 days later");
  });
});

describe("shortDate", () => {
  it("names the month and day", () => {
    expect(shortDate("2026-10-03")).toBe("Oct 3");
  });
});

describe("reportTags", () => {
  it("names each field the report carries, in the form's order", () => {
    const tags = reportTags(
      report({
        snow_condition: "patchy",
        traction_used: "spikes_and_axe",
        crossing_condition: "knee_high",
        exposure_comfort: "cautious",
        larches: "not_turning",
        mosquitoes: "bad",
        tapped: ["snow_condition", "mosquitoes"],
      }),
    );
    expect(tags.map((t) => t.text)).toEqual([
      "Snow: patchy",
      "Traction: microspikes and ice axe",
      "Crossing: knee high",
      "Travel felt: cautious",
      "Larches: not turning",
      "Mosquitoes: bad",
    ]);
    expect(tags.map((t) => t.tapped)).toEqual([true, false, false, false, false, true]);
  });
  it("puts the named source with the water", () => {
    expect(reportTags(report({ water_status: "trickling", water_source: "Rae Lakes outlet" }))[0].text).toBe(
      "Water: Rae Lakes outlet, trickling",
    );
    expect(reportTags(report({ water_status: "dry" }))[0].text).toBe("Water: dry");
  });
  it("is empty for words alone", () => {
    expect(reportTags(report({ body: "Fine day." }))).toEqual([]);
  });
});

describe("photoAlt", () => {
  it("is built from the report's own fields", () => {
    expect(
      photoAlt(report({ date_observed: "2026-10-03", snow_condition: "patchy", larches: "peak" }), "Glen Pass"),
    ).toBe("Photo filed by a visitor at Glen Pass on Oct 3, 2026. Snow: patchy. Larches: peak.");
  });
  it("says only what is known when the report has no fields", () => {
    expect(photoAlt(report({ date_observed: "2026-10-03" }), "Glen Pass")).toBe(
      "Photo filed by a visitor at Glen Pass on Oct 3, 2026.",
    );
  });
});

describe("seasonWatch", () => {
  it("is empty when no recent report carries a season item", () => {
    expect(seasonWatch([report({ snow_condition: "none" })], TODAY)).toEqual([]);
    expect(seasonWatch([], TODAY)).toEqual([]);
  });
  it("counts the reports that agree and dates the latest", () => {
    const lines = seasonWatch(
      [
        report({ larches: "turning", date_observed: "2026-10-03" }),
        report({ larches: "turning", date_observed: "2026-10-01" }),
      ],
      TODAY,
    );
    expect(lines).toEqual(["Larches: turning (2 reports, latest Oct 3)"]);
  });
  it("says one report when there is one", () => {
    expect(seasonWatch([report({ mosquitoes: "some", date_observed: "2026-09-30" })], TODAY)).toEqual([
      "Mosquitoes: some (1 report, latest Sep 30)",
    ]);
  });
  it("shows disagreement instead of settling it, newest first", () => {
    const lines = seasonWatch(
      [
        report({ larches: "turning", date_observed: "2026-09-28" }),
        report({ larches: "peak", date_observed: "2026-10-03" }),
        report({ larches: "peak", date_observed: "2026-10-02" }),
      ],
      TODAY,
    );
    expect(lines).toEqual(["Larches: peak (2 reports, latest Oct 3); turning (1 report, latest Sep 28)"]);
  });
  it("gives one line per item in a fixed order", () => {
    const lines = seasonWatch(
      [
        report({ water_status: "dry", water_source: "Outlet creek", mosquitoes: "none", date_observed: "2026-10-02" }),
        report({ wildflowers: "fading", larches: "dropped", date_observed: "2026-10-01" }),
      ],
      TODAY,
    );
    expect(lines).toEqual([
      "Larches: dropped (1 report, latest Oct 1)",
      "Wildflowers: fading (1 report, latest Oct 1)",
      "Mosquitoes: none (1 report, latest Oct 2)",
      "Water: Outlet creek, dry (1 report, latest Oct 2)",
    ]);
  });
  it("keeps water sources apart and reads their names without regard to case", () => {
    const lines = seasonWatch(
      [
        report({ water_status: "flowing", water_source: "Rae Lakes outlet", date_observed: "2026-10-03" }),
        report({ water_status: "flowing", water_source: "rae lakes outlet ", date_observed: "2026-10-01" }),
        report({ water_status: "dry", water_source: "Tarn below the pass", date_observed: "2026-10-02" }),
        report({ water_status: "trickling", date_observed: "2026-09-30" }),
      ],
      TODAY,
    );
    expect(lines).toEqual([
      "Water: Rae Lakes outlet, flowing (2 reports, latest Oct 3); Tarn below the pass, dry (1 report, latest Oct 2); unnamed source, trickling (1 report, latest Sep 30)",
    ]);
  });
  it("looks back fourteen days and no further", () => {
    expect(SEASON_WINDOW_DAYS).toBe(14);
    expect(seasonWatch([report({ larches: "peak", date_observed: "2026-09-20" })], TODAY)).toHaveLength(1);
    expect(seasonWatch([report({ larches: "peak", date_observed: "2026-09-19" })], TODAY)).toEqual([]);
  });
  it("leaves out reports after the date being viewed and reports that are hidden", () => {
    expect(seasonWatch([report({ larches: "peak", date_observed: "2026-10-05" })], TODAY)).toEqual([]);
    expect(seasonWatch([report({ larches: "peak", status: "hidden", mine: true })], TODAY)).toEqual([]);
  });
});

describe("splitByWindow", () => {
  it("puts the last thirty days first and the rest behind", () => {
    const inside = report({ date_observed: "2026-09-04" });
    const outside = report({ date_observed: "2026-09-03" });
    const newest = report({ date_observed: "2026-10-04" });
    const split = splitByWindow([outside, inside, newest], TODAY);
    expect(split.recent.map((r) => r.id)).toEqual([newest.id, inside.id]);
    expect(split.earlier.map((r) => r.id)).toEqual([outside.id]);
  });
  it("orders a day's reports by when they were filed, newest first", () => {
    const first = report({ created_at: "2026-10-04T15:00:00Z" });
    const second = report({ created_at: "2026-10-04T19:00:00Z" });
    expect(splitByWindow([first, second], TODAY).recent.map((r) => r.id)).toEqual([second.id, first.id]);
  });
  it("drops reports from after the date being viewed", () => {
    expect(splitByWindow([report({ date_observed: "2026-10-05" })], TODAY)).toEqual({ recent: [], earlier: [] });
  });
});

describe("windowEnd", () => {
  it("is today while the map shows the present, even when the data is a day old", () => {
    expect(windowEnd("2026-10-03", true, TODAY)).toBe(TODAY);
  });
  it("is the date on the history slider otherwise", () => {
    expect(windowEnd("2026-07-01", false, TODAY)).toBe("2026-07-01");
  });
});

describe("draftProblem", () => {
  it("passes words alone and taps alone", () => {
    expect(draftProblem({ ...emptyDraft(TODAY), text: "Dry to the top." })).toBeNull();
    expect(draftProblem({ ...emptyDraft(TODAY), snow_condition: "none" })).toBeNull();
  });
  it("asks for something to publish", () => {
    expect(draftProblem(emptyDraft(TODAY))).toBe("Write what you found or make at least one choice.");
    expect(draftProblem({ ...emptyDraft(TODAY), text: "   " })).not.toBeNull();
  });
  it("asks how a named water source was running", () => {
    expect(draftProblem({ ...emptyDraft(TODAY), water_source: "Outlet creek" })).toBe(
      "Choose how the water source was running, or clear its name.",
    );
  });
  it("holds the words to the limit", () => {
    expect(draftProblem({ ...emptyDraft(TODAY), text: "a".repeat(MAX_REPORT_CHARS + 1) })).not.toBeNull();
  });
});

describe("tapsOf", () => {
  it("sends only what was chosen", () => {
    expect(tapsOf({ ...emptyDraft(TODAY), snow_condition: "deep", water_status: "dry", water_source: "  " })).toEqual({
      snow_condition: "deep",
      water_status: "dry",
    });
    expect(tapsOf(emptyDraft(TODAY))).toEqual({});
  });
});
