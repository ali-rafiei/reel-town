import type { CSSProperties } from 'react';
import { art } from '../../client/art';
// Icons: painted sprites from the art pack where one exists, and a 24px line glyph for
// the plain controls (close, check, arrow, copy) and as the fallback.
const paths: Record<string, string> = {
  fish: 'M3 12c3-4 7-6 11-6 3 0 5 1 7 3l-3 3 3 3c-2 2-4 3-7 3-4 0-8-2-11-6Zm0 0-3-4v8l3-4Zm13-1.5a1 1 0 1 0 0 .01',
  coin: 'M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18Zm0 3.5v1m0 9v1M9.5 14c.4 1 1.4 1.5 2.6 1.5 1.5 0 2.4-.7 2.4-1.7 0-2.6-4.8-1.4-4.8-4 0-1 .9-1.7 2.3-1.7 1.1 0 2 .5 2.4 1.3',
  chat: 'M4 5h16v11H9l-5 4V5Z',
  hanger: 'M12 4a2 2 0 0 1 2 2c0 1-1 1.5-2 2v2l9 5v3H3v-3l9-5V8',
  box: 'M3 8l9-4 9 4v9l-9 4-9-4V8Zm9 4 9-4M12 12v9m0-9L3 8',
  gear: 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 1 0 0-7Zm7.4 3.5-1.9-.7-.5-1.6 1-1.7-1.7-1.7-1.7 1-1.6-.5L12.3 5h-2.6l-.7 1.9-1.6.5-1.7-1L4 8.1l1 1.7-.5 1.6-1.9.6v2.5l1.9.7.5 1.6-1 1.7 1.7 1.7 1.7-1 1.6.5.7 1.9h2.6l.7-1.9 1.6-.5 1.7 1 1.7-1.7-1-1.7.5-1.6 1.9-.7V12Z',
  wave: 'M7 11V6.5a1.5 1.5 0 0 1 3 0V11m0-6a1.5 1.5 0 0 1 3 0v6m0-4.5a1.5 1.5 0 0 1 3 0V12m-9-1V9a1.5 1.5 0 0 0-3 0v5c0 4 2.5 7 6.5 7s6.5-3 6.5-7v-2.5a1.5 1.5 0 0 0-3 0',
  heart: 'M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.5-7 10-7 10Z',
  music: 'M9 18a2.5 2.5 0 1 1-5 0 2.5 2.5 0 1 1 5 0Zm11-3a2.5 2.5 0 1 1-5 0 2.5 2.5 0 1 1 5 0ZM9 18V5l11-2v12',
  chair: 'M6 13V5h12v8M4 13h16v3H4v-3Zm2 3v4m12-4v4',
  target: 'M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18Zm0 4a5 5 0 1 0 0 10 5 5 0 1 0 0-10Zm0 4a1 1 0 1 0 0 2 1 1 0 1 0 0-2Z',
  rod: 'M4 20 18 4m0 0 2 2M9 15c3 1 5 3 6 6m-9-1a2 2 0 1 0 0-4 2 2 0 1 0 0 4Z',
  hook: 'M12 3v10a4 4 0 0 0 8 0v-1m-8-9h3M4 13l2-2 2 2',
  close: 'M6 6l12 12M18 6 6 18',
  check: 'M4 12l5 5L20 7',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 1 0 0-18Zm0 5v1m0 3v5',
  alert: 'M12 3 2 21h20L12 3Zm0 7v5m0 3v.5',
  sun: 'M12 7a5 5 0 1 0 0 10 5 5 0 1 0 0-10Zm0-5v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5',
  moon: 'M20 14A8 8 0 1 1 10 4a6 6 0 0 0 10 10Z',
  cloud: 'M7 18a4 4 0 0 1-.5-8A6 6 0 0 1 18 9a4 4 0 0 1 0 9H7Z',
  rain: 'M7 14a4 4 0 0 1-.5-8A6 6 0 0 1 18 5a4 4 0 0 1 0 9H7Zm1 3-1 3m5-3-1 3m5-3-1 3',
  fog: 'M4 10h16M4 14h12M8 18h12M7 6a5 5 0 0 1 9 0',
  users: 'M9 12a3.5 3.5 0 1 0 0-7 3.5 3.5 0 1 0 0 7Zm7 0a3 3 0 1 0 0-6 3 3 0 1 0 0 6ZM3 20c0-3 3-5 6-5s6 2 6 5m2-5c2.5 0 4 1.7 4 4',
  copy: 'M9 9h10v11H9V9Zm-4 6V4h10',
  star: 'M12 3l2.7 5.7 6.3.8-4.6 4.3 1.2 6.2L12 17l-5.6 3 1.2-6.2L3 9.5l6.3-.8L12 3Z',
  trophy: 'M7 4h10v5a5 5 0 0 1-10 0V4Zm10 1h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3m5 4v3m-4 3h8',
  ruler: 'M3 16 16 3l5 5L8 21l-5-5Zm5-5 2 2m1-5 2 2m1-5 2 2',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  shop: 'M4 9h16l-1 11H5L4 9Zm0 0 2-5h12l2 5M9 13v3m6-3v3',
  joystick: 'M12 3v9m0 0a3 3 0 0 1 3 3v2H9v-2a3 3 0 0 1 3-3Zm-7 9 3-3m11 3-3-3M6 20h12',
  eye: 'M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12Zm10-3a3 3 0 1 0 0 6 3 3 0 1 0 0-6Z',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Zm7 12 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z',
  pixel: 'M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z',
  hourglass: 'M6 3h12M6 21h12M8 3v4l4 5 4-5V3M8 21v-4l4-5 4 5v4',
  key: 'M14 3a6 6 0 0 0-5.7 8L3 16.3V21h4.7l1-1v-2h2l1-1v-2h2l1.3-1.3A6 6 0 1 0 14 3Zm2 4a1 1 0 1 0 0 2 1 1 0 1 0 0-2Z',
  bottle: 'M10 2h4v4l2 3v11a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V9l2-3V2Zm-2 9h8',
  can: 'M6 5h12v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5Zm0 0a6 2 0 0 0 12 0M6 9h12',
  paper: 'M5 3h10l4 4v14H5V3Zm10 0v4h4M8 11h8M8 15h8M8 19h5',
  shell: 'M12 20c-5 0-8-3-8-7a8 8 0 0 1 16 0c0 4-3 7-8 7Zm0 0V6m-5 3 5 11m5-11-5 11',
  crab: 'M8 13a4 4 0 1 1 8 0 4 4 0 0 1-8 0Zm-2 0-3-2m3 5-3 1m14-4 3-2m-3 5 3 1M9 8 7 4m8 4 2-4',
  boat: 'M3 15h18l-2 4H5l-2-4Zm9-11v11m0-11c3 2 5 5 5 8H12',
  lamp: 'M9 3h6l2 6H7l2-6Zm-3 6h12v3H6V9Zm4 3v6h4v-6M8 21h8',
  grid: 'M4 4h16v16H4V4Zm5.3 0v16m5.4-16v16M4 9.3h16M4 14.7h16',
  // The harbour cat from the app icon: ears, a wide face and a small smile.
  cat: 'M5 4l4 5h6l4-5 1.5 7L21 15l-4 6H7l-4-6 1.5-4Zm4 9.5h1m5 0h1M10 17q2 1.5 4 0',
  rps: 'M6 6a3.5 3.5 0 1 0 0 7 3.5 3.5 0 1 0 0-7Zm8-2h6v7h-6V4Zm-1 11 7 6m0-6-7 6',
};
const painted: Partial<Record<keyof typeof paths, string>> = {
  fish: 'fish',
  coin: 'gold-coin',
  chat: 'speech-bubble',
  hanger: 'clothes-hanger',
  box: 'wooden-tackle-box',
  gear: 'cog-gear',
  wave: 'waving-hand',
  heart: 'heart',
  music: 'music-note',
  chair: 'wooden-chair',
  target: 'archery-target',
  rod: 'fishing-rod',
  hook: 'fish-hook',
  info: 'info',
  alert: 'warning-triangle',
  sun: 'sun',
  moon: 'crescent-moon',
  cloud: 'cloud',
  rain: 'rain-cloud',
  fog: 'fog-wisps',
  users: 'players',
  star: 'star',
  trophy: 'trophy-cup',
  ruler: 'ruler',
  shop: 'shop-storefront',
  joystick: 'joystick',
  eye: 'eye',
  sparkle: 'four-point-sparkle',
  pixel: 'pixel-paint-brush',
  hourglass: 'hourglass',
  key: 'brass-key',
  bottle: 'plastic-bottle',
  can: 'tin-can',
  paper: 'folded-newspaper',
  shell: 'seashell',
  crab: 'crab',
  boat: 'rowboat',
  lamp: 'lighthouse-lamp',
  grid: 'grid-dots',
  cat: 'tabby-cat-face',
  rps: 'rock-paper-scissors',
};
export type IconName = keyof typeof paths;
export function Icon({ name, style, className }: { name: IconName; style?: CSSProperties; className?: string }) {
  const sprite = painted[name];
  if (sprite) {
    // oxlint-disable-next-line next/no-img-element -- static sprite, no optimisation pipeline
    return <img className={className ? `icon ${className}` : 'icon'} src={art('ui-icons', sprite)} alt="" draggable={false} style={style} aria-hidden="true" />;
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" style={style} className={className}>
      <path d={paths[name]} />
    </svg>
  );
}
export function weatherIcon(weather: string, night: boolean): IconName {
  if (weather === 'rain') return 'rain';
  if (weather === 'fog') return 'fog';
  if (weather === 'cloudy') return 'cloud';
  return night ? 'moon' : 'sun';
}
