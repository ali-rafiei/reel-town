'use client';
import { useEffect, useState } from 'react';
import { Button, Panel } from './primitives';
import { Icon } from './icons';
import type { ContestState } from '../../packages/shared/protocol';
export type ContestResult = { best: number; rank: number; gold: number; players: number };
export function ContestPanel({
  state,
  selfN,
  names,
  nearSign,
  joined,
  onJoin,
  onLeave,
  onClose,
  result,
  serverOffset,
}: {
  state: ContestState;
  selfN: number;
  names: (n: number) => string;
  nearSign: boolean;
  joined: boolean;
  onJoin: () => void;
  onLeave: () => void;
  onClose: () => void;
  result: ContestResult | null;
  serverOffset: number;
}) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((v) => v + 1), 250);
    return () => clearInterval(t);
  }, []);
  const remaining = state ? Math.max(0, Math.ceil((state.endsAt - (Date.now() + serverOffset)) / 1000)) : 0;
  const me = state?.players.find((p) => p[0] === selfN);
  const sorted = state ? [...state.players].sort((a, b) => b[1] - a[1]) : [];
  return (
    <Panel
      title="Casting contest"
      icon="target"
      onClose={onClose}
      className="contest"
      footer={
        !state || state.phase === 'lobby' ? (
          joined ? (
            <Button tone="ghost" onClick={onLeave}>
              Leave
            </Button>
          ) : (
            <Button tone="primary" icon="target" onClick={onJoin} disabled={!nearSign}>
              {nearSign ? 'Join the contest' : 'Walk to the sign to join'}
            </Button>
          )
        ) : undefined
      }
    >
      {result && (
        <div className="stat-grid">
          <div className="stat">
            <b>#{result.rank}</b>
            <span>of {result.players}</span>
          </div>
          <div className="stat">
            <b>{result.best}</b>
            <span>best cast</span>
          </div>
          <div className="stat">
            <b>+{result.gold}</b>
            <span>gold</span>
          </div>
        </div>
      )}
      {!state && (
        <>
          <p>A quick pickup game at the end of the pier. A target floats out on the water and everyone gets three casts.</p>
          <ol className="steps">
            <li>Join at the bullseye sign. Others have 15 seconds to join too.</li>
            <li>Hold the cast button to charge power, steer left or right to aim, release to cast.</li>
            <li>Closest to the bullseye scores 100. Best cast wins gold for everyone who played.</li>
          </ol>
          <p className="muted">Rewards are capped to a few rounds an hour, so it never beats honest fishing.</p>
        </>
      )}
      {state?.phase === 'lobby' && (
        <>
          <div className="countdown">
            {remaining}s<small>until the round starts</small>
          </div>
          <p>
            {state.players.length} {state.players.length === 1 ? 'player is' : 'players are'} in: {state.players.map((p) => names(p[0])).join(', ')}
          </p>
          {joined && <p className="muted">Stand near the end of the pier. Hold cast to charge, steer to aim, release to throw.</p>}
        </>
      )}
      {state?.phase === 'active' && (
        <>
          <div className="countdown">
            {remaining}s<small>{me ? `${3 - me[2]} cast${3 - me[2] === 1 ? '' : 's'} left` : 'round in progress'}</small>
          </div>
          <ul className="scores">
            {sorted.map((p) => (
              <li key={p[0]} className={p[0] === selfN ? 'me' : ''}>
                <span>{names(p[0])}</span>
                <span>
                  {p[1]} <Icon name="target" style={{ width: 14, height: 14, verticalAlign: '-2px' }} /> {p[2]}/3
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      {state?.phase === 'results' && (
        <>
          <div className="countdown">
            <Icon name="trophy" style={{ width: 28, height: 28, color: 'var(--gold-deep)' }} />
            <small>{sorted[0] ? `${names(sorted[0][0])} wins with ${sorted[0][1]}` : 'Round over'}</small>
          </div>
          <ul className="scores">
            {sorted.map((p, i) => (
              <li key={p[0]} className={p[0] === selfN ? 'me' : ''}>
                <span>
                  #{i + 1} {names(p[0])}
                </span>
                <span>{p[1]}</span>
              </li>
            ))}
          </ul>
          <p className="muted">Next round opens in {remaining}s. Stay by the sign to play again.</p>
        </>
      )}
    </Panel>
  );
}
