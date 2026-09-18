import { NO_MODS, type ReelMods } from './game.js';
// Tackle sold at the Bait Shop. Gear is owned for good and eases every reel a little;
// bait is used up by the next cast and only tilts what bites.
export type GearId = 'sturdyRod' | 'silkLine' | 'deepReel';
export const GEAR: Record<GearId, { name: string; price: number; blurb: string }> = {
  sturdyRod: { name: 'Sturdy rod', price: 250, blurb: 'Wider catch bar.' },
  silkLine: { name: 'Silk line', price: 450, blurb: 'Slower to lose the fish.' },
  deepReel: { name: 'Deep reel', price: 800, blurb: 'Reels in faster.' },
};
export const GEAR_IDS = Object.keys(GEAR) as GearId[];
export const BAIT = { id: 'luckyBait', name: 'Lucky bait', price: 90, blurb: 'Better odds on your next cast. One at a time.' };
export const GEAR_EFFECT = { halfWidth: 0.03, lossScale: 0.8, gainScale: 1.2 };
export function ownsGear(owned: Record<string, number>, id: GearId) {
  return !!owned[`gear:${id}`];
}
// The reel numbers a player's tackle earns; identical on the server and in the panel.
export function reelModifiers(owned: Record<string, number>): ReelMods {
  return {
    halfWidth: ownsGear(owned, 'sturdyRod') ? GEAR_EFFECT.halfWidth : NO_MODS.halfWidth,
    lossScale: ownsGear(owned, 'silkLine') ? GEAR_EFFECT.lossScale : NO_MODS.lossScale,
    gainScale: ownsGear(owned, 'deepReel') ? GEAR_EFFECT.gainScale : NO_MODS.gainScale,
  };
}
