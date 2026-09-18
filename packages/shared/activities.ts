import { GARDEN_BEDS, type Landmark } from './layout.js';
import { mulberry32 } from './rng.js';
// Small daily things to do around the island: shells to find at the tide pools, garden
// beds to water, a dog to pet. Each pays a little gold once a day and is remembered in
// the player's stats under the day it happened.
export function dayKey(now: number) {
  return String(Math.floor(now / 86400000));
}
export const SHELL = { reward: 5, radius: 1.1, perDay: 4 };
// Spots among the tide-pool rocks; a test keeps them walkable.
export const SHELL_SPOTS = [
  { x: 22.2, z: 0.2 },
  { x: 23.0, z: 1.6 },
  { x: 24.4, z: -0.6 },
  { x: 23.8, z: 2.6 },
  { x: 21.6, z: -1.4 },
  { x: 24.9, z: 0.9 },
  { x: 22.6, z: -2.2 },
  { x: 25.3, z: 3.2 },
  { x: 21.2, z: 1.8 },
  { x: 24.2, z: -2.4 },
];
export const SHELL_TYPES = ['Cockle', 'Whelk', 'Periwinkle', 'Limpet', 'Scallop', 'Conch', 'Sand dollar', 'Moon snail'] as const;
export type DayShells = { day: string; spots: Array<{ i: number; x: number; z: number; type: number }> };
// Four shells a day, at four different spots, each a different kind where possible.
export function shellsForDay(now: number): DayShells {
  const day = dayKey(now);
  const random = mulberry32(Number(day) * 2654435761);
  const order = SHELL_SPOTS.map((_, i) => i).sort(() => random() - 0.5);
  const spots = order.slice(0, SHELL.perDay).map((i, k) => ({ i, x: SHELL_SPOTS[i].x, z: SHELL_SPOTS[i].z, type: (Math.floor(random() * SHELL_TYPES.length) + k) % SHELL_TYPES.length }));
  return { day, spots };
}
export const collectedShell = (mask: number, i: number) => (mask & (1 << i)) !== 0;
export const GARDEN_PLOTS = GARDEN_BEDS.map((bed) => ({ x: (bed.x1 + bed.x2) / 2, z: (bed.z1 + bed.z2) / 2 }));
export const GARDEN: Landmark = { x: -1, z: -14.5, radius: 3.2 };
export const GARDEN_REWARD = 3;
export const DOG_REWARD = 5;
// The first unwatered plot today, or -1 when the garden has had its drink.
export function nextPlot(watered: number) {
  for (let i = 0; i < GARDEN_PLOTS.length; i++) if (!(watered & (1 << i))) return i;
  return -1;
}
