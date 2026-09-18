// Dev tools. The name below only decides who may *claim* the role; once claimed it is
// bound to that player's recovery-code identity, so nobody can take it by typing a name.
export const ADMIN_NAMES = ['ali'];
export const WEATHERS = ['clear', 'cloudy', 'rain', 'fog'] as const;
export type Weather = (typeof WEATHERS)[number];
export type AdminCommand =
  | { action: 'time'; value: number | null }
  | { action: 'weather'; value: Weather | null }
  | { action: 'mute'; target: number; value: boolean }
  | { action: 'kick'; target: number }
  | { action: 'ban'; target: number }
  | { action: 'unban'; id: string };
export type AdminState = {
  time: number | null;
  weather: Weather | null;
  banned: Array<{ id: string; name: string }>;
};
export function claimsAdmin(name: unknown) {
  return typeof name === 'string' && ADMIN_NAMES.includes(name.trim().toLowerCase());
}
const session = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v > 0 && v < 2 ** 31;
// Every field an admin can send is validated here, so a forged message cannot reach the world.
export function parseAdminCommand(m: Record<string, unknown>): AdminCommand | null {
  switch (m.action) {
    case 'time':
      if (m.value === null) return { action: 'time', value: null };
      return typeof m.value === 'number' && Number.isFinite(m.value) && m.value >= 0 && m.value <= 1 ? { action: 'time', value: m.value } : null;
    case 'weather':
      if (m.value === null) return { action: 'weather', value: null };
      return WEATHERS.includes(m.value as Weather) ? { action: 'weather', value: m.value as Weather } : null;
    case 'mute':
      return session(m.target) && typeof m.value === 'boolean' ? { action: 'mute', target: m.target as number, value: m.value } : null;
    case 'kick':
      return session(m.target) ? { action: 'kick', target: m.target as number } : null;
    case 'ban':
      return session(m.target) ? { action: 'ban', target: m.target as number } : null;
    case 'unban':
      return typeof m.id === 'string' && /^[a-f0-9]{64}$/.test(m.id) ? { action: 'unban', id: m.id } : null;
    default:
      return null;
  }
}
// Names the clock: used by the dev panel and by anyone describing the sky.
export function timeOfDayLabel(time: number) {
  if (time < 0.17 || time >= 0.86) return 'Night';
  if (time < 0.28) return 'Dawn';
  if (time < 0.45) return 'Morning';
  if (time < 0.58) return 'Midday';
  if (time < 0.75) return 'Afternoon';
  return 'Sunset';
}
