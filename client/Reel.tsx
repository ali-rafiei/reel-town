'use client';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { reelStep, reelInside, fishPosition, fishForSeed, catchHalfWidth, DIFFICULTY_NAMES, NO_MODS, type ReelMods } from '../packages/shared/game';
import { Button } from '../app/ui/primitives';
import { Icon } from '../app/ui/icons';
import { harbourphone } from './audio';
import { art } from './art';
export type ReelSnapshot = { phase: string; bar: number; velocity: number; progress: number; perfect: boolean; fish: number; seed: number; elapsed: number; mods?: ReelMods };
const MARK_PX = 22;
// Stardew-style reel: keep the green bar over the fish. The bar and fish are
// predicted locally with the shared simulation; the tension meter shows only the
// server's progress so the display never promises a gain the server refuses.
export function Reel({ initial, subscribe, held, onHold, onCancel }: { initial: ReelSnapshot; subscribe: (fn: (s: ReelSnapshot) => void) => () => void; held: RefObject<boolean>; onHold: (v: boolean) => void; onCancel: () => void }) {
  const bar = useRef<HTMLDivElement>(null),
    track = useRef<HTMLDivElement>(null),
    fish = useRef<HTMLDivElement>(null),
    tension = useRef<HTMLDivElement>(null),
    tensionWrap = useRef<HTMLDivElement>(null),
    state = useRef({ ...initial, received: 0, shown: initial.progress, serverProgress: initial.progress, serverInside: true });
  const [perfect, setPerfect] = useState(initial.perfect);
  const species = fishForSeed(initial.seed);
  // The server's numbers for this player's tackle, so the bar drawn is the bar that scores.
  const mods = initial.mods ?? NO_MODS;
  useEffect(
    () =>
      subscribe((snapshot) => {
        const old = state.current;
        state.current = {
          ...snapshot,
          bar: old.seed === snapshot.seed ? old.bar * 0.5 + snapshot.bar * 0.5 : snapshot.bar,
          velocity: old.seed === snapshot.seed ? old.velocity * 0.4 + snapshot.velocity * 0.6 : snapshot.velocity,
          received: performance.now(),
          shown: old.shown,
          serverProgress: snapshot.progress,
          serverInside: reelInside(snapshot.seed, snapshot.fish, snapshot.bar, snapshot.mods ?? mods),
        };
        // The bonus is the server's call, so the star never promises what the catch will not pay.
        setPerfect(snapshot.perfect);
      }),
    [subscribe, mods],
  );
  useEffect(() => {
    let frame = 0,
      last = performance.now();
    const half = catchHalfWidth(initial.seed, mods);
    function draw(now: number) {
      const s = state.current,
        dt = Math.min((now - last) / 1000, 0.04);
      last = now;
      const elapsed = s.elapsed + Math.min((now - (s.received || now)) / 1000, 0.25);
      reelStep(s, held.current, s.seed, elapsed, dt, mods);
      const fishY = fishPosition(s.seed, elapsed);
      const inside = reelInside(s.seed, fishY, s.bar, mods);
      if (bar.current) {
        bar.current.style.bottom = `${(s.bar - half) * 100}%`;
        bar.current.style.height = `${half * 200}%`;
      }
      if (track.current) track.current.classList.toggle('losing', !inside && !s.serverInside);
      if (fish.current) fish.current.style.bottom = `calc(${(fishY * 100).toFixed(2)}% - ${MARK_PX / 2}px)`;
      // Tension follows the authoritative progress with a short ease.
      s.shown += (s.serverProgress - s.shown) * Math.min(1, dt * 12);
      if (tension.current) tension.current.style.height = `${s.shown * 100}%`;
      harbourphone.setReel(true, s.shown);
      if (tensionWrap.current) tensionWrap.current.classList.toggle('low', s.shown < 0.3);
      frame = requestAnimationFrame(draw);
    }
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      harbourphone.setReel(false, 0);
    };
  }, [held, initial.seed, mods]);
  return (
    <section className="panel reel" aria-label="Reeling in a fish" role="dialog">
      <div>
        <div className="title">
          {species.rarity} bite · {DIFFICULTY_NAMES[species.difficulty]}
        </div>
        <div className="subtitle">Keep the green bar on the fish</div>
      </div>
      <div className="board">
        <div className="track" ref={track}>
          <div className="catchbar" ref={bar} />
          <div className="fishmark" ref={fish} aria-hidden="true">
            {/* oxlint-disable-next-line next/no-img-element -- static sprite */}
            <img src={art('fishing-shop', 'yellow-fish-marker')} alt="" draggable={false} />
          </div>
        </div>
        <div className="tension" ref={tensionWrap} aria-label="Catch progress">
          <div className="fill" ref={tension} />
        </div>
      </div>
      <span className={`perfect ${perfect ? '' : 'lost'}`} title={perfect ? 'Keep the fish in the bar the whole way for double value' : 'The fish slipped out of the bar, so this catch pays normally'}>
        <Icon name="star" style={{ width: 14, height: 14 }} /> {perfect ? 'Perfect · double value' : 'Perfect lost'}
      </span>
      <button
        type="button"
        className="btn teal hold"
        onPointerDown={(e) => {
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          onHold(true);
        }}
        onPointerUp={() => onHold(false)}
        onPointerCancel={() => onHold(false)}
        onKeyDown={(e) => {
          if (e.code === 'Space' || e.code === 'Enter') onHold(true);
        }}
        onKeyUp={() => onHold(false)}
      >
        <Icon name="hook" /> Hold to lift
      </button>
      <Button tone="ghost" onClick={onCancel}>
        Let it go
      </Button>
    </section>
  );
}
