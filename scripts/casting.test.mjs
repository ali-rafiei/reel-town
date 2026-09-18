import test from 'node:test';
import assert from 'node:assert/strict';
import { CastingContest, CONTEST, castScore, roundReward, canJoinFrom } from '../server/dist/server/src/minigames/casting.js';

test('closer casts score higher, a bullseye scores 100 and far misses score zero', () => {
  assert.equal(castScore(0), 100);
  assert.ok(castScore(0.5) > castScore(1.5) && castScore(1.5) > castScore(4));
  assert.equal(castScore(20), 0);
});

test('rewards are bounded per round and stop after the hourly cap', () => {
  const now = 10_000_000;
  assert.equal(roundReward(100, 1, [], now), Math.min(CONTEST.maxRewardPerRound, 20 + CONTEST.winnerBonus));
  assert.equal(roundReward(100, 2, [], now), 20);
  assert.equal(roundReward(0, 1, [], now), 0);
  const capped = Array.from({ length: CONTEST.maxRewardedRoundsPerHour }, (_, i) => now - i * 1000);
  assert.equal(roundReward(100, 1, capped, now), 0, 'no gold once the hourly cap is reached');
  assert.equal(roundReward(100, 1, capped.map((t) => t - 3600001), now), CONTEST.maxRewardPerRound, 'old rewards expire');
});

test('players can only join from the sign, between rounds, and joining opens a lobby', () => {
  const contest = new CastingContest(() => 0.5);
  assert.ok(canJoinFrom(CONTEST.sign.x, CONTEST.sign.z));
  assert.ok(!canJoinFrom(0, 8));
  assert.match(contest.join(1, 0, CONTEST.sign.z, 0), /sign/); // middle of the pier is no longer close enough
  assert.equal(contest.phase, 'idle');
  assert.equal(contest.join(1, CONTEST.sign.x, CONTEST.sign.z, 0), null);
  assert.equal(contest.phase, 'lobby');
  assert.equal(contest.endsAt, CONTEST.lobbyMs);
  contest.update(CONTEST.lobbyMs, () => []);
  assert.equal(contest.phase, 'active');
  assert.match(contest.join(2, CONTEST.sign.x, CONTEST.sign.z, CONTEST.lobbyMs + 1), /already under way/);
});

test('a round scores three rate-limited casts per player, ranks, rewards and resets', () => {
  // Arrange: two players, deterministic target at the centre of the zone
  const contest = new CastingContest(() => 0.5);
  contest.join(1, CONTEST.sign.x, CONTEST.sign.z, 0);
  contest.join(2, CONTEST.sign.x + 0.5, CONTEST.sign.z - 0.4, 0);
  contest.update(CONTEST.lobbyMs, () => []);
  const t0 = CONTEST.lobbyMs;
  const { x, z } = contest.target;
  // Act
  assert.equal(contest.castAllowed(1, t0), null);
  const bullseye = contest.scoreCast(1, x, z, t0);
  assert.equal(bullseye.score, 100);
  assert.match(contest.castAllowed(1, t0 + 100), /Easy/);
  assert.equal(contest.scoreCast(1, x, z, t0 + 100), null, 'rapid second cast is refused');
  contest.scoreCast(1, x + 2, z, t0 + 1100);
  contest.scoreCast(1, x + 2, z, t0 + 2200);
  assert.match(contest.castAllowed(1, t0 + 3300), /all three/);
  contest.scoreCast(2, x + 1, z + 1, t0 + 500);
  assert.equal(contest.update(t0 + 4000, () => []), null, 'round continues while player 2 has casts left');
  const results = contest.update(t0 + CONTEST.roundMs, () => []);
  // Assert
  assert.equal(contest.phase, 'results');
  assert.equal(results[0].n, 1);
  assert.equal(results[0].rank, 1);
  assert.equal(results[0].gold, roundReward(100, 1, [], t0 + CONTEST.roundMs));
  assert.equal(results[1].n, 2);
  assert.ok(results[1].gold > 0 && results[1].gold < results[0].gold);
  contest.update(t0 + CONTEST.roundMs + CONTEST.resultsMs, () => []);
  assert.equal(contest.phase, 'idle');
  assert.equal(contest.participants.size, 0);
  assert.equal(contest.state(), null);
});

