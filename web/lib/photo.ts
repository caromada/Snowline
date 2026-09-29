// A report's photo is re-drawn in the browser before it goes anywhere.
// Drawing to a canvas and encoding the canvas keeps the pixels and nothing
// else: no location, no camera, no time, no embedded thumbnail.
import type { PreparedPhoto } from "./reportTypes";

export const MAX_PHOTO_FILE_BYTES = 15 * 1024 * 1024;
export const MAX_PHOTO_SIDE = 1600;
/** The bucket's own limit. A 1600 px JPEG is far below it. */
export const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
export const PHOTO_ACCEPT = "image/jpeg,image/png,image/heic,image/heif,image/webp,.heic,.heif";

const TYPES = new Set(["image/jpeg", "image/png", "image/heic", "image/heif", "image/webp"]);
const NAMES = /\.(jpe?g|png|heic|heif|webp)$/i;

export function photoFileProblem(file: { type: string; name: string; size: number }): string | null {
  // Some browsers report no type for HEIC, so the name stands in.
  const known = file.type ? TYPES.has(file.type.toLowerCase()) : NAMES.test(file.name);
  if (!known) return "That file is not a JPEG, PNG, HEIC or WebP photo.";
  if (file.size > MAX_PHOTO_FILE_BYTES) return "That photo is over 15 MB. Choose a smaller one.";
  if (file.size === 0) return "That file is empty.";
  return null;
}

export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export class PhotoError extends Error {}

const UNREADABLE = "This browser could not read that photo. A JPEG or PNG copy of it will work.";

async function decode(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; done: () => void }> {
  if (typeof createImageBitmap === "function") {
    try {
      // "from-image" turns the picture the way its metadata says before the
      // metadata is dropped.
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, done: () => bitmap.close() };
    } catch {
      // Fall through: some browsers decode in an image element what they
      // will not decode here.
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, done: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    throw new PhotoError(UNREADABLE);
  }
}

function encode(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

/** The photo at no more than 1600 px on its long side, as a fresh JPEG
 * with no metadata. Nothing is sent anywhere by this function. */
export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  const problem = photoFileProblem(file);
  if (problem) throw new PhotoError(problem);
  const decoded = await decode(file);
  try {
    if (!decoded.width || !decoded.height) throw new PhotoError(UNREADABLE);
    const { width, height } = fitWithin(decoded.width, decoded.height, MAX_PHOTO_SIDE);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new PhotoError(UNREADABLE);
    // JPEG has no transparency; a transparent PNG would otherwise go black.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(decoded.source, 0, 0, width, height);
    for (const quality of [0.85, 0.7]) {
      const blob = await encode(canvas, quality);
      if (blob && blob.type === "image/jpeg" && blob.size <= MAX_UPLOAD_BYTES) return { blob, width, height };
    }
    throw new PhotoError(UNREADABLE);
  } finally {
    decoded.done();
  }
}
