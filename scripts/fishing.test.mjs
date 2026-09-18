import test from 'node:test';
import assert from 'node:assert/strict';
import { fishCatalog, fishForSeed, fishPosition, fishWeights, seedForContext, castLanding, castDistance, CAST, TOTAL_WEIGHT } from '../server/dist/packages/shared/game.js';
import { onIsland, onPier } from '../server/dist/packages/shared/layout.js';
import { sanitizeStats, recordCatch, rewardsInLastHour } from '../server/dist/packages/shared/stats.js';

test('every fish behaviour stays inside the reel track for all seeds and times', () => {
  for (let seed = 1; seed <= TOTAL_WEIGHT * 2; seed++)
    for (let t = 0; t < 30; t += 0.37) {
      const y = fishPosition(seed, t);
      assert.ok(y >= 0.07 && y <= 0.93, `seed ${seed} t ${t} -> ${y}`);
    }
});

test('behaviours are distinct: sinkers stay low and floaters stay high on average', () => {
  const average = (behavior) => {
    const seeds = [];
    for (let seed = 1; seed < TOTAL_WEIGHT; seed++) if (fishForSeed(seed).behavior === behavior) seeds.push(seed);
    let sum = 0,
      n = 0;
    for (const seed of seeds) for (let t = 0; t < 40; t += 0.5) (sum += fishPosition(seed, t)), n++;
    return sum / n;
  };
  assert.ok(average('sinker') < 0.45);
  assert.ok(average('floater') > 0.55);
  assert.ok(Math.abs(average('smooth') - 0.5) < 0.08);
});

test('weather, night and far casts raise rare odds only within bounded multipliers', () => {
  // Arrange
  const base = fishWeights({ weather: 'clear', night: false, power: 0.3 });
  const boosted = fishWeights({ weather: 'fog', night: true, power: 1 });
  const share = (weights, rarity) => weights.reduce((a, w, i) => a + (fishCatalog[i].rarity === rarity ? w : 0), 0) / weights.reduce((a, b) => a + b, 0);
  // Assert
  assert.ok(share(boosted, 'Legendary') > share(base, 'Legendary'));
  assert.ok(share(boosted, 'Legendary') < 0.08, 'legendaries stay rare even in the best conditions');
  assert.ok(share(base, 'Common') > 0.55);
  boosted.forEach((w, i) => assert.ok(w <= fishCatalog[i].weight * 2.5 + 1e-9 && w >= fishCatalog[i].weight * 0.7 - 1e-9));
});

test('seedForContext yields a seed that maps back to the chosen species for any roll', () => {
  let random = 0;
  const rng = () => {
    random = (random + 0.137) % 1;
    return random;
  };
  const seen = new Set();
  for (let i = 0; i < 2000; i++) {
    const seed = seedForContext({ weather: 'rain', night: true, power: 0.9 }, rng);
    assert.ok(Number.isInteger(seed) && seed > 0);
    seen.add(fishForSeed(seed).name);
  }
  assert.ok(seen.size > 20, 'weighted picking still reaches most species');
});

test('cast power sets distance and every landing point is in open water', () => {
  assert.equal(castDistance(0), CAST.minDistance);
  assert.equal(castDistance(1), CAST.maxDistance);
  for (const [x, z] of [[0, 36.5], [1.9, 36], [-1.5, 26], [0, 28], [2, 32], [8.5, 35], [-8.5, 34], [5, 36.5], [-4, 34]])
    for (const power of [0, 0.5, 1])
      for (const aim of [-1, 0, 1]) {
        const p = castLanding(x, z, power, aim);
        assert.ok(!onIsland(p.x, p.z) && !onPier(p.x, p.z), `landing (${p.x.toFixed(1)}, ${p.z.toFixed(1)}) from (${x}, ${z}) power ${power} aim ${aim}`);
      }
  const near = castLanding(0, 36.5, 0, 0),
    far = castLanding(0, 36.5, 1, 0);
  assert.ok(far.z - near.z > 6, 'more power lands further out');
});

