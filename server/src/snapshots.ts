import { Encoder } from '@msgpack/msgpack';
import { fishPosition } from '../../packages/shared/game.js';
import {
  ANGLE_SCALE,
  POSITION_SCALE,
  ROW,
  VELOCITY_SCALE,
  emoteCode,
  fishPhaseCode,
  quantize,
  type ContestState,
  type PlayerRow,
  type RosterEntry,
  type TableState,
  type WorldState,
} from '../../packages/shared/protocol.js';
import type { Player } from './player.js';
const encoder = new Encoder();
export const encode = (message: unknown) => encoder.encode(message);
export function rosterEntry(p: Player): RosterEntry {
  return {
    n: p.n,
    name: p.name,
    appearance: p.appearance,
    gold: p.appearance.showGold ? p.coins : undefined,
  };
}
const rows: PlayerRow[] = [];
// Builds the shared world snapshot once per tick; every protocol-2 client receives the same bytes.
export function buildSnapshot(players: Iterable<Player>, now: number, cap: number, count: number, world: WorldState, contest: ContestState, tables: TableState[] = []) {
  rows.length = 0;
  for (const p of players) {
    const row: PlayerRow = Array.from({ length: ROW.length }, () => 0);
    const f = p.fishing;
    row[ROW.n] = p.n;
    row[ROW.x] = quantize(p.move.x, POSITION_SCALE);
    row[ROW.z] = quantize(p.move.z, POSITION_SCALE);
    row[ROW.vx] = quantize(p.move.vx, VELOCITY_SCALE);
    row[ROW.vz] = quantize(p.move.vz, VELOCITY_SCALE);
    row[ROW.heading] = quantize(p.move.heading, ANGLE_SCALE);
    row[ROW.emote] = emoteCode(p.emote);
    row[ROW.emoteAge] = p.emote ? now - p.emoteStarted : 0;
    row[ROW.fishPhase] = fishPhaseCode(f?.phase);
    row[ROW.castAge] = f ? now - f.castAt : 0;
    row[ROW.waterX] = f ? quantize(f.waterX, VELOCITY_SCALE) : 0;
    row[ROW.waterZ] = f ? quantize(f.waterZ, VELOCITY_SCALE) : 0;
    row[ROW.castId] = f ? f.castId : 0;
    row[ROW.mode] = p.move.mode === 'boat' ? 1 : 0;
    rows.push(row);
  }
  return encode({ type: 'snapshot', st: now, count, cap, players: rows, contest, tables, ...world });
}
export function buildYou(p: Player, now: number) {
  const f = p.fishing;
  return encode({
    type: 'you',
    st: now,
    ack: p.protocol === 2 ? p.commands.lastSeq : 0,
    x: p.move.x,
    z: p.move.z,
    vx: p.move.vx,
    vz: p.move.vz,
    heading: p.move.heading,
    mode: p.move.mode,
    fishing: f
      ? {
          phase: f.phase,
          seed: f.seed,
          elapsed: (now - f.at) / 1000,
          velocity: f.velocity,
          bar: f.bar,
          progress: f.progress,
          perfect: f.perfect,
          fish: fishPosition(f.seed, (now - f.at) / 1000),
          mods: p.mods,
        }
      : null,
  });
}
// Snapshot shape used by clients published before protocol 2.
export function buildLegacySnapshot(p: Player, players: Iterable<Player>, now: number, cap: number, count: number, world: WorldState) {
  const nearby = [];
  for (const q of players) {
    nearby.push({
      id: q.id,
      name: q.name,
      color: q.appearance.color,
      appearance: q.appearance,
      gold: q.appearance.showGold ? q.coins : undefined,
      heading: q.move.heading,
      moving: !q.fishing && (q.move.vx !== 0 || q.move.vz !== 0),
      x: +q.move.x.toFixed(3),
      z: +q.move.z.toFixed(3),
      emote: q.emote,
      emoteAge: q.emote ? (now - q.emoteStarted) / 1000 : 0,
      castAt: q.fishing?.castAt || 0,
      castAge: q.fishing ? (now - q.fishing.castAt) / 1000 : 0,
      waterX: q.fishing?.waterX,
      waterZ: q.fishing?.waterZ,
      fishing: q.fishing?.phase || null,
    });
  }
  const f = p.fishing;
  return encode({
    type: 'snapshot',
    players: nearby,
    count,
    cap,
    ...world,
    fishing: f
      ? {
          phase: f.phase,
          seed: f.seed,
          elapsed: (now - f.at) / 1000,
          velocity: f.velocity,
          bar: f.bar,
          progress: f.progress,
          perfect: f.perfect,
          fish: fishPosition(f.seed, (now - f.at) / 1000),
        }
      : null,
  });
}
