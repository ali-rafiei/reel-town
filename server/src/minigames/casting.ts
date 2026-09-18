import { rewardsInLastHour } from '../../../packages/shared/stats.js';
import { CONTEST_SIGN, PIER, withinLandmark } from '../../../packages/shared/layout.js';
// Casting contest: a Club Penguin style pickup game at the end of the pier.
// Players join at the contest sign, a target ring floats out in the water, and
// everyone gets three casts to land as close to the bullseye as possible.
export const CONTEST = {
  sign: CONTEST_SIGN,
  lobbyMs: 15000,
  roundMs: 30000,
  resultsMs: 8000,
  castsPerPlayer: 3,
  minCastGapMs: 1000,
  // The target floats out in front of the contestants, near enough that every one of
  // them can reach it with the client's aim range and maximum cast distance.
  targetZone: { minZ: PIER.end + 3, maxZ: PIER.end + 8, spreadX: 3 },
  winnerBonus: 15,
  maxRewardPerRound: 30,
  maxRewardedRoundsPerHour: 8,
  minPlayersToReward: 1,
};
export type ContestPhase = 'idle' | 'lobby' | 'active' | 'results';
export type Participant = { n: number; casts: number; best: number; lastCastAt: number; scores: number[] };
export type ContestResult = { n: number; best: number; rank: number; gold: number };
export function castScore(distance: number) {
  return Math.max(0, Math.round(100 - distance * 18));
}
export function roundReward(best: number, rank: number, rewardedAt: number[], now: number) {
  if (best <= 0) return 0;
  if (rewardsInLastHour(rewardedAt, now) >= CONTEST.maxRewardedRoundsPerHour) return 0;
  return Math.min(CONTEST.maxRewardPerRound, Math.floor(best / 5) + (rank === 1 ? CONTEST.winnerBonus : 0));
}
export function canJoinFrom(x: number, z: number) {
  return withinLandmark(CONTEST.sign, x, z);
}
export class CastingContest {
  phase: ContestPhase = 'idle';
  endsAt = 0;
  target = { x: 0, z: 32 };
  // Where the contestants are standing along the pier head, set while the lobby fills.
  anchorX = 0;
  readonly participants = new Map<number, Participant>();
  constructor(private readonly random: () => number = Math.random) {}
  join(n: number, x: number, z: number, now: number): string | null {
    if (this.phase === 'active' || this.phase === 'results') return 'A round is already under way. Join the next one!';
    if (!canJoinFrom(x, z)) return 'Walk to the contest sign at the end of the pier to join.';
    if (this.participants.has(n)) return null;
    this.participants.set(n, { n, casts: 0, best: 0, lastCastAt: 0, scores: [] });
    if (this.phase === 'idle') {
      this.phase = 'lobby';
      this.endsAt = now + CONTEST.lobbyMs;
    }
    return null;
  }
  leave(n: number) {
    this.participants.delete(n);
    if (this.phase === 'lobby' && this.participants.size === 0) {
      this.phase = 'idle';
      this.endsAt = 0;
    }
  }
  isPlaying(n: number) {
    return this.phase === 'active' && this.participants.has(n);
  }
  // Returns why a contest cast is refused, or null when it may be scored.
  castAllowed(n: number, now: number): string | null {
    const p = this.participants.get(n);
    if (this.phase !== 'active' || !p) return 'The contest is not running.';
    if (p.casts >= CONTEST.castsPerPlayer) return 'You have used all three casts. Wait for the results!';
    if (now - p.lastCastAt < CONTEST.minCastGapMs) return 'Easy there! Let the last cast land.';
    return null;
  }
  scoreCast(n: number, landingX: number, landingZ: number, now: number) {
    const p = this.participants.get(n);
    if (!p || this.castAllowed(n, now)) return null;
    const distance = Math.hypot(landingX - this.target.x, landingZ - this.target.z);
    const score = castScore(distance);
    p.casts++;
    p.lastCastAt = now;
    p.scores.push(score);
    p.best = Math.max(p.best, score);
    return { score, distance, castsLeft: CONTEST.castsPerPlayer - p.casts };
  }
  // Advances the round; returns results when a round finishes, otherwise null.
  update(now: number, rewardedAtFor: (n: number) => number[]): ContestResult[] | null {
    if (this.phase === 'idle' || now < this.endsAt) {
      if (this.phase === 'active' && [...this.participants.values()].every((p) => p.casts >= CONTEST.castsPerPlayer)) this.endsAt = now;
      else return null;
    }
    if (this.phase === 'lobby') {
      this.phase = 'active';
      this.endsAt = now + CONTEST.roundMs;
      const limit = PIER.crossHalfWidth - 1;
      this.target = {
        x: Math.max(-limit, Math.min(limit, this.anchorX + (this.random() * 2 - 1) * CONTEST.targetZone.spreadX)),
        z: CONTEST.targetZone.minZ + this.random() * (CONTEST.targetZone.maxZ - CONTEST.targetZone.minZ),
      };
      return null;
    }
    if (this.phase === 'active') {
      this.phase = 'results';
      this.endsAt = now + CONTEST.resultsMs;
      const ranked = [...this.participants.values()].sort((a, b) => b.best - a.best);
      return ranked.map((p, i) => ({
        n: p.n,
        best: p.best,
        rank: i === 0 || p.best < ranked[i - 1].best ? i + 1 : i + 1,
        gold: roundReward(p.best, i === 0 || p.best === ranked[0].best ? 1 : i + 1, rewardedAtFor(p.n), now),
      }));
    }
    this.phase = 'idle';
    this.endsAt = 0;
    this.anchorX = 0;
    this.participants.clear();
    return null;
  }
  state(): { phase: 'lobby' | 'active' | 'results'; endsAt: number; target: [number, number]; players: Array<[number, number, number]> } | null {
    if (this.phase === 'idle') return null;
    return {
      phase: this.phase,
      endsAt: this.endsAt,
      target: [+this.target.x.toFixed(2), +this.target.z.toFixed(2)],
      players: [...this.participants.values()].map((p) => [p.n, p.best, p.casts]),
    };
  }
}
