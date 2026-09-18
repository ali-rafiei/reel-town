import { SPAWN, resolveBoat, resolveMove, walkable } from './layout.js';
const resolved = { x: 0, z: 0 };
// Fixed-step, deterministic movement shared by the authoritative server and the predicting client.
export const MOVE = {
  tickHz: 30,
  dt: 1 / 30,
  speed: 5.2,
  accel: 32,
  decel: 40,
  stopSpeed: 0.02,
  // Commands the server will execute per second (token bucket); more than this is a speed cheat.
  commandRate: 30,
  commandBurst: 8,
  maxPending: 90,
  snapDistance: 1.6,
};
// Rowing: faster than walking, slow to get going and slow to stop, and bounded by the
// water instead of the shore.
export const BOAT = { speed: 7.5, accel: 6, decel: 3.5, stopSpeed: 0.05 };
export type MoveMode = 'walk' | 'boat';
export type MoveState = {
  x: number;
  z: number;
  vx: number;
  vz: number;
  heading: number;
  mode: MoveMode;
};
export type MoveCommand = { seq: number; dx: number; dz: number };
export function createMoveState(x = SPAWN.x, z = SPAWN.z, heading = 0, mode: MoveMode = 'walk'): MoveState {
  return { x, z, vx: 0, vz: 0, heading, mode };
}
// The source may be a wire message from a server that predates boats, so mode is optional.
export type MoveLike = Omit<MoveState, 'mode'> & { mode?: MoveMode };
export function copyMoveState(from: MoveLike, to: MoveState) {
  to.x = from.x;
  to.z = from.z;
  to.vx = from.vx;
  to.vz = from.vz;
  to.heading = from.heading;
  // A message from a server that predates boats carries no mode: that player is walking.
  to.mode = from.mode ?? 'walk';
  return to;
}
export function clampAxis(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(-1, Math.min(1, value))
    : 0;
}
export function stepMovement(
  s: MoveState,
  dx: number,
  dz: number,
  dt: number,
  frozen = false,
) {
  let ix = frozen ? 0 : clampAxis(dx),
    iz = frozen ? 0 : clampAxis(dz);
  const inputLength = Math.sqrt(ix * ix + iz * iz);
  if (inputLength > 1) {
    ix /= inputLength;
    iz /= inputLength;
  }
  const tuning = s.mode === 'boat' ? BOAT : MOVE;
  const targetX = ix * tuning.speed,
    targetZ = iz * tuning.speed;
  const rate = inputLength > 0 ? tuning.accel : tuning.decel;
  const dvx = targetX - s.vx,
    dvz = targetZ - s.vz,
    dv = Math.sqrt(dvx * dvx + dvz * dvz),
    step = rate * dt;
  if (dv <= step) {
    s.vx = targetX;
    s.vz = targetZ;
  } else {
    s.vx += (dvx / dv) * step;
    s.vz += (dvz / dv) * step;
  }
  if (inputLength === 0 && s.vx * s.vx + s.vz * s.vz < tuning.stopSpeed * tuning.stopSpeed) {
    s.vx = 0;
    s.vz = 0;
  }
  // Held still with no momentum: the position cannot change, so it is not re-resolved.
  // A player seated on a bench stands inside the bench's own blocker, and resolving
  // would push them off it.
  if (frozen && s.vx === 0 && s.vz === 0) return s;
  const nx = s.x + s.vx * dt,
    nz = s.z + s.vz * dt;
  (s.mode === 'boat' ? resolveBoat : resolveMove)(s.x, s.z, nx, nz, resolved);
  if (resolved.x !== nx || resolved.z !== nz) {
    // Blocked or sliding: the velocity becomes the displacement actually achieved.
    s.vx = (resolved.x - s.x) / dt;
    s.vz = (resolved.z - s.z) / dt;
    if (s.vx * s.vx + s.vz * s.vz < tuning.stopSpeed * tuning.stopSpeed) {
      s.vx = 0;
      s.vz = 0;
    }
  }
  s.x = resolved.x;
  s.z = resolved.z;
  if (s.vx * s.vx + s.vz * s.vz > 0.04) s.heading = Math.atan2(s.vx, s.vz);
  return s;
}
export function speedOf(s: MoveState) {
  return Math.sqrt(s.vx * s.vx + s.vz * s.vz);
}
// Legacy instant-velocity walk kept for the original gameplay tests and bots.
export function walk(x: number, z: number, dx: number, dz: number, dt: number) {
  const s = createMoveState(x, z);
  const length = Math.sqrt(dx * dx + dz * dz) || 1;
  s.vx = (dx / Math.max(1, length)) * 5;
  s.vz = (dz / Math.max(1, length)) * 5;
  const nx = x + s.vx * dt,
    nz = z + s.vz * dt;
  if (walkable(nx, nz)) return { x: nx, z: nz };
  return { x, z };
}
