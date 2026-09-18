export const species = [
  'cat',
  'monkey',
  'frog',
  'bird',
  'axolotl',
  'bear',
  'rabbit',
  'fish',
  'blob',
] as const;
export type Species = (typeof species)[number];
export const hats = ['none', 'beanie', 'bucket', 'captain', 'flower', 'cone', 'party', 'beret', 'straw'] as const;
export const outfits = ['tee', 'hoodie', 'overalls', 'raincoat', 'striped', 'cardigan', 'sweater', 'vest'] as const;
export const accessories = ['none', 'glasses', 'scarf', 'backpack', 'satchel', 'bandana', 'bow', 'headphones', 'lantern'] as const;
// Clothing colours, shared by every animal. Also the palette every saved look was picked
// from before each species had its own coat colours, so it stays valid for fur too.
export const palette = [
  '#eea373',
  '#91b6cf',
  '#a8be75',
  '#cc9dcb',
  '#ebcd75',
  '#87c4aa',
  '#e78491',
  '#ece2cb',
  '#8c7265',
  '#486967',
  '#555d83',
  '#cf7744',
];
export const clothesPalette = palette;
// The shirt under a coat has its own colour: the clothing palette, plus the cream it
// starts as, so a layered outfit is never one colour from collar to hem.
export const SHIRT_CREAM = '#f2e3c7';
export const shirtPalette = [SHIRT_CREAM, ...palette];
// AUTO leaves each outfit the accent it was painted with, which is what every look wore
// before the trim could be chosen.
export const TRIM_AUTO = 'auto';
export const trimPalette = [TRIM_AUTO, SHIRT_CREAM, ...palette];
// Coat, skin, feather and scale colours per animal: the same model in a few natural
// palettes, the way the colour sheet has it. The first entry is the default look.
export const speciesPalettes: Record<Species, string[]> = {
  cat: ['#eea373', '#9aa9b8', '#e58a5b', '#ece2cb'],
  monkey: ['#9b6b45', '#8c7f78', '#7a5236', '#b98a5f'],
  frog: ['#7fa35a', '#6fb1a3', '#8ea864', '#87c4aa'],
  bird: ['#5f7fb4', '#8b6fa8', '#5b93a8', '#c9605c'],
  axolotl: ['#f0b3bd', '#c9b3d8', '#f4c2a8', '#f3e6e0'],
  bear: ['#8c6444', '#5b4033', '#b8895a', '#4a3a32'],
  rabbit: ['#f1e6d2', '#b48f66', '#f7f3ec', '#b9b3ad'],
  fish: ['#6fc0b4', '#eb9a5a', '#7fa8d0', '#8fbf7a'],
  blob: ['#a8d1b8', '#b3bfd6', '#9dc59a', '#c5b8dc'],
};
// Every colour an outfit is drawn in belongs to one of three cloths: the garment takes the
// clothing colour, the shirt showing under it takes the shirt colour, and every accent —
// a cuff, a hood's rim, a pocket, a waistband, the bands on a jumper — takes the trim.
// Clothes worn over a shirt rather than instead of one.
export const layeredOutfits = ['hoodie', 'overalls', 'raincoat', 'cardigan', 'vest'] as const;
export const isLayered = (outfit: string) => (layeredOutfits as readonly string[]).includes(outfit);
// A plain tee is one piece of cloth; everything else has an accent of some kind.
export const hasTrim = (outfit: string) => outfit !== 'tee';
// Hats of plain cloth take the player's hat colour. The rest are things before they are
// hats — a road cone, a birthday hat, a captain's cap, a flower crown, a straw brim — and
// keep the colours that make them those things.
export const tintedHats = ['beanie', 'bucket', 'beret'] as const;
export const isTintedHat = (hat: string) => (tintedHats as readonly string[]).includes(hat);
export type Appearance = {
  showGold: boolean;
  species: string;
  color: string;
  hat: string;
  outfit: string;
  outfitColor: string;
  shirtColor: string;
  trimColor: string;
  hatColor: string;
  accessory: string;
};
export const defaultAppearance: Appearance = {
  showGold: false,
  species: 'cat',
  color: speciesPalettes.cat[0],
  hat: 'none',
  outfit: 'tee',
  outfitColor: '#486967',
  shirtColor: SHIRT_CREAM,
  trimColor: TRIM_AUTO,
  hatColor: '#486967',
  accessory: 'none',
};
// Species that were renamed keep their players: an old saved look maps to the nearest one.
const speciesAliases: Record<string, string> = { dog: 'monkey' };
export function sanitizeAppearance(input: unknown): Appearance {
  const a =
    input && typeof input === 'object'
      ? (input as Record<string, unknown>)
      : {};
  const pick = (
    value: unknown,
    options: readonly string[],
    fallback: string,
  ) =>
    typeof value === 'string' && options.includes(value) ? value : fallback;
  const kind = pick(typeof a.species === 'string' && speciesAliases[a.species] ? speciesAliases[a.species] : a.species, species, 'cat') as Species;
  return {
    showGold: a.showGold === true,
    species: kind,
    color: pick(a.color, [...speciesPalettes[kind], ...palette], speciesPalettes[kind][0]),
    hat: pick(a.hat, hats, 'none'),
    outfit: pick(a.outfit, outfits, 'tee'),
    outfitColor: pick(a.outfitColor, palette, '#486967'),
    // A look saved before the shirt had a colour of its own keeps the cream it was drawn in.
    shirtColor: pick(a.shirtColor, shirtPalette, SHIRT_CREAM),
    trimColor: pick(a.trimColor, trimPalette, TRIM_AUTO),
    // A look saved before hats had their own colour keeps wearing its clothing colour,
    // which is what tinted its hat until now.
    hatColor: pick(a.hatColor, palette, pick(a.outfitColor, palette, '#486967')),
    accessory: pick(a.accessory, accessories, 'none'),
  };
}