test('stats sanitize garbage and record catches, streaks and discoveries', () => {
  const stats = sanitizeStats({ catches: -4, species: { ['x'.repeat(80)]: 3, Sock: 2 }, casting: { rewardedAt: ['no', 5] } });
  assert.equal(stats.catches, 0);
  assert.deepEqual(stats.species, { Sock: 2 });
  assert.deepEqual(stats.casting.rewardedAt, [5]);
  const first = recordCatch(stats, 'Button Bass', 40, true);
  const second = recordCatch(stats, 'Button Bass', 55, true);
  const third = recordCatch(stats, 'Button Bass', 20, false);
  assert.deepEqual([first.isNew, second.isNew, third.isNew], [true, false, false]);
  assert.deepEqual([first.record, second.record, third.record], [true, true, false]);
  assert.equal(stats.bestStreak, 2);
  assert.equal(stats.streak, 0);
  assert.equal(stats.biggest['Button Bass'], 55);
  assert.equal(rewardsInLastHour([0, 1000, 3600001], 3600001), 2, 'the reward exactly one hour old has expired');
});

test('the reel hit test allows a touching fish and is shared, and harder fish take longer to land', async () => {
  const { reelInside, reelStep, REEL, catchHalfWidth } = await import('../server/dist/packages/shared/game.js');
  // A fish just past the bar edge but within the visual margin still counts.
  assert.equal(reelInside(1, 0.5 + catchHalfWidth(1) + REEL.margin * 0.5, 0.5), true);
  assert.equal(reelInside(1, 0.5 + catchHalfWidth(1) + REEL.margin * 2, 0.5), false);
  // Perfect tracking: seconds to land a common (seed 1) versus a legendary (seed 193).
  const secondsToLand = (seed) => {
    const s = { bar: 0.5, velocity: 0, progress: REEL.startProgress, perfect: true };
    for (let t = 0; t < 60; t += 1 / 60) {
      s.bar = fishPosition(seed, t); // ideal player
      reelStep(s, false, seed, t, 1 / 60);
      s.bar = fishPosition(seed, t);
      if (s.progress >= 1) return t;
    }
    return Infinity;
  };
  const common = secondsToLand(1),
    legendary = secondsToLand(193);
  assert.ok(common > 4 && common < 6, `common lands in ${common.toFixed(1)} s`);
  assert.ok(legendary > common && legendary < 8, `legendary lands in ${legendary.toFixed(1)} s`);
  // Ignoring the fish loses the catch faster for harder fish.
  const secondsToLose = (seed) => {
    const s = { bar: 0.5, velocity: 0, progress: REEL.startProgress, perfect: true };
    for (let t = 0; t < 60; t += 1 / 60) {
      // Always park the bar on the far side of the track from the fish.
      s.bar = fishPosition(seed, t) > 0.5 ? catchHalfWidth(seed) : 1 - catchHalfWidth(seed);
      s.velocity = 0;
      reelStep(s, false, seed, t, 1 / 60);
      if (s.progress <= 0) return t;
    }
    return Infinity;
  };
  const loseLegendary = secondsToLose(193),
    loseCommon = secondsToLose(1);
  assert.ok(loseLegendary < loseCommon && loseCommon < 4, `lose common in ${loseCommon.toFixed(1)} s, legendary in ${loseLegendary.toFixed(1)} s`);
});

test('a reel opens with the fish inside the bar, so a perfect catch is the player\'s to lose', async () => {
  const { startingBar, reelInside, REEL, reelStep, TOTAL_WEIGHT, catchHalfWidth } = await import('../server/dist/packages/shared/game.js');
  // Parks the bar as far from the fish as the track allows.
  const away = (seed, t) => (fishPosition(seed, t) > 0.5 ? catchHalfWidth(seed) : 1 - catchHalfWidth(seed));
  // Arrange: every species, at the moment the reel begins.
  for (let seed = 1; seed <= TOTAL_WEIGHT * 3; seed++)
    assert.ok(reelInside(seed, fishPosition(seed, 0), startingBar(seed)), `seed ${seed} starts outside the bar`);
  // A player who tracks the fish keeps the bonus.
  const tracked = { bar: startingBar(7), velocity: 0, progress: REEL.startProgress, perfect: true };
  for (let t = 0; t < 8; t += 1 / 60) {
    reelStep(tracked, false, 7, t, 1 / 60);
    tracked.bar = fishPosition(7, t);
  }
  assert.equal(tracked.perfect, true);
  // A player who lets it drift loses the bonus, but not during the opening grace.
  const dropped = { bar: startingBar(7), velocity: 0, progress: REEL.startProgress, perfect: true };
  for (let t = 0; t < REEL.perfectGrace - 1 / 60; t += 1 / 60) {
    dropped.bar = away(7, t);
    reelStep(dropped, false, 7, t, 1 / 60);
  }
  assert.equal(dropped.perfect, true, 'the grace window covers the hook round trip');
  for (let t = REEL.perfectGrace; t < 2; t += 1 / 60) {
    dropped.bar = away(7, t);
    reelStep(dropped, false, 7, t, 1 / 60);
  }
  assert.equal(dropped.perfect, false, 'letting the fish out of the bar costs the bonus');
});

