'use client';
import { Panel } from './primitives';
import { Icon, type IconName } from './icons';
// Everything a new player needs, behind the ? button instead of on-screen text.
export function Help({ onClose, coarse }: { onClose: () => void; coarse: boolean }) {
  const rows: Array<[IconName, string, string]> = coarse
    ? [
        ['joystick', 'Wander', 'Drag the joystick to walk. Drag to look, pinch to zoom.'],
        ['rod', 'Fish', 'From the pier, hold Cast and let go. Tap at the “!”, then hold to keep the bar on the fish.'],
        ['shop', 'Sell', 'Sell fish and buy tackle at the red-roofed Bait Shop.'],
        ['hanger', 'Dress up', 'Hats and clothes are at Threads, the purple shop.'],
        ['target', 'Contest', 'Casting contest at the bullseye sign: closest of three wins.'],
        ['box', 'Sort the catch', 'Games have signs: crates, orchard, tide pools, lighthouse, picnic table, podium, rowboat.'],
        ['sparkle', 'Harbor pin', 'A golden star hides on the island each day.'],
        ['star', 'Around the island', 'Find shells, water the garden, pet the dog. Daily challenges are on the notice board.'],
        ['wave', 'Say hi', 'Emotes and chat are at the bottom. Sit on benches, draw on the plaza boards.'],
      ]
    : [
        ['joystick', 'Wander', 'WASD to walk. Right-drag to look, scroll to zoom.'],
        ['rod', 'Fish', 'From the pier, hold Space and release. Space at the “!”, then hold to keep the bar on the fish.'],
        ['shop', 'Sell', 'Sell fish and buy tackle at the red-roofed Bait Shop.'],
        ['hanger', 'Dress up', 'Hats and clothes are at Threads, the purple shop.'],
        ['target', 'Contest', 'Casting contest at the bullseye sign: closest of three wins.'],
        ['box', 'Sort the catch', 'Games have signs: crates, orchard, tide pools, lighthouse, picnic table, podium, rowboat.'],
        ['sparkle', 'Harbor pin', 'A golden star hides on the island each day.'],
        ['star', 'Around the island', 'Find shells, water the garden, pet the dog. Daily challenges are on the notice board.'],
        ['wave', 'Say hi', 'Enter: chat. 1–4: emotes. E: interact. I: tackle box. Esc: close.'],
      ];
  return (
    <Panel title="How to play" icon="info" onClose={onClose} className="help">
      <ul className="helplist">
        {rows.map(([icon, title, text]) => (
          <li key={title}>
            <Icon name={icon} />
            <div>
              <b>{title}</b>
              <span>{text}</span>
            </div>
          </li>
        ))}
      </ul>
      <p className="muted">Rarer fish bite at night, in rain or fog, and on far casts. Perfect catches sell for double.</p>
      <p className="muted">On foggy days the lighthouse burns day and night, and the fog thins for a moment each time its beam sweeps over you.</p>
    </Panel>
  );
}
