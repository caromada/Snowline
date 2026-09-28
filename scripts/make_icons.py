"""Render the app icons from the in-app pixel art.

The snowy-pine glyph is parsed straight out of web/lib/pixel.ts, so the home
screen icon can never drift from the sprite the map draws. Whole-pixel
nearest-neighbor scaling only: sprites never smear. The glyph sits inside
the maskable safe zone (the central 80% circle) so Android's shape masks
never clip the tree.

Usage: python -m scripts.make_icons
"""

from __future__ import annotations

import re
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
PIXEL_TS = ROOT / "web" / "lib" / "pixel.ts"
THEME_TS = ROOT / "web" / "lib" / "theme.ts"
OUT = ROOT / "web" / "public" / "icons"

INK = {
    "p": "deepPine",
    "m": "moss",
    "f": "fern",
    "s": "sage",
    "g": "granite",
    "b": "snowmelt",
    "a": "alpenglow",
}


def _palette() -> dict[str, tuple[int, int, int]]:
    text = THEME_TS.read_text()
    out = {}
    for name in INK.values():
        m = re.search(rf'{name}: "#([0-9A-Fa-f]{{6}})"', text)
        if not m:
            raise ValueError(f"palette value {name} missing from theme.ts")
        h = m.group(1)
        out[name] = (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))
    return out


def _sprite(name: str) -> list[str]:
    text = PIXEL_TS.read_text()
    m = re.search(rf"export const {name}: Sprite = \[(.*?)\];", text, re.S)
    if not m:
        raise ValueError(f"sprite {name} not found in pixel.ts")
    rows = re.findall(r'"([^"]*)"', m.group(1))
    if len(rows) != 16 or any(len(r) != 16 for r in rows):
        raise ValueError(f"sprite {name} is not 16x16")
    return rows


def render(size: int, glyph_px: int) -> Image.Image:
    """Icon of `size` px with the 16x16 glyph drawn at `glyph_px` px per cell."""
    pal = _palette()
    rows = _sprite("pineSnow")
    img = Image.new("RGB", (size, size), pal["deepPine"])
    span = 16 * glyph_px
    ox = oy = (size - span) // 2
    # One warm band of alpenglow for the horizon, behind the tree.
    band_top = oy + 12 * glyph_px
    for y in range(band_top, band_top + glyph_px):
        for x in range(size):
            img.putpixel((x, y), pal["alpenglow"])
    for ry, row in enumerate(rows):
        for rx, ch in enumerate(row):
            if ch == ".":
                continue
            color = pal[INK[ch]]
            for y in range(oy + ry * glyph_px, oy + (ry + 1) * glyph_px):
                for x in range(ox + rx * glyph_px, ox + (rx + 1) * glyph_px):
                    img.putpixel((x, y), color)
    return img


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    # (file, canvas size, px per sprite cell); glyph spans at most 75% of the
    # canvas, inside the maskable safe zone.
    for name, size, px in (
        ("icon-512.png", 512, 24),
        ("icon-192.png", 192, 9),
        ("apple-touch-icon.png", 180, 9),
        ("favicon-32.png", 32, 2),
    ):
        render(size, px).save(OUT / name, optimize=True)
        print(f"wrote {OUT / name}")


if __name__ == "__main__":
    main()
