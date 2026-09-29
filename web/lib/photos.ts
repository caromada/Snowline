// Photography: real photos of these mountains from Wikimedia Commons, each
// openly licensed for commercial use with credit (credits render on
// /credits/). Served from /photos as sharp WebP at 1280 and 2560 wide.

export type Photo = {
  key: string;
  alt: string;
  width: number;
  height: number;
  sizes: number[];
  credit: string;
  license: string;
  source: string;
};

export const photos = {
  hero: {
    key: "hero",
    alt: "Alpenglow on Mt. Mendel and Mt. Darwin over Sapphire Lake, Evolution Basin",
    width: 2560,
    height: 1707,
    sizes: [1280, 2560],
    credit: "Jeff P from Berkeley, CA, USA",
    license: "CC BY 2.0",
    source: "https://commons.wikimedia.org/wiki/File:Mt._Mendel_and_Mt._Darwin_reflected_in_Sapphire_Lake,_Evolution_Basin,_High_Sierra,_California.jpg",
  },
  winter: {
    key: "winter",
    alt: "Climbers on the Whitney-Russell Pass winter crossing",
    width: 5776,
    height: 4560,
    sizes: [1280, 2560],
    credit: "Robert K. Brinton",
    license: "CC BY-SA 4.0",
    source: "https://commons.wikimedia.org/wiki/File:Whitney_Russell_Pass_Winter_Crossing.jpg",
  },
  spring: {
    key: "spring",
    alt: "Banner Peak across the snow at Island Pass",
    width: 3504,
    height: 2336,
    sizes: [1280, 2560],
    credit: "DavetheMage",
    license: "CC BY-SA 3.0",
    source: "https://commons.wikimedia.org/wiki/File:Banner_Pk_across_Island_Pass_snow_close.jpg",
  },
  summer: {
    key: "summer",
    alt: "Backpackers resting in the Goat Rocks Wilderness",
    width: 4032,
    height: 3024,
    sizes: [1280, 2560],
    credit: "Mattsjc",
    license: "CC BY 4.0",
    source: "https://commons.wikimedia.org/wiki/File:Backpackers_in_Goat_Rocks_Wilderness_02.jpg",
  },
  fall: {
    key: "fall",
    alt: "Larches below Grindstone Mountain in the North Cascades",
    width: 6262,
    height: 4570,
    sizes: [1280, 2560],
    credit: "Martin Bravenboer",
    license: "CC BY 2.0",
    source: "https://commons.wikimedia.org/wiki/File:Grindstone_Mountain_in_the_early_morning_from_Lake_Edna.jpg",
  },
  aasgard: {
    key: "aasgard",
    alt: "Dragontail Peak from the climb up Aasgard Pass",
    width: 4624,
    height: 3472,
    sizes: [1280, 2560],
    credit: "Buidhe",
    license: "CC BY-SA 4.0",
    source: "https://commons.wikimedia.org/wiki/File:Dragontail_Peak_from_the_way_up_Aasgard_Pass_(11_October_2024).jpg",
  },
  whitney: {
    key: "whitney",
    alt: "Alpenglow on Lone Pine Peak and Mt. Whitney",
    width: 1920,
    height: 432,
    sizes: [1280],
    credit: "mjhbower",
    license: "CC BY-SA 2.0",
    source: "https://commons.wikimedia.org/wiki/File:Lone_Pine_Peak_and_Mt_Whitney_-_52104299311.jpg",
  },
  dayhike: {
    key: "dayhike",
    alt: "A hiker on the Timberline Trail below Mount Hood",
    width: 5384,
    height: 3648,
    sizes: [1280, 2560],
    credit: "U.S. Forest Service- Pacific Northwest Region",
    license: "Public domain",
    source: "https://commons.wikimedia.org/wiki/File:Recreation_hiking_Timberline_trail,_Mt_Hood_National_Forest_(37000793146).jpg",
  },
} satisfies Record<string, Photo>;

export function photoSrc(p: Photo, w: number = p.sizes[p.sizes.length - 1]): string {
  return `/photos/${p.key}-${w}.webp`;
}

export function photoSrcSet(p: Photo): string {
  return p.sizes.map((w) => `${photoSrc(p, w)} ${w}w`).join(", ");
}
