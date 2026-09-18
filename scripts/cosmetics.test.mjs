import test from 'node:test';
import assert from 'node:assert/strict';
import { purchase, enforceOwnership, grandfather, ownsCosmetic, cosmeticPrices } from '../server/dist/packages/shared/cosmetics.js';
import { defaultAppearance } from '../server/dist/packages/shared/appearance.js';
import { sanitizeStats } from '../server/dist/packages/shared/stats.js';

test('free items are always owned and paid items must be bought with enough gold', () => {
  const owned = {};
  assert.ok(ownsCosmetic(owned, 'hat', 'none'));
  assert.ok(!ownsCosmetic(owned, 'hat', 'captain'));
  assert.deepEqual(purchase(100, owned, 'hat', 'captain'), { ok: false, reason: `You need ${cosmeticPrices.hat.captain - 100} more gold for that.` });
  assert.deepEqual(purchase(1000, owned, 'hat', 'captain'), { ok: true, price: cosmeticPrices.hat.captain, consumable: false });
  assert.ok(ownsCosmetic(owned, 'hat', 'captain'));
  assert.equal(purchase(1000, owned, 'hat', 'captain').ok, false, 'cannot buy twice');
  assert.equal(purchase(400, owned, 'hat', 'crown').ok, false, 'unknown items are refused');
  assert.equal(purchase(400, owned, 'species', 'dragon').ok, false, 'unknown kinds are refused');
  assert.equal(purchase(400, owned, 'hat', 'none').ok, false, 'free items are not sold');
});

test('earned cosmetics cannot be bought, are stripped until the server grants them, and every catalogue item has a price', async () => {
  const { EARNED, FEATS, isEarned } = await import('../server/dist/packages/shared/cosmetics.js');
  const { hats, outfits, accessories, species, speciesPalettes, sanitizeAppearance } = await import('../server/dist/packages/shared/appearance.js');
  for (const [kind, list] of [['hat', hats], ['outfit', outfits], ['accessory', accessories]]) for (const item of list) assert.equal(typeof cosmeticPrices[kind][item], 'number', `${kind}:${item} has no price`);
  const earned = Object.keys(FEATS);
  assert.ok(earned.length >= 3);
  for (const key of earned) {
    const [kind, item] = key.split(':');
    assert.ok(isEarned(kind, item));
    const refused = purchase(100000, {}, kind, item);
    assert.equal(refused.ok, false);
    assert.match(refused.reason, /earned/);
  }
  assert.equal(enforceOwnership({ ...defaultAppearance, hat: 'straw' }, {}).hat, 'none');
  assert.equal(enforceOwnership({ ...defaultAppearance, hat: 'straw' }, { 'hat:straw': 1 }).hat, 'straw');
  assert.equal(cosmeticPrices.hat.straw, EARNED);
  // Every animal has its own coat colours, and an old shared-palette colour still loads.
  for (const kind of species) assert.ok(speciesPalettes[kind].length >= 3, `${kind} palette`);
  assert.equal(sanitizeAppearance({ species: 'bear', color: '#91b6cf' }).color, '#91b6cf', 'legacy palette colours are kept');
  assert.equal(sanitizeAppearance({ species: 'bear', color: '#000000' }).color, speciesPalettes.bear[0]);
  assert.equal(sanitizeAppearance({ species: 'frog', accessory: 'lantern' }).accessory, 'lantern');
  // The shirt under a coat is the player's second clothing colour, and a look saved
  // before there was one still loads, wearing the cream it was drawn in.
  const { SHIRT_CREAM, shirtPalette, isLayered, layeredOutfits } = await import('../server/dist/packages/shared/appearance.js');
  assert.equal(sanitizeAppearance({ outfit: 'hoodie' }).shirtColor, SHIRT_CREAM, 'an old look keeps its cream shirt');
  assert.equal(sanitizeAppearance({ shirtColor: '#e78491' }).shirtColor, '#e78491');
  assert.equal(sanitizeAppearance({ shirtColor: 'rgb(0,0,0)' }).shirtColor, SHIRT_CREAM, 'anything off the palette is refused');
  assert.ok(shirtPalette.includes(SHIRT_CREAM));
  for (const outfit of layeredOutfits) assert.ok(outfits.includes(outfit) && isLayered(outfit), outfit);
  assert.equal(isLayered('tee'), false, 'a tee is the shirt, so it has nothing under it');
  // A hat of plain cloth takes its own colour; a look from before that kept the clothing
  // colour its hat was tinted with, so nobody's beanie changed colour overnight.
  // Every accent an outfit is painted with can be chosen, and AUTO leaves them as painted.
  const { TRIM_AUTO, trimPalette, hasTrim } = await import('../server/dist/packages/shared/appearance.js');
  assert.equal(sanitizeAppearance({ outfit: 'vest' }).trimColor, TRIM_AUTO, 'an old look keeps the accents it was painted with');
  assert.equal(sanitizeAppearance({ trimColor: '#486967' }).trimColor, '#486967');
  assert.equal(sanitizeAppearance({ trimColor: '#123456' }).trimColor, TRIM_AUTO, 'anything off the palette is refused');
  assert.ok(trimPalette[0] === TRIM_AUTO, 'as-painted comes first');
  assert.equal(hasTrim('tee'), false, 'a plain tee is one piece of cloth');
  for (const outfit of outfits.filter((o) => o !== 'tee')) assert.ok(hasTrim(outfit), outfit);
  // A cardigan and a vest are garments over a shirt, so both of their cloths are chosen.
  for (const outfit of ['cardigan', 'vest', 'hoodie', 'raincoat', 'overalls']) assert.ok(isLayered(outfit), outfit);
  const { isTintedHat, tintedHats } = await import('../server/dist/packages/shared/appearance.js');
  for (const hat of tintedHats) assert.ok(hats.includes(hat) && isTintedHat(hat), hat);
  for (const hat of ['captain', 'flower', 'straw', 'cone', 'party']) assert.equal(isTintedHat(hat), false, `${hat} carries its own colours`);
  assert.equal(sanitizeAppearance({ outfitColor: '#cf7744' }).hatColor, '#cf7744', 'an old look keeps its hat as it was');
  assert.equal(sanitizeAppearance({ outfitColor: '#cf7744', hatColor: '#91b6cf' }).hatColor, '#91b6cf');
  assert.equal(sanitizeAppearance({ hatColor: 'chartreuse' }).hatColor, defaultAppearance.hatColor, 'anything off the palette is refused');
});

