'use client';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../ui/icons';
import type { GameProps } from './registry';
type FruitRow = [number, number, number, number, number];
// Orchard Catch: fruit drops down five lanes; move the basket underneath. The client
// moves the basket at the same speed the server allows, so a legal catch is never refused.
export function OrchardGame({ run, serverOffset, onInput, subscribe }: GameProps) {
  const fruits = run.fruits as FruitRow[];
  const lanes = run.lanes as number,
    speed = run.basketSpeed as number,
    half = run.basketHalf as number;
  const field = useRef<HTMLDivElement>(null),
    basket = useRef<HTMLDivElement>(null),
    timer = useRef<HTMLDivElement>(null),
    scoreEl = useRef<HTMLSpanElement>(null),
    multEl = useRef<HTMLSpanElement>(null),
    nodes = useRef(new Map<number, HTMLDivElement>()),
    reported = useRef(new Set<number>()),
    x = useRef(0.5),
    target = useRef<number | null>(null),
    keys = useRef(new Set<string>());
  const [results, setResults] = useState<Record<number, string>>({});
  const localStart = run.startAt - serverOffset;
  useEffect(
    () =>
      subscribe((m) => {
        if (typeof m.score === 'number' && scoreEl.current) scoreEl.current.textContent = String(m.score);
        if (typeof m.mult === 'number' && multEl.current) multEl.current.textContent = (m.mult as number) > 1 ? `×${m.mult}` : '';
        if (typeof m.i === 'number') setResults((r) => ({ ...r, [m.i as number]: m.rotten ? 'rotten' : m.ok ? 'ok' : 'miss' }));
      }),
    [subscribe],
  );
  useEffect(() => {
    let frame = 0,
      last = performance.now();
    const draw = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      const now = Date.now() - localStart;
      // Basket: keys or a drag target, never faster than the server allows.
      let dir = 0;
      if (keys.current.has('KeyA') || keys.current.has('ArrowLeft')) dir -= 1;
      if (keys.current.has('KeyD') || keys.current.has('ArrowRight')) dir += 1;
      if (dir === 0 && target.current !== null) dir = Math.sign(target.current - x.current) * Math.min(1, Math.abs(target.current - x.current) / (speed * dt || 1));
      x.current = Math.max(half, Math.min(1 - half, x.current + dir * speed * dt));
      if (basket.current) basket.current.style.left = `${x.current * 100}%`;
      const height = field.current?.clientHeight ?? 300;
      for (const [i, lane, at, fall] of fruits) {
        const node = nodes.current.get(i);
        if (!node) continue;
        const k = (now - at) / fall;
        const visible = k >= -0.05 && k <= 1.2;
        node.hidden = !visible;
        if (!visible) continue;
        node.style.transform = `translate(-50%, ${(Math.min(1.15, k) * (height - 46)).toFixed(1)}px)`;
        // At the basket line: if we are under it, report the catch once.
        const land = at + fall;
        if (!reported.current.has(i) && Math.abs(now - land) <= 120 && Math.abs(x.current - (lane + 0.5) / lanes) <= half + 0.05) {
          reported.current.add(i);
          onInput({ i, x: x.current });
        }
      }
      if (timer.current) timer.current.style.width = `${Math.max(0, 100 - (now / run.durationMs) * 100)}%`;
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    const down = (e: KeyboardEvent) => {
      if (['KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
        e.stopPropagation();
        keys.current.add(e.code);
        target.current = null;
      }
    };
    const up = (e: KeyboardEvent) => keys.current.delete(e.code);
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('keydown', down, true);
      window.removeEventListener('keyup', up, true);
    };
  }, [fruits, lanes, speed, half, localStart, onInput, run.durationMs]);
  const pointTo = (e: React.PointerEvent) => {
    const rect = field.current?.getBoundingClientRect();
    if (!rect) return;
    target.current = Math.max(half, Math.min(1 - half, (e.clientX - rect.left) / rect.width));
  };
  return (
    <div className="orchard">
      <div className="sorthud">
        <span className="score">
          <Icon name="star" /> <span ref={scoreEl}>0</span> <span className="combo" ref={multEl} />
        </span>
        <div className="timerbar" aria-hidden="true">
          <div ref={timer} />
        </div>
      </div>
      <div
        className="field"
        ref={field}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          pointTo(e);
        }}
        onPointerMove={(e) => {
          if (e.buttons) pointTo(e);
        }}
        onPointerUp={() => (target.current = null)}
      >
        {Array.from({ length: lanes }, (_, i) => (
          <div key={i} className="laneline" style={{ left: `${((i + 0.5) / lanes) * 100}%` }} />
        ))}
        {fruits.map(([i, lane, , , rotten]) => (
          <div
            key={i}
            hidden
            className={`fruit ${rotten ? 'rotten' : ''} ${results[i] ?? ''}`}
            style={{ left: `${((lane + 0.5) / lanes) * 100}%` }}
            ref={(el) => {
              if (el) nodes.current.set(i, el);
              else nodes.current.delete(i);
            }}
          />
        ))}
        <div className="basket" ref={basket} style={{ width: `${half * 200}%` }} />
      </div>
    </div>
  );
}
