import { describe, expect, it } from "vitest";
import { MAX_UPLOAD_BYTES } from "../../web/lib/photo";
import { pacificToday as appToday } from "../../web/lib/reports";
import * as app from "../../web/lib/reportTypes";
import * as limits from "../functions/_shared/config.ts";
import { pacificToday } from "../functions/_shared/report.ts";
import * as fields from "../functions/_shared/reportFields.ts";

// The app cannot import the backend's modules, so it repeats the vocabulary
// and the limits. These tests hold the two copies together.
describe("the app and the backend", () => {
  it("offer the same choices", () => {
    expect(app.TAP_CHOICES).toEqual(fields.TAP_CHOICES);
    expect(app.EXPOSURE).toEqual(fields.EXPOSURE);
  });
  it("hold the same limits", () => {
    expect(app.MAX_REPORT_CHARS).toBe(limits.MAX_REPORT_CHARS);
    expect(app.MAX_WATER_SOURCE_CHARS).toBe(limits.MAX_WATER_SOURCE_CHARS);
    expect(app.REPORT_WINDOW_DAYS).toBe(limits.REPORT_WINDOW_DAYS);
    expect(app.PHOTO_BUCKET).toBe(limits.PHOTO_BUCKET);
    expect(MAX_UPLOAD_BYTES).toBe(limits.MAX_PHOTO_BYTES);
  });
  it("agree on what day it is at the passes", () => {
    for (const at of ["2026-09-30T05:30:00Z", "2026-09-30T07:30:00Z", "2026-12-02T07:30:00Z"]) {
      expect(appToday(new Date(at))).toBe(pacificToday(new Date(at)));
    }
  });
});
