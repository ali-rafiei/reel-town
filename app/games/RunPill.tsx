'use client';
import { useEffect, useRef, useState } from 'react';
import type { GameStart, GameUpdate } from '../../packages/shared/games';
import { Icon } from '../ui/icons';
import { gameById } from './registry';
// A run that lets you roam (the boat) can put its card away. This small pill keeps the
// count and the clock in view; tap it to bring the card back.
export function RunPill({ run, subscribe, onOpen }: { run: GameStart; subscribe: (fn: (update: GameUpdate) => void) => () => void; onOpen: () => void }) {
  const def = gameById(run.game);
  const [line, setLine] = useState('');
  const next = useRef(0);
  const at = useRef<number | null>(null);
  useEffect(
    () =>
      subscribe((m) => {
        if (typeof m.next === 'number') next.current = m.next as number;
        if (typeof m.at === 'number') at.current = performance.now() - (m.at as number);
      }),
    [subscribe],
  );
  useEffect(() => {
    let frame = 0;
    const draw = () => {
      const total = (run.checkpoints as number[][]).length;
      const elapsed = at.current === null ? 0 : (performance.now() - at.current) / 1000;
      setLine(`${Math.min(next.current, total)}/${total} buoys · ${elapsed.toFixed(1)}s`);
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [run]);
  if (!def) return null;
  return (
    <button type="button" className="runpill" onClick={onOpen} aria-label={`${def.title}: ${line}. Open the card`}>
      <Icon name={def.icon} />
      <span>
        <b>{def.title}</b>
        <small>{line}</small>
      </span>
    </button>
  );
}