test('a round ends early once every participant has used all casts', () => {
  const contest = new CastingContest(() => 0.2);
  contest.join(7, CONTEST.sign.x, CONTEST.sign.z, 0);
  contest.update(CONTEST.lobbyMs, () => []);
  const t = CONTEST.lobbyMs;
  for (let i = 0; i < CONTEST.castsPerPlayer; i++) contest.scoreCast(7, 0, 0, t + i * 1100);
  const results = contest.update(t + 4000, () => []);
  assert.ok(results && results.length === 1);
  assert.equal(results[0].best, castScore(Math.hypot(contest.target.x, contest.target.z)));
});

test('the target lands in front of the contestants and every one of them can reach it', async () => {
  const { castLanding } = await import('../server/dist/packages/shared/game.js');
  const { PIER } = await import('../server/dist/packages/shared/layout.js');
  // Wherever a group gathers along the pier head, the round aims at them.
  for (const anchor of [-PIER.crossHalfWidth + 0.6, -4, 0, 4, PIER.crossHalfWidth - 0.6])
    for (const roll of [0, 0.5, 1]) {
      const contest = new CastingContest(() => roll);
      contest.join(1, CONTEST.sign.x, CONTEST.sign.z, 0);
      contest.anchorX = anchor;
      contest.update(CONTEST.lobbyMs, () => []);
      const { x: tx, z: tz } = contest.target;
      assert.ok(tz > PIER.end + 2, 'the target floats in open water past the pier head');
      assert.ok(Math.abs(tx) <= PIER.crossHalfWidth - 1 + 1e-9, 'and stays within the harbor mouth');
      let best = Infinity;
      for (let power = 0; power <= 1.0001; power += 0.02)
        for (let aim = -1; aim <= 1.0001; aim += 0.04) {
          const p = castLanding(anchor, PIER.end - 1, power, aim, true);
          best = Math.min(best, Math.hypot(p.x - tx, p.z - tz));
        }
      // A bullseye scores 100 and each unit of distance costs 18 points.
      assert.ok(best < 0.6, `from x ${anchor.toFixed(1)} to (${tx.toFixed(1)}, ${tz.toFixed(1)}): best ${best.toFixed(2)}`);
    }
});

test('leaving during the lobby cancels an empty contest and the state payload is compact', () => {
  const contest = new CastingContest(() => 0.5);
  contest.join(3, CONTEST.sign.x, CONTEST.sign.z, 0);
  assert.deepEqual(contest.state().players, [[3, 0, 0]]);
  contest.leave(3);
  assert.equal(contest.phase, 'idle');
});

test('the contest sign is a tight, deliberate step off the fishing spot', async () => {
  const { CONTEST_SIGN, PIER, onPier, walkable } = await import('../server/dist/packages/shared/layout.js');
  // Arrange: the sign stands on the pier and can be walked up to.
  assert.ok(onPier(CONTEST_SIGN.x, CONTEST_SIGN.z) && walkable(CONTEST_SIGN.x, CONTEST_SIGN.z));
  // Assert: standing anywhere along the middle of the pier never triggers the prompt,
  // so the contest cannot interrupt someone who walked out to fish.
  for (let z = 13; z < PIER.end; z += 0.25) assert.equal(canJoinFrom(0, z), false, `pier centre at z ${z.toFixed(2)} must stay clear`);
  // Stepping across to the sign does trigger it, from either side of it.
  assert.ok(canJoinFrom(CONTEST_SIGN.x, CONTEST_SIGN.z));
  assert.ok(canJoinFrom(CONTEST_SIGN.x + 0.8, CONTEST_SIGN.z));
  assert.ok(canJoinFrom(CONTEST_SIGN.x, CONTEST_SIGN.z - 1));
  // The trigger stays small: well under a quarter of the pier's length.
  assert.ok(CONTEST_SIGN.radius <= 1.5, `radius ${CONTEST_SIGN.radius}`);
});

test('the contest prompt stays clear of the whole fishing deck', async () => {
  const { PIER } = await import('../server/dist/packages/shared/layout.js');
  // Nobody standing out on either arm of the crossbar gets the prompt.
  for (let x = -PIER.crossHalfWidth; x <= PIER.crossHalfWidth; x += 0.5)
    for (const z of [PIER.crossStart + 0.4, PIER.end - 1.2, PIER.end - 0.3]) {
      const atSign = Math.hypot(x - CONTEST.sign.x, z - CONTEST.sign.z) <= CONTEST.sign.radius;
      assert.equal(canJoinFrom(x, z), atSign, `(${x.toFixed(1)}, ${z.toFixed(1)})`);
    }
});
