// The painted 2D art pack: sprites cut from the concept sheets in evidence/gpt/sheets and
// shipped under public/art/<sheet>/<item>.png. Everything the UI draws from it goes through
// here, so a renamed file breaks in one place.
export type ArtSheet = 'ui-icons' | 'fishing-shop' | 'minigames' | 'shells-tidepool' | 'world-billboards' | 'portraits-emotes' | 'cosmetics';
export function art(sheet: ArtSheet, item: string) {
  return `${import.meta.env.BASE_URL}art/${sheet}/${item}.png`;
}
// One painting per collectible shell, in SHELL_TYPES order.
export const SHELL_ART: Record<string, string> = {
  Cockle: 'cockle',
  Whelk: 'whelk',
  Periwinkle: 'periwinkle',
  Limpet: 'limpet',
  Scallop: 'scallop',
  Conch: 'conch',
  'Sand dollar': 'sand-dollar',
  'Moon snail': 'moon-snail',
};
export const GEAR_ART: Record<string, string> = { sturdyRod: 'wooden-rod', silkLine: 'silk-line', deepReel: 'brass-reel', luckyBait: 'lucky-bait' };
export const COSMETIC_ART: Record<string, Record<string, string>> = {
  hat: { beanie: 'beanie', bucket: 'bucket-hat', cone: 'traffic-cone-hat', party: 'birthday-cone-hat', flower: 'flower-crown', captain: 'captain-cap', beret: 'beret', straw: 'straw-hat' },
  outfit: { tee: 'plain-tee', hoodie: 'hoodie', striped: 'striped-jumper', overalls: 'denim-overalls', raincoat: 'yellow-raincoat', cardigan: 'cardigan', sweater: 'knit-sweater', vest: 'pocket-vest' },
  accessory: { glasses: 'round-glasses', scarf: 'scarf', backpack: 'backpack', satchel: 'satchel', bandana: 'bandana', bow: 'hair-bow', headphones: 'headphones', lantern: 'hand-lantern' },
};
export const RARITY_RIBBON: Record<string, string> = { Common: 'common-ribbon', Uncommon: 'uncommon-ribbon', Rare: 'rare-ribbon', Legendary: 'legendary-ribbon' };
export const RARITY_CRATE: Record<string, string> = { Common: 'common-crate', Uncommon: 'uncommon-crate', Rare: 'rare-crate', Legendary: 'legendary-crate' };
