import { MOVE, type MoveCommand } from '../../packages/shared/movement.js';
// Per-player queue of movement commands, rate limited with a token bucket.
// Commands beyond the allowance are acknowledged but never executed, so a
// flooding client is corrected instead of sped up.
export class CommandQueue {
  private queue: MoveCommand[] = [];
  private tokens = MOVE.commandBurst;
  lastSeq = 0;
  lastReceived = 0;
  dropped = 0;
  push(command: MoveCommand, now: number) {
    if (command.seq <= this.lastSeq) return false;
    this.lastReceived = now;
    if (this.queue.length >= MOVE.commandBurst) {
      this.lastSeq = command.seq;
      this.dropped++;
      return false;
    }
    this.queue.push(command);
    return true;
  }
  get pending() {
    return this.queue.length;
  }
  drain(dt: number, apply: (command: MoveCommand) => void) {
    this.tokens = Math.min(MOVE.commandBurst, this.tokens + dt * MOVE.commandRate);
    while (this.queue.length && this.tokens >= 1) {
      this.tokens -= 1;
      const command = this.queue.shift()!;
      this.lastSeq = command.seq;
      apply(command);
    }
  }
  clear() {
    this.queue.length = 0;
  }
}
