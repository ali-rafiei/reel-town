'use client';
import { Button, Panel, Segmented } from './primitives';
import { Icon } from './icons';
import { WEATHERS, timeOfDayLabel, type AdminState, type Weather } from '../../packages/shared/admin';
export type DevPlayer = { n: number; name: string; muted: boolean };
// Only rendered for the player holding the dev role; every action is re-checked on the server.
export function DevPanel({
  state,
  players,
  selfN,
  onCommand,
  onClose,
}: {
  state: AdminState;
  players: DevPlayer[];
  selfN: number;
  onCommand: (command: Record<string, unknown>) => void;
  onClose: () => void;
}) {
  const time = state.time;
  return (
    <Panel title="Dockkeeper tools" icon="key" onClose={onClose} className="dev">
      <h3 className="sub">Time of day</h3>
      <div className="devrow">
        <input
          type="range"
          min={0}
          max={1}
          step={0.005}
          value={time ?? 0.5}
          aria-label="Time of day"
          onChange={(e) => onCommand({ action: 'time', value: Number(e.target.value) })}
        />
        <span className="devvalue">{time === null ? 'Following the clock' : `${timeOfDayLabel(time)} · ${Math.round(time * 24)}:00`}</span>
      </div>
      <div className="devrow">
        {(
          [
            ['Dawn', 0.22],
            ['Midday', 0.5],
            ['Sunset', 0.8],
            ['Night', 0.95],
          ] as Array<[string, number]>
        ).map(([label, value]) => (
          <Button key={label} onClick={() => onCommand({ action: 'time', value })}>
            {label}
          </Button>
        ))}
        <Button tone={time === null ? 'teal' : undefined} onClick={() => onCommand({ action: 'time', value: null })}>
          Auto
        </Button>
      </div>
      <h3 className="sub">Weather</h3>
      <Segmented
        label="Weather"
        value={(state.weather ?? 'auto') as Weather | 'auto'}
        options={[['auto', 'Auto'], ...WEATHERS.map((w) => [w, w[0].toUpperCase() + w.slice(1)] as [Weather, string])]}
        onChange={(value) => onCommand({ action: 'weather', value: value === 'auto' ? null : value })}
      />
      <h3 className="sub">Players</h3>
      <ul className="list">
        {players.map((player) => (
          <li className="row" key={player.n}>
            <span className="name">
              {player.name}
              {player.n === selfN && <span className="meta">that&apos;s you</span>}
              {player.muted && player.n !== selfN && <span className="meta">muted</span>}
            </span>
            {player.n !== selfN && (
              <span className="devactions">
                <Button onClick={() => onCommand({ action: 'mute', target: player.n, value: !player.muted })}>{player.muted ? 'Unmute' : 'Mute'}</Button>
                <Button onClick={() => onCommand({ action: 'kick', target: player.n })}>Kick</Button>
                <Button tone="primary" onClick={() => onCommand({ action: 'ban', target: player.n })}>
                  Ban
                </Button>
              </span>
            )}
          </li>
        ))}
      </ul>
      <h3 className="sub">Banned</h3>
      {state.banned.length === 0 ? (
        <p className="muted">Nobody is banned.</p>
      ) : (
        <ul className="list">
          {state.banned.map((entry) => (
            <li className="row" key={entry.id}>
              <span className="name">{entry.name}</span>
              <Button onClick={() => onCommand({ action: 'unban', id: entry.id })}>Unban</Button>
            </li>
          ))}
        </ul>
      )}
      <p className="muted" style={{ marginTop: 10 }}>
        <Icon name="info" style={{ width: 13, height: 13, verticalAlign: '-2px' }} /> These tools follow your recovery code, not your name. A ban locks that character and its gold out for good; like any guest, the person behind it can still start over as a brand new visitor.
      </p>
    </Panel>
  );
}
