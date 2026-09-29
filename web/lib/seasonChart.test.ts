import { describe, expect, it } from "vitest";
import {
  linePath,
  monthTicks,
  placeLabels,
  scaleTop,
  seasonCurves,
  seasonDay,
  valueOn,
  windowDays,
} from "./seasonChart";

const WINDOW = { from: "04-01", through: "08-31" };

describe("seasonDay", () => {
  it("counts from April 1 of the date's own year", () => {
    expect(seasonDay("2026-04-01")).toBe(0);
    expect(seasonDay("2026-06-10")).toBe(70);
  });

  it("lines leap years up with the others", () => {
    expect(seasonDay("2024-06-10")).toBe(seasonDay("2025-06-10"));
  });

  it("spans April 1 to August 31", () => {
    expect(windowDays(WINDOW)).toBe(152);
  });
});

describe("seasonCurves", () => {
  const points: [string, number][] = [
    ["2025-03-30", 9],
    ["2025-04-01", 10],
    ["2025-04-04", 8],
    ["2025-09-02", 3],
    ["2026-04-01", 4],
    ["2026-04-04", 391.8],
    ["2026-04-07", 2],
  ];

  it("splits one station curve into seasons inside the window", () => {
    const curves = seasonCurves(points, [2025, 2026], WINDOW, 150);
    expect(curves.map((c) => c.year)).toEqual([2025, 2026]);
    expect(curves[0].points.map((p) => p.day)).toEqual([0, 3]);
  });

  it("drops readings no snowpack can reach", () => {
    const curves = seasonCurves(points, [2026], WINDOW, 150);
    expect(curves[0].points.map((p) => p.value)).toEqual([4, 2]);
  });

  it("draws only the seasons it is asked for", () => {
    expect(seasonCurves(points, [2026], WINDOW, 150).map((c) => c.year)).toEqual([2026]);
  });

  it("drops a single stray reading between two that agree", () => {
    const stray: [string, number][] = [
      ["2023-05-10", 50.2],
      ["2023-05-13", 49.3],
      ["2023-05-14", 3],
      ["2023-05-16", 46.6],
    ];
    const [curve] = seasonCurves(stray, [2023], WINDOW, 150);
    expect(curve.points.map((p) => p.value)).toEqual([50.2, 49.3, 46.6]);
  });

  it("leaves out a season with fewer than two readings", () => {
    expect(seasonCurves([["2026-04-01", 4]], [2026], WINDOW, 150)).toEqual([]);
  });
});

describe("scaleTop", () => {
  it("rounds up to a clean number with at most five steps", () => {
    expect(scaleTop(77.5)).toEqual({ top: 80, step: 20 });
    expect(scaleTop(4.1)).toEqual({ top: 5, step: 1 });
    expect(scaleTop(24.9)).toEqual({ top: 25, step: 5 });
    expect(scaleTop(118)).toEqual({ top: 150, step: 50 });
  });

  it("still gives a scale when nothing was measured", () => {
    expect(scaleTop(0)).toEqual({ top: 1, step: 0.5 });
  });
});

describe("monthTicks", () => {
  it("marks the first of each month in the window", () => {
    expect(monthTicks(WINDOW)).toEqual([
      { day: 0, label: "Apr" },
      { day: 30, label: "May" },
      { day: 61, label: "Jun" },
      { day: 91, label: "Jul" },
      { day: 122, label: "Aug" },
    ]);
  });
});

describe("linePath", () => {
  it("joins the points with straight segments on whole pixels", () => {
    const d = linePath(
      [
        { day: 0, value: 10, date: "2026-04-01" },
        { day: 3, value: 5, date: "2026-04-04" },
      ],
      (day) => 10 + day * 2.26,
      (v) => 100 - v * 3.3,
    );
    expect(d).toBe("M10 67L17 84");
  });
});

describe("valueOn", () => {
  const curve = [
    { day: 0, value: 10, date: "2026-04-01" },
    { day: 3, value: 4, date: "2026-04-04" },
    { day: 30, value: 0, date: "2026-05-01" },
  ];

  it("reads between two readings", () => {
    expect(valueOn(curve, 1)).toBeCloseTo(8);
  });

  it("says nothing outside the record", () => {
    expect(valueOn(curve, 40)).toBeNull();
  });

  it("says nothing across a hole in the record", () => {
    expect(valueOn(curve, 15)).toBeNull();
  });
});

describe("placeLabels", () => {
  it("keeps the first label and drops ones that would touch it", () => {
    const placed = placeLabels(
      [
        { key: "2026", y: 100 },
        { key: "2025", y: 94 },
        { key: "2023", y: 20 },
      ],
      12,
    );
    expect(placed.map((l) => l.key)).toEqual(["2026", "2023"]);
  });
});
