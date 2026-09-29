import { describe, expect, it } from "vitest";
import { stripJpegMetadata } from "../functions/_shared/photo.ts";

const SOI = [0xff, 0xd8];
const EOI = [0xff, 0xd9];

function segment(marker: number, payload: number[]): number[] {
  const length = payload.length + 2;
  return [0xff, marker, length >> 8, length & 0xff, ...payload];
}

function ascii(text: string): number[] {
  return Array.from(text, (c) => c.charCodeAt(0));
}

const JFIF = segment(0xe0, [...ascii("JFIF\0"), 1, 1, 0, 0, 1, 0, 1, 0, 0]);
const EXIF = segment(0xe1, [...ascii("Exif\0\0"), ...ascii("GPS 36.77N 118.41W")]);
const XMP = segment(0xe1, ascii("http://ns.adobe.com/xap/1.0/\0<x:xmpmeta/>"));
const IPTC = segment(0xed, ascii("Photoshop 3.0\0byline"));
const COMMENT = segment(0xfe, ascii("shot on a phone"));
const ICC = segment(0xe2, [...ascii("ICC_PROFILE\0"), 1, 1, 9, 9]);
const MPF = segment(0xe2, [...ascii("MPF\0"), 7, 7]);
const ADOBE = segment(0xee, [...ascii("Adobe"), 0, 100, 0, 0, 0, 0, 1]);
const DQT = segment(0xdb, [0, 1, 2, 3]);
const SOF = segment(0xc0, [8, 0, 2, 0, 2, 1, 1, 0x11, 0]);
const DHT = segment(0xc4, [0, 1, 2]);
const SOS = segment(0xda, [1, 1, 0, 0, 0x3f, 0]);
// Entropy-coded data: a stuffed 0xff, a restart marker, and bytes that
// spell "Exif" to prove the scan is copied and not searched.
const SCAN = [0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, ...ascii("Exif"), 0x56];

function jpeg(...parts: number[][]): Uint8Array {
  return Uint8Array.from([...SOI, ...parts.flat()]);
}

function text(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => String.fromCharCode(b)).join("");
}

describe("stripJpegMetadata", () => {
  it("returns a clean photo byte for byte", () => {
    const clean = jpeg(JFIF, DQT, SOF, DHT, SOS, SCAN, EOI);
    expect(stripJpegMetadata(clean)).toEqual(clean);
  });
  it("drops location, camera and caption blocks and keeps the picture", () => {
    const dirty = jpeg(JFIF, EXIF, XMP, IPTC, COMMENT, MPF, DQT, SOF, DHT, SOS, SCAN, EOI);
    const out = stripJpegMetadata(dirty);
    expect(out).toEqual(jpeg(JFIF, DQT, SOF, DHT, SOS, SCAN, EOI));
    expect(text(out!)).not.toContain("GPS");
    expect(text(out!)).not.toContain("xmpmeta");
    expect(text(out!)).not.toContain("byline");
    expect(text(out!)).not.toContain("shot on a phone");
  });
  it("keeps what the colors need", () => {
    const out = stripJpegMetadata(jpeg(JFIF, ICC, ADOBE, EXIF, DQT, SOF, DHT, SOS, SCAN, EOI));
    expect(out).toEqual(jpeg(JFIF, ICC, ADOBE, DQT, SOF, DHT, SOS, SCAN, EOI));
  });
  it("follows a progressive photo through every scan", () => {
    const progressive = jpeg(JFIF, EXIF, DQT, SOF, DHT, SOS, SCAN, DHT, SOS, SCAN, EOI);
    expect(stripJpegMetadata(progressive)).toEqual(jpeg(JFIF, DQT, SOF, DHT, SOS, SCAN, DHT, SOS, SCAN, EOI));
  });
  it("cuts whatever trails the end of the picture", () => {
    const trailing = Uint8Array.from([...jpeg(JFIF, DQT, SOF, DHT, SOS, SCAN, EOI), ...ascii("ftypmp42 a video")]);
    expect(stripJpegMetadata(trailing)).toEqual(jpeg(JFIF, DQT, SOF, DHT, SOS, SCAN, EOI));
  });
  it("refuses what is not a photo", () => {
    expect(stripJpegMetadata(Uint8Array.from(ascii("<svg onload=alert(1)>")))).toBeNull();
    expect(stripJpegMetadata(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]))).toBeNull();
    expect(stripJpegMetadata(new Uint8Array())).toBeNull();
  });
  it("refuses a photo that is cut short", () => {
    expect(stripJpegMetadata(jpeg(JFIF, DQT, SOF, DHT, SOS, SCAN))).toBeNull();
    expect(stripJpegMetadata(jpeg(JFIF, DQT).slice(0, -2))).toBeNull();
    expect(stripJpegMetadata(Uint8Array.from([...SOI, 0xff, 0xe1, 0xff, 0xff, 1, 2]))).toBeNull();
  });
  it("refuses a photo with no picture in it", () => {
    expect(stripJpegMetadata(jpeg(JFIF, EXIF, EOI))).toBeNull();
  });
});
