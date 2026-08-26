// The hand-drawn pixel layer: 16x16 glyphs, one per evidence source and
// condition, plus the campfire loader, tent, and drifting clouds.
// Letters map to the seven palette values; '.' is transparent.
// Sprites move in whole pixels only, never subpixel, or the art smears.

import { palette } from "./theme";

const ink: Record<string, string> = {
  p: palette.deepPine,
  m: palette.moss,
  f: palette.fern,
  s: palette.sage,
  g: palette.granite,
  b: palette.snowmelt,
  a: palette.alpenglow,
};

export type Sprite = string[];

// Snow stake: banded survey stake in a snow mound. SNOTEL and CDEC sensors.
export const snowstake: Sprite = [
  "................",
  ".......bg.......",
  ".......gg.......",
  ".......bg.......",
  ".......gg.......",
  ".......bg.......",
  ".......gg.......",
  ".......bg.......",
  ".......gg.......",
  ".......bg.......",
  ".......gg.......",
  "......gggg......",
  "....gggggggg....",
  "..gggggggggggg..",
  ".gggggggggggggg.",
  "................",
];

// Satellite: body with solar wings. Imagery stream.
export const satellite: Sprite = [
  "................",
  "......g.........",
  ".......g........",
  "bbb..ggggg..bbb.",
  "bbb..g.g.g..bbb.",
  "bbbggg.g.gggbbb.",
  "bbb..g.g.g..bbb.",
  "bbb..ggggg..bbb.",
  ".......g........",
  "......ggg.......",
  ".....g...g......",
  "....g.....g.....",
  "................",
  "................",
  "................",
  "................",
];

// Boot: trip reports walk in on this.
export const boot: Sprite = [
  "................",
  "....ssss........",
  "....ssss........",
  "....ssss........",
  "....ssss........",
  "....sssss.......",
  "....ssssss......",
  "....sssssss.....",
  "....ssssssssss..",
  "....sssssssssss.",
  "...ssssssssssss.",
  "...gggggggggggg.",
  "...gggggggggggg.",
  "....g..g..g..g..",
  "................",
  "................",
];

// Creek ripple: the gauges.
export const creek: Sprite = [
  "................",
  "................",
  "................",
  "..bb....bb......",
  ".b..bb.b..bb..b.",
  "......b........b",
  "................",
  "..bb....bb......",
  ".b..bb.b..bb..b.",
  "......b........b",
  "................",
  "..bb....bb......",
  ".b..bb.b..bb..b.",
  "......b........b",
  "................",
  "................",
];

// Pine tree: clear, go walk.
export const pine: Sprite = [
  "................",
  ".......f........",
  "......fff.......",
  ".....fffff......",
  "......fff.......",
  ".....fffff......",
  "....fffffff.....",
  ".....fffff......",
  "....fffffff.....",
  "...fffffffff....",
  "..fffffffffff...",
  ".fffffffffffff..",
  ".......m........",
  ".......m........",
  "......mmm.......",
  "................",
];

// Snowflake on pine: patchy snow.
export const pineSnow: Sprite = [
  "......g.........",
  ".....gfg....g...",
  "......fff.......",
  ".....fgfff..g...",
  "......fff.......",
  ".....ffgff......",
  "....ffgffff..g..",
  ".....fffgf......",
  "....fgfffff.....",
  "...ffffgffff....",
  "..fgfffffgfff...",
  ".ffffffgffffff..",
  ".......m....g...",
  "...g...m........",
  "......mmm.......",
  "................",
];

// Ice axe: traction advised.
export const iceAxe: Sprite = [
  "................",
  "..gggggggg......",
  ".g....ss..gg....",
  ".g....ss....g...",
  "......ss........",
  ".....ss.........",
  ".....ss.........",
  "....ss..........",
  "....ss..........",
  "...ss...........",
  "...ss...........",
  "..ss............",
  "..ss............",
  ".gs.............",
  "g...............",
  "................",
];

// Crossed poles: not recommended, turn around.
export const crossedPoles: Sprite = [
  "................",
  ".aa..........aa.",
  "..aa........aa..",
  "...ss......ss...",
  "....ss....ss....",
  ".....ss..ss.....",
  "......ssss......",
  ".......ss.......",
  "......ssss......",
  ".....ss..ss.....",
  "....ss....ss....",
  "...ss......ss...",
  "..gg........gg..",
  ".g..g......g..g.",
  "................",
  "................",
];

// Tent: your saved passes.
export const tent: Sprite = [
  "................",
  "................",
  "................",
  ".......f........",
  "......fff.......",
  ".....fffff......",
  "....fffffff.....",
  "...ffff.ffff....",
  "..ffff...ffff...",
  ".ffff..m..ffff..",
  "ffff...m...ffff.",
  "fff....m....fff.",
  "gggggggggggggg..",
  "................",
  "................",
  "................",
];

// Campfire, three-frame flicker. The loading state.
export const campfire: Sprite[] = [
  [
    "................",
    "................",
    "................",
    ".......a........",
    "......aa........",
    "......aaa.......",
    ".....aaaaa......",
    ".....aaaaa......",
    "....aaaaaaa.....",
    "....aaaaaaa.....",
    ".....aaaaa......",
    "...mm.....mm....",
    "..mmmmmmmmmmm...",
    "....mm...mm.....",
    "................",
    "................",
  ],
  [
    "................",
    "................",
    ".......a........",
    "........a.......",
    ".......aa.......",
    "......aaaa......",
    "......aaaa......",
    ".....aaaaaa.....",
    "....aaaaaaa.....",
    "....aaaaaa......",
    ".....aaaa.......",
    "...mm.....mm....",
    "..mmmmmmmmmmm...",
    "....mm...mm.....",
    "................",
    "................",
  ],
  [
    "................",
    "................",
    "................",
    "......a.........",
    ".......aa.......",
    ".......aaa......",
    "......aaaa......",
    ".....aaaaa......",
    ".....aaaaaa.....",
    "....aaaaaaa.....",
    ".....aaaa.......",
    "...mm.....mm....",
    "..mmmmmmmmmmm...",
    "....mm...mm.....",
    "................",
    "................",
  ],
];

// Two cloud shapes that drift across the map at 4px/min.
export const cloudA: Sprite = [
  "................",
  "................",
  "................",
  "................",
  "......ss........",
  "....ssssss......",
  "...ssssssssss...",
  "..ssssssssssss..",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
];

export const cloudB: Sprite = [
  "................",
  "................",
  "................",
  "................",
  "................",
  "........sss.....",
  ".....sssssss....",
  "...ssssssssss...",
  "..sssssssssss...",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
  "................",
];

export const glyphBySource: Record<string, Sprite> = {
  sensor: snowstake,
  satellite,
  report: boot,
  gauge: creek,
};

export const glyphByStatus: Record<string, Sprite> = {
  open: pine,
  snow_caution: pineSnow,
  traction_advised: iceAxe,
  not_recommended: crossedPoles,
  unknown: cloudA,
};

export function drawSprite(
  ctx: CanvasRenderingContext2D,
  sprite: Sprite,
  x: number,
  y: number,
  scale = 1,
): void {
  const px = Math.round(x);
  const py = Math.round(y);
  for (let row = 0; row < sprite.length; row++) {
    for (let col = 0; col < sprite[row].length; col++) {
      const c = ink[sprite[row][col]];
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(px + col * scale, py + row * scale, scale, scale);
    }
  }
}
