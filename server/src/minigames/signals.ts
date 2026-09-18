import { SoloRun, mulberry32, type RunEvent } from './solo.js';
// Lighthouse Signals: the lamp flashes a sequence of colours and the player repeats it.
// Each round adds a light; three mistakes end the run. The server seeds each sequence
// and checks the reply against its own copy and its own deadline.
export const SIGNALS = {
  colours: 4,
  startLength: 3,
  lives: 3,
  maxRounds: 20,
  pointsPerRound: 2,
  showMs: (length: number) => 500 * length + 600,
  replyMs: (length: number) => 2500 + 900 * length,
  graceMs: 600,
  timeoutMs: 10 * 60000,
};
export function sequenceFor(seed: number, round: number, attempt: number) {
  const random = mulberry32((seed ^ (round * 7919 + attempt * 104729)) >>> 0);
  return Array.from({ length: SIGNALS.startLength + round - 1 }, () => Math.floor(random() * SIGNALS.colours));
}
export class SignalsRun extends SoloRun {
  readonly game = 'signals' as const;
  round = 1;
  attempt = 0;
  lives = SIGNALS.lives;
  rounds = 0;
  sequence: number[];
  shownAt: number;
  replyBy: number;
  private over = false;
  private answered = false;
  constructor(runId: number, seed: number, startAt: number) {
    super(runId, seed, startAt, SIGNALS.timeoutMs);
    this.sequence = sequenceFor(seed, 1, 0);
    this.shownAt = startAt;
    this.replyBy = startAt + SIGNALS.showMs(this.sequence.length) + SIGNALS.replyMs(this.sequence.length);
  }
  private roundPayload() {
    return { round: this.round, lives: this.lives, sequence: this.sequence, shownAt: this.shownAt, replyBy: this.replyBy, rounds: this.rounds, score: this.score };
  }
  startPayload(): RunEvent {
    return this.roundPayload();
  }
  // A beat after the verdict before the next sequence, so a right answer registers.
  private issue(now: number) {
    this.sequence = sequenceFor(this.seed, this.round, this.attempt);
    this.shownAt = now + 1500;
    this.replyBy = this.shownAt + SIGNALS.showMs(this.sequence.length) + SIGNALS.replyMs(this.sequence.length);
    this.answered = false;
  }
  private mistake(now: number): RunEvent {
    this.lives--;
    this.attempt++;
    if (this.lives <= 0) {
      this.over = true;
      return { ok: false, lives: 0, rounds: this.rounds, score: this.score };
    }
    this.issue(now);
    return { ok: false, ...this.roundPayload() };
  }
  input(m: Record<string, unknown>, now: number): RunEvent | null {
    if (this.over || this.answered || m.round !== this.round) return null;
    const reply = m.sequence;
    if (!Array.isArray(reply) || reply.length > 24 || !reply.every((v) => Number.isInteger(v) && (v as number) >= 0 && (v as number) < SIGNALS.colours)) return null;
    if (now > this.replyBy + SIGNALS.graceMs) return null; // the tick already counted this as a miss
    this.answered = true;
    const right = reply.length === this.sequence.length && reply.every((v, i) => v === this.sequence[i]);
    if (!right) return this.mistake(now);
    this.rounds++;
    this.score = this.rounds * SIGNALS.pointsPerRound;
    if (this.rounds >= SIGNALS.maxRounds) {
      this.over = true;
      return { ok: true, rounds: this.rounds, score: this.score, lives: this.lives, finished: true };
    }
    this.round++;
    this.attempt = 0;
    this.issue(now);
    return { ok: true, ...this.roundPayload() };
  }
  tick(now: number) {
    if (this.over || this.answered || now <= this.replyBy + SIGNALS.graceMs) return null;
    return { timeout: true, ...this.mistake(now) };
  }
  protected complete() {
    return this.over;
  }
  summary() {
    return { score: this.score, rounds: this.rounds, lives: this.lives };
  }
}
