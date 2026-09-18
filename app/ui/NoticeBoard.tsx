'use client';
import { Panel } from './primitives';
import { Icon } from './icons';
import type { ChallengeView } from '../../packages/shared/challenges';
import { CHALLENGE_REWARD } from '../../packages/shared/challenges';
export type Daily = { day: string; shells: Array<{ i: number; x: number; z: number; type: number }>; collected: number; garden: number; dog: number; plots: number };
const bits = (mask: number) => mask.toString(2).split('').filter((b) => b === '1').length;
// The notice board by the spawn: today's three challenges and the small daily things.
export function NoticeBoard({ challenges, daily, onClose }: { challenges: ChallengeView[]; daily: Daily | null; onClose: () => void }) {
  const shells = daily ? bits(daily.collected) : 0;
  return (
    <Panel title="Notice board" icon="star" onClose={onClose} className="notice">
      <p className="muted">Three a day, {CHALLENGE_REWARD} gold each.</p>
      <ul className="challenges">
        {challenges.map((c) => (
          <li key={c.id} className={c.done ? 'done' : ''}>
            <span className="text">
              {c.done && <Icon name="check" />}
              {c.text}
            </span>
            <span className="progress" aria-label={`${c.progress} of ${c.target}`}>
              <i style={{ width: `${Math.min(100, (c.progress / c.target) * 100)}%` }} />
            </span>
            <small>
              {c.progress}/{c.target}
            </small>
          </li>
        ))}
      </ul>
      <h3 className="sub">Around the island today</h3>
      <ul className="list">
        <li className="row">
          <span className="fishicon tackle">
            <Icon name="shell" />
          </span>
          <span className="name">
            Shells at the tide pools
            <span className="meta">Walk over them among the rocks on the east shore.</span>
          </span>
          <span className="value">{shells}/4</span>
        </li>
        <li className="row">
          <span className="fishicon tackle">
            <Icon name="sparkle" />
          </span>
          <span className="name">
            Water the garden
            <span className="meta">The beds by the orchard, one drink each.</span>
          </span>
          <span className="value">
            {daily ? bits(daily.garden) : 0}/{daily?.plots ?? 3}
          </span>
        </li>
        <li className="row">
          <span className="fishicon tackle">
            <Icon name="heart" />
          </span>
          <span className="name">
            Pet the dog
            <span className="meta">By the garden gate. Good dog.</span>
          </span>
          <span className="value">{daily?.dog ? 'Done' : 'Not yet'}</span>
        </li>
      </ul>
    </Panel>
  );
}
