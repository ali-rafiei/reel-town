import { PIER, SHORE, onIsland, onPier } from './layout.js';
export const profiles = {
  small: { cap: 12, hz: 10 },
  standard: { cap: 60, hz: 20 },
};
export const colors = ['#eea373', '#91b6cf', '#a8be75', '#cc9dcb', '#ebcd75', '#87c4aa'];
export type Rarity = 'Common' | 'Uncommon' | 'Rare' | 'Legendary';
// How a fish moves on the reel track (Stardew-style personalities).
export type Behavior = 'mixed' | 'smooth' | 'dart' | 'sinker' | 'floater';
export type FishSpecies = { name: string; rarity: Rarity; difficulty: number; price: number; weight: number; behavior: Behavior; habitat: string };
const tier = (names: string[], rarity: Rarity, difficulty: number, price: (i: number) => number, weight: number, behaviors: Behavior[], habitats: string[]): FishSpecies[] =>
  names.map((name, i) => ({ name, rarity, difficulty, price: price(i), weight, behavior: behaviors[i % behaviors.length], habitat: habitats[i % habitats.length] }));
export const fishCatalog: FishSpecies[] = [
  ...tier(
    ['Sock Eel', 'Marshmallow Carp', 'Button Bass', 'Pebble Perch', 'Moon Minnow', 'Teacup Trout', 'Puddle Guppy', 'Acorn Anchovy', 'Daisy Dace', 'Bubble Bream'],
    'Common',
    0,
    (i) => 12 + i * 3,
    12,
    ['smooth', 'mixed', 'smooth', 'floater', 'smooth', 'mixed', 'sinker', 'smooth', 'mixed', 'floater'],
    ['Any time', 'Any time', 'Daytime', 'Any time', 'Night', 'Any time', 'Rainy days', 'Any time', 'Daytime', 'Any time'],
  ),
  ...tier(
    ['Lantern Gar', 'Grumpfish', 'Ribbon Ray', 'Sunbeam Snapper', 'Coral Koi', 'Velvet Catfish', 'Honey Haddock', 'Emerald Tetra'],
    'Uncommon',
    1,
    (i) => 50 + i * 8,
    6,
    ['mixed', 'sinker', 'floater', 'mixed', 'smooth', 'sinker', 'mixed', 'dart'],
    ['Night', 'Rainy days', 'Any time', 'Daytime', 'Any time', 'Foggy mornings', 'Daytime', 'Any time'],
  ),
  ...tier(
    ['Starlight Salmon', 'Sapphire Sturgeon', 'Glassfin Grouper', 'Thunder Tuna', 'Orchid Octopus', 'Silver Sailfish', 'Aurora Angler'],
    'Rare',
    2,
    (i) => 130 + i * 25,
    3,
    ['dart', 'sinker', 'mixed', 'dart', 'sinker', 'dart', 'floater'],
    ['Night', 'Far casts', 'Foggy mornings', 'Rainy days', 'Far casts', 'Daytime', 'Night'],
  ),
  ...tier(
    ['Crown Coelacanth', 'Comet Marlin', 'Opal Oarfish', 'Golden Dragonfish', 'Midnight Leviathan'],
    'Legendary',
    3,
    (i) => 400 + i * 150,
    1,
    ['sinker', 'dart', 'mixed', 'dart', 'sinker'],
    ['Far casts', 'Far casts', 'Foggy mornings', 'Daytime', 'Night'],
  ),
];
export const fishNames = fishCatalog.map((f) => f.name);
export const TOTAL_WEIGHT = fishCatalog.reduce((a, f) => a + f.weight, 0); // 194
export const rarityColors: Record<Rarity, string> = { Common: '#7fa36b', Uncommon: '#4f8fc7', Rare: '#9b6bcc', Legendary: '#e0a93a' };
export const DIFFICULTY_NAMES = ['Gentle', 'Lively', 'Tricky', 'Challenging'];
export function fishForSeed(seed: number) {
  let roll = ((seed % TOTAL_WEIGHT) + TOTAL_WEIGHT) % TOTAL_WEIGHT;
  for (const fish of fishCatalog) {
    roll -= fish.weight;
    if (roll < 0) return fish;
  }
  return fishCatalog[0];
}
export function fishIndex(seed: number) {
  return fishCatalog.indexOf(fishForSeed(seed));
}
// Tackle bought at the Bait Shop changes how the reel behaves; the server and the client
// apply the same numbers, so what the player sees is still what scores.
export type ReelMods = { halfWidth: number; gainScale: number; lossScale: number };
export const NO_MODS: ReelMods = { halfWidth: 0, gainScale: 1, lossScale: 1 };
// The legendary bar was a quarter of the track and drained fastest of all; it is a little
// wider and a little kinder now, so the top tier is hard rather than unfair.
export function catchHalfWidth(seed: number, mods: ReelMods = NO_MODS) {
  return [0.2, 0.175, 0.15, 0.14][fishForSeed(seed).difficulty] + mods.halfWidth;
}
export type CastContext = { weather: string; night: boolean; power: number; lucky?: boolean };
// Bounded spawn weights: weather, time of day and cast distance nudge rarer fish without ever guaranteeing them.
export const RARITY_CAP: Record<Rarity, number> = { Common: 1, Uncommon: 1.8, Rare: 2.2, Legendary: 2.5 };
// A lucky bait is a one-cast consumable, so it may push past the everyday cap, but never
// far enough that a legendary becomes the expected outcome.
export const RARITY_CAP_LUCKY: Record<Rarity, number> = { Common: 1, Uncommon: 1.8, Rare: 3, Legendary: 5.5 };
export function fishWeights(context: CastContext) {
  const caps = context.lucky ? RARITY_CAP_LUCKY : RARITY_CAP;
  return fishCatalog.map((fish) => {
    let m = 1;
    if (context.lucky && fish.rarity === 'Legendary') m *= 2.2;
    if (context.lucky && fish.rarity === 'Rare') m *= 1.3;
    if (context.weather === 'rain' && (fish.rarity === 'Uncommon' || fish.rarity === 'Rare')) m *= 1.4;
    if (context.weather === 'fog' && fish.rarity === 'Rare') m *= 1.3;
    if (context.weather === 'fog' && fish.rarity === 'Legendary') m *= 1.5;
    if (context.night && fish.rarity === 'Legendary') m *= 1.6;
    if (context.night && fish.rarity === 'Rare') m *= 1.2;
    if (context.power > 0.7) {
      if (fish.rarity === 'Common') m *= 0.7;
      if (fish.rarity === 'Rare') m *= 1.3;
      if (fish.rarity === 'Legendary') m *= 1.4;
    }
    if (fish.habitat === 'Rainy days' && context.weather === 'rain') m *= 1.5;
    if (fish.habitat === 'Night' && context.night) m *= 1.4;
    if (fish.habitat === 'Daytime' && !context.night) m *= 1.15;
    if (fish.habitat === 'Foggy mornings' && context.weather === 'fog') m *= 1.5;
    if (fish.habitat === 'Far casts' && context.power > 0.7) m *= 1.5;
    // The compound bonus is capped per rarity so ideal conditions never trivialise rare fish.
    return fish.weight * Math.max(0.7, Math.min(caps[fish.rarity], m));
  });
}
// Picks a species by weight, then returns a seed whose fishForSeed bucket is that species,
// so every seed-driven function (position, difficulty, price) stays consistent.
export function seedForContext(context: CastContext, random: () => number) {
  const weights = fishWeights(context);
  let roll = random() * weights.reduce((a, b) => a + b, 0);
  let index = 0;
  for (; index < weights.length - 1; index++) {
    roll -= weights[index];
    if (roll < 0) break;
  }
  let bucketStart = 0;
  for (let i = 0; i < index; i++) bucketStart += fishCatalog[i].weight;
  const offset = Math.floor(random() * fishCatalog[index].weight);
  const cycle = Math.floor(random() * 500);
  return TOTAL_WEIGHT * cycle + bucketStart + offset + (cycle === 0 && bucketStart + offset === 0 ? TOTAL_WEIGHT : 0);
}
export function isNight(time: number) {
  return time < 0.17 || time > 0.83;
}
export const CAST = { minDistance: 3.5, maxDistance: 12, maxAim: 0.75, chargeSeconds: 1.6 };
export function castDistance(power: number) {
  const p = Math.max(0, Math.min(1, power));
  return CAST.minDistance + p * (CAST.maxDistance - CAST.minDistance);
}
// Landing point of a cast from (x, z): sideways off the pier, or forward from the pier end.
// Anyone standing on the crossbar casts out to sea; from the stem the line goes over the side.
export function castLanding(x: number, z: number, power: number, aim: number, forward = z >= PIER.crossStart - 0.4) {
  const side = x < 0 ? -1 : 1;
  let dirX = forward ? 0 : side * 0.92,
    dirZ = forward ? 1 : 0.4;
  const length = Math.hypot(dirX, dirZ);
  dirX /= length;
  dirZ /= length;
  const a = Math.max(-CAST.maxAim, Math.min(CAST.maxAim, aim || 0));
  const rx = dirX * Math.cos(a) + dirZ * Math.sin(a),
    rz = -dirX * Math.sin(a) + dirZ * Math.cos(a);
  for (let d = castDistance(power); d <= SHORE.maxRadius; d += 0.5) {
    const px = x + rx * d,
      pz = z + rz * d;
    if (!onIsland(px, pz) && !onPier(px, pz)) return { x: px, z: pz };
  }
  // Nothing clear along the aim: drop the line in the open water past the pier head.
  return { x, z: PIER.end + 1.5 };
}
export { walk } from './movement.js';
const clamp = (v: number) => Math.max(0.07, Math.min(0.93, v));
// Where the fish would be on the track if it had been swimming since the hook.
function fishPath(seed: number, t: number) {
  const fish = fishForSeed(seed);
  t *= [0.72, 0.95, 1.2, 1.35][fish.difficulty];
  const wobble = 0.31 * Math.sin(t * (1.1 + (seed % 5) * 0.11) + seed) + 0.12 * Math.sin(t * 2.7 + seed);
  switch (fish.behavior) {
    case 'smooth':
      return clamp(0.5 + 0.36 * Math.sin(t * (0.85 + (seed % 5) * 0.08) + seed));
    case 'dart':
      return clamp(0.5 + wobble * 0.6 + 0.2 * Math.tanh(4 * Math.sin(t * 1.9 + seed * 0.7)));
    case 'sinker':
      return clamp(0.3 + 0.2 * Math.sin(t * (1 + (seed % 3) * 0.1) + seed) + 0.08 * Math.sin(t * 2.3 + seed) + Math.max(0, Math.sin(t * 0.5 + seed)) * 0.25);
    case 'floater':
      return clamp(0.7 + 0.2 * Math.sin(t * (1 + (seed % 3) * 0.1) + seed) + 0.08 * Math.sin(t * 2.3 + seed) - Math.max(0, Math.sin(t * 0.5 + seed)) * 0.25);
    default:
      return clamp(0.5 + wobble);
  }
}
// Reel tuning. The hit test is shared by server and client so what the player sees is what scores.
export const REEL = {
  startProgress: 0.3,
  // The fish sits dead centre for this long after the hook, then eases onto its path,
  // so every reel opens the same way and the player has a moment to find the button.
  holdSeconds: 0.5,
  settleSeconds: 0.6,
  // The line settles before the catch counts as perfect, so the hold and the trip to the
  // server and back at the moment of the hook cannot cost a player their bonus.
  perfectGrace: 0.8,
  // Visual tolerance: the fish icon has height, so a touch counts as inside.
  margin: 0.03,
  gain: [0.15, 0.135, 0.12, 0.105],
  loss: [0.14, 0.17, 0.2, 0.21],
  lift: 1.5,
  sink: -1.25,
  maxVelocity: 0.65,
};
const smoothstep = (k: number) => {
  const v = Math.max(0, Math.min(1, k));
  return v * v * (3 - 2 * v);
};
// The fish on the track: centred and still for the hold, then blended onto its own path.
export function fishPosition(seed: number, t: number) {
  if (t <= REEL.holdSeconds) return 0.5;
  const since = t - REEL.holdSeconds;
  return clamp(0.5 + (fishPath(seed, since) - 0.5) * smoothstep(since / REEL.settleSeconds));
}
export function reelInside(seed: number, fishY: number, bar: number, mods: ReelMods = NO_MODS) {
  return Math.abs(fishY - bar) < catchHalfWidth(seed, mods) + REEL.margin;
}
// The bar opens on the fish, which opens on the centre of the track.
export function startingBar(seed: number) {
  return fishPosition(seed, 0);
}
export function reelStep(s: { bar: number; velocity: number; progress: number; perfect: boolean }, held: boolean, seed: number, t: number, dt: number, mods: ReelMods = NO_MODS) {
  s.velocity = Math.max(-REEL.maxVelocity, Math.min(REEL.maxVelocity, s.velocity + (held ? REEL.lift : REEL.sink) * dt));
  s.bar += s.velocity * dt;
  const half = catchHalfWidth(seed, mods);
  if (s.bar < half) {
    s.bar = half;
    s.velocity = Math.abs(s.velocity) * 0.22;
  }
  if (s.bar > 1 - half) {
    s.bar = 1 - half;
    s.velocity = -Math.abs(s.velocity) * 0.22;
  }
  const fish = fishForSeed(seed);
  const inside = reelInside(seed, fishPosition(seed, t), s.bar, mods);
  s.progress = Math.max(0, Math.min(1, s.progress + (inside ? REEL.gain[fish.difficulty] * mods.gainScale : -REEL.loss[fish.difficulty] * mods.lossScale) * dt));
  if (t > REEL.perfectGrace) s.perfect = s.perfect && inside;
  return s;
}
