import type { ComponentType } from 'react';
import type { GameEnd, GameId, GameStart, GameUpdate } from '../../packages/shared/games';
import { LANDMARKS } from '../../packages/shared/landmarks';
import type { Landmark } from '../../packages/shared/layout';
import type { IconName } from '../ui/icons';
import { SortingGame } from './Sorting';
import { OrchardGame } from './Orchard';
import { TidepoolGame } from './Tidepool';
import { SignalsGame } from './Signals';
import { BuoyGame } from './Buoy';
// What a game component receives: the start payload, the clock offset, a way to send
// inputs, and a subscription to authoritative updates that bypasses React state.
export type GameProps = {
  run: GameStart;
  serverOffset: number;
  onInput: (payload: Record<string, unknown>) => void;
  subscribe: (fn: (update: GameUpdate) => void) => () => void;
};
export type GameDef = {
  id: GameId;
  title: string;
  icon: IconName;
  landmark: Landmark;
  // Short names for prompts and buttons: "Sort the catch · play a round", "Walk to the crates to play".
  prompt: string;
  place: string;
  startLabel?: string;
  quitLabel?: string;
  wide?: boolean;
  // Whether the player can still walk and fish while the run is on.
  free?: boolean;
  blurb: string;
  instructions: (coarse: boolean) => string[];
  resultLine?: (end: GameEnd) => string;
  component: ComponentType<GameProps>;
};
const n = (v: unknown) => (typeof v === 'number' ? v : 0);
export const GAMES: GameDef[] = [
  {
    id: 'sorting',
    title: 'Sort the catch',
    icon: 'box',
    landmark: LANDMARKS.sorting,
    prompt: 'Sort the catch · play a round',
    place: 'crates',
    startLabel: 'Start sorting',
    wide: true,
    blurb: 'Throw each fish into the crate for its rarity before it falls off the belt.',
    instructions: (coarse) => [
      'The flash shows the rarity: green, blue, purple, gold.',
      `${coarse ? 'Tap a crate' : 'Press 1 to 4'} to throw. Fast throws and streaks score more.`,
      '90 seconds. The belt speeds up.',
    ],
    resultLine: (end) => `${n(end.correct)} sorted · ${n(end.wrong)} wrong · ${n(end.missed)} missed.`,
    component: SortingGame,
  },
  {
    id: 'orchard',
    title: 'Orchard catch',
    icon: 'sparkle',
    landmark: LANDMARKS.orchard,
    prompt: 'Orchard catch · play a round',
    place: 'orchard',
    startLabel: 'Grab a basket',
    wide: true,
    blurb: 'Catch the falling fruit. Let the rotten ones drop.',
    instructions: (coarse) => [
      coarse ? 'Drag left and right to move the basket.' : 'A and D, or the arrow keys, move the basket.',
      'Streaks score more. Fruit falls faster over time.',
      'Brown fruit is rotten: catching it costs points.',
    ],
    resultLine: (end) => `${n(end.caught)} caught · ${n(end.missed)} missed · ${n(end.rottenCaught)} rotten.`,
    component: OrchardGame,
  },
  {
    id: 'tidepool',
    title: 'Tidepool tidy',
    icon: 'shell',
    landmark: LANDMARKS.tidepool,
    prompt: 'Tidepool tidy · clean up',
    place: 'tide pools',
    startLabel: 'Start tidying',
    wide: true,
    blurb: 'Sort the litter into bins. Leave the creatures alone.',
    instructions: (coarse) => [
      `${coarse ? 'Tap a bin' : 'Press 1 to 3'}: plastic, metal, paper.`,
      'Binning a shell, crab or starfish costs points.',
      '60 seconds. The water speeds up.',
    ],
    resultLine: (end) => `${n(end.correct)} sorted · ${n(end.wrong)} wrong · ${n(end.missed)} missed · ${n(end.spared)} creatures spared.`,
    component: TidepoolGame,
  },
  {
    id: 'signals',
    title: 'Lighthouse signals',
    icon: 'lamp',
    landmark: LANDMARKS.signals,
    prompt: 'Lighthouse signals · read the lamps',
    place: 'lighthouse door',
    startLabel: 'Light the lamps',
    blurb: 'Watch the lamps, then repeat the sequence. Each round adds one.',
    instructions: (coarse) => [
      'Watch the four lamps flash in order.',
      `${coarse ? 'Tap the lamps' : 'Press 1 to 4'} in the same order.`,
      'Three mistakes end the run. Round 10 earns the headphones.',
    ],
    resultLine: (end) => `${n(end.rounds)} rounds read.`,
    component: SignalsGame,
  },
  {
    id: 'buoy',
    title: 'Buoy run',
    icon: 'boat',
    landmark: LANDMARKS.buoy,
    prompt: 'Buoy run · take the rowboat',
    place: 'rowboat',
    startLabel: 'Push off',
    quitLabel: 'Row back to the dock',
    free: true,
    blurb: 'Row round the eight buoys against the clock.',
    instructions: (coarse) => [
      `${coarse ? 'Steer with the joystick' : 'Steer with WASD'}. The beam of light marks the next buoy.`,
      'Under 90 seconds earns the bandana.',
    ],
    resultLine: (end) => (n(end.timeMs) > 0 ? `Finished in ${(n(end.timeMs) / 1000).toFixed(1)} seconds.` : `${n(end.checkpoints)} of ${n(end.total)} buoys.`),
    component: BuoyGame,
  },
];
export const gameById = (id: GameId) => GAMES.find((g) => g.id === id);
