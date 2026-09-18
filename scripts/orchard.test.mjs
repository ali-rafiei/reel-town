import test from 'node:test';
import assert from 'node:assert/strict';
import { ORCHARD, OrchardRun, generateOrchard, laneX, orchardMultiplier } from '../server/dist/server/src/minigames/orchard.js';

test('an orchard schedule is deterministic, lands inside the run, ramps, and never stacks rotten fruit in one lane', () => {
  const a = generateOrchard(11),
    b = generateOrchard(11);
  assert.deepEqual(a, b);
  assert.notDeepEqual(generateOrchard(12), a);
  assert.equal(a.length, ORCHARD.fruits);
  const last = a[a.length - 1];
  assert.ok(last.at + last.fall <= ORCHARD.durationMs, 'the last fruit lands before time is up');
  assert.ok(a[0].fall > last.fall && a[1].at - a[0].at > last.at - a[a.length - 2].at, 'fruit falls faster and closer together later');
  for (let i = 1; i < a.length; i++) if (a[i].rotten && a[i - 1].rotten) assert.notEqual(a[i].lane, a[i - 1].lane);
  assert.ok(a.some((f) => f.rotten) && a.filter((f) => f.rotten).length < a.length / 3);
  for (const f of a) assert.ok(f.lane >= 0 && f.lane < ORCHARD.lanes);
});

test('a catch under the fruit at landing scores, streaks multiply, rotten fruit costs and resets', () => {
  // Arrange: a run that starts now, played by a basket that moves at exactly the allowed speed.
  const run = new OrchardRun(1, 11, 100000);
  let expected = 0,
    streak = 0,
    caught = 0,
    x = ORCHARD.startX,
    at = run.startAt,
    lastGood = null;
  // Act: run under every good fruit the basket can reach in time; skip the rest and the rotten ones.
  for (const fruit of run.fruits) {
    if (caught >= 12) break;
    const land = run.landing(fruit);
    if (fruit.rotten) continue;
    const reachable = Math.abs(laneX(fruit.lane) - x) <= ORCHARD.basketSpeed * ((land - at) / 1000) + 0.02;
    if (!reachable) {
      streak = 0; // it drops on the grass and the server sweeps it before the next catch
      continue;
    }
    const result = run.input({ i: fruit.i, x: laneX(fruit.lane) }, land);
    assert.ok(result && result.ok, `fruit ${fruit.i} counted (${JSON.stringify(result)})`);
    expected += ORCHARD.catch * orchardMultiplier(streak);
    streak++;
    caught++;
    x = laneX(fruit.lane);
    at = land;
    lastGood = fruit;
  }
  assert.ok(caught >= 8, `caught ${caught}`);
  assert.equal(run.score, expected);
  assert.equal(run.caught, caught);
  assert.ok(orchardMultiplier(ORCHARD.streakStep) === 2 && orchardMultiplier(ORCHARD.streakStep * 2) === 3, 'streaks double, then triple');
  // A rotten fruit caught on purpose, the next one that falls.
  const rotten = run.fruits.find((f) => f.rotten && f.at > lastGood.at);
  const bad = run.input({ i: rotten.i, x: laneX(rotten.lane) }, run.landing(rotten));
  assert.equal(bad.rotten, true);
  assert.equal(bad.delta, ORCHARD.rotten);
  assert.equal(run.streak, 0);
  assert.equal(run.rottenCaught, 1);
  assert.equal(orchardMultiplier(run.streak), 1);
});

test('reports the basket could not have made are ignored, off-lane reports miss, and late fruit is swept', () => {
  const run = new OrchardRun(2, 5, 0);
  const [first, second] = run.fruits;
  // First report: the basket starts mid-track; a fruit two lanes away at the same instant is unreachable.
  const farLane = first.lane <= 2 ? 4 : 0;
  const teleport = run.input({ i: first.i, x: laneX(farLane) }, run.landing(first));
  if (Math.abs(laneX(farLane) - ORCHARD.startX) > ORCHARD.basketSpeed * ((run.landing(first) - run.startAt) / 1000) + 0.02) {
    assert.equal(teleport, null, 'an impossible basket position is ignored');
    assert.equal(run.rejected, 1);
    assert.equal(run.lastX, ORCHARD.startX, 'the basket did not move');
  }
  // A report far from the fruit's lane misses it.
  const away = laneX((first.lane + 2) % ORCHARD.lanes);
  const miss = run.input({ i: first.i, x: Math.abs(away - ORCHARD.startX) < 0.3 ? away : laneX(first.lane) + 0.2 }, run.landing(first) + 2000 + first.fall);
  assert.ok(miss === null || miss.ok === false);
  // Malformed and duplicate inputs mean nothing.
  assert.equal(run.input({ i: 'x', x: 0.5 }, 1000), null);
  assert.equal(run.input({ i: second.i, x: 'left' }, 1000), null);
  assert.equal(run.input({ i: 999, x: 0.5 }, 1000), null);
  // Everything landed long ago: the tick sweeps it all as missed and the run is complete.
  run.tick(run.startAt + ORCHARD.durationMs + 5000);
  assert.equal(run.taken.size, run.fruits.length);
  assert.equal(run.finished(run.startAt + 1), true);
  const summary = run.summary();
  assert.equal(summary.missed + summary.caught, run.fruits.filter((f) => !f.rotten).length);
});
