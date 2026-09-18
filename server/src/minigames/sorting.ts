import { fishCatalog, type Rarity } from '../../../packages/shared/game.js';
import { GAME_REWARDS, gameReward } from '../../../packages/shared/games.js';
import { SORTING_CRATES } from '../../../packages/shared/layout.js';
import { ConveyorRun, comboMultiplier as conveyorCombo, type ConveyorSpec } from './conveyor.js';
export { mulberry32, ramp } from './solo.js';
export { BELT_CURVE } from './conveyor.js';
// Sort the Catch: a solo arcade run at the crates by the pier. Fish slide along a
// conveyor and the player throws each into the crate matching its rarity before it
// falls off the end. The server owns the sequence, timing, scoring and rewards.
const spec: ConveyorSpec = {
  durationMs: 90000,
  items: 89,
  firstAt: 1200,
  // The belt ramps, weighted to the end: fish keep arriving until the clock runs out, and
  // the closing seconds are the fastest the run ever gets.
  spacingMs: [1250, 450],
  travelMs: [3000, 1350],
  jitter: 0.38,
  graceMs: 300,
  correct: 10,
  speedBonus: 5,
  speedWindowMs: 900,
  wrong: -5,
  comboStep: 5,
  maxCombo: 3,
  bins: 4,
};
export const SORTING = {
  station: { x: SORTING_CRATES.x, z: SORTING_CRATES.z },
  radius: SORTING_CRATES.radius,
  ...spec,
  goldDivisor: GAME_REWARDS.sorting.divisor,
  maxRewardPerRun: GAME_REWARDS.sorting.maxPerRun,
  maxRewardedRunsPerHour: GAME_REWARDS.sorting.maxRunsPerHour,
};
export const BINS: Rarity[] = ['Common', 'Uncommon', 'Rare', 'Legendary'];
export type SortItem = { i: number; species: number; kind: number; at: number; travel: number };
const byRarity = BINS.map((rarity) => fishCatalog.map((f, index) => (f.rarity === rarity ? index : -1)).filter((i) => i >= 0));
// Rarity mix leans common but guarantees the rarer crates see action.
const pickSpecies = (random: () => number, i: number) => {
  const roll = random();
  const rarity = i % 9 === 8 ? 3 : roll < 0.45 ? 0 : roll < 0.75 ? 1 : roll < 0.93 ? 2 : 3;
  const pool = byRarity[rarity];
  return pool[Math.floor(random() * pool.length)];
};
export class SortingRun extends ConveyorRun {
  declare readonly items: SortItem[];
  constructor(runId: number, seed: number, startAt: number) {
    super('sorting', runId, seed, startAt, spec, pickSpecies);
    // The belt item's kind is a species index; name it so for the tests and the client.
    for (const item of this.items) item.species = item.kind;
  }
  protected correctBin(kind: number) {
    return BINS.indexOf(fishCatalog[kind].rarity);
  }
  protected wrongDelta() {
    return spec.wrong;
  }
}
export function generateRun(seed: number): SortItem[] {
  return new SortingRun(0, seed, 0).items;
}
export function comboMultiplier(streak: number) {
  return conveyorCombo(streak, spec);
}
export function runReward(score: number, rewardedAt: number[], now: number) {
  return gameReward('sorting', score, rewardedAt, now);
}
export function canStartFrom(x: number, z: number) {
  return Math.hypot(x - SORTING.station.x, z - SORTING.station.z) <= SORTING.radius;
}
