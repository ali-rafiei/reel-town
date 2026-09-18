import type { Appearance } from './appearance.js';
import type { GameClientMessage, GameServerMessage } from './games.js';
// Wire protocol shared by client and server. Client -> server is JSON text; server -> client is MessagePack.
export const PROTOCOL_VERSION = 2;
export const EMOTES = ['', 'wave', 'heart', 'dance', 'sit'] as const;
export type Emote = (typeof EMOTES)[number];
export const FISH_PHASES = ['', 'waiting', 'bite', 'reeling', 'contest'] as const;
// How a player is getting about; appended to the snapshot row so old clients ignore it.
export const MODES = ['walk', 'boat'] as const;
export type FishPhase = (typeof FISH_PHASES)[number];
export const POSITION_SCALE = 1000; // millimetres
export const VELOCITY_SCALE = 100; // cm/s
export const ANGLE_SCALE = 1000; // milliradians
// Snapshot player row layout (array for compactness).
export const ROW = {
  n: 0,
  x: 1,
  z: 2,
  vx: 3,
  vz: 4,
  heading: 5,
  emote: 6,
  emoteAge: 7,
  fishPhase: 8,
  castAge: 9,
  waterX: 10,
  waterZ: 11,
  castId: 12,
  mode: 13,
  length: 14,
} as const;
export type PlayerRow = number[];
export type RosterEntry = {
  n: number;
  name: string;
  appearance: Appearance;
  gold?: number;
};
export type WorldState = { time: number; weather: string };
// Casting contest state shared in the snapshot while a round is running.
export type ContestState = { phase: 'lobby' | 'active' | 'results'; endsAt: number; target: [number, number]; players: Array<[number, number, number]> } | null;
// The picnic table: [phase code, seat 0 session, seat 1 session], so a nearby prompt can say whether a seat is free.
export type TableState = [number, number, number];
export type ReelState = {
  phase: FishPhase;
  seed: number;
  elapsed: number;
  velocity: number;
  bar: number;
  progress: number;
  perfect: boolean;
  fish: number;
};
export type ServerMessage =
  | {
      type: 'welcome';
      protocol: number;
      n: number;
      id: string;
      token: string;
      cap: number;
      profile: string;
      coins: number;
      inventory: unknown[];
      appearance: Appearance;
      snapshotHz: number;
      tickHz: number;
    }
  | { type: 'roster'; full?: boolean; add?: RosterEntry[]; remove?: number[] }
  | { type: 'snapshot'; st: number; count: number; cap: number; players: PlayerRow[]; contest: ContestState; tables?: TableState[] } & WorldState
  | { type: 'you'; st: number; ack: number; x: number; z: number; vx: number; vz: number; heading: number; mode?: 'walk' | 'boat'; fishing: ReelState | null }
  | { type: 'chat'; n: number; name: string; text: string }
  | { type: 'effect'; kind: string; n: number; waterX: number; waterZ: number; fish?: string; perfect?: boolean }
  | { type: 'inventory'; coins: number; inventory: unknown[] }
  | { type: 'appearance'; appearance: Appearance }
  | { type: 'notice'; message: string }
  | { type: 'error'; message: string }
  | GameServerMessage;
export type ClientMessage =
  | { type: 'join'; protocol?: number; name?: string; token?: string; appearance?: unknown; color?: string }
  | { type: 'move'; seq: number; dx: number; dz: number }
  | { type: 'input'; dx: number; dz: number; held?: boolean }
  | { type: 'reelInput'; held: boolean }
  | { type: 'chat'; text: string }
  | { type: 'emote'; emote: string }
  | { type: 'cast'; power?: number; aim?: number }
  | { type: 'contest'; action: 'join' | 'leave' }
  | { type: 'sort'; action: 'start' | 'quit' }
  | { type: 'sort'; action: 'answer'; runId: number; i: number; bin: number }
  | { type: 'hook' }
  | { type: 'cancel' }
  | { type: 'sell' }
  | { type: 'appearance'; appearance: unknown }
  | { type: 'buy'; kind: string; item: string }
  | { type: 'admin'; action: string; value?: unknown; target?: number; id?: string }
  | GameClientMessage;
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
// Returns the validated move command or null; sequence numbers must be positive integers.
export function parseMoveCommand(m: Record<string, unknown>) {
  if (!finite(m.seq) || !Number.isInteger(m.seq) || m.seq <= 0 || m.seq > 2 ** 31) return null;
  if (!finite(m.dx) || !finite(m.dz)) return null;
  return {
    seq: m.seq,
    dx: Math.max(-1, Math.min(1, m.dx)),
    dz: Math.max(-1, Math.min(1, m.dz)),
  };
}
export function emoteCode(emote: string) {
  const index = EMOTES.indexOf(emote as Emote);
  return index < 0 ? 0 : index;
}
export function fishPhaseCode(phase: string | null | undefined) {
  const index = FISH_PHASES.indexOf((phase || '') as FishPhase);
  return index < 0 ? 0 : index;
}
export function parseCast(m: Record<string, unknown>) {
  const power = finite(m.power) ? Math.max(0, Math.min(1, m.power)) : 0.55;
  const aim = finite(m.aim) ? Math.max(-1, Math.min(1, m.aim)) : 0;
  return { power, aim };
}
export const quantize = (value: number, scale: number) => Math.round(value * scale);
