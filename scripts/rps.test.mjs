import test from 'node:test';
import assert from 'node:assert/strict';
import { RPS, RpsPodium, beats, maxRoundsFor, winsFor } from '../server/dist/server/src/minigames/rps.js';
import { LANDMARKS } from '../server/dist/packages/shared/landmarks.js';

const here = LANDMARKS.rps;
const nobody = () => undefined;
// Runs the clock to the end of whatever the podium is waiting on.
const runOut = (stand, now) => {
  stand.tick(stand.deadline + 1, nobody);
  return stand.deadline + 1;
};

test('rock beats scissors, a pair ties, and a seat that played nothing loses the round', () => {
  assert.equal(beats('rock', 'scissors'), 1);
  assert.equal(beats('scissors', 'paper'), 1);
  assert.equal(beats('paper', 'rock'), 1);
  assert.equal(beats('scissors', 'rock'), 2);
  assert.equal(beats('paper', 'scissors'), 2);
  assert.equal(beats('rock', 'paper'), 2);
  for (const move of ['rock', 'paper', 'scissors']) assert.equal(beats(move, move), 0, 'a tie');
  assert.equal(beats('rock', null), 1, 'nothing played loses');
  assert.equal(beats(null, 'rock'), 2);
  assert.equal(beats(null, null), 0, 'neither played is a tie');
});

test('the podium takes two players and locks in whatever is lit when the clock runs out', () => {
  const stand = new RpsPodium();
  let now = 100000;
  assert.match(stand.handle(1, 'Ann', 0, 0, 'sit', undefined, now), /Walk over/, 'must be at the podium');
  assert.equal(stand.handle(1, 'Ann', here.x, here.z, 'sit', undefined, now), null);
  assert.equal(stand.phase, 'waiting');
  assert.equal(stand.handle(2, 'Bo', here.x, here.z, 'sit', undefined, now), null);
  assert.equal(stand.phase, 'picking');
  assert.equal(stand.round, 1);
  assert.equal(stand.deadline, now + RPS.pickMs);
  // Ann changes her mind twice; the last pick before the clock stops is the one played.
  assert.equal(stand.handle(1, 'Ann', here.x, here.z, 'pick', 'rock', now), null);
  assert.equal(stand.handle(1, 'Ann', here.x, here.z, 'pick', 'paper', now), null);
  assert.equal(stand.handle(2, 'Bo', here.x, here.z, 'pick', 'rock', now), null);
  // An opponent's pick never leaves the server before the reveal, but that one was made.
  assert.equal(stand.view(1).pick, 'paper');
  assert.deepEqual(stand.view(1).picked, [true, true]);
  assert.equal(stand.view(1).last, null, 'nothing is shown mid-round');
  // The round does not resolve early, however fast both players pick.
  stand.tick(now + RPS.pickMs - 1, nobody);
  assert.equal(stand.phase, 'picking');
  now = runOut(stand, now);
  assert.equal(stand.phase, 'reveal');
  assert.deepEqual(stand.view(1).last, { picks: ['paper', 'rock'], winner: 1 });
  assert.deepEqual(stand.wins, [1, 0]);
});

test('best of three: two rounds take the match, a tied round replays, and a pick after the clock is refused', () => {
  const stand = new RpsPodium();
  let now = 200000;
  stand.handle(1, 'Ann', here.x, here.z, 'sit', undefined, now);
  stand.handle(2, 'Bo', here.x, here.z, 'sit', undefined, now);
  // Round 1: a tie. It replays and counts toward nobody's total.
  stand.handle(1, 'Ann', here.x, here.z, 'pick', 'rock', now);
  stand.handle(2, 'Bo', here.x, here.z, 'pick', 'rock', now);
  now = runOut(stand, now);
  assert.equal(stand.view(1).last.winner, 0);
  assert.deepEqual(stand.wins, [0, 0]);
  assert.match(String(stand.handle(1, 'Ann', here.x, here.z, 'pick', 'paper', now) ?? ''), /^$/, 'a pick during the reveal is ignored');
  now = runOut(stand, now);
  assert.equal(stand.phase, 'picking');
  assert.equal(stand.round, 2, 'a tie still costs a round');
  assert.deepEqual(stand.picks, [null, null], 'the next round starts clean');
  // Rounds 2 and 3 both go to Ann, which is the match.
  for (let i = 0; i < 2; i++) {
    stand.handle(1, 'Ann', here.x, here.z, 'pick', 'scissors', now);
    stand.handle(2, 'Bo', here.x, here.z, 'pick', 'paper', now);
    now = runOut(stand, now);
    assert.equal(stand.phase, 'reveal');
    now = runOut(stand, now);
  }
  assert.equal(stand.phase, 'over');
  assert.equal(stand.winner, 1);
  assert.deepEqual(stand.wins, [2, 0]);
  const results = stand.takeResults();
  assert.deepEqual(
    results.map((r) => [r.n, r.outcome, r.forfeit, r.vsAi]),
    [
      [1, 'win', false, false],
      [2, 'loss', false, false],
    ],
  );
});

