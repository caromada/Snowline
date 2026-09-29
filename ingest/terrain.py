"""Ground elevation from the open Terrarium terrain tiles, the same ones
the map draws its relief from.

One tile answers every point inside it, so a few hundred tiles cover
thousands of trailheads. The tiles are plain 8-bit RGB PNGs, decoded here
with the standard library so the pipeline keeps its two dependencies.
"""

from __future__ import annotations

import math
import struct
import zlib
from collections.abc import Callable
from functools import lru_cache

import requests

from ingest.http import HEADERS

TILE_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png"
ZOOM = 12
TILE_PX = 256
FT_PER_M = 3.28084
_SIGNATURE = b"\x89PNG\r\n\x1a\n"

TileFetch = Callable[[int, int, int], bytes]


def _paeth(a: int, b: int, c: int) -> int:
    p = a + b - c
    pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
    if pa <= pb and pa <= pc:
        return a
    return b if pb <= pc else c


def decode_png_rgb(data: bytes) -> tuple[int, int, list[bytes]]:
    """Decode a non-interlaced 8-bit RGB PNG into (width, height, rows)."""
    if not data.startswith(_SIGNATURE):
        raise ValueError("not a PNG")
    width = height = 0
    body = bytearray()
    at = len(_SIGNATURE)
    while at < len(data):
        (length,) = struct.unpack(">I", data[at : at + 4])
        kind = data[at + 4 : at + 8]
        chunk = data[at + 8 : at + 8 + length]
        at += 12 + length
        if kind == b"IHDR":
            width, height, depth, colour, _, _, interlace = struct.unpack(">IIBBBBB", chunk)
            if (depth, colour, interlace) != (8, 2, 0):
                raise ValueError("only non-interlaced 8-bit RGB is supported")
        elif kind == b"IDAT":
            body.extend(chunk)
        elif kind == b"IEND":
            break
    raw = zlib.decompress(bytes(body))
    stride = width * 3
    rows: list[bytes] = []
    prior = bytes(stride)
    for r in range(height):
        start = r * (stride + 1)
        kind = raw[start]
        line = bytearray(raw[start + 1 : start + 1 + stride])
        for i in range(stride):
            left = line[i - 3] if i >= 3 else 0
            up = prior[i]
            if kind == 1:
                line[i] = (line[i] + left) & 0xFF
            elif kind == 2:
                line[i] = (line[i] + up) & 0xFF
            elif kind == 3:
                line[i] = (line[i] + (left + up) // 2) & 0xFF
            elif kind == 4:
                up_left = prior[i - 3] if i >= 3 else 0
                line[i] = (line[i] + _paeth(left, up, up_left)) & 0xFF
            elif kind != 0:
                raise ValueError(f"unknown PNG filter {kind}")
        prior = bytes(line)
        rows.append(prior)
    return width, height, rows


def terrarium_m(r: int, g: int, b: int) -> float:
    return (r * 256 + g + b / 256) - 32768


def locate(lat: float, lon: float, zoom: int = ZOOM) -> tuple[int, int, int, int]:
    """The tile holding a point and the pixel inside it: (x, y, px, py)."""
    n = 2**zoom
    fx = (lon + 180.0) / 360.0 * n
    fy = (1.0 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2.0 * n
    x, y = int(fx), int(fy)
    px = min(TILE_PX - 1, int((fx - x) * TILE_PX))
    py = min(TILE_PX - 1, int((fy - y) * TILE_PX))
    return x, y, px, py


@lru_cache(maxsize=512)
def _fetch_tile(z: int, x: int, y: int) -> bytes:
    resp = requests.get(TILE_URL.format(z=z, x=x, y=y), headers=HEADERS, timeout=30)
    resp.raise_for_status()
    return resp.content


@lru_cache(maxsize=512)
def _rows(z: int, x: int, y: int, fetch: TileFetch) -> list[bytes]:
    return decode_png_rgb(fetch(z, x, y))[2]


def elevation_m(lat: float, lon: float, fetch: TileFetch = _fetch_tile) -> float:
    x, y, px, py = locate(lat, lon)
    row = _rows(ZOOM, x, y, fetch)[py]
    return terrarium_m(row[px * 3], row[px * 3 + 1], row[px * 3 + 2])


def elevation_ft(lat: float, lon: float) -> int | None:
    """Feet above sea level, or None when the tile cannot be read."""
    try:
        return round(elevation_m(lat, lon) * FT_PER_M)
    except (requests.RequestException, ValueError, zlib.error, IndexError):
        return None
