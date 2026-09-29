import struct
import zlib

import pytest

from ingest.terrain import decode_png_rgb, elevation_m, locate, terrarium_m


def _png(width: int, height: int, rows: list[bytes], filters: list[int]) -> bytes:
    def chunk(kind: bytes, body: bytes) -> bytes:
        crc = zlib.crc32(kind + body) & 0xFFFFFFFF
        return struct.pack(">I", len(body)) + kind + body + struct.pack(">I", crc)

    raw = b"".join(bytes([f]) + row for f, row in zip(filters, rows, strict=True))
    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", header)
        + chunk(b"IDAT", zlib.compress(raw))
        + chunk(b"IEND", b"")
    )


def test_decodes_unfiltered_rows() -> None:
    rows = [bytes([1, 2, 3, 4, 5, 6]), bytes([7, 8, 9, 10, 11, 12])]
    width, height, pixels = decode_png_rgb(_png(2, 2, rows, [0, 0]))
    assert (width, height) == (2, 2)
    assert pixels[0] == rows[0] and pixels[1] == rows[1]


def test_undoes_sub_up_average_and_paeth_filters() -> None:
    want = [
        bytes([10, 20, 30, 40, 50, 60]),
        bytes([11, 22, 33, 44, 55, 66]),
        bytes([12, 24, 36, 48, 60, 72]),
        bytes([13, 26, 39, 52, 65, 78]),
    ]

    def paeth(a: int, b: int, c: int) -> int:
        p = a + b - c
        pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
        return a if pa <= pb and pa <= pc else b if pb <= pc else c

    def encode(kind: int, row: bytes, prior: bytes) -> bytes:
        out = bytearray()
        for i, value in enumerate(row):
            left = row[i - 3] if i >= 3 else 0
            up = prior[i]
            up_left = prior[i - 3] if i >= 3 else 0
            predicted = {1: left, 2: up, 3: (left + up) // 2, 4: paeth(left, up, up_left)}[kind]
            out.append((value - predicted) % 256)
        return bytes(out)

    zero = bytes(6)
    rows = [
        encode(1, want[0], zero),
        encode(2, want[1], want[0]),
        encode(3, want[2], want[1]),
        encode(4, want[3], want[2]),
    ]
    _, _, pixels = decode_png_rgb(_png(2, 4, rows, [1, 2, 3, 4]))
    assert pixels == want


def test_rejects_anything_but_plain_8_bit_rgb() -> None:
    palette = bytearray(_png(1, 1, [bytes(3)], [0]))
    palette[25] = 3  # colour type byte in IHDR
    with pytest.raises(ValueError):
        decode_png_rgb(bytes(palette))
    with pytest.raises(ValueError):
        decode_png_rgb(b"not a png")


def test_terrarium_encoding() -> None:
    assert terrarium_m(128, 0, 0) == 0.0
    assert terrarium_m(134, 88, 0) == pytest.approx(1624.0)
    assert terrarium_m(127, 255, 128) == pytest.approx(-0.5)


def test_locate_finds_the_tile_and_pixel() -> None:
    # Null Island sits at the shared corner of the four central tiles.
    assert locate(0.0, 0.0, 1) == (1, 1, 0, 0)
    x, y, px, py = locate(36.7854, -118.4166, 12)
    assert (x, y) == (700, 1597)
    assert 0 <= px < 256 and 0 <= py < 256


def test_elevation_reads_the_pixel_from_a_fetched_tile() -> None:
    x, y, px, py = locate(36.7854, -118.4166, 12)
    row = bytearray(256 * 3)
    row[px * 3 : px * 3 + 3] = bytes([142, 51, 0])  # 3635 m
    rows = [bytes(256 * 3)] * 256
    rows[py] = bytes(row)
    tile = _png(256, 256, rows, [0] * 256)
    seen: list[tuple[int, int, int]] = []

    def fetch(z: int, tx: int, ty: int) -> bytes:
        seen.append((z, tx, ty))
        return tile

    assert elevation_m(36.7854, -118.4166, fetch=fetch) == pytest.approx(3635.0)
    assert seen == [(12, x, y)]
