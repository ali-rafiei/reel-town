import test from 'node:test';
import assert from 'node:assert/strict';
import { SIGNALS, SignalsRun, sequenceFor } from '../server/dist/server/src/minigames/signals.js';

test('sequences are deterministic, grow by one light a round, and differ between attempts', () => {
  assert.deepEqual(sequenceFor(5, 1, 0), sequenceFor(5, 1, 0));
  assert.equal(sequenceFor(5, 1, 0).length, SIGNALS.startLength);
  assert.equal(sequenceFor(5, 4, 0).length, SIGNALS.startLength + 3);
  assert.notDeepEqual(sequenceFor(5, 3, 0), sequenceFor(5, 3, 1));
  for (const v of sequenceFor(5, 6, 0)) assert.ok(v >= 0 && v < SIGNALS.colours);
});

test('a right reply advances and scores, a wrong one costs a life and a new sequence, three mistakes end it', () => {
  const run = new SignalsRun(1, 5, 1000);
  const start = run.startPayload();
  assert.equal(start.round, 1);
  assert.equal(start.lives, SIGNALS.lives);
  const ok = run.input({ round: 1, sequence: [...run.sequence] }, run.replyBy - 100);
  assert.equal(ok.ok, true);
  assert.equal(run.rounds, 1);
  assert.equal(run.score, SIGNALS.pointsPerRound);
  assert.equal(run.round, 2);
  assert.equal(run.sequence.length, SIGNALS.startLength + 1);
  assert.equal(run.input({ round: 2, sequence: [...run.sequence] }, run.replyBy - 100).ok, true);
  const before = [...run.sequence];
  const wrong = run.input({ round: 3, sequence: before.map((v) => (v + 1) % SIGNALS.colours) }, run.replyBy - 100);
  assert.equal(wrong.ok, false);
  assert.equal(run.lives, SIGNALS.lives - 1);
  assert.equal(run.round, 3, 'the round is retried');
  assert.notDeepEqual(run.sequence, before, 'with a different sequence');
  // Malformed and stale replies mean nothing.
  assert.equal(run.input({ round: 2, sequence: [...run.sequence] }, run.replyBy - 100), null);
  assert.equal(run.input({ round: 3, sequence: 'red' }, run.replyBy - 100), null);
  assert.equal(run.input({ round: 3, sequence: [9] }, run.replyBy - 100), null);
  // Two more mistakes, one of them by running out of time.
  assert.equal(run.tick(run.replyBy + SIGNALS.graceMs + 1).timeout, true);
  assert.equal(run.lives, SIGNALS.lives - 2);
  assert.equal(run.finished(run.replyBy), false);
  run.input({ round: 3, sequence: [] }, run.replyBy - 100);
  assert.equal(run.lives, 0);
  assert.equal(run.finished(run.replyBy), true);
  assert.deepEqual(run.summary(), { score: 2 * SIGNALS.pointsPerRound, rounds: 2, lives: 0 });
  assert.equal(run.input({ round: 3, sequence: [] }, run.replyBy), null, 'nothing more counts');
});

test('twenty rounds is a clean finish', () => {
  const run = new SignalsRun(2, 8, 0);
  let last;
  for (let i = 0; i < SIGNALS.maxRounds; i++) last = run.input({ round: run.round, sequence: [...run.sequence] }, run.replyBy - 50);
  assert.equal(last.finished, true);
  assert.equal(run.finished(0), true);
  assert.equal(run.summary().rounds, SIGNALS.maxRounds);
  assert.equal(run.lives, SIGNALS.lives);
});
