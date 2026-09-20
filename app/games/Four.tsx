'use client';
import { useEffect, useState } from 'react';
import { Button, Panel } from '../ui/primitives';
import { Icon } from '../ui/icons';
import { FOUR, type FourView } from '../../server/src/minigames/four';
import { harbourphone } from '../../client/audio';
export type { FourView };
// Dockside Four at the picnic table: sit, play, rematch, or watch.
export function FourPanel({
  view,
  near,
  wins,
  coins,
  serverOffset,
  send,
  setBusy,
  onClose,
}: {
  view: FourView | null;
  near: boolean;
  wins: number;
  coins: number;
  serverOffset: number;
  send: (message: Record<string, unknown>) => void;
  setBusy: (busy: boolean) => void;
  onClose: () => void;
}) {
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((v) => v + 1), 500);
    return () => clearInterval(t);
  }, []);
  // A piece landing, whoever dropped it.
  const pieces = view?.board.filter((c) => c !== 0).length ?? 0;
  useEffect(() => {
    if (pieces > 0) harbourphone.play('drop');
  }, [pieces]);
  const seated = !!view && view.you >= 0;
  // A seated player stays put; the keys belong to the board.
  useEffect(() => {
    setBusy(seated);
    return () => setBusy(false);
  }, [seated, setBusy]);
  const act = (action: string, col?: number) => send({ type: 'game', game: 'four', action, col });
  // The wager: whoever sat down first names it, and the player who joins matches it.
  const stake = view?.stake ?? 0;
  const setsStake = seated && view?.you === 0 && view.phase === 'waiting' && !view.ai;
  const canMatch = coins >= stake;
  const myTurn = !!view && view.phase === 'playing' && view.you === view.turn;
  const remaining = view && view.phase === 'playing' ? Math.max(0, Math.ceil((view.deadline - (Date.now() + serverOffset)) / 1000)) : 0;
  useEffect(() => {
    if (!myTurn) return;
    const onKey = (e: KeyboardEvent) => {
      const col = ['1', '2', '3', '4', '5', '6', '7'].indexOf(e.key);
      if (col >= 0 && !e.repeat) {
        e.preventDefault();
        act('drop', col);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myTurn]);
  const status = !view || view.phase === 'empty' ? 'Nobody is playing. Take a seat.' : view.phase === 'waiting' ? (seated ? 'Waiting for a second player.' : 'One seat is free.') : view.phase === 'playing' ? (seated ? (myTurn ? `Your move · ${remaining}s` : `${view.seats[view.turn]} is thinking · ${remaining}s`) : `${view.seats[0]} vs ${view.seats[1]}`) : view.winner === 3 ? 'A draw!' : view.forfeit ? `${view.seats[view.winner - 1] ?? 'Someone'} wins by default.` : `${view.seats[view.winner - 1] ?? 'Someone'} wins!`;
  return (
    <Panel
      title="Dockside Four"
      icon="grid"
      className="game game-four wide"
      onClose={
        seated && view.phase === 'playing'
          ? undefined
          : () => {
              if (seated) act('leave');
              onClose();
            }
      }
      footer={
        <>
          {!seated && (!view || view.phase !== 'playing') && (
            <Button tone="primary" icon="chair" disabled={!near || (stake > 0 && !canMatch)} onClick={() => send({ type: 'game', game: 'four', action: 'sit', stake })}>
              {!near ? 'Walk to the picnic table' : stake > 0 ? (canMatch ? `Match ${stake} gold and sit` : `You need ${stake - coins} more gold`) : 'Take a seat'}
            </Button>
          )}
          {!seated && view?.phase === 'playing' && !view.watching && (
            <Button tone="teal" icon="eye" disabled={!near} onClick={() => act('watch')}>
              Watch
            </Button>
          )}
          {seated && view.phase === 'waiting' && (
            <Button tone="teal" icon="users" onClick={() => act('solo')}>
              Play the Dockkeeper
            </Button>
          )}
          {seated && view.phase === 'over' && (
            <Button tone="primary" icon="arrow" disabled={view.rematch[view.you as 0 | 1]} onClick={() => act('rematch')}>
              {view.rematch[view.you as 0 | 1] ? 'Waiting for a rematch…' : 'Rematch'}
            </Button>
          )}
          {seated && (
            <Button tone="ghost" onClick={() => act('leave')}>
              {view.phase === 'playing' ? 'Forfeit and leave' : 'Leave the table'}
            </Button>
          )}
          {!seated && (
            <Button tone="ghost" onClick={onClose}>
              Done
            </Button>
          )}
        </>
      }
    >
      <p className="muted">{status}</p>
      {view && view.phase === 'playing' && view.pot > 0 && (
        <p className="wager">
          <Icon name="coin" style={{ width: 14, height: 14 }} /> {view.pot} gold on the table · winner takes it, a draw returns it
        </p>
      )}
      {view && view.phase === 'over' && view.pot > 0 && <p className="wager">{view.winner === 3 ? `A draw: your ${view.stake} gold comes back.` : `${view.pot} gold to ${view.seats[view.winner - 1] ?? 'the winner'}.`}</p>}
      {setsStake && (
        <fieldset className="option-group wagerpick">
          <legend>Playing for</legend>
          <div className="options">
            {FOUR.stakes.map((amount) => (
              <button type="button" key={amount} aria-pressed={stake === amount} disabled={amount > coins} onClick={() => send({ type: 'game', game: 'four', action: 'stake', stake: amount })}>
                {amount === 0 ? 'Nothing' : `${amount} gold`}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      {!setsStake && stake > 0 && view?.phase === 'waiting' && (
        <p className="wager">
          <Icon name="coin" style={{ width: 14, height: 14 }} /> {view.seats[0]} is playing for {stake} gold a side.
        </p>
      )}
      {(!view || view.phase === 'empty') && <p className="muted">Wins: {wins}</p>}
      {view && view.phase !== 'empty' && (
        <>
          <div className="fourseats">
            <span className={`seat p1 ${view.turn === 0 && view.phase === 'playing' ? 'turn' : ''}`}>
              <i /> {view.seats[0] ?? '-'}
            </span>
            <span className={`seat p2 ${view.turn === 1 && view.phase === 'playing' ? 'turn' : ''}`}>
              <i /> {view.seats[1] ?? '-'}
            </span>
          </div>
          <div className="fourboard" role="grid" aria-label="Board">
            {Array.from({ length: 7 }, (_, col) => (
              <button type="button" key={col} className="fourcol" role="gridcell" aria-label={`Column ${col + 1}`} disabled={!myTurn} onClick={() => act('drop', col)}>
                {Array.from({ length: 6 }, (_, r) => {
                  const row = 5 - r;
                  const piece = view.board[row * 7 + col];
                  return <span key={row} className={`cell ${piece === 1 ? 'p1' : piece === 2 ? 'p2' : ''}`} />;
                })}
                {myTurn && <kbd>{col + 1}</kbd>}
              </button>
            ))}
          </div>
          {view.watching > 0 && (
            <p className="muted">
              <Icon name="eye" style={{ width: 14, height: 14 }} /> {view.watching} watching
            </p>
          )}
        </>
      )}
    </Panel>
  );
}
