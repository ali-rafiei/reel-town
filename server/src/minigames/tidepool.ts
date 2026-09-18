import { GAME_REWARDS } from '../../../packages/shared/games.js';
import { ConveyorRun, type ConveyorSpec } from './conveyor.js';
// Tidepool Tidy: litter washes along the rocks on the belt and the player sorts it into
// three bins. Shells, crabs and starfish ride along too and must be left where they are.
export const TIDE_BINS = ['Plastic', 'Metal', 'Paper'] as const;
export const TIDE_ITEMS = [
  { name: 'Bottle', bin: 0 },
  { name: 'Bag', bin: 0 },
  { name: 'Six-pack ring', bin: 0 },
  { name: 'Can', bin: 1 },
  { name: 'Bottle cap', bin: 1 },
  { name: 'Newspaper', bin: 2 },
  { name: 'Cup', bin: 2 },
  { name: 'Shell', bin: -1 },
  { name: 'Crab', bin: -1 },
  { name: 'Starfish', bin: -1 },
] as const;
const litter = TIDE_ITEMS.map((item, i) => (item.bin >= 0 ? i : -1)).filter((i) => i >= 0);
const creatures = TIDE_ITEMS.map((item, i) => (item.bin < 0 ? i : -1)).filter((i) => i >= 0);
export const TIDEPOOL = {
  durationMs: 60000,
  items: 61,
  firstAt: 1200,
  // Weighted to the end: litter keeps washing in until the clock runs out, and the last
  // stretch is the fastest of the run.
  spacingMs: [1200, 420] as const,
  travelMs: [2800, 1250] as const,
  jitter: 0.34,
  graceMs: 300,
  correct: 10,
  speedBonus: 5,
  speedWindowMs: 800,
  wrong: -5,
  comboStep: 5,
  maxCombo: 3,
  bins: TIDE_BINS.length,
  creaturePenalty: -15,
  maxRewardPerRun: GAME_REWARDS.tidepool.maxPerRun,
};
const spec: ConveyorSpec = TIDEPOOL;
// Every fourth item is something alive; the rest is litter.
const pickKind = (random: () => number, i: number) => (i % 4 === 3 ? creatures[Math.floor(random() * creatures.length)] : litter[Math.floor(random() * litter.length)]);
export class TidepoolRun extends ConveyorRun {
  constructor(runId: number, seed: number, startAt: number) {
    super('tidepool', runId, seed, startAt, spec, pickKind);
  }
  protected correctBin(kind: number) {
    const bin = TIDE_ITEMS[kind].bin;
    return bin < 0 ? null : bin;
  }
  protected wrongDelta(kind: number) {
    return TIDE_ITEMS[kind].bin < 0 ? TIDEPOOL.creaturePenalty : TIDEPOOL.wrong;
  }
  startPayload() {
    return { ...super.startPayload(), bins: TIDE_BINS, names: TIDE_ITEMS.map((item) => item.name) };
  }
}