test('every reel opens with the fish still and centred, and it eases onto its path afterwards', async () => {
  const { startingBar, REEL, reelStep, NO_MODS, fishWeights } = await import('../server/dist/packages/shared/game.js');
  for (let seed = 1; seed <= TOTAL_WEIGHT; seed++) {
    for (let t = 0; t <= REEL.holdSeconds; t += 0.1) assert.equal(fishPosition(seed, t), 0.5, `seed ${seed} moved at ${t.toFixed(1)} s`);
    assert.equal(startingBar(seed), 0.5);
  }
  // After the hold the fish is on its own path: two species differ, and the path is continuous.
  assert.notEqual(fishPosition(123, 2), fishPosition(124, 2));
  for (let seed = 1; seed <= TOTAL_WEIGHT; seed += 7)
    for (let t = 0; t < 4; t += 1 / 60) assert.ok(Math.abs(fishPosition(seed, t + 1 / 60) - fishPosition(seed, t)) < 0.06, `seed ${seed} jumps at ${t.toFixed(2)} s`);
  // Tackle is optional: a step with no modifiers is exactly the plain step.
  const a = { bar: 0.5, velocity: 0, progress: 0.3, perfect: true },
    b = { ...a };
  for (let i = 0; i < 300; i++) {
    reelStep(a, i % 30 < 15, 190, i / 60, 1 / 60);
    reelStep(b, i % 30 < 15, 190, i / 60, 1 / 60, NO_MODS);
  }
  assert.deepEqual(a, b);
  // Lucky bait raises legendary odds and still leaves them a minority, even on the best night.
  const share = (weights, rarity) => weights.reduce((s, w, i) => s + (fishCatalog[i].rarity === rarity ? w : 0), 0) / weights.reduce((s, w) => s + w, 0);
  const best = fishWeights({ weather: 'fog', night: true, power: 1 }),
    lucky = fishWeights({ weather: 'fog', night: true, power: 1, lucky: true }),
    luckyPlain = fishWeights({ weather: 'clear', night: false, power: 0.3, lucky: true });
  assert.ok(share(lucky, 'Legendary') > share(best, 'Legendary') * 1.5, 'bait is worth buying');
  assert.ok(share(lucky, 'Legendary') < 0.2, `legendaries stay a minority with bait: ${share(lucky, 'Legendary').toFixed(3)}`);
  assert.ok(share(luckyPlain, 'Legendary') > share(fishWeights({ weather: 'clear', night: false, power: 0.3 }), 'Legendary'));
});

test('every species has its own look, and the looks are actually distinct', async () => {
  const { fishLooks, lookFor } = await import('../server/dist/packages/shared/fishlook.js');
  const signatures = new Set();
  for (const fish of fishCatalog) {
    const look = fishLooks[fish.name];
    assert.ok(look, `${fish.name} has no look`);
    // Colours must be usable hex, and readable rather than paper-coloured.
    for (const colour of look.colors) assert.match(colour, /^#[0-9a-f]{6}$/, `${fish.name} colour ${colour}`);
    assert.notEqual(look.colors[0].toLowerCase(), '#ffffff', `${fish.name} would vanish on the panels`);
    assert.notEqual(look.colors[2].toLowerCase(), '#ffffff', `${fish.name} accent would vanish on the panels`);
    signatures.add([look.body, look.tail, look.fin, look.pattern, look.extra, look.colors[0]].join('|'));
  }
  assert.equal(signatures.size, fishCatalog.length, 'two species would be drawn identically');
  // An unknown name still draws something rather than crashing the guide.
  assert.ok(lookFor('Not A Fish').body);
  assert.ok(lookFor(undefined).colors.length === 3);
});
