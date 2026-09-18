// How each species looks. The catalog decides what a fish is worth and how it fights;
// this decides how it is drawn, in the guide, the bag, the conveyor and in a player's
// hands when they land it. Shared so the 2D art and the 3D catch agree.
export type BodyShape = 'torpedo' | 'round' | 'long' | 'flat' | 'chunky' | 'bulb' | 'dome';
export type TailShape = 'fan' | 'fork' | 'crescent' | 'whip' | 'paddle' | 'ribbon';
export type FinShape = 'none' | 'small' | 'spiky' | 'sail' | 'ribbon';
export type Pattern = 'none' | 'stripes' | 'spots' | 'bands' | 'glow';
export type Extra = 'none' | 'whiskers' | 'bill' | 'lure' | 'tentacles' | 'crest' | 'frown';
export type FishLook = {
  body: BodyShape;
  tail: TailShape;
  fin: FinShape;
  pattern: Pattern;
  extra: Extra;
  // Back, belly and the accent used for fins, patterns and glow.
  colors: [string, string, string];
  // Proportions for the fish a player holds up: along its length and through its depth.
  length: number;
  depth: number;
};
const look = (
  body: BodyShape,
  tail: TailShape,
  fin: FinShape,
  pattern: Pattern,
  extra: Extra,
  colors: [string, string, string],
  length = 1,
  depth = 1,
): FishLook => ({ body, tail, fin, pattern, extra, colors, length, depth });
export const fishLooks: Record<string, FishLook> = {
  // Common
  'Sock Eel': look('long', 'whip', 'none', 'stripes', 'none', ['#8f7fa8', '#d9cfe4', '#5d4f75'], 1.35, 0.62),
  'Marshmallow Carp': look('round', 'fan', 'small', 'none', 'whiskers', ['#f6dcd9', '#fff6f2', '#d99a9a'], 0.92, 1.18),
  'Button Bass': look('torpedo', 'fork', 'spiky', 'spots', 'none', ['#6f9152', '#e2e8c4', '#41603a'], 1, 1),
  'Pebble Perch': look('chunky', 'fan', 'spiky', 'bands', 'none', ['#9a9686', '#e6e2d2', '#6a6657'], 0.95, 1.05),
  'Moon Minnow': look('torpedo', 'fork', 'small', 'glow', 'none', ['#b9cfe8', '#f3f8ff', '#8aa8cc'], 0.78, 0.82),
  'Teacup Trout': look('torpedo', 'fan', 'small', 'spots', 'none', ['#b98453', '#f2dcc0', '#7d5433'], 0.95, 0.95),
  'Puddle Guppy': look('round', 'ribbon', 'ribbon', 'spots', 'none', ['#57b0a6', '#d8f2ee', '#e6c45c'], 0.7, 0.95),
  'Acorn Anchovy': look('long', 'fork', 'none', 'none', 'none', ['#a9b4bd', '#eef2f5', '#6f7c88'], 0.82, 0.66),
  'Daisy Dace': look('torpedo', 'fork', 'small', 'spots', 'none', ['#c5cc6a', '#f4f7d8', '#8b9440'], 0.9, 0.9),
  'Bubble Bream': look('round', 'fan', 'spiky', 'bands', 'none', ['#8fb8cc', '#e8f4fa', '#5b8298'], 0.95, 1.15),
  // Uncommon
  'Lantern Gar': look('long', 'fan', 'small', 'glow', 'none', ['#3f6b52', '#cfe0c9', '#f0b125'], 1.3, 0.7),
  Grumpfish: look('bulb', 'paddle', 'spiky', 'bands', 'frown', ['#b05a4c', '#f0c9ab', '#77362d'], 0.85, 1.2),
  'Ribbon Ray': look('flat', 'whip', 'none', 'spots', 'none', ['#b08ec8', '#ecdff5', '#77558f'], 1.1, 0.5),
  'Sunbeam Snapper': look('chunky', 'fork', 'spiky', 'stripes', 'none', ['#e08a3c', '#ffe2b8', '#a8551c'], 1, 1.08),
  'Coral Koi': look('round', 'fan', 'ribbon', 'spots', 'whiskers', ['#f5f0e6', '#ffffff', '#e2793f'], 1, 1.1),
  'Velvet Catfish': look('chunky', 'paddle', 'none', 'none', 'whiskers', ['#6b5a72', '#cfc3d4', '#3f3447'], 1.05, 1.05),
  'Honey Haddock': look('torpedo', 'fork', 'small', 'stripes', 'none', ['#d8a44e', '#f7e6c4', '#95672a'], 1, 0.98),
  'Emerald Tetra': look('round', 'fork', 'small', 'stripes', 'none', ['#2f9c7a', '#cdf0e2', '#e3d45c'], 0.72, 0.95),
  // Rare
  'Starlight Salmon': look('torpedo', 'crescent', 'small', 'glow', 'none', ['#e08fa0', '#fbe4ea', '#f5e2a0'], 1.12, 0.98),
  'Sapphire Sturgeon': look('long', 'crescent', 'spiky', 'bands', 'none', ['#3a5f96', '#c6d6ee', '#8fb0dc'], 1.35, 0.85),
  'Glassfin Grouper': look('chunky', 'fan', 'sail', 'none', 'none', ['#8fc6c2', '#e8f7f5', '#c9ece8'], 1.05, 1.12),
  'Thunder Tuna': look('torpedo', 'crescent', 'small', 'stripes', 'none', ['#4a6f92', '#dfe9f2', '#f2d05c'], 1.25, 1.05),
  'Orchid Octopus': look('dome', 'paddle', 'none', 'spots', 'tentacles', ['#b06ab0', '#f0d6f0', '#7a3f7a'], 0.9, 1.1),
  'Silver Sailfish': look('torpedo', 'crescent', 'sail', 'none', 'bill', ['#8fa6c4', '#eef3f8', '#4f74ad'], 1.3, 0.95),
  'Aurora Angler': look('bulb', 'paddle', 'spiky', 'glow', 'lure', ['#2f6a70', '#a9dcd6', '#9be8c8'], 0.95, 1.15),
  // Legendary
  'Crown Coelacanth': look('chunky', 'fan', 'spiky', 'spots', 'crest', ['#4a5b96', '#c7cfe8', '#e0b74a'], 1.15, 1.1),
  'Comet Marlin': look('torpedo', 'crescent', 'sail', 'glow', 'bill', ['#2f57a8', '#dbe6ff', '#8fb6ff'], 1.35, 0.95),
  'Opal Oarfish': look('long', 'ribbon', 'ribbon', 'glow', 'crest', ['#f0e4ef', '#fffaff', '#e08fb4'], 1.5, 0.6),
  'Golden Dragonfish': look('long', 'whip', 'ribbon', 'glow', 'crest', ['#e8b63c', '#fbe7ac', '#a86f16'], 1.3, 0.75),
  'Midnight Leviathan': look('chunky', 'crescent', 'spiky', 'glow', 'frown', ['#2b2f4a', '#5a5f85', '#8f7fd8'], 1.4, 1.2),
};
const fallback = look('torpedo', 'fan', 'small', 'none', 'none', ['#7fa36b', '#e4eddc', '#4f6b45']);
export function lookFor(name: string | undefined): FishLook {
  return (name && fishLooks[name]) || fallback;
}
