import type { WebSocket } from 'ws';
import type { Appearance } from '../../packages/shared/appearance.js';
import { createMoveState, type MoveState } from '../../packages/shared/movement.js';
import { CommandQueue } from './commands.js';
import type { Catch } from './db.js';
import type { Stats } from '../../packages/shared/stats.js';
import type { ReelMods } from '../../packages/shared/game.js';
import { reelModifiers } from '../../packages/shared/gear.js';
import type { SoloRun } from './minigames/solo.js';
export type Fishing = {
  phase: 'waiting' | 'bite' | 'reeling' | 'contest';
  power: number;
  castId: number;
  castAt: number;
  waterX: number;
  waterZ: number;
  at: number;
  seed: number;
  held: boolean;
  bar: number;
  velocity: number;
  progress: number;
  perfect: boolean;
};
export type Player = {
  n: number;
  id: string;
  name: string;
  color: string;
  appearance: Appearance;
  protocol: 1 | 2;
  admin: boolean;
  muted: boolean;
  move: MoveState;
  commands: CommandQueue;
  legacyInput: { dx: number; dz: number; at: number };
  coins: number;
  inventory: Catch[];
  stats: Stats;
  // The reel numbers this player's tackle earns; refreshed when gear is bought.
  mods: ReelMods;
  lastChat: number;
  emote: string;
  emoteUntil: number;
  emoteStarted: number;
  casts: number;
  fishing: Fishing | null;
  // The pickup game this player is in the middle of, if any.
  run: SoloRun | null;
  lastGameStart: number;
  // Set when a client still speaks the old `sort` message, so its events are mirrored.
  legacySort: boolean;
  // Strokes per second on the drawing boards.
  boardRate: { at: number; count: number };
  ws: WebSocket;
  budget: number;
  budgetAt: number;
};
let nextSession = 1;
export function createPlayer(
  base: Pick<Player, 'id' | 'name' | 'color' | 'appearance' | 'protocol' | 'admin' | 'muted' | 'coins' | 'inventory' | 'stats' | 'ws'>,
  x: number,
  z: number,
): Player {
  return {
    ...base,
    n: nextSession++,
    move: createMoveState(x, z, Math.PI),
    mods: reelModifiers(base.stats.owned),
    commands: new CommandQueue(),
    legacyInput: { dx: 0, dz: 0, at: 0 },
    lastChat: 0,
    emote: '',
    emoteUntil: 0,
    emoteStarted: 0,
    casts: 0,
    fishing: null,
    run: null,
    lastGameStart: 0,
    legacySort: false,
    boardRate: { at: 0, count: 0 },
    budget: 0,
    budgetAt: Date.now(),
  };
}