test('the dockkeeper is granted the whole catalogue, earned pieces and gear included', async () => {
  const { grantAll } = await import('../server/dist/packages/shared/cosmetics.js');
  const { hats, outfits, accessories } = await import('../server/dist/packages/shared/appearance.js');
  const { GEAR_IDS } = await import('../server/dist/packages/shared/gear.js');
  const owned = grantAll({});
  for (const [kind, list] of [['hat', hats], ['outfit', outfits], ['accessory', accessories]]) for (const item of list) assert.ok(ownsCosmetic(owned, kind, item), `${kind}:${item}`);
  for (const id of GEAR_IDS) assert.equal(owned[`gear:${id}`], 1);
  assert.equal(enforceOwnership({ ...defaultAppearance, hat: 'straw', accessory: 'headphones' }, owned).hat, 'straw');
  assert.equal(owned['hat:none'], undefined, 'free items need no grant');
});

test('unowned cosmetics in a submitted look fall back to the free defaults', () => {
  const look = { ...defaultAppearance, hat: 'captain', outfit: 'raincoat', accessory: 'scarf' };
  assert.deepEqual(enforceOwnership(look, {}), { ...defaultAppearance, hat: 'none', outfit: 'tee', accessory: 'none' });
  const owned = { 'hat:captain': 1 };
  assert.equal(enforceOwnership(look, owned).hat, 'captain');
  assert.equal(enforceOwnership(look, owned).outfit, 'tee');
});

test('existing players are grandfathered into the items they already wear', () => {
  const stats = sanitizeStats({});
  grandfather(stats.owned, { ...defaultAppearance, hat: 'flower', outfit: 'hoodie', accessory: 'backpack' });
  assert.deepEqual(stats.owned, { 'hat:flower': 1, 'outfit:hoodie': 1, 'accessory:backpack': 1 });
  assert.deepEqual(sanitizeStats({ owned: { 'hat:flower': 1, junk: 'x' } }).owned, { 'hat:flower': 1, junk: 0 });
});

test('gear is bought once and changes the reel; bait is held one at a time and never owned', async () => {
  const { GEAR, BAIT, reelModifiers, ownsGear } = await import('../server/dist/packages/shared/gear.js');
  const { NO_MODS, catchHalfWidth, reelInside } = await import('../server/dist/packages/shared/game.js');
  // Arrange: a player with no tackle.
  const owned = {};
  assert.deepEqual(reelModifiers(owned), NO_MODS);
  // Act: buy a rod, then try again.
  assert.deepEqual(purchase(1000, owned, 'gear', 'sturdyRod'), { ok: true, price: GEAR.sturdyRod.price, consumable: false });
  assert.ok(ownsGear(owned, 'sturdyRod'));
  assert.equal(purchase(1000, owned, 'gear', 'sturdyRod').ok, false, 'gear is bought once');
  assert.equal(purchase(10, owned, 'gear', 'silkLine').ok, false, 'gear costs gold');
  // Assert: the rod widens the bar on every fish, and only the rod's effect is applied.
  const mods = reelModifiers(owned);
  assert.ok(catchHalfWidth(193, mods) > catchHalfWidth(193));
  assert.equal(mods.lossScale, 1);
  assert.equal(mods.gainScale, 1);
  // Past the plain bar and its visual margin, but inside the rod's wider bar.
  const edge = 0.5 + catchHalfWidth(193) + 0.045;
  assert.equal(reelInside(193, edge, 0.5), false);
  assert.equal(reelInside(193, edge, 0.5, mods), true, 'a fish just past the plain bar is inside the rod\'s bar');
  // Bait: bought while none is held, refused while one is, never added to owned.
  assert.deepEqual(purchase(500, owned, 'bait', BAIT.id, 0), { ok: true, price: BAIT.price, consumable: true });
  assert.equal(purchase(500, owned, 'bait', BAIT.id, 1).ok, false, 'one bait on the hook at a time');
  assert.equal(owned['bait:luckyBait'], undefined);
  assert.equal(sanitizeStats({ bait: 3 }).bait, 1);
  assert.equal(sanitizeStats({}).bait, 0);
});
