import { FEATS } from '../../packages/shared/cosmetics.js';
import type { GameId } from '../../packages/shared/games.js';
import type { Stats } from '../../packages/shared/stats.js';
// Cosmetics that are earned rather than bought: the run that unlocks each one.
const RULES: Array<{ key: string; game: GameId; earned: (summary: Record<string, unknown>) => boolean }> = [
  { key: 'hat:straw', game: 'orchard', earned: (s) => Number(s.score) >= 300 },
  { key: 'accessory:bandana', game: 'buoy', earned: (s) => Number(s.timeMs) > 0 && Number(s.timeMs) < 90000 },
  { key: 'accessory:headphones', game: 'signals', earned: (s) => Number(s.rounds) >= 10 },
];
// Grants whatever a finished run has just earned; returns the keys and their feat texts.
export function checkFeats(stats: Stats, game: GameId, summary: Record<string, unknown>) {
  const earned: Array<{ key: string; feat: string }> = [];
  for (const rule of RULES) {
    if (rule.game !== game || stats.owned[rule.key] || !rule.earned(summary)) continue;
    stats.owned[rule.key] = 1;
    earned.push({ key: rule.key, feat: FEATS[rule.key] });
  }
  return earned;
}
