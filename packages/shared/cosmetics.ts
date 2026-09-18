import { accessories, hats, outfits, type Appearance } from './appearance.js';
import { BAIT, GEAR } from './gear.js';
// Cosmetic shop: gold has somewhere to go. Free items keep newcomers expressive; the rest are earned.
// Tackle (gear, bait) rides the same purchase path so there is one place gold leaves a player.
export type WearableKind = 'hat' | 'outfit' | 'accessory';
export type CosmeticKind = WearableKind | 'gear' | 'bait';
// A price of EARNED means the item is never sold: the server hands it over when the
// player pulls off the feat named in FEATS.
export const EARNED = -1;
export const cosmeticPrices: Record<CosmeticKind, Record<string, number>> = {
  hat: { none: 0, beanie: 60, bucket: 120, cone: 90, party: 100, flower: 200, captain: 320, beret: 140, straw: EARNED },
  outfit: { tee: 0, hoodie: 110, striped: 130, overalls: 160, raincoat: 220, cardigan: 180, sweater: 150, vest: 200 },
  accessory: { none: 0, glasses: 80, scarf: 120, backpack: 260, satchel: 180, bandana: EARNED, bow: 90, headphones: EARNED, lantern: 280 },
  gear: Object.fromEntries(Object.entries(GEAR).map(([id, g]) => [id, g.price])),
  bait: { [BAIT.id]: BAIT.price },
};
export const cosmeticKinds: CosmeticKind[] = ['hat', 'outfit', 'accessory', 'gear', 'bait'];
export const FEATS: Record<string, string> = {
  'hat:straw': 'Score 300 in Orchard Catch',
  'accessory:bandana': 'Finish the Buoy Run in under 90 seconds',
  'accessory:headphones': 'Reach round 10 of Lighthouse Signals',
};
export const isEarned = (kind: CosmeticKind, item: string) => cosmeticPrices[kind][item] === EARNED;
export function isCosmetic(kind: unknown, item: unknown): kind is CosmeticKind {
  return typeof kind === 'string' && typeof item === 'string' && kind in cosmeticPrices && item in cosmeticPrices[kind as CosmeticKind];
}
export function ownedKey(kind: CosmeticKind, item: string) {
  return `${kind}:${item}`;
}
export function ownsCosmetic(owned: Record<string, number>, kind: CosmeticKind, item: string) {
  return cosmeticPrices[kind][item] === 0 || !!owned[ownedKey(kind, item)];
}
// Players who already wear an item from before the shop existed keep it.
export function grandfather(owned: Record<string, number>, appearance: Appearance) {
  for (const [kind, item] of [['hat', appearance.hat], ['outfit', appearance.outfit], ['accessory', appearance.accessory]] as Array<[CosmeticKind, string]>)
    if (isCosmetic(kind, item) && cosmeticPrices[kind][item] > 0) owned[ownedKey(kind, item)] = owned[ownedKey(kind, item)] || 1;
  return owned;
}
// Replaces any unowned cosmetic with the free default so a client cannot dress up by editing messages.
export function enforceOwnership(appearance: Appearance, owned: Record<string, number>): Appearance {
  return {
    ...appearance,
    hat: ownsCosmetic(owned, 'hat', appearance.hat) ? appearance.hat : 'none',
    outfit: ownsCosmetic(owned, 'outfit', appearance.outfit) ? appearance.outfit : 'tee',
    accessory: ownsCosmetic(owned, 'accessory', appearance.accessory) ? appearance.accessory : 'none',
  };
}
// The dockkeeper owns the whole catalogue: every hat, outfit, accessory and piece of gear,
// earned ones included, so they can try and test anything.
export function grantAll(owned: Record<string, number>) {
  for (const kind of ['hat', 'outfit', 'accessory', 'gear'] as CosmeticKind[]) for (const item of Object.keys(cosmeticPrices[kind])) if (cosmeticPrices[kind][item] !== 0) owned[ownedKey(kind, item)] = 1;
  return owned;
}
export type PurchaseResult = { ok: true; price: number; consumable: boolean } | { ok: false; reason: string };
// Bait is not owned: it is held, one at a time, until the next cast uses it up.
export function purchase(coins: number, owned: Record<string, number>, kind: unknown, item: unknown, baitHeld = 0): PurchaseResult {
  if (!isCosmetic(kind, item)) return { ok: false, reason: 'That item is not for sale.' };
  const price = cosmeticPrices[kind][item as string];
  if (price === EARNED) return { ok: false, reason: `That one is earned, not bought: ${FEATS[ownedKey(kind, item as string)] ?? 'a feat around the harbour'}.` };
  if (kind === 'bait') {
    if (baitHeld > 0) return { ok: false, reason: 'You already have bait on the hook. Cast it first.' };
    if (coins < price) return { ok: false, reason: `You need ${price - coins} more gold for that.` };
    return { ok: true, price, consumable: true };
  }
  if (price === 0 || owned[ownedKey(kind, item as string)]) return { ok: false, reason: 'You already own that.' };
  if (coins < price) return { ok: false, reason: `You need ${price - coins} more gold for that.` };
  owned[ownedKey(kind, item as string)] = 1;
  return { ok: true, price, consumable: false };
}
export const allItems = { hat: hats, outfit: outfits, accessory: accessories } as const;
