import { GAME_IDS, emptyGameStats, type GameId, type GameStats } from './games.js';
// Persistent per-player progression: catches, perfects, streaks, discoveries and minigame records.
export type Stats = {
  catches: number;
  perfects: number;
  streak: number;
  bestStreak: number;
  species: Record<string, number>;
  biggest: Record<string, number>;
  casting: { best: number; plays: number; wins: number; rewardedAt: number[] };
  // Kept for clients published before the games table existed; mirrored from games.sorting.
  sorting: { best: number; plays: number; rewardedAt: number[] };
  games: Record<GameId, GameStats>;
  pins: Record<string, number>;
  owned: Record<string, number>;
  // Lucky bait on the hook: 0 or 1, used up by the next cast.
  bait: number;
  // Daily activities: shells found (a bitmask of the day's spots), garden plots watered and
  // whether the dog has been petted, by day; the shell journal by kind; challenge progress.
  shells: Record<string, number>;
  journal: Record<string, number>;
  daily: Record<string, { garden: number; dog: number }>;
  challenges: Record<string, { progress: Record<string, number>; done: Record<string, number> }>;
};
const count = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
const counts = (v: unknown, max = 400) => {
  const out: Record<string, number> = {};
  if (v && typeof v === 'object')
    for (const [key, value] of Object.entries(v as Record<string, unknown>).slice(0, max)) if (typeof key === 'string' && key.length <= 40) out[key] = count(value);
  return out;
};
const stamps = (v: unknown) => (Array.isArray(v) ? v.filter((t) => typeof t === 'number' && Number.isFinite(t)).slice(-64) : []);
// Day-keyed records keep only the most recent few days.
const lastDays = <T>(v: unknown, keep: number, each: (x: unknown) => T): Record<string, T> => {
  const out: Record<string, T> = {};
  if (!v || typeof v !== 'object') return out;
  const keys = Object.keys(v as Record<string, unknown>)
    .filter((k) => /^\d{1,7}$/.test(k))
    .sort((a, b) => Number(a) - Number(b))
    .slice(-keep);
  for (const key of keys) out[key] = each((v as Record<string, unknown>)[key]);
  return out;
};
// A game's record, seeded from the legacy sorting block the first time a player loads.
const gameStats = (v: any, legacy?: any): GameStats => ({
  best: count(v?.best ?? legacy?.best),
  plays: count(v?.plays ?? legacy?.plays),
  wins: count(v?.wins),
  bestTimeMs: count(v?.bestTimeMs),
  rewardedAt: stamps(v?.rewardedAt ?? legacy?.rewardedAt),
});
export function sanitizeStats(input: unknown): Stats {
  const s = (input && typeof input === 'object' ? input : {}) as Record<string, any>;
  return {
    catches: count(s.catches),
    perfects: count(s.perfects),
    streak: count(s.streak),
    bestStreak: count(s.bestStreak),
    species: counts(s.species),
    biggest: counts(s.biggest),
    casting: { best: count(s.casting?.best), plays: count(s.casting?.plays), wins: count(s.casting?.wins), rewardedAt: stamps(s.casting?.rewardedAt) },
    sorting: { best: count(s.sorting?.best), plays: count(s.sorting?.plays), rewardedAt: stamps(s.sorting?.rewardedAt) },
    games: Object.fromEntries(GAME_IDS.map((id) => [id, id === 'sorting' ? gameStats(s.games?.[id], s.sorting) : gameStats(s.games?.[id])])) as Record<GameId, GameStats>,
    pins: counts(s.pins, 64),
    owned: counts(s.owned, 64),
    bait: count(s.bait) > 0 ? 1 : 0,
    shells: lastDays(s.shells, 3, count),
    journal: counts(s.journal, 16),
    daily: lastDays(s.daily, 3, (d) => ({ garden: count((d as Record<string, unknown> | null)?.garden), dog: count((d as Record<string, unknown> | null)?.dog) > 0 ? 1 : 0 })),
    challenges: lastDays(s.challenges, 2, (d) => ({ progress: counts((d as Record<string, unknown> | null)?.progress, 8), done: counts((d as Record<string, unknown> | null)?.done, 8) })),
  };
}
export function recordCatch(stats: Stats, name: string, size: number, perfect: boolean) {
  stats.catches++;
  stats.species[name] = (stats.species[name] || 0) + 1;
  const isNew = stats.species[name] === 1;
  const record = size > (stats.biggest[name] || 0);
  if (record) stats.biggest[name] = size;
  if (perfect) {
    stats.perfects++;
    stats.streak++;
    stats.bestStreak = Math.max(stats.bestStreak, stats.streak);
  } else stats.streak = 0;
  return { isNew, record };
}
// The record a game run updates; the legacy sorting block follows it so old clients keep their numbers.
export function gameRecord(stats: Stats, game: GameId) {
  const record = (stats.games[game] ??= emptyGameStats());
  return record;
}
export function mirrorLegacySorting(stats: Stats) {
  stats.sorting = { best: stats.games.sorting.best, plays: stats.games.sorting.plays, rewardedAt: stats.games.sorting.rewardedAt };
}
// Rewards are capped per rolling hour so no activity can be farmed indefinitely.
export function rewardsInLastHour(rewardedAt: number[], now: number) {
  return rewardedAt.filter((t) => now - t < 3600000).length;
}
