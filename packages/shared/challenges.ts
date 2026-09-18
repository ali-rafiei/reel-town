import { dayKey } from './activities.js';
import type { GameId } from './games.js';
import type { Rarity } from './game.js';
import { mulberry32 } from './rng.js';
import type { Stats } from './stats.js';
// Three rotating challenges a day, pinned to the notice board. Progress lives in the
// player's stats under the day, and each pays once.
export const CHALLENGE_REWARD = 20;
export type Challenge = { id: string; text: string; target: number; kind: 'catch' | 'perfect' | 'rare' | 'game' | 'buoy' | 'shell' | 'four' | 'play'; game?: GameId; unit?: string };
export const CHALLENGE_POOL: Challenge[] = [
  { id: 'catch5', text: 'Catch five fish', target: 5, kind: 'catch', unit: 'fish' },
  { id: 'perfect3', text: 'Land three perfect catches', target: 3, kind: 'perfect', unit: 'perfect' },
  { id: 'rare1', text: 'Catch a rare or legendary fish', target: 1, kind: 'rare', unit: 'rare' },
  { id: 'sort300', text: 'Score 300 in Sort the Catch', target: 300, kind: 'game', game: 'sorting', unit: 'points' },
  { id: 'tide150', text: 'Score 150 in Tidepool Tidy', target: 150, kind: 'game', game: 'tidepool', unit: 'points' },
  { id: 'orchard150', text: 'Score 150 in Orchard Catch', target: 150, kind: 'game', game: 'orchard', unit: 'points' },
  { id: 'signals12', text: 'Read six rounds of Lighthouse Signals', target: 12, kind: 'game', game: 'signals', unit: 'points' },
  { id: 'catch10', text: 'Catch ten fish', target: 10, kind: 'catch', unit: 'fish' },
  { id: 'buoy90', text: 'Finish the Buoy Run in under 90 seconds', target: 1, kind: 'buoy', unit: 'run' },
  { id: 'four1', text: 'Win a game of Dockside Four', target: 1, kind: 'four', unit: 'win' },
  { id: 'shells4', text: 'Find four shells at the tide pools', target: 4, kind: 'shell', unit: 'shells' },
  { id: 'play3', text: 'Play three rounds of anything', target: 3, kind: 'play', unit: 'rounds' },
];
export function challengesForDay(now: number): Challenge[] {
  const random = mulberry32(Number(dayKey(now)) * 40503 + 7);
  const pool = [...CHALLENGE_POOL];
  const picked: Challenge[] = [];
  while (picked.length < 3 && pool.length) picked.push(pool.splice(Math.floor(random() * pool.length), 1)[0]);
  return picked;
}
export type ChallengeEvent =
  | { kind: 'catch'; rarity: Rarity; perfect: boolean }
  | { kind: 'game'; game: GameId; score: number }
  | { kind: 'buoy'; timeMs: number }
  | { kind: 'shell' }
  | { kind: 'four'; won: boolean };
export type ChallengeView = Challenge & { progress: number; done: boolean };
function bucket(stats: Stats, day: string) {
  return (stats.challenges[day] ??= { progress: {}, done: {} });
}
// Applies one event to today's challenges; returns the ones it just completed.
export function applyChallenge(stats: Stats, now: number, event: ChallengeEvent): Challenge[] {
  const day = dayKey(now);
  const today = bucket(stats, day);
  const completed: Challenge[] = [];
  for (const c of challengesForDay(now)) {
    if (today.done[c.id]) continue;
    let progress = today.progress[c.id] ?? 0;
    switch (c.kind) {
      case 'catch':
        if (event.kind === 'catch') progress++;
        break;
      case 'perfect':
        if (event.kind === 'catch' && event.perfect) progress++;
        break;
      case 'rare':
        if (event.kind === 'catch' && (event.rarity === 'Rare' || event.rarity === 'Legendary')) progress++;
        break;
      case 'game':
        if (event.kind === 'game' && event.game === c.game) progress = Math.max(progress, event.score);
        break;
      case 'play':
        if (event.kind === 'game' || (event.kind === 'four' && true)) progress++;
        break;
      case 'buoy':
        if (event.kind === 'buoy' && event.timeMs > 0 && event.timeMs < 90000) progress++;
        break;
      case 'shell':
        if (event.kind === 'shell') progress++;
        break;
      case 'four':
        if (event.kind === 'four' && event.won) progress++;
        break;
    }
    today.progress[c.id] = progress;
    if (progress >= c.target) {
      today.done[c.id] = 1;
      completed.push(c);
    }
  }
  // Only today and yesterday are kept.
  for (const key of Object.keys(stats.challenges)) if (Number(key) < Number(day) - 1) delete stats.challenges[key];
  return completed;
}
export function challengeView(stats: Stats, now: number): ChallengeView[] {
  const today = stats.challenges[dayKey(now)];
  return challengesForDay(now).map((c) => ({ ...c, progress: Math.min(c.target, today?.progress[c.id] ?? 0), done: !!today?.done[c.id] }));
}