test('a player who never picks loses the round, and a podium of two idlers ends as a dead heat', () => {
  const stand = new RpsPodium();
  let now = 300000;
  stand.handle(1, 'Ann', here.x, here.z, 'sit', undefined, now);
  stand.handle(2, 'Bo', here.x, here.z, 'sit', undefined, now);
  stand.handle(1, 'Ann', here.x, here.z, 'pick', 'rock', now);
  now = runOut(stand, now);
  assert.deepEqual(stand.view(1).last, { picks: ['rock', null], winner: 1 }, 'Bo played nothing');
  // Neither of them touches it again: the round cap ends the match rather than running forever.
  for (let i = 0; i < maxRoundsFor(RPS.defaultLength) * 2 + 4 && stand.phase !== 'over'; i++) now = runOut(stand, now);
  assert.equal(stand.phase, 'over');
  assert.equal(stand.round, maxRoundsFor(RPS.defaultLength));
  assert.equal(stand.winner, 1, 'the one round Ann took decides it');
});

test('a wager is matched to play, collected once the match starts, and paid to the winner', () => {
  const stand = new RpsPodium();
  let now = 400000;
  stand.handle(1, 'Ann', here.x, here.z, 'sit', undefined, now, 500);
  assert.equal(stand.handle(1, 'Ann', here.x, here.z, 'stake', undefined, now, 500, 50), null);
  assert.equal(stand.stake, 50);
  assert.match(stand.handle(1, 'Ann', here.x, here.z, 'stake', undefined, now, 10, 50), /only have 10 gold/);
  assert.match(stand.handle(2, 'Bo', here.x, here.z, 'sit', undefined, now, 500), /Match it/, 'the amount comes back with the request');
  assert.match(stand.handle(2, 'Bo', here.x, here.z, 'sit', undefined, now, 20, 50), /30 more gold/);
  assert.deepEqual(stand.takeCharges(), [], 'nothing is taken from a podium that never filled');
  assert.equal(stand.handle(2, 'Bo', here.x, here.z, 'sit', undefined, now, 500, 50), null);
  assert.deepEqual(stand.takeCharges(), [
    { n: 1, amount: 50 },
    { n: 2, amount: 50 },
  ]);
  assert.equal(stand.pot, 100);
  // Bo walks out mid-match: Ann wins by default and the pot is hers.
  assert.equal(stand.handle(2, 'Bo', here.x, here.z, 'leave', undefined, now), null);
  assert.equal(stand.phase, 'over');
  assert.equal(stand.forfeit, true);
  const results = stand.takeResults();
  assert.deepEqual(
    results.map((r) => [r.n, r.outcome, r.wager]),
    [
      [1, 'win', 50],
      [2, 'loss', 50],
    ],
  );
});

test('the Dockkeeper plays for nothing, picks within the round, and frees the podium when nobody rematches', () => {
  const stand = new RpsPodium();
  let now = 500000;
  stand.handle(1, 'Ann', here.x, here.z, 'sit', undefined, now, 500);
  stand.handle(1, 'Ann', here.x, here.z, 'stake', undefined, now, 500, 100);
  assert.equal(stand.handle(1, 'Ann', here.x, here.z, 'solo', undefined, now), null);
  assert.equal(stand.ai, true);
  assert.equal(stand.stake, 0, 'the Dockkeeper never plays for gold');
  assert.deepEqual(stand.takeCharges(), []);
  stand.tick(now + RPS.aiPickMs, nobody);
  assert.ok(stand.picks[1], 'the Dockkeeper has something lit before the clock stops');
  assert.equal(stand.view(1).picked[1], true);
  // Play it out, then let the rematch offer lapse.
  for (let i = 0; i < maxRoundsFor(RPS.defaultLength) * 2 + 4 && stand.phase !== 'over'; i++) {
    stand.handle(1, 'Ann', here.x, here.z, 'pick', 'rock', stand.deadline - 1);
    now = runOut(stand, now);
  }
  assert.equal(stand.phase, 'over');
  stand.takeResults();
  now = runOut(stand, now);
  assert.equal(stand.phase, 'empty', 'the podium frees up for the next pair');
  assert.deepEqual(stand.seats, [null, null]);
});

test('a match is best of three, five or seven, and stops the moment one side holds the majority', () => {
  assert.deepEqual([...RPS.lengths], [3, 5, 7]);
  assert.deepEqual(RPS.lengths.map(winsFor), [2, 3, 4]);
  const stand = new RpsPodium();
  let now = 600000;
  stand.handle(1, 'Ann', here.x, here.z, 'sit', undefined, now);
  assert.match(stand.handle(2, 'Bo', here.x, here.z, 'length', undefined, now, 0, undefined, 5), /stepped up first/, 'only the first player sets it');
  assert.equal(stand.handle(1, 'Ann', here.x, here.z, 'length', undefined, now, 0, undefined, 5), null);
  assert.equal(stand.bestOf, 5);
  assert.equal(stand.handle(1, 'Ann', here.x, here.z, 'length', undefined, now, 0, undefined, 4), null, 'a length off the list is ignored');
  assert.equal(stand.bestOf, 5);
  stand.handle(2, 'Bo', here.x, here.z, 'sit', undefined, now);
  assert.match(String(stand.handle(1, 'Ann', here.x, here.z, 'length', undefined, now, 0, undefined, 7) ?? ''), /before the other player/, 'the length is fixed once the match is on');
  // Ann takes the first three rounds of five: that is the majority, so round four is
  // never played.
  for (let i = 0; i < 3; i++) {
    stand.handle(1, 'Ann', here.x, here.z, 'pick', 'rock', now);
    stand.handle(2, 'Bo', here.x, here.z, 'pick', 'scissors', now);
    now = runOut(stand, now);
    now = runOut(stand, now);
  }
  assert.equal(stand.phase, 'over');
  assert.equal(stand.winner, 1);
  assert.deepEqual(stand.wins, [3, 0]);
  assert.equal(stand.round, 3, 'it stopped at the majority rather than playing all five');
});
