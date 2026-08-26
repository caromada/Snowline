"""Build gazetteer/passes.json: 15 Sierra passes with polygons and aliases.

Coordinates are approximate saddle locations (within ~1 km). Polygons are
octagonal buffers around the saddle, sized to cover the approach bowls that
satellite sampling cares about.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

PASSES: list[dict] = [
    {
        "slug": "kearsarge",
        "name": "Kearsarge Pass",
        "elevation_ft": 11709,
        "lat": 36.7728,
        "lon": -118.3736,
        "aliases": ["kearsarge", "kearsage", "kersarge", "kearsarge pass", "onion valley pass"],
        "creek": "Independence Creek / Bubbs Creek",
        "aspect_note": "north side holds snow late; east approach from Onion Valley",
    },
    {
        "slug": "bishop",
        "name": "Bishop Pass",
        "elevation_ft": 11972,
        "lat": 37.1049,
        "lon": -118.5570,
        "aliases": ["bishop", "bishop pass", "south lake pass"],
        "creek": "South Fork Bishop Creek",
        "aspect_note": "long north-facing ramp above Bishop Lake holds snow",
    },
    {
        "slug": "piute",
        "name": "Piute Pass",
        "elevation_ft": 11423,
        "lat": 37.2262,
        "lon": -118.6812,
        "aliases": ["piute", "piute pass", "paiute pass", "paiute"],
        "creek": "North Fork Bishop Creek / Piute Creek",
        "aspect_note": "gentle grade, melts early relative to neighbors",
    },
    {
        "slug": "mono",
        "name": "Mono Pass",
        "elevation_ft": 12060,
        "lat": 37.3743,
        "lon": -118.7817,
        "aliases": ["mono", "mono pass", "mono pass (rock creek)"],
        "creek": "Rock Creek",
        "aspect_note": "the Rock Creek Mono Pass, not the Bloody Canyon one",
    },
    {
        "slug": "duck",
        "name": "Duck Pass",
        "elevation_ft": 10797,
        "lat": 37.5432,
        "lon": -118.9450,
        "aliases": ["duck", "duck pass", "duck lake pass"],
        "creek": "Mammoth Creek / Duck Creek",
        "aspect_note": "lowest of the set, first to open most years",
    },
    {
        "slug": "taboose",
        "name": "Taboose Pass",
        "elevation_ft": 11417,
        "lat": 37.0058,
        "lon": -118.4266,
        "aliases": ["taboose", "taboose pass"],
        "creek": "Taboose Creek",
        "aspect_note": "brutal east approach, snow lingers in the upper bowl",
    },
    {
        "slug": "sawmill",
        "name": "Sawmill Pass",
        "elevation_ft": 11347,
        "lat": 36.9297,
        "lon": -118.3891,
        "aliases": ["sawmill", "sawmill pass"],
        "creek": "Sawmill Creek",
        "aspect_note": "dry east side, snow mostly on the west ramp",
    },
    {
        "slug": "baxter",
        "name": "Baxter Pass",
        "elevation_ft": 12290,
        "lat": 36.8757,
        "lon": -118.3620,
        "aliases": ["baxter", "baxter pass"],
        "creek": "North Fork Oak Creek",
        "aspect_note": "high, rarely traveled, reports are sparse",
    },
    {
        "slug": "shepherd",
        "name": "Shepherd Pass",
        "elevation_ft": 12050,
        "lat": 36.6931,
        "lon": -118.3572,
        "aliases": ["shepherd", "shepherd pass", "shepherds pass", "shepherd's pass"],
        "creek": "Shepherd Creek / Symmes Creek",
        "aspect_note": "notorious north-facing headwall chute, ice axe terrain into July",
    },
    {
        "slug": "glen",
        "name": "Glen Pass",
        "elevation_ft": 11926,
        "lat": 36.7854,
        "lon": -118.4166,
        "aliases": [
            "glen",
            "glen pass",
            "glenn pass",
            "the pass after rae lakes",
            "pass after rae lakes",
        ],
        "creek": "Bubbs Creek / Woods Creek",
        "aspect_note": "steep north-side switchbacks hold a snowfield deep into season",
    },
    {
        "slug": "muir",
        "name": "Muir Pass",
        "elevation_ft": 11955,
        "lat": 37.1119,
        "lon": -118.6712,
        "aliases": ["muir", "muir pass", "the hut pass", "muir hut"],
        "creek": "Evolution Creek / Middle Fork Kings",
        "aspect_note": "miles of gentle snow basin on both sides, slow but not steep",
    },
    {
        "slug": "mather",
        "name": "Mather Pass",
        "elevation_ft": 12100,
        "lat": 37.0479,
        "lon": -118.5084,
        "aliases": ["mather", "mather pass", "the golden staircase pass"],
        "creek": "Palisade Creek / South Fork Kings",
        "aspect_note": "steep south-side snow ramp early season",
    },
    {
        "slug": "pinchot",
        "name": "Pinchot Pass",
        "elevation_ft": 12130,
        "lat": 36.9394,
        "lon": -118.4139,
        "aliases": ["pinchot", "pinchot pass"],
        "creek": "Woods Creek / South Fork Kings",
        "aspect_note": "broad and moderate, crossings below matter more than the pass",
    },
    {
        "slug": "forester",
        "name": "Forester Pass",
        "elevation_ft": 13153,
        "lat": 36.6935,
        "lon": -118.3735,
        "aliases": ["forester", "forester pass", "forrester pass", "forrester"],
        "creek": "Tyndall Creek / Bubbs Creek",
        "aspect_note": "highest point on the PCT, the north-side chute is the crux",
    },
    {
        "slug": "donohue",
        "name": "Donohue Pass",
        "elevation_ft": 11056,
        "lat": 37.7607,
        "lon": -119.2477,
        "aliases": ["donohue", "donohue pass", "donahue pass", "donahue"],
        "creek": "Rush Creek / Lyell Fork",
        "aspect_note": "Yosemite boundary, broad snow flats on the Lyell side",
    },
]

BUFFER_M = 600.0


def octagon(lat: float, lon: float, radius_m: float) -> list[list[float]]:
    """Octagonal ring around a point, closed, as [lon, lat] pairs."""
    ring: list[list[float]] = []
    for i in range(8):
        ang = math.pi / 8 + i * math.pi / 4
        dlat = (radius_m * math.sin(ang)) / 111_320.0
        dlon = (radius_m * math.cos(ang)) / (111_320.0 * math.cos(math.radians(lat)))
        ring.append([round(lon + dlon, 6), round(lat + dlat, 6)])
    ring.append(ring[0])
    return ring


def main() -> None:
    features = []
    for p in PASSES:
        features.append(
            {
                **p,
                "polygon": {
                    "type": "Polygon",
                    "coordinates": [octagon(p["lat"], p["lon"], BUFFER_M)],
                },
            }
        )
    out = Path(__file__).resolve().parent.parent / "gazetteer" / "passes.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"passes": features}, indent=1) + "\n")
    print(f"wrote {out} ({len(features)} passes)")


if __name__ == "__main__":
    main()
