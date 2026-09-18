'use client';
import type { GameEnd, GameId, GameStart, GameUpdate } from '../../packages/shared/games';
import { MinigameShell } from '../ui/MinigameShell';
import { FourPanel, type FourView } from './Four';
import { gameById } from './registry';
// Looks up the game and puts its component inside the shared shell. Dockside Four is a
// table rather than a run, so it brings its own panel.
export function GameHost({
  game,
  run,
  end,
  best,
  near,
  coarse,
  serverOffset,
  send,
  subscribe,
  onClose,
  fourView,
  setBusy,
  coins,
}: {
  game: GameId;
  run: GameStart | null;
  end: GameEnd | null;
  best: number;
  near: boolean;
  coarse: boolean;
  serverOffset: number;
  send: (message: Record<string, unknown>) => void;
  subscribe: (fn: (update: GameUpdate) => void) => () => void;
  onClose: () => void;
  fourView: FourView | null;
  setBusy: (busy: boolean) => void;
  coins: number;
}) {
  if (game === 'four') return <FourPanel view={fourView} near={near} wins={best} coins={coins} serverOffset={serverOffset} send={send} setBusy={setBusy} onClose={onClose} />;
  const def = gameById(game);
  if (!def) return null;
  const Game = def.component;
  return (
    <MinigameShell
      def={def}
      run={run}
      end={end}
      best={best}
      near={near}
      coarse={coarse}
      onStart={() => send({ type: 'game', game, action: 'start' })}
      onQuit={() => send({ type: 'game', game, action: 'quit', runId: run?.runId })}
      onClose={onClose}
    >
      {run && <Game run={run} serverOffset={serverOffset} subscribe={subscribe} onInput={(payload) => send({ type: 'game', game, action: 'input', runId: run.runId, ...payload })} />}
    </MinigameShell>
  );
}
