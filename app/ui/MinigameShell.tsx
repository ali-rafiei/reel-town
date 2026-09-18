'use client';
import type { ReactNode } from 'react';
import { Button, Panel } from './primitives';
import type { GameEnd, GameStart } from '../../packages/shared/games';
import type { GameDef } from '../games/registry';
// Every pickup game shares one frame: a briefing with a start button, the game itself
// with a way out, and a results card with the score, the gold and a way to go again.
export function MinigameShell({
  def,
  run,
  end,
  best,
  near,
  coarse,
  onStart,
  onQuit,
  onClose,
  children,
}: {
  def: GameDef;
  run: GameStart | null;
  end: GameEnd | null;
  best: number;
  near: boolean;
  coarse: boolean;
  onStart: () => void;
  onQuit: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const phase = run ? 'active' : end ? 'results' : 'intro';
  return (
    <Panel
      title={def.title}
      icon={def.icon}
      onClose={phase === 'active' && !def.free ? undefined : onClose}
      className={`game game-${def.id}${def.wide ? ' wide' : ''}`}
      footer={
        phase === 'active' ? (
          <Button tone="ghost" onClick={onQuit}>
            {def.quitLabel ?? 'Give up'}
          </Button>
        ) : (
          <>
            <Button tone="primary" icon={def.icon} onClick={onStart} disabled={!near}>
              {end ? 'Play again' : near ? def.startLabel ?? 'Start' : `Walk to the ${def.place} to play`}
            </Button>
            {end && (
              <Button tone="ghost" onClick={onClose}>
                Done
              </Button>
            )}
          </>
        )
      }
    >
      {phase === 'intro' && (
        <>
          <p>{def.blurb}</p>
          <ol className="steps">
            {def.instructions(coarse).map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ol>
          <p className="muted">Best: {best}</p>
        </>
      )}
      {phase === 'results' && end && (
        <>
          <div className="stat-grid">
            <div className="stat">
              <b>{end.score}</b>
              <span>score</span>
            </div>
            <div className="stat">
              <b>+{end.gold}</b>
              <span>gold</span>
            </div>
            <div className="stat">
              <b>{end.best}</b>
              <span>best</span>
            </div>
          </div>
          <p>
            {def.resultLine?.(end) ?? ''}
            {end.quit ? ' Run abandoned.' : ''}
          </p>
          {end.score >= end.best && end.score > 0 && !end.quit && <p className="muted">New personal best!</p>}
        </>
      )}
      {phase === 'active' && children}
    </Panel>
  );
}
