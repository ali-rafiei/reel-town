import { walkable } from '../../packages/shared/layout.js';
import { dayKey } from '../../packages/shared/activities.js';
export { dayKey };
// A collectible harbour pin appears at one of a few spots each day; finding it once a day pays a little gold.
export const PIN = { reward: 15, radius: 1.2 };
export const PIN_SPOTS = [
  { x: -12, z: -9.5 }, // the tip of the pond dock
  { x: -7, z: -14 }, // the orchard
  { x: 7.5, z: -16.5 }, // the picnic clearing
  { x: 23.5, z: -0.8 }, // the tide pools
  { x: 16, z: -11.3 }, // the lookout
  { x: -17.5, z: -2 }, // behind the house, inside the garden fence
];
export function pinForDay(now: number) {
  const day = Math.floor(now / 86400000);
  const spot = PIN_SPOTS[day % PIN_SPOTS.length];
  return { x: spot.x, z: spot.z, day: dayKey(now) };
}
export function pinSpotsWalkable() {
  return PIN_SPOTS.every((s) => walkable(s.x, s.z));
}
