import test from 'node:test';
import assert from 'node:assert/strict';
import { SHELL, SHELL_SPOTS, SHELL_TYPES, GARDEN_PLOTS, GARDEN, shellsForDay, dayKey, nextPlot } from '../server/dist/packages/shared/activities.js';
import { CHALLENGE_POOL, CHALLENGE_REWARD, applyChallenge, challengeView, challengesForDay } from '../server/dist/packages/shared/challenges.js';
import { sanitizeStats } from '../server/dist/packages/shared/stats.js';
import { walkable, withinLandmark } from '../server/dist/packages/shared/layout.js';
import { LANDMARKS } from '../server/dist/packages/shared/landmarks.js';
import { collectShell, waterGarden, petDog, dailyState } from '../server/dist/server/src/activities.js';
import { checkFeats } from '../server/dist/server/src/feats.js';

const DAY = 86400000;

test('four shells a day, on walkable spots that change with the date', () => {
  for (const spot of SHELL_SPOTS) assert.ok(walkable(spot.x, spot.z), `shell spot (${spot.x}, ${spot.z}) is not walkable`);
  const a = shellsForDay(3 * DAY + 5000),
    b = shellsForDay(3 * DAY + 90000),
    c = shellsForDay(4 * DAY);
  assert.deepEqual(a, b, 'the same day gives the same shells');
  assert.equal(a.spots.length, SHELL.perDay);
  assert.equal(new Set(a.spots.map((s) => s.i)).size, SHELL.perDay, 'four different spots');
  assert.notDeepEqual(a.spots.map((s) => s.i), c.spots.map((s) => s.i));
  for (const s of a.spots) assert.ok(s.type >= 0 && s.type < SHELL_TYPES.length);
  assert.equal(dayKey(3 * DAY + 5000), '3');
});

test('a shell is picked up once, fills the journal, and the day resets', () => {
  const stats = sanitizeStats({});
  const now = 10 * DAY + 1000;
  const [first] = shellsForDay(now).spots;
  assert.equal(collectShell(stats, 0, 0, now), null, 'nowhere near a shell');
  const found = collectShell(stats, first.x + 0.3, first.z, now);
  assert.equal(found.gold, SHELL.reward);
  assert.equal(found.isNew, true);
  assert.equal(stats.journal[found.name], 1);
  assert.equal(collectShell(stats, first.x, first.z, now), null, 'the same shell is not picked up twice');
  assert.equal(dailyState(stats, now).collected, 1 << first.i);
  // Tomorrow the spots are fresh, and the record only keeps a few days.
  const tomorrow = now + DAY;
  const again = shellsForDay(tomorrow).spots[0];
  assert.ok(collectShell(stats, again.x, again.z, tomorrow));
  const later = sanitizeStats({ ...stats, shells: { ...stats.shells, 1: 3, 2: 3, 3: 3, 4: 3 } });
  assert.ok(Object.keys(later.shells).length <= 3);
});

test('the garden takes one watering per plot per day and the dog pays once a day but always wags', () => {
  const stats = sanitizeStats({});
  const now = 20 * DAY;
  assert.match(waterGarden(stats, 0, 0, now), /watering can/);
  assert.ok(withinLandmark(GARDEN, LANDMARKS.garden.x, LANDMARKS.garden.z));
  for (let i = 0; i < GARDEN_PLOTS.length; i++) {
    const result = waterGarden(stats, GARDEN.x, GARDEN.z, now);
    assert.equal(result.plot, i);
    assert.ok(result.gold > 0);
  }
  assert.match(waterGarden(stats, GARDEN.x, GARDEN.z, now), /tomorrow/);
  assert.equal(nextPlot(stats.daily[dayKey(now)].garden), -1);
  assert.equal(typeof waterGarden(stats, GARDEN.x, GARDEN.z, now + DAY), 'object', 'a new day, a thirsty garden');
  assert.match(petDog(stats, 0, 0, now), /gate/);
  const dog = LANDMARKS.dog;
  assert.ok(petDog(stats, dog.x, dog.z, now).gold > 0);
  assert.equal(petDog(stats, dog.x, dog.z, now).gold, 0, 'a second pat is free');
  assert.equal(dailyState(stats, now).dog, 1);
});

test('three challenges a day from the pool, progress that pays once, and pruning of old days', () => {
  const now = 30 * DAY + 1000;
  const today = challengesForDay(now);
  assert.equal(today.length, 3);
  assert.equal(new Set(today.map((c) => c.id)).size, 3);
  assert.deepEqual(today, challengesForDay(now + 1000));
  assert.ok(CHALLENGE_POOL.length >= 12);
  // Drive every challenge in the pool to completion by simulating each day with its own events.
  const stats = sanitizeStats({});
  let paid = 0;
  for (let day = 0; day < 40; day++) {
    const t = day * DAY + 500;
    const list = challengesForDay(t);
    const events = [];
    for (let i = 0; i < 10; i++) events.push({ kind: 'catch', rarity: i === 0 ? 'Rare' : 'Common', perfect: i < 3 });
    for (const c of list) if (c.kind === 'game') events.push({ kind: 'game', game: c.game, score: c.target });
    events.push({ kind: 'game', game: 'sorting', score: 1 }, { kind: 'game', game: 'sorting', score: 1 }, { kind: 'buoy', timeMs: 80000 }, { kind: 'four', won: true }, { kind: 'shell' }, { kind: 'shell' }, { kind: 'shell' }, { kind: 'shell' });
    for (const e of events) paid += applyChallenge(stats, t, e).length * CHALLENGE_REWARD;
    const view = challengeView(stats, t);
    assert.ok(view.every((c) => c.done), `day ${day}: ${view.map((c) => `${c.id}:${c.progress}/${c.target}`).join(', ')}`);
    assert.ok(Object.keys(stats.challenges).length <= 2, 'only two days are kept');
  }
  assert.equal(paid, 40 * 3 * CHALLENGE_REWARD, 'each challenge paid exactly once');
  // Progress is capped in the view and a completed challenge does not complete again.
  const fresh = sanitizeStats({});
  const t = 41 * DAY;
  const catcher = challengesForDay(t).find((c) => c.kind === 'catch' || c.kind === 'perfect');
  if (catcher) {
    for (let i = 0; i < 20; i++) applyChallenge(fresh, t, { kind: 'catch', rarity: 'Common', perfect: true });
    const v = challengeView(fresh, t).find((c) => c.id === catcher.id);
    assert.equal(v.progress, catcher.target);
    assert.equal(v.done, true);
  }
});

test('feats hand over the earned cosmetics once', () => {
  const stats = sanitizeStats({});
  assert.deepEqual(checkFeats(stats, 'orchard', { score: 299 }), []);
  assert.deepEqual(
    checkFeats(stats, 'orchard', { score: 300 }).map((e) => e.key),
    ['hat:straw'],
  );
  assert.equal(stats.owned['hat:straw'], 1);
  assert.deepEqual(checkFeats(stats, 'orchard', { score: 900 }), [], 'earned once');
  assert.deepEqual(checkFeats(stats, 'buoy', { timeMs: 89000 }).map((e) => e.key), ['accessory:bandana']);
  assert.deepEqual(checkFeats(stats, 'buoy', { timeMs: 0 }), [], 'an unfinished run earns nothing');
  assert.deepEqual(checkFeats(stats, 'signals', { rounds: 10 }).map((e) => e.key), ['accessory:headphones']);
});
