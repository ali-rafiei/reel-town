import type { GameId } from '../../../packages/shared/games.js';
import { LANDMARKS } from '../../../packages/shared/landmarks.js';
import { BOAT_SPAWN, type Landmark } from '../../../packages/shared/layout.js';
import type { Player } from '../player.js';
import { BuoyRun } from './buoy.js';
import { OrchardRun } from './orchard.js';
import { SignalsRun } from './signals.js';
import type { SoloRun } from './solo.js';
import { SortingRun } from './sorting.js';
import { TidepoolRun } from './tidepool.js';
// What the dispatcher needs to know about each solo game: where it starts, how long the
// countdown is, what to say when someone tries from the wrong place, whether the player
// stands still while playing, and how to make a run.
export type ServerGameDef = {
  landmark: Landmark;
  countdownMs: number;
  refusal: string;
  freeze: boolean;
  // The Buoy Run can be restarted from the water without rowing back first.
  allowRestart?: boolean;
  create: (runId: number, seed: number, startAt: number) => SoloRun;
  onStart?: (p: Player) => void;
  onSettle?: (p: Player) => void;
};
// Into the boat: a fresh rower beside the moored rowboat, line reeled in.
function boardBoat(p: Player) {
  p.fishing = null;
  p.emote = '';
  p.move.mode = 'boat';
  p.move.x = BOAT_SPAWN.x;
  p.move.z = BOAT_SPAWN.z;
  p.move.vx = 0;
  p.move.vz = 0;
  p.move.heading = BOAT_SPAWN.heading;
  p.commands.clear();
}
// Back on the planks beside the mooring.
function leaveBoat(p: Player) {
  p.move.mode = 'walk';
  p.move.x = LANDMARKS.buoy.x;
  p.move.z = LANDMARKS.buoy.z;
  p.move.vx = 0;
  p.move.vz = 0;
  p.move.heading = Math.PI;
  p.commands.clear();
}
export const SERVER_GAMES: Partial<Record<GameId, ServerGameDef>> = {
  sorting: { landmark: LANDMARKS.sorting, countdownMs: 1200, refusal: 'Play this at the crates by the pier.', freeze: true, create: (id, seed, at) => new SortingRun(id, seed, at) },
  orchard: { landmark: LANDMARKS.orchard, countdownMs: 1200, refusal: 'Play this in the orchard.', freeze: true, create: (id, seed, at) => new OrchardRun(id, seed, at) },
  tidepool: { landmark: LANDMARKS.tidepool, countdownMs: 1200, refusal: 'Play this at the tide pools.', freeze: true, create: (id, seed, at) => new TidepoolRun(id, seed, at) },
  signals: { landmark: LANDMARKS.signals, countdownMs: 1500, refusal: 'Play this at the lighthouse door.', freeze: true, create: (id, seed, at) => new SignalsRun(id, seed, at) },
  buoy: { landmark: LANDMARKS.buoy, countdownMs: 1000, refusal: 'Start from the rowboat by the pier.', freeze: false, allowRestart: true, create: (id, seed, at) => new BuoyRun(id, seed, at), onStart: boardBoat, onSettle: leaveBoat },
};
