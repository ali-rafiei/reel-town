'use client';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../ui/icons';
import type { GameProps } from './registry';
// Boat Buoy Run: you are on the water; this only keeps the count and the clock. The next
// buoy is marked in the world by a beam of light.
export function BuoyGame({ run, subscribe }: GameProps) {
  const total = (run.checkpoints as number[][]).length;
  const [next, setNext] = useState(0);
  const [started, setStarted] = useState<number | null>(null);
  const [finished, setFinished] = useState<number | null>(null);
  const clock = useRef<HTMLSpanElement>(null);
  const startedRef = useRef<number | null>(null);
  useEffect(
    () =>
      subscribe((m) => {
        if (typeof m.next === 'number') setNext(m.next as number);
        if (typeof m.at === 'number') {
          // The server's elapsed time anchors our clock.
          startedRef.current = performance.now() - (m.at as number);
          setStarted(startedRef.current);
          if (m.finished) setFinished(m.at as number);
        }
      }),
    [subscribe],
  );
  useEffect(() => {
    let frame = 0;
    const draw = () => {
      const s = startedRef.current;
      if (clock.current) clock.current.textContent = s === null ? '0.0' : ((finished ?? performance.now() - s) / 1000).toFixed(1);
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [finished]);
  const done = finished !== null;
  return (
    <div className="buoyrun">
      <div className="stat-grid">
        <div className="stat">
          <b>
            {Math.min(next, total)}/{total}
          </b>
          <span>buoys</span>
        </div>
        <div className="stat">
          <b>
            <span ref={clock}>0.0</span>s
          </b>
          <span>{started === null ? 'push off to start' : done ? 'finished' : 'elapsed'}</span>
        </div>
        <div className="stat">
          <b>{Math.round((run.parMs as number) / 1000)}s</b>
          <span>par</span>
        </div>
      </div>
      <p className="muted">
        <Icon name="boat" style={{ width: 14, height: 14 }} /> Follow the beam of light.
      </p>
    </div>
  );
}
