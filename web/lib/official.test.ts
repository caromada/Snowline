import { describe, expect, it } from "vitest";
import { agoInWords, currentReports, daysAgo, longDate } from "./official";
import type { OfficialReport } from "./officialTypes";

// 2026-09-29 14:30 in California.
const NOW = Date.parse("2026-09-29T21:30:00Z");

function report(date: string, text = "Snow free."): OfficialReport {
  return {
    agency: "National Park Service",
    unit: "Sequoia and Kings Canyon National Parks",
    section: "Cedar Grove and Roads End",
    place: "Copper Creek and Granite Pass",
    text,
    truncated: false,
    date,
    url: "https://www.nps.gov/seki/planyourvisit/trailcond.htm",
    fetched_at: "2026-09-29T21:30:00+00:00",
    named_in: "place",
  };
}

describe("daysAgo", () => {
  it("counts calendar days in Pacific time", () => {
    expect(daysAgo("2026-09-29", NOW)).toBe(0);
    expect(daysAgo("2026-09-28", NOW)).toBe(1);
    expect(daysAgo("2026-09-08", NOW)).toBe(21);
  });

  it("does not roll to tomorrow while it is still evening in California", () => {
    // 05:00 UTC on the 30th is 22:00 on the 29th in California.
    expect(daysAgo("2026-09-29", Date.parse("2026-09-30T05:00:00Z"))).toBe(0);
  });

  it("gives null for what is not a date", () => {
    expect(daysAgo("soon", NOW)).toBeNull();
    expect(daysAgo("2026-02-30", NOW)).toBeNull();
    expect(daysAgo("", NOW)).toBeNull();
  });
});

describe("agoInWords", () => {
  it("writes the count out", () => {
    expect(agoInWords(0)).toBe("today");
    expect(agoInWords(1)).toBe("yesterday");
    expect(agoInWords(2)).toBe("two days ago");
    expect(agoInWords(8)).toBe("eight days ago");
    expect(agoInWords(14)).toBe("fourteen days ago");
    expect(agoInWords(21)).toBe("twenty-one days ago");
  });

  it("falls back to figures past what it can spell", () => {
    expect(agoInWords(40)).toBe("40 days ago");
  });
});

describe("longDate", () => {
  it("prints the agency's date without moving it across a time zone", () => {
    expect(longDate("2026-09-21")).toBe("September 21, 2026");
    expect(longDate("2026-01-01")).toBe("January 1, 2026");
  });
});

describe("currentReports", () => {
  it("keeps what is 21 days old or newer, and nothing dated ahead or undated", () => {
    const kept = currentReports(
      [
        report("2026-09-21", "kept"),
        report("2026-09-08", "kept at the limit"),
        report("2026-09-07", "one day past"),
        report("2026-09-30", "dated tomorrow"),
        report("soon", "no date"),
      ],
      NOW,
    );
    expect(kept.map((r) => r.text)).toEqual(["kept", "kept at the limit"]);
  });

  it("ages reports against the day the page is read, not the day it was built", () => {
    const later = Date.parse("2026-10-13T18:00:00Z");
    expect(currentReports([report("2026-09-21")], later)).toEqual([]);
  });
});
