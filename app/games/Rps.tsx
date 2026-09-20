'use client';
import { useEffect, useState } from 'react';
import { Button, Panel } from '../ui/primitives';
import { Icon } from '../ui/icons';
import { art } from '../../client/art';
import { MOVES, RPS, winsFor, type Move, type RpsView } from '../../server/src/minigames/rps';
export type { RpsView };
// The three pieces and the two seat markers, painted for this game on its own sheet.
const PIECES: Record<Move, { label: string; src: string }> = {
  rock: { label: 'Rock', src: art('rps', 'rock-token') },
  paper: { label: 'Paper', src: art('rps', 'paper-token') },
  scissors: { label: 'Scissors', src: art('rps', 'scissors-token') },
};
// Sea glass, one colour a side, so a seat reads at a glance without borrowing the
// picnic table's checkers.
const DISC = [art('rps', 'marker-coral'), art('rps', 'marker-teal')];
// Rock paper scissors at the podium in the picnic clearing: step up, wager, best of three.
export function RpsPanel({
  view,
  near,
  wins,
  coins,
  serverOffset,
  send,
  setBusy,
  onClose,
}: {
  view: RpsView | null;
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
    const t = setInterval(() => tick((v) => v + 1), 200);
    return () => clearInterval(t);
  }, []);
  const seated = !!view && view.you >= 0;
  // A player at the podium stays put; the keys belong to the three pieces.
  useEffect(() => {
    setBusy(seated);
    return () => setBusy(false);
  }, [seated, setBusy]);
  const act = (action: string, move?: Move) => send({ type: 'game', game: 'rps', action, move });
  // Opening the card asks the podium for its state: a player deciding whether to take
  // someone on should see the length and the wager before they commit to either.
  useEffect(() => {
    send({ type: 'game', game: 'rps', action: 'view' });
  }, [send]);
  const stake = view?.stake ?? 0;
  const bestOf = view?.bestOf ?? RPS.defaultLength;
  const needed = winsFor(bestOf);
  // Whoever steps up first names the length and the wager; the other player matches both.
  const setsTerms = seated && view?.you === 0 && view.phase === 'waiting' && !view.ai;
  const setsStake = setsTerms;
  const canMatch = coins >= stake;
  const picking = !!view && view.phase === 'picking';
  const mine = seated ? (view.you as 0 | 1) : -1;
  const yours = picking && seated;
  // The clock only ever counts a picking round down; it runs the whole way so a pick can
  // be changed until it stops.
  const remaining = picking ? Math.max(0, (view.deadline - (Date.now() + serverOffset)) / 1000) : 0;
  useEffect(() => {
    if (!yours) return;
    const onKey = (e: KeyboardEvent) => {
      const i = ['1', '2', '3'].indexOf(e.key);
      if (i >= 0 && !e.repeat) {
        e.preventDefault();
        act('pick', MOVES[i]);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yours]);
  const last = view?.last ?? null;
  // Who the reveal belongs to, said from where the reader is sitting.
  const roundLine = !last
    ? ''
    : last.winner === 0
      ? last.picks[0] && last.picks[1]
        ? 'A tie. That round plays again.'
        : 'Nobody played. That round plays again.'
      : seated
        ? last.winner === mine + 1
          ? 'You take the round.'
          : last.picks[mine as 0 | 1]
            ? `${view!.seats[last.winner - 1]} takes the round.`
            : 'You ran out of time. That round goes against you.'
        : `${view!.seats[last.winner - 1]} takes the round.`;
  const status = !view || view.phase === 'empty'
    ? 'Nobody is playing. Step up.'
    : view.phase === 'waiting'
      ? seated
        ? 'Waiting for someone to take you on.'
        : 'One side is free.'
      : view.phase === 'picking'
        ? seated
          ? `Round ${view.round} · ${remaining.toFixed(1)}s`
          : `${view.seats[0]} vs ${view.seats[1]} · round ${view.round}`
        : view.phase === 'reveal'
          ? roundLine
          : view.winner === 3
            ? 'A dead heat!'
            : view.forfeit
              ? `${view.seats[view.winner - 1] ?? 'Someone'} wins by default.`
              : seated && view.winner === mine + 1
                ? 'You win the match!'
                : `${view.seats[view.winner - 1] ?? 'Someone'} wins the match.`;
  return (
    <Panel
      title="Rock Paper Scissors"
      icon="rps"
      className="game game-rps"
      onClose={
        seated && (view.phase === 'picking' || view.phase === 'reveal')
          ? undefined
          : () => {
              if (seated) act('leave');
              onClose();
            }
      }
      footer={
        <>
          {!seated && (!view || (view.phase !== 'picking' && view.phase !== 'reveal')) && (
            <Button tone="primary" icon="users" disabled={!near || (stake > 0 && !canMatch)} onClick={() => send({ type: 'game', game: 'rps', action: 'sit', stake })}>
              {!near ? 'Walk to the podium' : stake > 0 ? (canMatch ? `Match ${stake} gold and play` : `You need ${stake - coins} more gold`) : 'Step up'}
            </Button>
          )}
          {!seated && view && (view.phase === 'picking' || view.phase === 'reveal') && !view.watching && (
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
            <Button tone="primary" icon="arrow" disabled={view.rematch[mine as 0 | 1]} onClick={() => act('rematch')}>
              {view.rematch[mine as 0 | 1] ? 'Waiting for a rematch…' : 'Play again'}
            </Button>
          )}
          {seated && (
            <Button tone="ghost" onClick={() => act('leave')}>
              {view.phase === 'picking' || view.phase === 'reveal' ? 'Forfeit and leave' : 'Leave the podium'}
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
      {view && view.pot > 0 && view.phase !== 'over' && (
        <p className="wager">
          <Icon name="coin" style={{ width: 14, height: 14 }} /> {view.pot} gold on the podium
        </p>
      )}
      {view && view.phase === 'over' && view.pot > 0 && <p className="wager">{view.winner === 3 ? `Your ${view.stake} gold comes back.` : `${view.pot} gold to ${view.seats[view.winner - 1] ?? 'the winner'}.`}</p>}
      {setsTerms && (
        <fieldset className="option-group wagerpick">
          <legend>Match length</legend>
          <div className="options">
            {RPS.lengths.map((length) => (
              <button type="button" key={length} aria-pressed={bestOf === length} onClick={() => send({ type: 'game', game: 'rps', action: 'length', length })}>
                Best of {length}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      {setsStake && (
        <fieldset className="option-group wagerpick">
          <legend>Playing for</legend>
          <div className="options">
            {RPS.stakes.map((amount) => (
              <button type="button" key={amount} aria-pressed={stake === amount} disabled={amount > coins} onClick={() => send({ type: 'game', game: 'rps', action: 'stake', stake: amount })}>
                {amount === 0 ? 'Nothing' : `${amount} gold`}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      {!setsTerms && view?.phase === 'waiting' && (
        <p className="wager">
          {stake > 0 && <Icon name="coin" style={{ width: 14, height: 14 }} />}
          Best of {bestOf}
          {stake > 0 ? `, ${stake} gold a side` : ''}
        </p>
      )}
      {(!view || view.phase === 'empty') && <p className="muted">Matches won: {wins}</p>}
      {view && view.phase !== 'empty' && (
        <>
          <div className="rpsseats">
            {([0, 1] as const).map((i) => (
              <span key={i} className={`seat p${i + 1} ${view.picked[i] && view.phase === 'picking' ? 'ready' : ''}`}>
                {/* oxlint-disable-next-line next/no-img-element -- static sprite, no optimisation pipeline */}
                <img src={DISC[i]} alt="" draggable={false} />
                <b>{view.seats[i] ?? '-'}</b>
                <span className="pips" aria-label={`${view.wins[i]} of ${needed} rounds`}>
                  {Array.from({ length: needed }, (_, k) => (
                    <i key={k} className={k < view.wins[i] ? 'won' : ''} />
                  ))}
                </span>
              </span>
            ))}
          </div>
          {view.phase === 'picking' && (
            <div className="rpsclock" role="timer" aria-label={`${Math.ceil(remaining)} seconds left`}>
              <span style={{ width: `${Math.max(0, Math.min(100, (remaining * 1000 * 100) / RPS.pickMs))}%` }} />
            </div>
          )}
          {view.phase === 'reveal' && last && (
            <div className="rpsreveal">
              {([0, 1] as const).map((i) => (
                <span key={i} className={`shown ${last.winner === i + 1 ? 'won' : ''}`}>
                  {last.picks[i] ? (
                    <>
                      {/* oxlint-disable-next-line next/no-img-element -- static sprite, no optimisation pipeline */}
                      <img src={PIECES[last.picks[i]!].src} alt={PIECES[last.picks[i]!].label} draggable={false} />
                      <b>{PIECES[last.picks[i]!].label}</b>
                    </>
                  ) : (
                    <>
                      <Icon name="hourglass" />
                      <b>No pick</b>
                    </>
                  )}
                </span>
              ))}
            </div>
          )}
          {(view.phase === 'picking' || view.phase === 'waiting') && (
            <fieldset className="rpspick" aria-label="Your pick">
              {MOVES.map((move, i) => (
                <button type="button" key={move} className="piece" aria-pressed={view.pick === move} disabled={!yours} onClick={() => act('pick', move)}>
                  {/* oxlint-disable-next-line next/no-img-element -- static sprite, no optimisation pipeline */}
                  <img src={PIECES[move].src} alt="" draggable={false} />
                  <b>{PIECES[move].label}</b>
                  {yours && <kbd>{i + 1}</kbd>}
                </button>
              ))}
            </fieldset>
          )}
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
