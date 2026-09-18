import { BOAT_SPAWN, BUOYS } from '../../../packages/shared/layout.js';
import { SoloRun, type RunEvent } from './solo.js';
// Boat Buoy Run: push off beside the moored rowboat and round the eight buoys in order.
// The clock starts when the boat leaves the mooring and stops at the last buoy; the
// server reads the boat's own authoritative position, so there is nothing to report.
export const BUOY = { radius: 2.5, parMs: 60000, timeoutMs: 6 * 60000, finishBonus: 12, spawn: BOAT_SPAWN };
export function buoyScore(timeMs: number) {
  return BUOY.finishBonus + Math.max(0, Math.round((BUOY.parMs * 2 - timeMs) / 1000));
}
export class BuoyRun extends SoloRun {
  readonly game = 'buoy' as const;
  next = 0;
  startedAt = 0;
  finishedAt = 0;
  constructor(runId: number, seed: number, startAt: number) {
    super(runId, seed, startAt, BUOY.timeoutMs);
  }
  startPayload(): RunEvent {
    return { checkpoints: BUOYS.map((b) => [+b.x.toFixed(2), +b.z.toFixed(2)]), radius: BUOY.radius, parMs: BUOY.parMs, spawn: [BUOY.spawn.x, BUOY.spawn.z] };
  }
  input() {
    return null;
  }
  tick(now: number, position: { x: number; z: number }): RunEvent | null {
    if (this.finishedAt) return null;
    if (!this.startedAt) {
      if (Math.hypot(position.x - BUOY.spawn.x, position.z - BUOY.spawn.z) < 1.5) return null;
      this.startedAt = now;
    }
    const buoy = BUOYS[this.next];
    if (!buoy || Math.hypot(position.x - buoy.x, position.z - buoy.z) > BUOY.radius) return null;
    this.next++;
    if (this.next === BUOYS.length) {
      this.finishedAt = now;
      this.score = buoyScore(now - this.startedAt);
    }
    return { next: this.next, at: now - this.startedAt, finished: this.finishedAt > 0, score: this.score };
  }
  protected complete() {
    return this.finishedAt > 0;
  }
  summary() {
    return { score: this.score, timeMs: this.finishedAt ? this.finishedAt - this.startedAt : 0, checkpoints: this.next, total: BUOYS.length };
  }
}
