// Photography for the marketing site: real photos of these mountains from
// Wikimedia Commons, each openly licensed for commercial use with credit.
// Credits render on /credits/. Hotlinked from Wikimedia's image servers.

export type Photo = {
  src: string;
  alt: string;
  width: number;
  height: number;
  credit: string;
  license: string;
  source: string;
};

export const photos = {
  hero: {
    src: "https://thumb.wikimedia.org/wikipedia/commons/thumb/e/e4/Mt._Mendel_and_Mt._Darwin_reflected_in_Sapphire_Lake%2C_Evolution_Basin%2C_High_Sierra%2C_California.jpg/1920px-Mt._Mendel_and_Mt._Darwin_reflected_in_Sapphire_Lake%2C_Evolution_Basin%2C_High_Sierra%2C_California.jpg",
    alt: "Mt. Mendel and Mt. Darwin in alpenglow over Sapphire Lake, Evolution Basin",
    width: 2560,
    height: 1707,
    credit: "Jeff P from Berkeley, CA, USA",
    license: "CC BY 2.0",
    source: "https://commons.wikimedia.org/wiki/File:Mt._Mendel_and_Mt._Darwin_reflected_in_Sapphire_Lake,_Evolution_Basin,_High_Sierra,_California.jpg",
  },
  winter: {
    src: "https://thumb.wikimedia.org/wikipedia/commons/thumb/7/7b/Whitney_Russell_Pass_Winter_Crossing.jpg/1920px-Whitney_Russell_Pass_Winter_Crossing.jpg",
    alt: "Climbers on the Whitney-Russell Pass winter crossing",
    width: 5776,
    height: 4560,
    credit: "Robert K. Brinton",
    license: "CC BY-SA 4.0",
    source: "https://commons.wikimedia.org/wiki/File:Whitney_Russell_Pass_Winter_Crossing.jpg",
  },
  spring: {
    src: "https://thumb.wikimedia.org/wikipedia/commons/thumb/7/72/Banner_Pk_across_Island_Pass_snow_close.jpg/1920px-Banner_Pk_across_Island_Pass_snow_close.jpg",
    alt: "Banner Peak across the snow at Island Pass",
    width: 3504,
    height: 2336,
    credit: "DavetheMage",
    license: "CC BY-SA 3.0",
    source: "https://commons.wikimedia.org/wiki/File:Banner_Pk_across_Island_Pass_snow_close.jpg",
  },
  summer: {
    src: "https://thumb.wikimedia.org/wikipedia/commons/thumb/a/af/Backpackers_in_Goat_Rocks_Wilderness_02.jpg/1920px-Backpackers_in_Goat_Rocks_Wilderness_02.jpg",
    alt: "Backpackers resting in the Goat Rocks Wilderness",
    width: 4032,
    height: 3024,
    credit: "Mattsjc",
    license: "CC BY 4.0",
    source: "https://commons.wikimedia.org/wiki/File:Backpackers_in_Goat_Rocks_Wilderness_02.jpg",
  },
  fall: {
    src: "https://thumb.wikimedia.org/wikipedia/commons/thumb/d/dc/Grindstone_Mountain_in_the_early_morning_from_Lake_Edna.jpg/1920px-Grindstone_Mountain_in_the_early_morning_from_Lake_Edna.jpg",
    alt: "Larches below Grindstone Mountain in the North Cascades",
    width: 6262,
    height: 4570,
    credit: "Martin Bravenboer",
    license: "CC BY 2.0",
    source: "https://commons.wikimedia.org/wiki/File:Grindstone_Mountain_in_the_early_morning_from_Lake_Edna.jpg",
  },
  aasgard: {
    src: "https://thumb.wikimedia.org/wikipedia/commons/thumb/6/61/Dragontail_Peak_from_the_way_up_Aasgard_Pass_%2811_October_2024%29.jpg/1920px-Dragontail_Peak_from_the_way_up_Aasgard_Pass_%2811_October_2024%29.jpg",
    alt: "Dragontail Peak from the climb up Aasgard Pass",
    width: 4624,
    height: 3472,
    credit: "Buidhe",
    license: "CC BY-SA 4.0",
    source: "https://commons.wikimedia.org/wiki/File:Dragontail_Peak_from_the_way_up_Aasgard_Pass_(11_October_2024).jpg",
  },
  smoke: {
    src: "https://upload.wikimedia.org/wikipedia/commons/4/49/Cedar_Creek_Fire_Smoke_Pushes_Offshore_%28CIRA_2022-09-10%29.png",
    alt: "GOES satellite view of wildfire smoke pushing offshore",
    width: 1920,
    height: 1080,
    credit: "GOES imagery: CSU/CIRA & NOAA",
    license: "Public domain",
    source: "https://commons.wikimedia.org/wiki/File:Cedar_Creek_Fire_Smoke_Pushes_Offshore_(CIRA_2022-09-10).png",
  },
  muir: {
    src: "https://thumb.wikimedia.org/wikipedia/commons/thumb/9/93/California%2C_Kings_Canyon_National_Park%2C_Muir_Hut.jpg/1920px-California%2C_Kings_Canyon_National_Park%2C_Muir_Hut.jpg",
    alt: "The Muir Pass hut in Kings Canyon National Park",
    width: 3456,
    height: 2304,
    credit: "Lucas\u00b7G",
    license: "CC BY-SA 4.0",
    source: "https://commons.wikimedia.org/wiki/File:California,_Kings_Canyon_National_Park,_Muir_Hut.jpg",
  },
  whitney: {
    src: "https://upload.wikimedia.org/wikipedia/commons/2/21/Lone_Pine_Peak_and_Mt_Whitney_-_52104299311.jpg",
    alt: "Alpenglow on Lone Pine Peak and Mt. Whitney",
    width: 1920,
    height: 432,
    credit: "mjhbower",
    license: "CC BY-SA 2.0",
    source: "https://commons.wikimedia.org/wiki/File:Lone_Pine_Peak_and_Mt_Whitney_-_52104299311.jpg",
  },
} satisfies Record<string, Photo>;
