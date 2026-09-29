"""Build gazetteer/passes.json: the whole Sierra.

Two tiers merge here:
- featured: the hand-curated passes with aliases, creek names, and aspect
  notes. Their positions and elevations come from the OpenStreetMap node
  that carries the same name; the hand-entered "near" point only picks
  between namesakes, and sits up to 11 km from the saddle it names.
- osm: every other named mountain pass and saddle in the range, pulled from
  OpenStreetMap (gazetteer/osm_passes.json, via scripts.fetch_osm_passes)

Polygons are octagonal buffers around the saddle, sized to cover the
approach bowls that satellite sampling cares about. Featured entries win
alias collisions and absorb OSM duplicates by proximity.
"""

from __future__ import annotations

import json
import math
import re
from pathlib import Path

from ingest.geo import haversine_km

# The High Sierra featured tier. "near" is a rough hand-entered position, good
# only for choosing between same-named passes (resolve_sierra below).
# "elevation_ft" is used only when the OpenStreetMap node carries none.
PASSES: list[dict] = [
    {
        "slug": "kearsarge",
        "name": "Kearsarge Pass",
        "elevation_ft": 11709,
        "near": (36.7728, -118.3736),
        "aliases": ["kearsarge", "kearsage", "kersarge", "kearsarge pass", "onion valley pass"],
        "creek": "Independence Creek / Bubbs Creek",
        "aspect_note": "north side holds snow late; east approach from Onion Valley",
    },
    {
        "slug": "bishop",
        "name": "Bishop Pass",
        "elevation_ft": 11972,
        "near": (37.1049, -118.5570),
        "aliases": ["bishop", "bishop pass", "south lake pass"],
        "creek": "South Fork Bishop Creek",
        "aspect_note": "long north-facing ramp above Bishop Lake holds snow",
    },
    {
        "slug": "piute",
        "name": "Piute Pass",
        "elevation_ft": 11423,
        "near": (37.2262, -118.6812),
        "aliases": ["piute", "piute pass", "paiute pass", "paiute"],
        "creek": "North Fork Bishop Creek / Piute Creek",
        "aspect_note": "gentle grade, melts early relative to neighbors",
    },
    {
        "slug": "mono",
        "name": "Mono Pass",
        "elevation_ft": 12060,
        "near": (37.3743, -118.7817),
        "aliases": ["mono", "mono pass", "mono pass (rock creek)"],
        "creek": "Rock Creek",
        "aspect_note": "the Rock Creek Mono Pass, not the Bloody Canyon one",
    },
    {
        "slug": "duck",
        "name": "Duck Pass",
        "elevation_ft": 10797,
        "near": (37.5432, -118.9450),
        "aliases": ["duck", "duck pass", "duck lake pass"],
        "creek": "Mammoth Creek / Duck Creek",
        "aspect_note": "lowest of the set, first to open most years",
    },
    {
        "slug": "taboose",
        "name": "Taboose Pass",
        "elevation_ft": 11417,
        "near": (37.0058, -118.4266),
        "aliases": ["taboose", "taboose pass"],
        "creek": "Taboose Creek",
        "aspect_note": "brutal east approach, snow lingers in the upper bowl",
    },
    {
        "slug": "sawmill",
        "name": "Sawmill Pass",
        "elevation_ft": 11347,
        "near": (36.9297, -118.3891),
        "aliases": ["sawmill", "sawmill pass"],
        "creek": "Sawmill Creek",
        "aspect_note": "dry east side, snow mostly on the west ramp",
    },
    {
        "slug": "baxter",
        "name": "Baxter Pass",
        "elevation_ft": 12290,
        "near": (36.8757, -118.3620),
        "aliases": ["baxter", "baxter pass"],
        "creek": "North Fork Oak Creek",
        "aspect_note": "high, rarely traveled, reports are sparse",
    },
    {
        "slug": "shepherd",
        "name": "Shepherd Pass",
        "elevation_ft": 12050,
        "near": (36.6931, -118.3572),
        "aliases": ["shepherd", "shepherd pass", "shepherds pass", "shepherd's pass"],
        "creek": "Shepherd Creek / Symmes Creek",
        "aspect_note": "notorious north-facing headwall chute, ice axe terrain into July",
    },
    {
        "slug": "glen",
        "name": "Glen Pass",
        "elevation_ft": 11926,
        "near": (36.7854, -118.4166),
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
        "near": (37.1119, -118.6712),
        "aliases": ["muir", "muir pass", "the hut pass", "muir hut"],
        "creek": "Evolution Creek / Middle Fork Kings",
        "aspect_note": "miles of gentle snow basin on both sides, slow but not steep",
    },
    {
        "slug": "mather",
        "name": "Mather Pass",
        "elevation_ft": 12100,
        "near": (37.0479, -118.5084),
        "aliases": ["mather", "mather pass", "the golden staircase pass"],
        "creek": "Palisade Creek / South Fork Kings",
        "aspect_note": "steep south-side snow ramp early season",
    },
    {
        "slug": "pinchot",
        "name": "Pinchot Pass",
        "elevation_ft": 12130,
        "near": (36.9394, -118.4139),
        "aliases": ["pinchot", "pinchot pass"],
        "creek": "Woods Creek / South Fork Kings",
        "aspect_note": "broad and moderate, crossings below matter more than the pass",
    },
    {
        "slug": "forester",
        "name": "Forester Pass",
        "elevation_ft": 13153,
        "near": (36.6935, -118.3735),
        "aliases": ["forester", "forester pass", "forrester pass", "forrester"],
        "creek": "Tyndall Creek / Bubbs Creek",
        "aspect_note": "highest point on the PCT, the north-side chute is the crux",
    },
    {
        "slug": "donohue",
        "name": "Donohue Pass",
        "elevation_ft": 11056,
        "near": (37.7607, -119.2477),
        "aliases": ["donohue", "donohue pass", "donahue pass", "donahue"],
        "creek": "Rush Creek / Lyell Fork",
        "aspect_note": "Yosemite boundary, broad snow flats on the Lyell side",
    },
    {
        "slug": "cottonwood",
        "name": "Cottonwood Pass",
        "elevation_ft": 11160,
        "near": (36.4432, -118.2237),
        "aliases": ["cottonwood", "cottonwood pass", "horseshoe meadows pass"],
        "creek": "Cottonwood Creek",
        "aspect_note": "gentle grade from Horseshoe Meadows, one of the first to open",
    },
    {
        "slug": "new-army",
        "name": "New Army Pass",
        "elevation_ft": 12315,
        "near": (36.4570, -118.2230),
        "aliases": ["new army", "new army pass", "army pass"],
        "creek": "Cottonwood Creek / Rock Creek (south)",
        "aspect_note": "north-facing switchbacks ice over early and late in season",
    },
    {
        "slug": "trail-crest",
        "name": "Trail Crest",
        "elevation_ft": 13645,
        "near": (36.5622, -118.2932),
        "aliases": ["trail crest", "whitney trail crest", "the crest on whitney"],
        "creek": "Lone Pine Creek",
        "aspect_note": "the ninety-nine switchbacks and their cables hold ice into July",
    },
    {
        "slug": "colby",
        "name": "Colby Pass",
        "elevation_ft": 12000,
        "near": (36.5728, -118.4440),
        "aliases": ["colby", "colby pass"],
        "creek": "Kern-Kaweah River",
        "aspect_note": "remote Kaweah headwaters, reports are rare",
    },
    {
        "slug": "franklin",
        "name": "Franklin Pass",
        "elevation_ft": 11760,
        "near": (36.4166, -118.5530),
        "aliases": ["franklin", "franklin pass"],
        "creek": "Franklin Creek / Rattlesnake Creek",
        "aspect_note": "sandy south side melts early, north side holds",
    },
    {
        "slug": "sawtooth",
        "name": "Sawtooth Pass",
        "elevation_ft": 11630,
        "near": (36.4528, -118.5561),
        "aliases": ["sawtooth", "sawtooth pass", "glacier pass"],
        "creek": "Monarch Creek",
        "aspect_note": "loose and steep out of Mineral King, miserable in snow",
    },
    {
        "slug": "kaweah-gap",
        "name": "Kaweah Gap",
        "elevation_ft": 10700,
        "near": (36.5540, -118.5480),
        "aliases": ["kaweah gap", "kaweah", "hamilton lakes gap"],
        "creek": "Hamilton Creek / Big Arroyo",
        "aspect_note": "the High Sierra Trail crux, cirque holds snow above Precipice Lake",
    },
    {
        "slug": "elizabeth",
        "name": "Elizabeth Pass",
        "elevation_ft": 11375,
        "near": (36.6222, -118.6222),
        "aliases": ["elizabeth", "elizabeth pass"],
        "creek": "Lone Pine Creek (Kings) / Deadman Canyon",
        "aspect_note": "steep snowfinger on the Deadman Canyon side lingers",
    },
    {
        "slug": "granite",
        "name": "Granite Pass",
        "elevation_ft": 10673,
        "near": (36.9140, -118.5450),
        "aliases": ["granite", "granite pass"],
        "creek": "Dougherty Creek / Copper Creek",
        "aspect_note": "long dry climb out of Cedar Grove, snow only up top",
    },
    {
        "slug": "hell-for-sure",
        "name": "Hell For Sure Pass",
        "elevation_ft": 11297,
        "near": (37.0470, -118.8150),
        "aliases": ["hell for sure", "hell for sure pass", "hell-for-sure"],
        "creek": "Fleming Creek / Goddard Canyon",
        "aspect_note": "Red Mountain Basin approach, better than the name suggests",
    },
    {
        "slug": "lamarck-col",
        "name": "Lamarck Col",
        "elevation_ft": 12880,
        "near": (37.1728, -118.6620),
        "aliases": ["lamarck", "lamarck col", "the col"],
        "creek": "North Fork Bishop Creek / Darwin Canyon",
        "aspect_note": "cross-country into Darwin Canyon, permanent snowfield on the east",
    },
    {
        "slug": "pine-creek",
        "name": "Pine Creek Pass",
        "elevation_ft": 11120,
        "near": (37.3230, -118.7380),
        "aliases": ["pine creek", "pine creek pass"],
        "creek": "Pine Creek / French Canyon",
        "aspect_note": "tungsten mine road start, gentle pass into French Canyon",
    },
    {
        "slug": "italy",
        "name": "Italy Pass",
        "elevation_ft": 12350,
        "near": (37.3640, -118.7830),
        "aliases": ["italy", "italy pass", "lake italy pass"],
        "creek": "Pine Creek / Hilgard Branch",
        "aspect_note": "talus cross-country over the crest to Lake Italy",
    },
    {
        "slug": "selden",
        "name": "Selden Pass",
        "elevation_ft": 10910,
        "near": (37.3066, -118.8652),
        "aliases": ["selden", "selden pass", "seldon", "seldon pass"],
        "creek": "Bear Creek / Sallie Keyes",
        "aspect_note": "mellow JMT pass, crossings below matter more than the top",
    },
    {
        "slug": "silver",
        "name": "Silver Pass",
        "elevation_ft": 10895,
        "near": (37.4680, -118.9230),
        "aliases": ["silver", "silver pass"],
        "creek": "Silver Pass Creek / Fish Creek",
        "aspect_note": "the north-side creek crossing under the pass is the sting",
    },
    {
        "slug": "mcgee",
        "name": "McGee Pass",
        "elevation_ft": 11895,
        "near": (37.5120, -118.8510),
        "aliases": ["mcgee", "mcgee pass", "mc gee pass"],
        "creek": "McGee Creek / Fish Creek",
        "aspect_note": "red slate country, long approach up McGee Creek",
    },
    {
        "slug": "parker",
        "name": "Parker Pass",
        "elevation_ft": 11100,
        "near": (37.8390, -119.1990),
        "aliases": ["parker", "parker pass"],
        "creek": "Parker Pass Creek / Rush Creek",
        "aspect_note": "broad alpine plateau south of Tioga, gentle travel",
    },
    {
        "slug": "vogelsang",
        "name": "Vogelsang Pass",
        "elevation_ft": 10700,
        "near": (37.7910, -119.3420),
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


# The rest of the West Coast featured tier. Coordinates and elevations come
# from each pass's OpenStreetMap node (resolved in resolve_west below), so
# only names, disambiguation hints and hand-written notes live here. "near"
# picks between same-named passes; notes stay empty where unsure.
WEST_FEATURED: list[dict] = [
    # Washington: North Cascades, Enchantments, Glacier Peak, Rainier, Goat Rocks
    {"slug": "aasgard", "name": "Aasgard Pass", "state": "WA",
     "aliases": ["aasgard", "asgard pass", "asgard"],
     "aspect_note": "a 2,200 ft talus gully from Colchuck Lake into the Enchantments"},
    {"slug": "cascade", "name": "Cascade Pass", "state": "WA", "aliases": ["cascade pass"],
     "aspect_note": "short switchbacks from the end of the Cascade River Road; Sahale Arm above"},
    {"slug": "cutthroat", "name": "Cutthroat Pass", "state": "WA", "aliases": ["cutthroat"],
     "aspect_note": "PCT high ground above Rainy Pass and Highway 20"},
    {"slug": "rainy", "name": "Rainy Pass", "state": "WA", "aliases": ["rainy pass"],
     "aspect_note": "Highway 20 PCT crossing, trailhead for Cutthroat and Maple Pass"},
    {"slug": "harts", "name": "Harts Pass", "state": "WA", "aliases": ["harts", "hart's pass"],
     "aspect_note": "PCT trailhead at the top of a high dirt road into the Pasayten"},
    {"slug": "glacier-pasayten", "name": "Glacier Pass", "state": "WA", "near": (48.67, -120.73),
     "aliases": [], "aspect_note": ""},
    {"slug": "hannegan", "name": "Hannegan Pass", "state": "WA", "aliases": ["hannegan"],
     "aspect_note": "gateway into the northern Picket Range country"},
    {"slug": "whatcom", "name": "Whatcom Pass", "state": "WA", "aliases": ["whatcom"],
     "aspect_note": "remote North Cascades crossing facing the Challenger Glacier"},
    {"slug": "spider-gap", "name": "Spider Gap", "state": "WA", "aliases": ["spider gap", "spider"],
     "aspect_note": "the Spider Glacier gully below it holds snow most of the summer"},
    {"slug": "buck-creek", "name": "Buck Creek Pass", "state": "WA", "aliases": ["buck creek"],
     "aspect_note": "Glacier Peak Wilderness, the far side of the Spider Gap loop"},
    {"slug": "fire-creek", "name": "Fire Creek Pass", "state": "WA", "aliases": ["fire creek"],
     "aspect_note": "PCT in the Glacier Peak Wilderness; the north side holds snow late"},
    {"slug": "white-glacier-peak", "name": "White Pass", "state": "WA", "near": (48.03, -121.15),
     "aliases": ["white pass glacier peak"],
     "aspect_note": "PCT meadow pass on the flank of Glacier Peak"},
    {"slug": "stevens", "name": "Stevens Pass", "state": "WA", "aliases": ["stevens"],
     "aspect_note": "Highway 2 PCT crossing"},
    {"slug": "snoqualmie", "name": "Snoqualmie Pass", "state": "WA", "aliases": ["snoqualmie"],
     "aspect_note": "I-90 PCT crossing, start of the Kendall Katwalk"},
    {"slug": "chinook", "name": "Chinook Pass", "state": "WA", "aliases": ["chinook"],
     "aspect_note": "Highway 410 PCT crossing on the east edge of Mount Rainier"},
    {"slug": "panhandle-gap", "name": "Panhandle Gap", "state": "WA", "aliases": ["panhandle"],
     "aspect_note": "high point of the Wonderland Trail; snowfields linger into August"},
    {"slug": "cispus", "name": "Cispus Pass", "state": "WA", "aliases": ["cispus"],
     "aspect_note": "PCT through the Goat Rocks, south of the Knife's Edge"},
    {"slug": "elk-goat-rocks", "name": "Elk Pass", "state": "WA", "near": (46.54, -121.46),
     "aliases": ["elk pass goat rocks"], "aspect_note": "PCT at the north end of the Goat Rocks"},
    # Oregon: Mount Hood, the central Cascades, the Wallowas
    {"slug": "lolo", "name": "Lolo Pass", "state": "OR", "aliases": ["lolo"],
     "aspect_note": "PCT on the northwest side of Mount Hood"},
    {"slug": "santiam", "name": "Santiam Pass", "state": "OR", "aliases": ["santiam"],
     "aspect_note": "Highway 20 PCT crossing near Mount Washington"},
    {"slug": "mckenzie", "name": "McKenzie Pass", "state": "OR", "aliases": ["mckenzie"],
     "aspect_note": "Highway 242 across the lava fields, closed to cars in winter"},
    {"slug": "willamette", "name": "Willamette Pass", "state": "OR", "aliases": ["willamette"],
     "aspect_note": "Highway 58 PCT crossing"},
    {"slug": "glacier-wallowa", "name": "Glacier Pass", "state": "OR", "near": (45.17, -117.29),
     "aliases": ["glacier pass wallowa"],
     "aspect_note": "Wallowa Mountains, above Glacier Lake in the Lakes Basin country"},
    {"slug": "hawkins", "name": "Hawkins Pass", "state": "OR", "aliases": ["hawkins"],
     "aspect_note": "head of the West Fork Wallowa River"},
    {"slug": "polaris", "name": "Polaris Pass", "state": "OR", "aliases": ["polaris"],
     "aspect_note": "long switchbacks above the West Fork Wallowa"},
    # California beyond the High Sierra core
    {"slug": "donner", "name": "Donner Pass", "state": "CA", "aliases": ["donner"],
     "aspect_note": "historic crossing near the PCT north of Lake Tahoe"},
    {"slug": "mosquito-desolation", "name": "Mosquito Pass", "state": "CA",
     "near": (38.88, -120.16), "aliases": ["mosquito pass desolation"],
     "aspect_note": "Desolation Wilderness"},
    {"slug": "carson", "name": "Carson Pass", "state": "CA", "aliases": ["carson"],
     "aspect_note": "Highway 88 PCT crossing"},
    {"slug": "ebbetts", "name": "Ebbetts Pass", "state": "CA", "aliases": ["ebbetts"],
     "aspect_note": "Highway 4 PCT crossing"},
    {"slug": "sonora", "name": "Sonora Pass", "state": "CA", "aliases": ["sonora"],
     "aspect_note": "Highway 108 PCT crossing, the second-highest road pass in the Sierra"},
    {"slug": "dorothy-lake", "name": "Dorothy Lake Pass", "state": "CA",
     "aliases": ["dorothy lake"],
     "aspect_note": "PCT at the northern boundary of Yosemite"},
    {"slug": "benson", "name": "Benson Pass", "state": "CA", "aliases": ["benson"],
     "aspect_note": "PCT through the canyon country of northern Yosemite"},
    {"slug": "burro", "name": "Burro Pass", "state": "CA", "aliases": ["burro"],
     "aspect_note": "head of Matterhorn Canyon below the Sawtooth Ridge"},
    {"slug": "isberg", "name": "Isberg Pass", "state": "CA", "aliases": ["isberg"],
     "aspect_note": "on the southern boundary of Yosemite"},
    {"slug": "dollar-lake-saddle", "name": "Dollar Lake Saddle", "state": "CA",
     "aliases": ["dollar lake saddle"],
     "aspect_note": "San Gorgonio Wilderness, on the way to Southern California's highest summit"},
]


def resolve_west(osm_nodes: list[dict]) -> list[dict]:
    """Attach OSM coordinates and elevations to the West Coast featured tier."""
    out: list[dict] = []
    for entry in WEST_FEATURED:
        candidates = [
            n for n in osm_nodes
            if n["name"] == entry["name"] and n["state"] == entry["state"]
            and n["elevation_ft"] is not None
        ]
        if not candidates:
            raise ValueError(f"no OSM node for featured pass {entry['name']} ({entry['state']})")
        if "near" in entry:
            lat, lon = entry["near"]
            node = min(candidates, key=lambda n: haversine_km(lat, lon, n["lat"], n["lon"]))
        elif len({(round(n["lat"], 2), round(n["lon"], 2)) for n in candidates}) > 1:
            raise ValueError(f"ambiguous featured pass {entry['name']}: add a 'near' hint")
        else:
            node = candidates[0]
        out.append(
            {
                "slug": entry["slug"],
                "name": entry["name"],
                "elevation_ft": node["elevation_ft"],
                "lat": round(node["lat"], 6),
                "lon": round(node["lon"], 6),
                "aliases": entry["aliases"],
                "creek": "",
                "aspect_note": entry["aspect_note"],
                "state": entry["state"],
            }
        )
    return out


# The hand-entered positions sit up to 11 km from the saddle they name, and
# the nearest namesake beyond that is 65 km off (Mono Pass, Bloody Canyon).
ANCHOR_KM = 15.0


def resolve_sierra(
    entries: list[dict], osm_nodes: list[dict], max_km: float = ANCHOR_KM
) -> list[dict]:
    """Move each hand-curated pass onto the nearest OSM node of the same name."""
    out: list[dict] = []
    for entry in entries:
        lat, lon = entry["near"]
        name = entry["name"].lower()
        best: tuple[float, dict] | None = None
        for node in osm_nodes:
            if node["name"].lower() != name:
                continue
            km = haversine_km(lat, lon, node["lat"], node["lon"])
            if km <= max_km and (best is None or km < best[0]):
                best = (km, node)
        if best is None:
            raise ValueError(
                f"no OSM node named {entry['name']} within {max_km:g} km of {lat}, {lon}"
            )
        node = best[1]
        hand = {k: v for k, v in entry.items() if k != "near"}
        out.append(
            {
                **hand,
                "elevation_ft": node["elevation_ft"] or entry["elevation_ft"],
                "lat": round(node["lat"], 6),
                "lon": round(node["lon"], 6),
                "osm_id": node["osm_id"],
            }
        )
    return out


DUPLICATE_KM = 1.5


def _slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def load_osm_nodes(path: Path) -> list[dict]:
    if not path.exists():
        return []
    return json.loads(path.read_text())["nodes"]


def merge_osm(featured: list[dict], osm_nodes: list[dict]) -> list[dict]:
    """OSM entries that are not duplicates of a featured pass, slug-deduped."""
    merged: list[dict] = []
    taken = {p["slug"] for p in featured}
    names = {p["name"].lower() for p in featured}
    for node in sorted(osm_nodes, key=lambda n: n["name"]):
        if node["elevation_ft"] is None:
            continue
        if node["name"].lower() in names:
            continue
        if any(
            haversine_km(node["lat"], node["lon"], p["lat"], p["lon"]) < DUPLICATE_KM
            for p in featured
        ):
            continue
        slug = _slugify(node["name"])
        if slug in taken:
            slug = f"{slug}-{node['osm_id']}"
        taken.add(slug)
        aliases = [node["name"].lower()]
        short = re.sub(r"\s+(pass|saddle|gap|col)$", "", node["name"].lower())
        if short != node["name"].lower():
            aliases.append(short)
        merged.append(
            {
                "slug": slug,
                "name": node["name"],
                "elevation_ft": node["elevation_ft"],
                "lat": round(node["lat"], 6),
                "lon": round(node["lon"], 6),
                "aliases": aliases,
                "creek": "",
                "aspect_note": "",
                "tier": "osm",
                "state": node.get("state", "CA"),
                "osm_id": node["osm_id"],
            }
        )
    return merged


def main() -> None:
    root = Path(__file__).resolve().parent.parent / "gazetteer"
    osm_nodes = load_osm_nodes(root / "osm_passes.json")
    featured = [
        {**p, "state": "CA", "tier": "featured"} for p in resolve_sierra(PASSES, osm_nodes)
    ] + [{**p, "tier": "featured"} for p in resolve_west(osm_nodes)]
    entries = featured + merge_osm(featured, osm_nodes)
    features = []
    for p in entries:
        features.append(
            {
                **p,
                "polygon": {
                    "type": "Polygon",
                    "coordinates": [octagon(p["lat"], p["lon"], BUFFER_M)],
                },
            }
        )
    out = root / "passes.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"passes": features}, indent=0) + "\n")
    tiers = sum(1 for f in features if f["tier"] == "featured")
    print(f"wrote {out} ({len(features)} passes, {tiers} featured)")


if __name__ == "__main__":
    main()
