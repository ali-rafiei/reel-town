import test from 'node:test';
import assert from 'node:assert/strict';
import {
  walk,
  reelStep,
  fishPosition,
  profiles,
  fishCatalog, fishForSeed, catchHalfWidth,
} from '../server/dist/packages/shared/game.js';
test('small VM profile has 12 players and 10 Hz snapshots', () =>
  assert.deepEqual(profiles.small, { cap: 12, hz: 10 }));
test('diagonal movement cannot exceed the allowed speed', () => {
  const p = walk(0, 0, 1, 1, 0.1);
  assert.ok(Math.abs(Math.hypot(p.x, p.z) - 0.5) < 1e-9);
});
import { shoreRadius, SHORE_SOUTH } from '../server/dist/packages/shared/layout.js';
test('players cannot walk into the ocean but can walk onto the pier', () => {
  const edge = shoreRadius(0) - 0.1;
  assert.deepEqual(walk(edge, 0, 1, 0, 0.1), { x: edge, z: 0 });
  assert.ok(walk(0, SHORE_SOUTH, 0, 1, 0.1).z > SHORE_SOUTH);
});
test('reel simulation is deterministic and bounded', () => {
  function run() {
    const s = { bar: 0.5, velocity: 0, progress: 0.35, perfect: true };
    for (let i = 0; i < 600; i++) {
      reelStep(s, i % 20 < 10, 123, i * 0.1, 0.1);
      assert.ok(s.bar >= 0.175 && s.bar <= 0.825);
      assert.ok(s.progress >= 0 && s.progress <= 1);
    }
    return s;
  }
  assert.deepEqual(run(), run());
  assert.notEqual(fishPosition(123, 1), fishPosition(124, 1));
});

import {
  sanitizeAppearance,
  defaultAppearance,
} from '../server/dist/packages/shared/appearance.js';
test('appearance accepts supported cosmetics and rejects arbitrary values', () => {
  assert.deepEqual(
    sanitizeAppearance({
      species: 'dragon',
      hat: '../../etc',
      color: 'url(x)',
    }),
    defaultAppearance,
  );
  assert.equal(
    sanitizeAppearance({ species: 'frog', hat: 'bucket' }).hat,
    'bucket',
  );
  // The dog was replaced by the monkey; players who saved one keep a character.
  assert.equal(sanitizeAppearance({ species: 'dog' }).species, 'monkey');
  assert.equal(sanitizeAppearance({ species: 'wolf' }).species, 'cat');
});
test('reel bar bounces gently off limits rather than sticking', () => {
  const s = { bar: 0.824, velocity: 0.6, progress: 0.5, perfect: true };
  reelStep(s, true, 1, 1, 1 / 60);
  assert.equal(s.bar, 1-catchHalfWidth(1));
  assert.ok(s.velocity < 0);
});

test('all 30 fish are reachable with weighted rarity and distinct values',()=>{const picks=Array.from({length:194},(_,i)=>fishForSeed(i));assert.equal(new Set(picks.map(f=>f.name)).size,30);assert.equal(picks.filter(f=>f.rarity==='Legendary').length,5);assert.equal(picks.filter(f=>f.rarity==='Common').length,120);assert.ok(Math.max(...fishCatalog.map(f=>f.price))>Math.min(...fishCatalog.map(f=>f.price))*20);assert.ok(catchHalfWidth(0)>catchHalfWidth(193));});
