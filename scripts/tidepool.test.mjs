import test from 'node:test';
import assert from 'node:assert/strict';
import { TIDEPOOL, TIDE_BINS, TIDE_ITEMS, TidepoolRun } from '../server/dist/server/src/minigames/tidepool.js';

test('a tidepool run is a ramping belt of litter with a creature every fourth item', () => {
  const run = new TidepoolRun(1, 3, 0);
  assert.deepEqual(run.items, new TidepoolRun(2, 3, 0).items);
  assert.equal(run.items.length, TIDEPOOL.items);
  for (const item of run.items) assert.equal(TIDE_ITEMS[item.kind].bin < 0, item.i % 4 === 3, `item ${item.i}`);
  const last = run.items[run.items.length - 1];
  assert.ok(last.at + last.travel <= TIDEPOOL.durationMs);
  assert.ok(last.at + last.travel > TIDEPOOL.durationMs - 2000, 'litter keeps coming until the clock stops');
  assert.ok(run.items[0].travel > last.travel);
  // The belt drifts off the beat, so litter arrives in clusters and gaps rather than on a count.
  const gaps = run.items.slice(1).map((item, i) => item.at - run.items[i].at);
  assert.ok(gaps.every((gap) => gap > 0), 'litter keeps its order');
  assert.ok(new Set(gaps).size > gaps.length / 2, 'no two stretches of the run are the same');
  assert.ok(Math.min(...gaps) < TIDEPOOL.spacingMs[1], 'some arrive closer than the tightest beat');
  assert.deepEqual(run.startPayload().bins, TIDE_BINS);
});

test('litter scores in its bin, a creature binned costs more than a wrong bin, and a creature left alone is spared not missed', () => {
  const run = new TidepoolRun(1, 3, 100000);
  const shown = (i) => run.startAt + run.items[i].at + 100;
  const litter = run.items.find((it) => TIDE_ITEMS[it.kind].bin >= 0);
  const creature = run.items.find((it) => TIDE_ITEMS[it.kind].bin < 0);
  const good = run.answer(litter.i, TIDE_ITEMS[litter.kind].bin, shown(litter.i));
  assert.equal(good.correct, true);
  assert.equal(good.delta, TIDEPOOL.correct + TIDEPOOL.speedBonus);
  const other = run.items.find((it) => it.i !== litter.i && TIDE_ITEMS[it.kind].bin >= 0);
  const wrongBin = (TIDE_ITEMS[other.kind].bin + 1) % TIDE_BINS.length;
  const bad = run.answer(other.i, wrongBin, shown(other.i));
  assert.equal(bad.correct, false);
  assert.equal(bad.delta, TIDEPOOL.wrong);
  const scoreBefore = run.score;
  const harmed = run.answer(creature.i, 0, shown(creature.i));
  assert.equal(harmed.correct, false);
  assert.equal(harmed.delta, TIDEPOOL.creaturePenalty);
  assert.equal(run.score, Math.max(0, scoreBefore + TIDEPOOL.creaturePenalty));
  assert.ok(TIDEPOOL.creaturePenalty < TIDEPOOL.wrong);
  // Everything else left alone: creatures are spared, litter is missed.
  const summary = run.summary();
  const creatures = run.items.filter((it) => TIDE_ITEMS[it.kind].bin < 0).length;
  assert.equal(summary.spared, creatures - 1);
  assert.equal(summary.missed, run.items.length - creatures - 2);
});
