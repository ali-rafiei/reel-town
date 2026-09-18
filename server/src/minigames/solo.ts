import type { GameId } from '../../../packages/shared/games.js';
// One player's run of a pickup game: the server owns the schedule, the score and the
// clock. Games extend this with their inputs; the dispatcher only ever sees the base.
export type RunEvent = Record<string, unknown>;
export abstract class SoloRun {
  abstract readonly game: GameId;
  // Exactly one settlement per run, whichever of input, tick, quit or disconnect gets there first.
  settled = false;
  score = 0;
  streak = 0;
  constructor(
    readonly runId: number,
    readonly seed: number,
    readonly startAt: number,
    readonly durationMs: number,
  ) {}
  get endsAt() {
    return this.startAt + this.durationMs;
  }
  // Extra fields for the start message: schedules, targets, course.
  abstract startPayload(): RunEvent;
  // A validated player input; null means the message meant nothing and is dropped.
  abstract input(m: Record<string, unknown>, now: number): RunEvent | null;
  // Unsolicited progress from the tick: timeouts, checkpoints. Null when nothing changed.
  tick(_now: number, _position: { x: number; z: number }): RunEvent | null {
    return null;
  }
  finished(now: number) {
    return now >= this.endsAt || this.complete();
  }
  protected complete() {
    return false;
  }
  abstract summary(): RunEvent & { score: number };
}
export { mulberry32 } from '../../../packages/shared/rng.js';
// Ramp from the first item to the last. A curve above 1 holds the early value longer and
// then falls away steeply, so the run tightens hardest in its closing seconds.
export const ramp = (range: readonly [number, number], i: number, count: number, curve = 1) =>
  Math.round(range[0] + (range[1] - range[0]) * Math.pow(i / Math.max(1, count - 1), curve));
