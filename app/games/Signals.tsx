'use client';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../ui/icons';
import type { GameProps } from './registry';
import { harbourphone } from '../../client/audio';
import { art } from '../../client/art';
const LAMPS = [
  { name: 'Red', color: '#e0574f', art: 'red-lamp' },
  { name: 'Green', color: '#5e9a4b', art: 'green-lamp' },
  { name: 'White', color: '#fff4d9', art: 'white-lamp' },
  { name: 'Amber', color: '#e9b949', art: 'amber-lamp' },
];
type Round = { round: number; lives: number; sequence: number[]; shownAt: number; replyBy: number; rounds: number; score: number };
// Lighthouse Signals: the lamps flash a sequence, then the player taps it back.
export function SignalsGame({ run, serverOffset, onInput, subscribe }: GameProps) {
  const [round, setRound] = useState<Round>(run as unknown as Round);
  const [lit, setLit] = useState(-1);
  const [phase, setPhase] = useState<'watch' | 'reply' | 'wait'>('watch');
  const [reply, setReply] = useState<number[]>([]);
  const [verdict, setVerdict] = useState<'ok' | 'miss' | null>(null);
  const [left, setLeft] = useState(0);
  const replyRef = useRef(reply);
  replyRef.current = reply;
  useEffect(
    () =>
      subscribe((m) => {
        if (typeof m.ok === 'boolean') {
          setVerdict(m.ok ? 'ok' : 'miss');
          setTimeout(() => setVerdict(null), 1300);
        }
        if (Array.isArray(m.sequence)) {
          setRound(m as unknown as Round);
          setReply([]);
          setPhase('watch');
        } else if (typeof m.lives === 'number') setRound((r) => ({ ...r, lives: m.lives as number, rounds: (m.rounds as number) ?? r.rounds, score: (m.score as number) ?? r.score }));
      }),
    [subscribe],
  );
  // Playback runs off the server clock: one lamp per slot, then the reply window.
  useEffect(() => {
    let frame = 0;
    const showMs = 500 * round.sequence.length + 600;
    const slot = showMs / (round.sequence.length + 0.5);
    const draw = () => {
      const now = Date.now() + serverOffset;
      const since = now - round.shownAt;
      if (since < 0) setLit(-1);
      else if (since < showMs) {
        const index = Math.floor(since / slot);
        const within = (since % slot) / slot;
        setLit(index < round.sequence.length && within < 0.7 ? round.sequence[index] : -1);
        setPhase('watch');
      } else {
        setLit(-1);
        setPhase((p) => (p === 'watch' ? 'reply' : p));
        setLeft(Math.max(0, Math.ceil((round.replyBy - now) / 1000)));
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [round, serverOffset]);
  const tap = (index: number) => {
    if (phase !== 'reply') return;
    const next = [...replyRef.current, index];
    setReply(next);
    setLit(index);
    harbourphone.play('lamp');
    setTimeout(() => setLit((v) => (v === index ? -1 : v)), 180);
    if (next.length === round.sequence.length) {
      setPhase('wait');
      onInput({ round: round.round, sequence: next });
    }
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const index = ['1', '2', '3', '4'].indexOf(e.key);
      if (index >= 0 && !e.repeat) {
        e.preventDefault();
        tap(index);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, round]);
  return (
    <div className={`signals ${verdict ?? ''}`}>
      <div className="sorthud">
        <span className="score">
          <Icon name="star" /> {round.score} <span className="combo">round {round.round}</span>
        </span>
        <span className="lives" aria-label={`${round.lives} lives left`}>
          {Array.from({ length: 3 }, (_, i) => (
            <Icon key={i} name="heart" style={{ opacity: i < round.lives ? 1 : 0.25 }} />
          ))}
        </span>
      </div>
      <div className="lamps" role="group" aria-label="Signal lamps">
        {LAMPS.map((lamp, i) => (
          <button type="button" key={lamp.name} className={`lamp ${lit === i ? 'lit' : ''}`} style={{ ['--lamp' as string]: lamp.color }} aria-label={`${lamp.name} lamp`} disabled={phase !== 'reply'} onPointerDown={(e) => { e.preventDefault(); tap(i); }}>
            {/* oxlint-disable-next-line next/no-img-element -- static sprite */}
            <img src={art('minigames', `${lamp.art}-${lit === i ? 'on' : 'off'}`)} alt="" draggable={false} />
            <kbd>{i + 1}</kbd>
          </button>
        ))}
      </div>
      <p className="muted signalstatus">
        {verdict === 'ok' ? 'Right! Next signal coming…' : verdict === 'miss' ? 'Not quite. Watch again.' : phase === 'watch' ? 'Watch the lamps…' : phase === 'reply' ? `Your turn: ${reply.length}/${round.sequence.length} · ${left}s` : 'Checking…'}
      </p>
    </div>
  );
}
