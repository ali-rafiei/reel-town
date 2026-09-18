'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../ui/icons';
import type { GameProps } from './registry';
// Items ride a belt from right to left; the player throws the frontmost one into a bin
// with a key or a tap before it drops off the end. Sort the Catch and Tidepool Tidy are
// both this with different items and bins.
export type Bin = { label: string; color: string; key: string; art?: string };
export type ConveyorUpdate = { i: number; correct: boolean; late: boolean; score: number; combo: number; delta: number };
export function Conveyor({
  run,
  serverOffset,
  onInput,
  subscribe,
  bins,
  renderItem,
  flashColor,
  correctBin,
  quickGlimpseFrom = Infinity,
}: GameProps & {
  bins: Bin[];
  renderItem: (kind: number) => ReactNode;
  flashColor: (kind: number) => string;
  // The bin an item belongs in, or null when it must be left alone; used for the local flash only.
  correctBin: (kind: number) => number | null;
  quickGlimpseFrom?: number;
}) {
  const items = run.items as Array<[number, number, number, number]>;
  const durationMs = run.durationMs;
  const lane = useRef<HTMLDivElement>(null),
    timer = useRef<HTMLDivElement>(null),
    scoreEl = useRef<HTMLSpanElement>(null),
    comboEl = useRef<HTMLSpanElement>(null),
    cards = useRef(new Map<number, HTMLDivElement>()),
    answered = useRef(new Map<number, 'ok' | 'bad' | 'late'>()),
    [flash, setFlash] = useState<{ bin: number; ok: boolean } | null>(null);
  const localStart = run.startAt - serverOffset;
  // Authoritative results arrive outside React and only touch the affected card.
  useEffect(
    () =>
      subscribe((m) => {
        const a = m as unknown as ConveyorUpdate;
        answered.current.set(a.i, a.late ? 'late' : a.correct ? 'ok' : 'bad');
        const card = cards.current.get(a.i);
        if (card) card.dataset.result = a.late ? 'late' : a.correct ? 'ok' : 'bad';
        if (scoreEl.current) scoreEl.current.textContent = String(a.score);
        if (comboEl.current) comboEl.current.textContent = a.combo > 1 ? `×${a.combo}` : '';
      }),
    [subscribe],
  );
  useEffect(() => {
    answered.current.clear();
    let frame = 0;
    const draw = () => {
      // Server timestamps are wall-clock based, so the run clock is Date.now() corrected by the measured offset.
      const now = Date.now() - localStart;
      const laneWidth = lane.current?.clientWidth ?? 400;
      // Cards are narrower on a phone; the stylesheet owns the number.
      const cardWidth = lane.current ? parseFloat(getComputedStyle(lane.current).getPropertyValue('--card')) || 96 : 96;
      for (const [i, , at, travel] of items) {
        const card = cards.current.get(i);
        if (!card) continue;
        const k = (now - at) / travel;
        const visible = k >= -0.02 && k <= 1.05;
        card.hidden = !visible;
        if (!visible) continue;
        card.style.transform = `translateX(${((1 - k) * (laneWidth + cardWidth) - cardWidth).toFixed(1)}px)`;
        card.dataset.fresh = now - at < (i >= quickGlimpseFrom ? 380 : 700) ? 'yes' : 'no';
      }
      if (timer.current) timer.current.style.width = `${Math.max(0, 100 - (now / durationMs) * 100)}%`;
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [items, localStart, durationMs, quickGlimpseFrom]);
  function throwInto(bin: number) {
    const now = Date.now() - localStart;
    // The frontmost unanswered item on the belt is the one being thrown.
    const target = items.find(([i, , at, travel]) => !answered.current.has(i) && now >= at && now <= at + travel);
    if (!target) return;
    answered.current.set(target[0], 'ok');
    setFlash({ bin, ok: correctBin(target[1]) === bin });
    setTimeout(() => setFlash(null), 220);
    onInput({ i: target[0], bin });
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const index = bins.findIndex((b) => b.key === e.key);
      if (index >= 0 && !e.repeat) {
        e.preventDefault();
        throwInto(index);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, localStart]);
  return (
    <div className="sortgame">
      <div className="sorthud">
        <span className="score">
          <Icon name="star" /> <span ref={scoreEl}>0</span> <span className="combo" ref={comboEl} />
        </span>
        <div className="timerbar" aria-hidden="true">
          <div ref={timer} />
        </div>
      </div>
      <div className="lane" ref={lane}>
        {items.map(([i, kind]) => (
          <div
            key={i}
            className="fishcard"
            hidden
            ref={(el) => {
              if (el) cards.current.set(i, el);
              else cards.current.delete(i);
            }}
            style={{ ['--flash' as string]: flashColor(kind) }}
          >
            <span className="glimpse" />
            {renderItem(kind)}
          </div>
        ))}
        <div className="edge" aria-hidden="true" />
      </div>
      <fieldset className="crates" aria-label="Bins">
        {bins.map((bin, index) => (
          <button
            type="button"
            key={bin.label}
            className={`crate ${flash?.bin === index ? (flash.ok ? 'ok' : 'bad') : ''}`}
            style={{ ['--crate' as string]: bin.color }}
            onPointerDown={(e) => {
              e.preventDefault();
              throwInto(index);
            }}
          >
            <kbd>{bin.key}</kbd>
            {/* oxlint-disable-next-line next/no-img-element -- static sprite */}
            {bin.art && <img src={bin.art} alt="" draggable={false} />}
            <span>{bin.label}</span>
          </button>
        ))}
      </fieldset>
    </div>
  );
}
