import { rewardsInLastHour } from './stats.js';
// Every pickup game on the island shares one identity table, one stats shape and one
// reward curve, so a new game is a module and a row here rather than a new economy.
export const GAME_IDS = ['sorting', 'tidepool', 'orchard', 'signals', 'buoy', 'four', 'rps'] as const;
export type GameId = (typeof GAME_IDS)[number];
export const isGameId = (v: unknown): v is GameId => typeof v === 'string' && (GAME_IDS as readonly string[]).includes(v);
export type GameStats = { best: number; plays: number; wins: number; bestTimeMs: number; rewardedAt: number[] };
export const emptyGameStats = (): GameStats => ({ best: 0, plays: 0, wins: 0, bestTimeMs: 0, rewardedAt: [] });
// Gold per run is score over the divisor, capped per run and to a few rewarded runs an
// hour, so no single game makes the others pointless. `brag` is the score the Dockkeeper
// announces to the harbour.
export const GAME_REWARDS: Record<GameId, { divisor: number; maxPerRun: number; maxRunsPerHour: number; brag: number }> = {
  sorting: { divisor: 20, maxPerRun: 25, maxRunsPerHour: 8, brag: 500 },
  tidepool: { divisor: 14, maxPerRun: 25, maxRunsPerHour: 8, brag: 300 },
  orchard: { divisor: 14, maxPerRun: 30, maxRunsPerHour: 8, brag: 350 },
  signals: { divisor: 1, maxPerRun: 20, maxRunsPerHour: 6, brag: 16 },
  buoy: { divisor: 4, maxPerRun: 25, maxRunsPerHour: 6, brag: 60 },
  four: { divisor: 1, maxPerRun: 8, maxRunsPerHour: 6, brag: 0 },
  rps: { divisor: 1, maxPerRun: 8, maxRunsPerHour: 6, brag: 0 },
};
export function gameReward(game: GameId, score: number, rewardedAt: number[], now: number) {
  const rule = GAME_REWARDS[game];
  if (score <= 0) return 0;
  if (rewardsInLastHour(rewardedAt, now) >= rule.maxRunsPerHour) return 0;
  return Math.min(rule.maxPerRun, Math.floor(score / rule.divisor));
}
// Wire shapes. Client to server is one envelope per game; server to client is start,
// update and end events carrying whatever the game needs.
export type GameClientMessage =
  | { type: 'game'; game: GameId; action: 'start' }
  | { type: 'game'; game: GameId; action: 'quit'; runId?: number }
  | ({ type: 'game'; game: GameId; action: 'input'; runId: number } & Record<string, unknown>);
export type GameStart = { type: 'game'; game: GameId; event: 'start'; runId: number; startAt: number; durationMs: number } & Record<string, unknown>;
export type GameUpdate = { type: 'game'; game: GameId; event: 'update'; runId: number } & Record<string, unknown>;
export type GameEnd = { type: 'game'; game: GameId; event: 'end'; runId: number; score: number; gold: number; best: number; quit: boolean } & Record<string, unknown>;
export type GameServerMessage = GameStart | GameUpdate | GameEnd;
