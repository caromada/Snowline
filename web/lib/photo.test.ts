import { describe, expect, it } from "vitest";
import { fitWithin, MAX_PHOTO_FILE_BYTES, MAX_PHOTO_SIDE, photoFileProblem } from "./photo";

describe("fitWithin", () => {
  it("brings the long side down to the limit and keeps the shape", () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(3000, 4000, 1600)).toEqual({ width: 1200, height: 1600 });
    expect(fitWithin(6000, 1000, 1600)).toEqual({ width: 1600, height: 267 });
  });
  it("never makes a photo larger", () => {
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(1600, 1600, 1600)).toEqual({ width: 1600, height: 1600 });
  });
  it("never rounds a side away to nothing", () => {
    expect(fitWithin(10000, 2, 1600)).toEqual({ width: 1600, height: 1 });
  });
  it("uses 1600 as the limit", () => {
    expect(MAX_PHOTO_SIDE).toBe(1600);
  });
});

describe("photoFileProblem", () => {
  const ok = { type: "image/jpeg", name: "pass.jpg", size: 4_000_000 };
  it("takes JPEG, PNG, HEIC and WebP", () => {
    for (const type of ["image/jpeg", "image/png", "image/heic", "image/heif", "image/webp"]) {
      expect(photoFileProblem({ ...ok, type })).toBeNull();
    }
  });
  it("goes by the name when the browser does not know the type, as with HEIC", () => {
    expect(photoFileProblem({ ...ok, type: "", name: "IMG_0042.HEIC" })).toBeNull();
    expect(photoFileProblem({ ...ok, type: "", name: "notes.txt" })).not.toBeNull();
  });
  it("refuses other kinds of file", () => {
    expect(photoFileProblem({ ...ok, type: "image/gif", name: "a.gif" })).toBe(
      "That file is not a JPEG, PNG, HEIC or WebP photo.",
    );
    expect(photoFileProblem({ ...ok, type: "image/svg+xml", name: "a.svg" })).not.toBeNull();
    expect(photoFileProblem({ ...ok, type: "video/mp4", name: "a.mp4" })).not.toBeNull();
  });
  it("refuses files over 15 MB before anything is read", () => {
    expect(MAX_PHOTO_FILE_BYTES).toBe(15 * 1024 * 1024);
    expect(photoFileProblem({ ...ok, size: MAX_PHOTO_FILE_BYTES })).toBeNull();
    expect(photoFileProblem({ ...ok, size: MAX_PHOTO_FILE_BYTES + 1 })).toBe(
      "That photo is over 15 MB. Choose a smaller one.",
    );
  });
  it("refuses an empty file", () => {
    expect(photoFileProblem({ ...ok, size: 0 })).not.toBeNull();
  });
});
