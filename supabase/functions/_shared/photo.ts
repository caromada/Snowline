// The browser re-encodes every photo before upload, which leaves no
// metadata behind. This is the same promise kept a second time, for an
// upload that did not come through our form: the published copy is rebuilt
// from the picture's own segments and nothing else.

const SOI = 0xd8;
const EOI = 0xd9;
const SOS = 0xda;
const APP0 = 0xe0;
const APP2 = 0xe2;
const APP14 = 0xee;
const APP15 = 0xef;
const COM = 0xfe;
const ICC = "ICC_PROFILE\0";

function startsWith(bytes: Uint8Array, at: number, text: string): boolean {
  if (at + text.length > bytes.length) return false;
  for (let i = 0; i < text.length; i++) if (bytes[at + i] !== text.charCodeAt(i)) return false;
  return true;
}

function keeps(marker: number, bytes: Uint8Array, payloadAt: number): boolean {
  if (marker === COM) return false;
  if (marker < APP0 || marker > APP15) return true;
  if (marker === APP0 || marker === APP14) return true;
  return marker === APP2 && startsWith(bytes, payloadAt, ICC);
}

/** The photo without its metadata, or null when the bytes are not a whole
 * JPEG picture. Exif, XMP, IPTC, comments, and anything after the end of
 * the picture (a phone's attached video clip) are left out. */
export function stripJpegMetadata(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== SOI) return null;
  // The output is never longer than the input: segments are only dropped.
  const out = new Uint8Array(bytes.length);
  let written = 0;
  const copy = (from: number, to: number) => {
    out.set(bytes.subarray(from, to), written);
    written += to - from;
  };
  const mark = (marker: number) => {
    out[written++] = 0xff;
    out[written++] = marker;
  };

  mark(SOI);
  let at = 2;
  let sawPicture = false;

  while (at < bytes.length) {
    if (bytes[at] !== 0xff) return null;
    while (at < bytes.length && bytes[at] === 0xff) at++;
    if (at >= bytes.length) return null;
    const marker = bytes[at++];

    if (marker === EOI) {
      if (!sawPicture) return null;
      mark(EOI);
      return out.slice(0, written);
    }
    if (marker === SOI || marker === 0x00 || (marker >= 0xd0 && marker <= 0xd7)) return null;

    if (at + 2 > bytes.length) return null;
    const length = (bytes[at] << 8) | bytes[at + 1];
    if (length < 2 || at + length > bytes.length) return null;
    if (keeps(marker, bytes, at + 2)) {
      mark(marker);
      copy(at, at + length);
    }
    at += length;

    if (marker !== SOS) continue;
    sawPicture = true;
    // Entropy-coded data runs until the next real marker. Inside it a 0xff
    // is followed by 0x00 (a literal 0xff) or by a restart marker.
    const scanStart = at;
    while (at < bytes.length) {
      if (bytes[at] !== 0xff) {
        at++;
        continue;
      }
      const next = bytes[at + 1];
      if (next === undefined) return null;
      if (next !== 0x00 && (next < 0xd0 || next > 0xd7)) break;
      at += 2;
    }
    copy(scanStart, at);
  }
  return null;
}
