// The pass vignette: a 96x32 pixel scene generated from the fused data.
// Snowline sits at the reported cover, the creek runs at the gauge level,
// the sky shifts with the satellite's last clear pass. The fusion output
// rendered as a tiny landscape.

import { palette } from "./theme";
import type { VignetteParams } from "./types";

export const VIGNETTE_W = 96;
export const VIGNETTE_H = 32;

const SKY_ROWS = 12;
const CREEK_TOP = 28;

function hashCode(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// Ridge profile: two shoulders and a saddle in the middle, because these
// scenes are passes. Deterministic per pass slug.
export function ridgeProfile(slug: string): number[] {
  const h = hashCode(slug);
  const leftPeak = 4 + (h % 5); // y of left summit (smaller = taller)
  const rightPeak = 4 + ((h >> 3) % 5);
  const saddleY = 13 + ((h >> 6) % 3);
  const saddleX = 40 + ((h >> 9) % 16);
  const profile: number[] = [];
  for (let x = 0; x < VIGNETTE_W; x++) {
    let y: number;
    if (x < saddleX) {
      const t = x / saddleX;
      y = leftPeak + (saddleY - leftPeak) * smooth(t);
      y -= Math.sin(t * Math.PI) * 3;
    } else {
      const t = (x - saddleX) / (VIGNETTE_W - saddleX);
      y = saddleY + (rightPeak - saddleY) * smooth(t);
      y -= Math.sin(t * Math.PI) * 4;
    }
    const jitter = ((hashCode(slug + x) % 3) - 1) * 0.6;
    profile.push(Math.max(2, Math.min(CREEK_TOP - 3, Math.round(y + jitter))));
  }
  return profile;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

// phase: 0..1 assembly progress (terrain rises, then snow, then sky).
export function drawVignette(
  ctx: CanvasRenderingContext2D,
  slug: string,
  params: VignetteParams,
  phase = 1,
): void {
  ctx.clearRect(0, 0, VIGNETTE_W, VIGNETTE_H);
  const terrainPhase = Math.min(1, phase / 0.55);
  const snowPhase = Math.max(0, Math.min(1, (phase - 0.55) / 0.3));
  const skyPhase = Math.max(0, Math.min(1, (phase - 0.85) / 0.15));

  // Sky: deep pine, brightened toward snowmelt when the satellite has had
  // a recent clear look.
  ctx.fillStyle = palette.deepPine;
  ctx.fillRect(0, 0, VIGNETTE_W, VIGNETTE_H);
  if (params.sky_fresh && skyPhase > 0) {
    ctx.globalAlpha = 0.22 * skyPhase;
    ctx.fillStyle = palette.snowmelt;
    ctx.fillRect(0, 0, VIGNETTE_W, SKY_ROWS);
    ctx.globalAlpha = 1;
  }
  // A few stars/grain in the sky band.
  for (let i = 0; i < 6; i++) {
    const sx = (hashCode(slug + "star" + i) % VIGNETTE_W) | 0;
    const sy = hashCode(slug + "sy" + i) % (SKY_ROWS - 2);
    ctx.fillStyle = palette.sage;
    if (skyPhase > 0.5) ctx.fillRect(sx, sy + 1, 1, 1);
  }

  const profile = ridgeProfile(slug);
  // Terrain assembles bottom-up.
  const rise = Math.round((1 - terrainPhase) * VIGNETTE_H);
  const snowlineY = Math.round(
    SKY_ROWS + (CREEK_TOP - SKY_ROWS) * Math.max(0, Math.min(1, params.snowline_frac)) - 6,
  );
  for (let x = 0; x < VIGNETTE_W; x++) {
    const top = profile[x] + rise;
    for (let y = Math.max(0, top); y < VIGNETTE_H; y++) {
      const shadow = x > 0 && profile[x - 1] < profile[x];
      ctx.fillStyle = shadow ? palette.moss : palette.fern;
      if (y > CREEK_TOP + rise) ctx.fillStyle = palette.moss;
      ctx.fillRect(x, y, 1, 1);
    }
    // Snow paints above the snowline once terrain has landed.
    if (snowPhase > 0 && params.snow_cover > 0.02 && snowlineY > profile[x]) {
      const bottom = top + Math.max(0, Math.round((snowlineY - top) * snowPhase));
      for (let y = Math.max(0, top); y < Math.min(bottom, VIGNETTE_H); y++) {
        // Dither the snow edge so it reads hand-placed, not filled.
        const nearEdge = y > bottom - 3;
        if (nearEdge && hashCode(slug + x + ":" + y) % 3 === 0) continue;
        ctx.fillStyle = palette.granite;
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  // Creek along the bottom, level from the gauge.
  const creekRows = Math.max(params.creek_level > 0.02 ? 1 : 0, Math.round(params.creek_level * 3));
  if (terrainPhase >= 1 && creekRows > 0) {
    for (let x = 0; x < VIGNETTE_W; x++) {
      for (let r = 0; r < creekRows; r++) {
        const y = VIGNETTE_H - 1 - r;
        const gap = hashCode("w" + x + ":" + r) % 5 === 0;
        if (!gap) {
          ctx.fillStyle = palette.snowmelt;
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }
  }
}
