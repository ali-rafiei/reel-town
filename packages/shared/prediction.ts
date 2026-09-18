import { SPAWN } from './layout.js';
import {
  MOVE,
  copyMoveState,
  createMoveState,
  stepMovement,
  type MoveCommand,
  type MoveLike,
  type MoveState,
} from './movement.js';
// Client-side prediction with authoritative reconciliation.
// tick() applies local input immediately and returns the command to send;
// reconcile() rebases on the server state and replays unacknowledged commands.
export class Predictor {
  state: MoveState;
  previous: MoveState;
  pending: MoveCommand[] = [];
  seq = 0;
  // Visual correction offset that decays toward zero so rebases never snap.
  offsetX = 0;
  offsetZ = 0;
  lastError = 0;
  constructor(initial?: Partial<MoveState>) {
    this.state = createMoveState(initial?.x ?? SPAWN.x, initial?.z ?? SPAWN.z, initial?.heading ?? 0);
    this.previous = createMoveState(this.state.x, this.state.z, this.state.heading);
  }
  tick(dx: number, dz: number, frozen = false): MoveCommand | null {
    const moving = this.state.vx !== 0 || this.state.vz !== 0;
    if (!moving && dx === 0 && dz === 0 && this.pending.length === 0) return null;
    copyMoveState(this.state, this.previous);
    const command = { seq: ++this.seq, dx: frozen ? 0 : dx, dz: frozen ? 0 : dz };
    stepMovement(this.state, command.dx, command.dz, MOVE.dt, frozen);
    this.pending.push(command);
    if (this.pending.length > MOVE.maxPending) this.pending.shift();
    return command;
  }
  reconcile(ack: number, server: MoveLike, frozen = false) {
    const beforeX = this.state.x + this.offsetX,
      beforeZ = this.state.z + this.offsetZ;
    let keep = 0;
    while (keep < this.pending.length && this.pending[keep].seq <= ack) keep++;
    if (keep) this.pending.splice(0, keep);
    copyMoveState(server, this.state);
    for (const c of this.pending) stepMovement(this.state, c.dx, c.dz, MOVE.dt, frozen);
    const ex = beforeX - this.state.x,
      ez = beforeZ - this.state.z;
    this.lastError = Math.sqrt(ex * ex + ez * ez);
    if (this.lastError > MOVE.snapDistance) {
      this.offsetX = 0;
      this.offsetZ = 0;
    } else {
      this.offsetX = ex;
      this.offsetZ = ez;
    }
    copyMoveState(this.state, this.previous);
    return this.lastError;
  }
  // Decays the visual correction; call once per rendered frame.
  relax(dt: number) {
    const k = 1 - Math.exp(-12 * dt);
    this.offsetX -= this.offsetX * k;
    this.offsetZ -= this.offsetZ * k;
    if (Math.abs(this.offsetX) < 1e-4) this.offsetX = 0;
    if (Math.abs(this.offsetZ) < 1e-4) this.offsetZ = 0;
  }
  // Render position interpolated between the previous and current fixed step.
  renderX(alpha: number) {
    return this.previous.x + (this.state.x - this.previous.x) * alpha + this.offsetX;
  }
  renderZ(alpha: number) {
    return this.previous.z + (this.state.z - this.previous.z) * alpha + this.offsetZ;
  }
}
