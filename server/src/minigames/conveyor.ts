import type { GameId } from '../../../packages/shared/games.js';
import { SoloRun, mulberry32, ramp, type RunEvent } from './solo.js';
// A belt of items the player sorts into bins before each falls off the end. Sort the
// Catch and Tidepool Tidy are both this with different items, bins and penalties.
export type ConveyorSpec = {
  durationMs: number;
  items: number;
  firstAt: number;
  // Gap between items and time on the belt, first item to last: the belt ramps.
  spacingMs: readonly [number, number];
  travelMs: readonly [number, number];
  // How far off the beat an item may drift, as a share of the gap before it.
  jitter: number;
  graceMs: number;
  correct: number;
  speedBonus: number;
  speedWindowMs: number;
  wrong: number;
  comboStep: number;
  maxCombo: number;
  bins: number;
};
// The belt's ramp is weighted to the end of the run: the last quarter is where the gaps
// collapse and the items cross fastest, so a run finishes hectic instead of trailing off.
export const BELT_CURVE = 2;
export type ConveyorItem = { i: number; kind: number; at: number; travel: number };
export function generateSchedule(seed: number, spec: ConveyorSpec, pickKind: (random: () => number, i: number) => number): ConveyorItem[] {
  const random = mulberry32(seed);
  const items: ConveyorItem[] = [];
  let at = spec.firstAt;
  for (let i = 0; i < spec.items; i++) {
    const gap = ramp(spec.spacingMs, i, spec.items, BELT_CURVE);
    // The belt is not a metronome. Each item drifts off the beat by up to `jitter` of its
    // gap, so two can arrive almost together and then leave a hole, and a run cannot be
    // played to a rhythm. The drift is off the beat, never off the clock: it moves an
    // item around where it would have been rather than pushing everything after it along,
    // and the first and last keep the beat exactly, so a run still ends with its clock.
    const edge = i === 0 || i === spec.items - 1;
    const drift = edge ? 0 : Math.round((random() * 2 - 1) * spec.jitter * gap);
    items.push({ i, kind: pickKind(random, i), at: at + drift, travel: ramp(spec.travelMs, i, spec.items, BELT_CURVE) });
    at += gap;
  }
  return items;
}
export const comboMultiplier = (streak: number, spec: ConveyorSpec) => Math.min(spec.maxCombo, 1 + Math.floor(streak / spec.comboStep));
export abstract class ConveyorRun extends SoloRun {
  readonly items: ConveyorItem[];
  readonly answers = new Map<number, number>();
  correct = 0;
  wrong = 0;
  spared = 0;
  constructor(
    readonly game: GameId,
    runId: number,
    seed: number,
    startAt: number,
    readonly spec: ConveyorSpec,
    pickKind: (random: () => number, i: number) => number,
  ) {
    super(runId, seed, startAt, spec.durationMs);
    this.items = generateSchedule(seed, spec, pickKind);
  }
  // The bin an item belongs in, or null for something that must be left alone.
  protected abstract correctBin(kind: number): number | null;
  protected abstract wrongDelta(kind: number, bin: number): number;
  startPayload(): RunEvent {
    return { items: this.items.map((it) => [it.i, it.kind, it.at, it.travel]) };
  }
  input(m: Record<string, unknown>, now: number) {
    return Number.isInteger(m.i) ? this.answer(m.i as number, m.bin as number, now) : null;
  }
  // Validates one throw; returns null when the message is meaningless (unknown item, duplicate, not yet visible).
  answer(i: number, bin: number, now: number) {
    const item = this.items[i];
    if (!item || !Number.isInteger(bin) || bin < 0 || bin >= this.spec.bins || this.answers.has(i)) return null;
    const shown = this.startAt + item.at;
    if (now < shown - this.spec.graceMs) return null;
    if (now > shown + item.travel + this.spec.graceMs) {
      this.answers.set(i, -1);
      return { i, correct: false, late: true, score: this.score, combo: comboMultiplier(this.streak, this.spec), delta: 0 };
    }
    this.answers.set(i, bin);
    const wanted = this.correctBin(item.kind);
    const correct = wanted !== null && wanted === bin;
    let delta: number;
    if (correct) {
      this.streak++;
      this.correct++;
      delta = (this.spec.correct + (now - shown <= this.spec.speedWindowMs ? this.spec.speedBonus : 0)) * comboMultiplier(this.streak - 1, this.spec);
    } else {
      this.streak = 0;
      this.wrong++;
      delta = this.wrongDelta(item.kind, bin);
    }
    this.score = Math.max(0, this.score + delta);
    return { i, correct, late: false, score: this.score, combo: comboMultiplier(this.streak, this.spec), delta };
  }
  protected complete() {
    return this.answers.size >= this.items.length;
  }
  summary() {
    // Items that had a bin and never got one are missed; creatures left alone were spared.
    let missed = 0,
      spared = 0;
    for (const item of this.items) {
      if (this.answers.has(item.i) && this.answers.get(item.i) !== -1) continue;
      if (this.correctBin(item.kind) === null) spared++;
      else missed++;
    }
    this.spared = spared;
    return { score: this.score, correct: this.correct, wrong: this.wrong, missed, spared };
  }
}
