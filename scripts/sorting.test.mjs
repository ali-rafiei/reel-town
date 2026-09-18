import test from 'node:test';
import assert from 'node:assert/strict';
import { SORTING, BINS, BELT_CURVE, SortingRun, generateRun, runReward, comboMultiplier, canStartFrom, ramp } from '../server/dist/server/src/minigames/sorting.js';
import { fishCatalog } from '../server/dist/packages/shared/game.js';

test('a run is deterministic for a seed, fits the duration and includes every crate', () => {
  const a = generateRun(42),
    b = generateRun(42);
  assert.deepEqual(a, b);
  assert.equal(a.length, SORTING.items);
  const last = a[a.length - 1];
  assert.ok(last.at + last.travel <= SORTING.durationMs, 'last fish falls off before the run ends');
  // ...and only just: the belt is still delivering when the clock stops.
  assert.ok(last.at + last.travel > SORTING.durationMs - 2000, 'no dead stretch at the end of the run');
  // The belt ramps: later fish arrive closer together and cross faster than earlier ones.
  assert.equal(a[0].travel, SORTING.travelMs[0]);
  assert.equal(last.travel, SORTING.travelMs[1]);
  for (let i = 1; i < a.length; i++) {
    assert.ok(a[i].travel <= a[i - 1].travel, `travel never grows (item ${i})`);
    assert.ok(a[i].at > a[i - 1].at, `fish keep their order (item ${i})`);
  }
  const gaps = a.slice(1).map((item, i) => item.at - a[i].at);
  const mean = (list) => list.reduce((sum, v) => sum + v, 0) / list.length;
  const fifth = Math.floor(gaps.length / 5);
  assert.ok(mean(gaps.slice(-fifth)) < mean(gaps.slice(0, fifth)) / 2, 'the end of the run is at least twice as dense as the start');
  // ...but it is not a metronome: the gaps drift off the beat, so no two stretches of the
  // run are the same and it cannot be played to a rhythm.
  const beat = a.map((item, i) => ramp(SORTING.spacingMs, i, a.length, BELT_CURVE));
  assert.ok(gaps.some((gap, i) => Math.abs(gap - beat[i]) > beat[i] * 0.15), 'the belt drifts off the beat');
  assert.ok(new Set(gaps).size > gaps.length / 2, 'and rarely twice the same');
  // The drift never runs away with the clock: the first and last fish keep the beat.
  assert.equal(a[0].at, SORTING.firstAt);
  const rarities = new Set(a.map((item) => fishCatalog[item.species].rarity));
  assert.equal(rarities.size, 4);
  assert.notDeepEqual(generateRun(43), a);
});

test('correct throws score with speed and combo bonuses, wrong throws cost points and reset the combo', () => {
  // Arrange
  const run = new SortingRun(1, 7, 100000);
  const binOf = (item) => BINS.indexOf(fishCatalog[item.species].rarity);
  // Act: five quick correct answers build a combo
  let last;
  for (let i = 0; i < 5; i++) last = run.answer(i, binOf(run.items[i]), run.startAt + run.items[i].at + 200);
  // Assert
  assert.equal(run.score, 5 * (SORTING.correct + SORTING.speedBonus));
  assert.equal(last.combo, 2, 'fifth correct answer unlocks x2');
  const sixth = run.answer(5, binOf(run.items[5]), run.startAt + run.items[5].at + 3000);
  assert.equal(sixth.delta, SORTING.correct * 2, 'slow but correct: no speed bonus, combo applies');
  const wrongBin = (binOf(run.items[6]) + 1) % 4;
  const seventh = run.answer(6, wrongBin, run.startAt + run.items[6].at + 500);
  assert.equal(seventh.correct, false);
  assert.equal(seventh.delta, SORTING.wrong);
  assert.equal(seventh.combo, 1);
  assert.equal(run.wrong, 1);
});

test('late, duplicate, early and malformed throws are handled without scoring', () => {
  const run = new SortingRun(1, 7, 100000);
  const shown = run.startAt + run.items[3].at;
  assert.equal(run.answer(3, 0, shown - 5000), null, 'fish not on the conveyor yet');
  assert.equal(run.answer(99, 0, shown), null, 'unknown item');
  assert.equal(run.answer(3, 9, shown), null, 'unknown crate');
  assert.equal(run.answer(3, 1.5, shown), null, 'non-integer crate');
  const late = run.answer(3, 0, shown + run.items[3].travel + 2000);
  assert.equal(late.late, true);
  assert.equal(run.score, 0);
  assert.equal(run.answer(3, 0, shown + 100), null, 'a late item cannot be answered again');
  assert.ok(run.answer(0, 0, run.startAt + run.items[0].at), 'first throw counts');
  assert.equal(run.answer(0, 0, run.startAt + run.items[0].at + 1), null, 'duplicate answers are ignored');
});

test('score never drops below zero and the run ends by time or when everything is sorted', () => {
  const run = new SortingRun(2, 3, 0);
  const wrong = (i) => (BINS.indexOf(fishCatalog[run.items[i].species].rarity) + 1) % 4;
  run.answer(0, wrong(0), run.items[0].at);
  assert.equal(run.score, 0);
  assert.equal(run.finished(1000), false);
  assert.equal(run.finished(SORTING.durationMs), true);
  const full = new SortingRun(3, 3, 0);
  for (const item of full.items) full.answer(item.i, 0, item.at);
  assert.equal(full.finished(1), true);
  assert.deepEqual(full.summary().missed, 0);
});

test('rewards are bounded per run and stop at the hourly cap', () => {
  const now = 5_000_000;
  assert.equal(runReward(0, [], now), 0);
  assert.equal(runReward(120, [], now), Math.floor(120 / SORTING.goldDivisor));
  assert.equal(runReward(10000, [], now), SORTING.maxRewardPerRun);
  const capped = Array.from({ length: SORTING.maxRewardedRunsPerHour }, (_, i) => now - i * 60000);
  assert.equal(runReward(300, capped, now), 0);
  assert.equal(comboMultiplier(0), 1);
  assert.equal(comboMultiplier(14), SORTING.maxCombo);
});

test('runs can only be started at the sorting crates', () => {
  assert.ok(canStartFrom(SORTING.station.x, SORTING.station.z));
  assert.ok(!canStartFrom(0, 24));
});

test('every daily pin spot is reachable on foot and the spot rotates by day', async () => {
  const { pinForDay, pinSpotsWalkable, PIN_SPOTS } = await import('../server/dist/server/src/pins.js');
  assert.ok(pinSpotsWalkable());
  const a = pinForDay(0),
    b = pinForDay(86400000);
  assert.notDeepEqual([a.x, a.z], [b.x, b.z]);
  assert.equal(pinForDay(86400000 * PIN_SPOTS.length).x, a.x);
});
