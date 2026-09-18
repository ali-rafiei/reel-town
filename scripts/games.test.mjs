import test from 'node:test';
import assert from 'node:assert/strict';
import { GAME_IDS, GAME_REWARDS, gameReward } from '../server/dist/packages/shared/games.js';
import { sanitizeStats, gameRecord, mirrorLegacySorting } from '../server/dist/packages/shared/stats.js';
import { LANDMARKS, LANDMARK_IDS } from '../server/dist/packages/shared/landmarks.js';
import { walkable, blockers, capsules } from '../server/dist/packages/shared/layout.js';
import { SERVER_GAMES } from '../server/dist/server/src/minigames/registry.js';

test('every game pays by one curve: score over a divisor, capped per run and per rolling hour', () => {
  const now = 9_000_000;
  for (const id of GAME_IDS) {
    const rule = GAME_REWARDS[id];
    assert.equal(gameReward(id, 0, [], now), 0);
    assert.equal(gameReward(id, rule.divisor * 3, [], now), 3);
    assert.equal(gameReward(id, 1e9, [], now), rule.maxPerRun);
    const capped = Array.from({ length: rule.maxRunsPerHour }, (_, i) => now - i * 60000);
    assert.equal(gameReward(id, 1e9, capped, now), 0, `${id} stops paying at the hourly cap`);
    assert.equal(gameReward(id, 1e9, [now - 3600001], now), rule.maxPerRun, `${id} pays again an hour later`);
    assert.ok(rule.maxPerRun <= 40, `${id} cannot outpay fishing`);
  }
});

test('stats grow a record per game, seeded from the old sorting block, and mirror it back for old clients', () => {
  const fresh = sanitizeStats({});
  for (const id of GAME_IDS) assert.deepEqual(fresh.games[id], { best: 0, plays: 0, wins: 0, bestTimeMs: 0, rewardedAt: [] });
  const legacy = sanitizeStats({ sorting: { best: 120, plays: 3, rewardedAt: [5, 6] } });
  assert.deepEqual(legacy.games.sorting, { best: 120, plays: 3, wins: 0, bestTimeMs: 0, rewardedAt: [5, 6] });
  assert.equal(legacy.sorting.best, 120, 'the legacy block is untouched');
  const record = gameRecord(legacy, 'sorting');
  record.best = 200;
  record.plays = 4;
  mirrorLegacySorting(legacy);
  assert.equal(legacy.sorting.best, 200);
  assert.equal(legacy.sorting.plays, 4);
  // Garbage in the games map is dropped rather than crashing the load.
  const junk = sanitizeStats({ games: { orchard: { best: 'x', plays: -2, rewardedAt: 'nope' }, nonsense: 1 } });
  assert.deepEqual(junk.games.orchard, { best: 0, plays: 0, wins: 0, bestTimeMs: 0, rewardedAt: [] });
  assert.equal('nonsense' in junk.games, false);
});

test('every landmark stands on walkable ground clear of props, and every registered game starts at one', () => {
  const inside = (x, z) =>
    blockers.some((b) => Math.hypot(x - b.x, z - b.z) < b.r) ||
    capsules.some((c) => {
      const dx = c.x2 - c.x1,
        dz = c.z2 - c.z1,
        t = Math.max(0, Math.min(1, ((x - c.x1) * dx + (z - c.z1) * dz) / (dx * dx + dz * dz)));
      return Math.hypot(x - (c.x1 + dx * t), z - (c.z1 + dz * t)) < c.r;
    });
  for (const id of LANDMARK_IDS) {
    const l = LANDMARKS[id];
    // The centre may sit on the prop itself (a door, a table); somewhere inside the radius must be standable.
    let standable = false;
    for (let a = 0; a < Math.PI * 2 && !standable; a += Math.PI / 8) {
      const x = l.x + Math.cos(a) * l.radius * 0.7,
        z = l.z + Math.sin(a) * l.radius * 0.7;
      if (walkable(x, z) && !inside(x, z)) standable = true;
    }
    assert.ok(standable, `${id} at (${l.x}, ${l.z}) has nowhere to stand`);
  }
  for (const [id, def] of Object.entries(SERVER_GAMES)) {
    assert.ok(Object.values(LANDMARKS).includes(def.landmark), `${id} starts at a shared landmark`);
    assert.ok(def.countdownMs >= 1000 && def.refusal.length > 10);
    const run = def.create(1, 7, 1000);
    assert.equal(run.game, id);
    assert.equal(run.settled, false);
    assert.ok(run.durationMs > 10000);
    assert.equal(typeof run.startPayload(), 'object');
  }
});
