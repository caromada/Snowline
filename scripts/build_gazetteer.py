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
    {
        "slug": "cottonwood",
        "name": "Cottonwood Pass",
        "elevation_ft": 11160,
        "lat": 36.4432,
        "lon": -118.2237,
        "aliases": ["cottonwood", "cottonwood pass", "horseshoe meadows pass"],
        "creek": "Cottonwood Creek",
        "aspect_note": "gentle grade from Horseshoe Meadows, one of the first to open",
    },
    {
        "slug": "new-army",
        "name": "New Army Pass",
        "elevation_ft": 12315,
        "lat": 36.4570,
        "lon": -118.2230,
        "aliases": ["new army", "new army pass", "army pass"],
        "creek": "Cottonwood Creek / Rock Creek (south)",
        "aspect_note": "north-facing switchbacks ice over early and late in season",
    },
    {
        "slug": "trail-crest",
        "name": "Trail Crest",
        "elevation_ft": 13645,
        "lat": 36.5622,
        "lon": -118.2932,
        "aliases": ["trail crest", "whitney trail crest", "the crest on whitney"],
        "creek": "Lone Pine Creek",
        "aspect_note": "the ninety-nine switchbacks and their cables hold ice into July",
    },
    {
        "slug": "colby",
        "name": "Colby Pass",
        "elevation_ft": 12000,
        "lat": 36.5728,
        "lon": -118.4440,
        "aliases": ["colby", "colby pass"],
        "creek": "Kern-Kaweah River",
        "aspect_note": "remote Kaweah headwaters, reports are rare",
    },
    {
        "slug": "franklin",
        "name": "Franklin Pass",
        "elevation_ft": 11760,
        "lat": 36.4166,
        "lon": -118.5530,
        "aliases": ["franklin", "franklin pass"],
        "creek": "Franklin Creek / Rattlesnake Creek",
        "aspect_note": "sandy south side melts early, north side holds",
    },
    {
        "slug": "sawtooth",
        "name": "Sawtooth Pass",
        "elevation_ft": 11630,
        "lat": 36.4528,
        "lon": -118.5561,
        "aliases": ["sawtooth", "sawtooth pass", "glacier pass"],
        "creek": "Monarch Creek",
        "aspect_note": "loose and steep out of Mineral King, miserable in snow",
    },
    {
        "slug": "kaweah-gap",
        "name": "Kaweah Gap",
        "elevation_ft": 10700,
        "lat": 36.5540,
        "lon": -118.5480,
        "aliases": ["kaweah gap", "kaweah", "hamilton lakes gap"],
        "creek": "Hamilton Creek / Big Arroyo",
        "aspect_note": "the High Sierra Trail crux, cirque holds snow above Precipice Lake",
    },
    {
        "slug": "elizabeth",
        "name": "Elizabeth Pass",
        "elevation_ft": 11375,
        "lat": 36.6222,
        "lon": -118.6222,
        "aliases": ["elizabeth", "elizabeth pass"],
        "creek": "Lone Pine Creek (Kings) / Deadman Canyon",
        "aspect_note": "steep snowfinger on the Deadman Canyon side lingers",
    },
    {
        "slug": "granite",
        "name": "Granite Pass",
        "elevation_ft": 10673,
        "lat": 36.9140,
        "lon": -118.5450,
        "aliases": ["granite", "granite pass"],
        "creek": "Dougherty Creek / Copper Creek",
        "aspect_note": "long dry climb out of Cedar Grove, snow only up top",
    },
    {
        "slug": "hell-for-sure",
        "name": "Hell For Sure Pass",
        "elevation_ft": 11297,
        "lat": 37.0470,
        "lon": -118.8150,
        "aliases": ["hell for sure", "hell for sure pass", "hell-for-sure"],
        "creek": "Fleming Creek / Goddard Canyon",
        "aspect_note": "Red Mountain Basin approach, better than the name suggests",
    },
    {
        "slug": "lamarck-col",
        "name": "Lamarck Col",
        "elevation_ft": 12880,
        "lat": 37.1728,
        "lon": -118.6620,
        "aliases": ["lamarck", "lamarck col", "the col"],
        "creek": "North Fork Bishop Creek / Darwin Canyon",
        "aspect_note": "cross-country into Darwin Canyon, permanent snowfield on the east",
    },
    {
        "slug": "pine-creek",
        "name": "Pine Creek Pass",
        "elevation_ft": 11120,
        "lat": 37.3230,
        "lon": -118.7380,
        "aliases": ["pine creek", "pine creek pass"],
        "creek": "Pine Creek / French Canyon",
        "aspect_note": "tungsten mine road start, gentle pass into French Canyon",
    },
    {
        "slug": "italy",
        "name": "Italy Pass",
        "elevation_ft": 12350,
        "lat": 37.3640,
        "lon": -118.7830,
        "aliases": ["italy", "italy pass", "lake italy pass"],
        "creek": "Pine Creek / Hilgard Branch",
        "aspect_note": "talus cross-country over the crest to Lake Italy",
    },
    {
        "slug": "selden",
        "name": "Selden Pass",
        "elevation_ft": 10910,
        "lat": 37.3066,
        "lon": -118.8652,
        "aliases": ["selden", "selden pass", "seldon", "seldon pass"],
        "creek": "Bear Creek / Sallie Keyes",
        "aspect_note": "mellow JMT pass, crossings below matter more than the top",
    },
    {
        "slug": "silver",
        "name": "Silver Pass",
        "elevation_ft": 10895,
        "lat": 37.4680,
        "lon": -118.9230,
        "aliases": ["silver", "silver pass"],
        "creek": "Silver Pass Creek / Fish Creek",
        "aspect_note": "the north-side creek crossing under the pass is the sting",
    },
    {
        "slug": "mcgee",
        "name": "McGee Pass",
        "elevation_ft": 11895,
        "lat": 37.5120,
        "lon": -118.8510,
        "aliases": ["mcgee", "mcgee pass", "mc gee pass"],
        "creek": "McGee Creek / Fish Creek",
        "aspect_note": "red slate country, long approach up McGee Creek",
    },
    {
        "slug": "parker",
        "name": "Parker Pass",
        "elevation_ft": 11100,
        "lat": 37.8390,
        "lon": -119.1990,
        "aliases": ["parker", "parker pass"],
        "creek": "Parker Pass Creek / Rush Creek",
        "aspect_note": "broad alpine plateau south of Tioga, gentle travel",
    },
    {
        "slug": "vogelsang",
        "name": "Vogelsang Pass",
        "elevation_ft": 10700,
        "lat": 37.7910,
        "lon": -119.3420,
        "aliases": ["vogelsang", "vogelsang pass"],
        "creek": "Fletcher Creek / Lewis Creek",
        "aspect_note": "Yosemite high country, opens earlier than the crest passes",
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
