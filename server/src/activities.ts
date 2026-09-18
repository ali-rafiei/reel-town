import { DOG_REWARD, GARDEN_PLOTS, GARDEN_REWARD, SHELL, SHELL_TYPES, collectedShell, dayKey, nextPlot, shellsForDay } from '../../packages/shared/activities.js';
import { LANDMARKS } from '../../packages/shared/landmarks.js';
import { withinLandmark } from '../../packages/shared/layout.js';
import type { Stats } from '../../packages/shared/stats.js';
// What a player can still do today, sent on joining and after each activity.
export function dailyState(stats: Stats, now: number) {
  const day = dayKey(now);
  const shells = shellsForDay(now);
  const today = stats.daily[day] ?? { garden: 0, dog: 0 };
  return { day, shells: shells.spots, collected: stats.shells[day] ?? 0, garden: today.garden, dog: today.dog, plots: GARDEN_PLOTS.length };
}
function today(stats: Stats, now: number) {
  return (stats.daily[dayKey(now)] ??= { garden: 0, dog: 0 });
}
// Walking over one of today's shells picks it up; returns what was found, or null.
export function collectShell(stats: Stats, x: number, z: number, now: number) {
  const day = dayKey(now);
  const mask = stats.shells[day] ?? 0;
  for (const spot of shellsForDay(now).spots) {
    if (collectedShell(mask, spot.i) || Math.hypot(x - spot.x, z - spot.z) > SHELL.radius) continue;
    stats.shells[day] = mask | (1 << spot.i);
    const name = SHELL_TYPES[spot.type];
    stats.journal[name] = (stats.journal[name] || 0) + 1;
    return { spot, name, gold: SHELL.reward, isNew: stats.journal[name] === 1 };
  }
  return null;
}
// Waters the next dry plot; refused away from the garden or once every plot has had its drink.
export function waterGarden(stats: Stats, x: number, z: number, now: number): { plot: number; gold: number } | string {
  if (!withinLandmark(LANDMARKS.garden, x, z)) return 'The watering can is by the garden beds in the orchard.';
  const day = today(stats, now);
  const plot = nextPlot(day.garden);
  if (plot < 0) return 'The garden has had its water for today. Come back tomorrow.';
  day.garden |= 1 << plot;
  return { plot, gold: GARDEN_REWARD };
}
// A pat for the dog: hearts every time, gold the first time each day.
export function petDog(stats: Stats, x: number, z: number, now: number): { gold: number } | string {
  if (!withinLandmark(LANDMARKS.dog, x, z)) return 'The dog waits by the garden gate.';
  const day = today(stats, now);
  const gold = day.dog ? 0 : DOG_REWARD;
  day.dog = 1;
  return { gold };
}
