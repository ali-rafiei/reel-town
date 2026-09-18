import { SoloRun, mulberry32, ramp, type RunEvent } from './solo.js';
// Orchard Catch: fruit drops from the trees into five lanes and the player runs a basket
// underneath. The server seeds every fruit's lane, time and whether it is rotten, then
// checks each reported catch against the clock and against how fast a basket can move.
export const ORCHARD = {
  durationMs: 60000,
  fruits: 70,
  lanes: 5,
  firstAt: 1500,
  spacingMs: [1100, 450] as const,
  fallMs: [2600, 1500] as const,
  rottenChance: 0.18,
  graceMs: 250,
  lateMs: 350,
  catch: 10,
  streakStep: 5,
  maxMult: 3,
  rotten: -15,
  // Basket speed in track widths per second, and its half width in track widths.
  basketSpeed: 0.55,
  basketHalf: 0.11,
  laneTolerance: 0.06,
  startX: 0.5,
};
export type Fruit = { i: number; lane: number; at: number; fall: number; rotten: boolean };
export const laneX = (lane: number) => (lane + 0.5) / ORCHARD.lanes;
export function generateOrchard(seed: number): Fruit[] {
  const random = mulberry32(seed);
  const fruits: Fruit[] = [];
  let at = ORCHARD.firstAt,
    lastRottenLane = -1;
  for (let i = 0; i < ORCHARD.fruits; i++) {
    const lane = Math.floor(random() * ORCHARD.lanes);
    // Never two rotten in a row in the same lane, so a basket is never trapped.
    const rotten = random() < ORCHARD.rottenChance && lane !== lastRottenLane;
    lastRottenLane = rotten ? lane : -1;
    fruits.push({ i, lane, at, fall: ramp(ORCHARD.fallMs, i, ORCHARD.fruits), rotten });
    at += ramp(ORCHARD.spacingMs, i, ORCHARD.fruits);
  }
  return fruits;
}
export const orchardMultiplier = (streak: number) => Math.min(ORCHARD.maxMult, 1 + Math.floor(streak / ORCHARD.streakStep));
export class OrchardRun extends SoloRun {
  readonly game = 'orchard' as const;
  readonly fruits: Fruit[];
  readonly taken = new Map<number, 'ok' | 'rotten' | 'miss'>();
  lastX = ORCHARD.startX;
  lastAt: number;
  caught = 0;
  rottenCaught = 0;
  rejected = 0;
  constructor(runId: number, seed: number, startAt: number) {
    super(runId, seed, startAt, ORCHARD.durationMs);
    this.fruits = generateOrchard(seed);
    this.lastAt = startAt;
  }
  startPayload(): RunEvent {
    return { fruits: this.fruits.map((f) => [f.i, f.lane, f.at, f.fall, f.rotten ? 1 : 0]), lanes: ORCHARD.lanes, basketSpeed: ORCHARD.basketSpeed, basketHalf: ORCHARD.basketHalf };
  }
  landing(fruit: Fruit) {
    return this.startAt + fruit.at + fruit.fall;
  }
  // Fruit that has already hit the grass without a report is missed, and breaks the streak.
  private sweep(now: number) {
    let swept = 0;
    for (const fruit of this.fruits) {
      if (this.taken.has(fruit.i)) continue;
      if (this.landing(fruit) < now - ORCHARD.graceMs - ORCHARD.lateMs) {
        this.taken.set(fruit.i, 'miss');
        if (!fruit.rotten) {
          this.streak = 0;
          swept++;
        }
      }
    }
    return swept;
  }
  input(m: Record<string, unknown>, now: number): RunEvent | null {
    if (!Number.isInteger(m.i) || typeof m.x !== 'number' || !Number.isFinite(m.x)) return null;
    const fruit = this.fruits[m.i as number];
    if (!fruit || this.taken.has(fruit.i)) return null;
    const x = Math.max(0, Math.min(1, m.x));
    const land = this.landing(fruit);
    if (now < land - ORCHARD.graceMs) return null;
    if (now > land + ORCHARD.graceMs + ORCHARD.lateMs) {
      this.taken.set(fruit.i, 'miss');
      return { i: fruit.i, ok: false, late: true, ...this.view() };
    }
    // The basket can only have got here if it had time to: anything faster is ignored.
    const reach = ORCHARD.basketSpeed * ((now - this.lastAt) / 1000) + 0.02;
    if (Math.abs(x - this.lastX) > reach) {
      this.rejected++;
      return null;
    }
    this.lastX = x;
    this.lastAt = now;
    this.sweep(now);
    if (Math.abs(x - laneX(fruit.lane)) > ORCHARD.basketHalf + ORCHARD.laneTolerance) {
      this.taken.set(fruit.i, 'miss');
      if (!fruit.rotten) this.streak = 0;
      return { i: fruit.i, ok: false, late: false, ...this.view() };
    }
    let delta: number;
    if (fruit.rotten) {
      this.taken.set(fruit.i, 'rotten');
      this.rottenCaught++;
      this.streak = 0;
      delta = ORCHARD.rotten;
    } else {
      this.taken.set(fruit.i, 'ok');
      this.caught++;
      this.streak++;
      delta = ORCHARD.catch * orchardMultiplier(this.streak - 1);
    }
    this.score = Math.max(0, this.score + delta);
    return { i: fruit.i, ok: !fruit.rotten, rotten: fruit.rotten, late: false, delta, ...this.view() };
  }
  tick(now: number) {
    return this.sweep(now) ? this.view() : null;
  }
  private view() {
    return { score: this.score, streak: this.streak, mult: orchardMultiplier(this.streak) };
  }
  protected complete() {
    return this.taken.size >= this.fruits.length;
  }
  summary() {
    return { score: this.score, caught: this.caught, rottenCaught: this.rottenCaught, missed: this.fruits.filter((f) => !f.rotten && this.taken.get(f.i) !== 'ok').length, rejected: this.rejected };
  }
}
