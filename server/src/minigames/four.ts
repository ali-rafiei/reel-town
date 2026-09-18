import { LANDMARKS } from '../../../packages/shared/landmarks.js';
import { withinLandmark } from '../../../packages/shared/layout.js';
// Dockside Four: four in a row at the picnic table. Two seats, turns with a clock,
// rematches, a few onlookers, and the Dockkeeper to play against when nobody else is
// around. The board lives here; seated players and watchers each get their own view.
export const FOUR = { cols: 7, rows: 6, turnMs: 30000, aiDelayMs: 700, rematchMs: 20000, watchMargin: 3, reward: { human: 8, ai: 4, draw: 2 }, maxStake: 500, stakes: [0, 10, 25, 50, 100, 250] as const };
export type Board = number[];
export type Seat = { n: number; name: string };
export type FourPhase = 'empty' | 'waiting' | 'playing' | 'over';
export type FourView = {
  phase: FourPhase;
  // Gold each seat has put up on this game, and what is in the middle. A wager is set by
  // whoever sits down first and has to be matched by the player who joins them.
  stake: number;
  pot: number;
  board: Board;
  seats: [string | null, string | null];
  turn: 0 | 1;
  you: -1 | 0 | 1;
  deadline: number;
  winner: 0 | 1 | 2 | 3;
  forfeit: boolean;
  ai: boolean;
  rematch: [boolean, boolean];
  watching: number;
};
export type FourResult = { n: number; outcome: 'win' | 'loss' | 'draw'; forfeit: boolean; vsAi: boolean; wager: number };
// Gold to take off a player when a wagered game begins; the table never touches coins
// itself, it only says who owes what, and the server moves the money.
export type FourCharge = { n: number; amount: number };
export const emptyBoard = (): Board => Array.from({ length: FOUR.cols * FOUR.rows }, () => 0);
const at = (board: Board, col: number, row: number) => board[row * FOUR.cols + col];
// Drops a piece into a column; returns the row it lands in, or -1 when the column is full.
export function dropPiece(board: Board, col: number, piece: 1 | 2) {
  if (col < 0 || col >= FOUR.cols) return -1;
  for (let row = 0; row < FOUR.rows; row++)
    if (at(board, col, row) === 0) {
      board[row * FOUR.cols + col] = piece;
      return row;
    }
  return -1;
}
export function winner(board: Board): 0 | 1 | 2 {
  const lines = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ];
  for (let col = 0; col < FOUR.cols; col++)
    for (let row = 0; row < FOUR.rows; row++) {
      const piece = at(board, col, row);
      if (!piece) continue;
      for (const [dc, dr] of lines) {
        let k = 1;
        while (k < 4) {
          const c = col + dc * k,
            r = row + dr * k;
          if (c < 0 || c >= FOUR.cols || r < 0 || r >= FOUR.rows || at(board, c, r) !== piece) break;
          k++;
        }
        if (k === 4) return piece as 1 | 2;
      }
    }
  return 0;
}
export const isFull = (board: Board) => board.every((cell) => cell !== 0);
const legal = (board: Board) => Array.from({ length: FOUR.cols }, (_, c) => c).filter((c) => at(board, c, FOUR.rows - 1) === 0);
const winsWith = (board: Board, col: number, piece: 1 | 2) => {
  const copy = board.slice();
  return dropPiece(copy, col, piece) >= 0 && winner(copy) === piece;
};
// The Dockkeeper: take a win, block a loss, otherwise play toward the middle without
// handing the opponent a win on top of the piece just dropped.
export function aiMove(board: Board, me: 1 | 2, prefer = [3, 2, 4, 1, 5, 0, 6]) {
  const them = (me === 1 ? 2 : 1) as 1 | 2;
  const open = legal(board);
  for (const col of open) if (winsWith(board, col, me)) return col;
  for (const col of open) if (winsWith(board, col, them)) return col;
  for (const col of prefer) {
    if (!open.includes(col)) continue;
    const copy = board.slice();
    dropPiece(copy, col, me);
    if (legal(copy).includes(col) && winsWith(copy, col, them)) continue;
    return col;
  }
  return prefer.find((col) => open.includes(col)) ?? open[0];
}
export class FourTable {
  phase: FourPhase = 'empty';
  board = emptyBoard();
  seats: [Seat | null, Seat | null] = [null, null];
  turn: 0 | 1 = 0;
  deadline = 0;
  ai = false;
  aiMoveAt = 0;
  rematch: [boolean, boolean] = [false, false];
  readonly watchers = new Set<number>();
  winner: 0 | 1 | 2 | 3 = 0;
  forfeit = false;
  overAt = 0;
  // What the seats agreed to play for, and what is staked on the game being played.
  stake = 0;
  pot = 0;
  private dirty = false;
  private results: FourResult[] = [];
  private charges: FourCharge[] = [];
  constructor(private readonly landmark = LANDMARKS.four) {}
  seatOf(n: number): -1 | 0 | 1 {
    return this.seats[0]?.n === n ? 0 : this.seats[1]?.n === n ? 1 : -1;
  }
  isSeated(n: number) {
    return this.seatOf(n) >= 0;
  }
  involves(n: number) {
    return this.isSeated(n) || this.watchers.has(n);
  }
  private start(now: number) {
    // The wager is collected as the game begins, so a table that never fills costs nobody.
    this.pot = 0;
    if (this.stake > 0 && !this.ai && this.seats[0] && this.seats[1]) {
      for (const seat of this.seats) if (seat) this.charges.push({ n: seat.n, amount: this.stake });
      this.pot = this.stake * 2;
    }
    this.board = emptyBoard();
    this.phase = 'playing';
    this.turn = 0;
    this.winner = 0;
    this.forfeit = false;
    this.rematch = [false, false];
    this.deadline = now + FOUR.turnMs;
    this.aiMoveAt = 0;
    this.dirty = true;
  }
  private finish(now: number, who: 0 | 1 | 2 | 3, forfeit: boolean) {
    this.phase = 'over';
    this.winner = who;
    this.forfeit = forfeit;
    this.overAt = now;
    this.deadline = now + FOUR.rematchMs;
    this.dirty = true;
    for (const [i, seat] of this.seats.entries()) {
      if (!seat || seat.n === 0) continue;
      const outcome = who === 3 ? 'draw' : who === i + 1 ? 'win' : 'loss';
      this.results.push({ n: seat.n, outcome, forfeit, vsAi: this.ai, wager: this.pot > 0 ? this.stake : 0 });
    }
  }
  private clear() {
    this.phase = 'empty';
    this.seats = [null, null];
    this.ai = false;
    this.stake = 0;
    this.pot = 0;
    this.board = emptyBoard();
    this.rematch = [false, false];
    this.deadline = 0;
    this.dirty = true;
  }
  // One player's action; returns a message for them when it is refused. `coins` is what
  // the player has on them, which is what a wager can be set to or matched from.
  handle(n: number, name: string, x: number, z: number, action: unknown, col: unknown, now: number, coins = 0, stake?: unknown): string | null {
    const seat = this.seatOf(n);
    switch (action) {
      case 'sit': {
        if (seat >= 0) return null;
        if (!withinLandmark(this.landmark, x, z)) return 'Walk over to the picnic table to sit down.';
        if (this.phase === 'playing') return 'A game is on. Watch this one, or wait for the next.';
        const free: 0 | 1 | -1 = this.seats[0] ? (this.seats[1] && this.seats[1].n !== 0 ? -1 : 1) : 0;
        if (free === -1) return 'Both seats are taken.';
        // Joining a table with gold on it means matching it, and saying so: the amount
        // comes back with the request, so nobody is signed up to a wager they never saw.
        if (free === 1 && this.stake > 0) {
          if (stake !== this.stake) return `There is ${this.stake} gold on this table. Match it to sit down.`;
          if (coins < this.stake) return `You need ${this.stake - coins} more gold to match that wager.`;
        }
        if (free === 0) this.stake = 0;
        if (this.ai) {
          // A real opponent takes the Dockkeeper's seat.
          this.ai = false;
          this.seats[1] = null;
        }
        this.watchers.delete(n);
        this.seats[free] = { n, name };
        this.phase = this.seats[0] && this.seats[1] ? 'playing' : 'waiting';
        if (this.phase === 'playing') this.start(now);
        this.dirty = true;
        return null;
      }
      case 'stake': {
        if (seat !== 0) return 'Only whoever sat down first sets the wager.';
        if (this.phase !== 'waiting') return 'The wager is set before the other player sits down.';
        if (!Number.isInteger(stake) || (stake as number) < 0 || (stake as number) > FOUR.maxStake) return null;
        if ((stake as number) > coins) return `You only have ${coins} gold.`;
        this.stake = stake as number;
        this.dirty = true;
        return null;
      }
      case 'solo': {
        if (seat < 0 || this.phase === 'playing') return null;
        if (this.seats[0] && this.seats[1] && this.seats[1].n !== 0) return 'Someone is already sitting across from you.';
        // The Dockkeeper plays for the fun of it, never for gold.
        this.stake = 0;
        const me = this.seats[seat as 0 | 1]!;
        this.seats = [me, { n: 0, name: 'Dockkeeper' }];
        this.ai = true;
        this.start(now);
        this.aiMoveAt = 0;
        return null;
      }
      case 'drop': {
        if (this.phase !== 'playing' || seat < 0) return null;
        if (seat !== this.turn) return 'Not your turn.';
        if (!Number.isInteger(col) || dropPiece(this.board, col as number, (seat + 1) as 1 | 2) < 0) return null;
        this.afterMove(now);
        return null;
      }
      case 'leave': {
        this.watchers.delete(n);
        if (seat < 0) return null;
        if (this.phase === 'playing') this.finish(now, (seat === 0 ? 2 : 1) as 1 | 2, true);
        this.seats[seat as 0 | 1] = null;
        if (this.ai) {
          this.ai = false;
          this.seats[1] = null;
        }
        if (!this.seats[0] && !this.seats[1]) this.clear();
        else if (this.phase !== 'over') this.phase = 'waiting';
        // A table nobody is playing at carries no wager into the next pair.
        if (this.phase === 'waiting' && !this.seats[0]) this.stake = 0;
        this.dirty = true;
        return null;
      }
      case 'rematch': {
        if (this.phase !== 'over' || seat < 0) return null;
        if (this.stake > 0 && !this.ai && coins < this.stake) return `Another game is ${this.stake} gold and you have ${coins}.`;
        this.rematch[seat as 0 | 1] = true;
        this.dirty = true;
        if (this.ai || (this.rematch[0] && this.rematch[1])) this.start(now);
        return null;
      }
      case 'watch': {
        if (seat >= 0) return null;
        if (Math.hypot(x - this.landmark.x, z - this.landmark.z) > this.landmark.radius + FOUR.watchMargin) return 'Come closer to watch.';
        this.watchers.add(n);
        this.dirty = true;
        return null;
      }
      default:
        return null;
    }
  }
  private afterMove(now: number) {
    const won = winner(this.board);
    if (won) this.finish(now, won, false);
    else if (isFull(this.board)) this.finish(now, 3, false);
    else {
      this.turn = this.turn === 0 ? 1 : 0;
      this.deadline = now + FOUR.turnMs;
      if (this.ai && this.turn === 1) this.aiMoveAt = now + FOUR.aiDelayMs;
      this.dirty = true;
    }
  }
  // Clocks: the Dockkeeper's move, a turn left too long, a finished game nobody rematched,
  // and watchers who wandered off. Returns whether anyone needs a fresh view.
  tick(now: number, positionOf: (n: number) => { x: number; z: number } | undefined) {
    if (this.phase === 'playing') {
      if (this.ai && this.turn === 1 && this.aiMoveAt && now >= this.aiMoveAt) {
        this.aiMoveAt = 0;
        dropPiece(this.board, aiMove(this.board, 2), 2);
        this.afterMove(now);
      } else if (now >= this.deadline) this.finish(now, (this.turn === 0 ? 2 : 1) as 1 | 2, true);
    } else if (this.phase === 'over' && now >= this.deadline) {
      // Nobody asked for another game: the seats empty for the next pair.
      if (this.ai) this.clear();
      else {
        this.phase = this.seats[0] && this.seats[1] ? 'waiting' : this.seats[0] || this.seats[1] ? 'waiting' : 'empty';
        this.rematch = [false, false];
        this.deadline = 0;
        if (this.phase === 'waiting' && this.seats[0] && this.seats[1]) this.start(now);
        this.dirty = true;
      }
    }
    // Deleting while iterating a Set is safe: skipped entries are simply not visited.
    for (const n of this.watchers) {
      const p = positionOf(n);
      if (!p || Math.hypot(p.x - this.landmark.x, p.z - this.landmark.z) > this.landmark.radius + FOUR.watchMargin + 1) {
        this.watchers.delete(n);
        this.dirty = true;
      }
    }
    const dirty = this.dirty;
    this.dirty = false;
    return dirty;
  }
  // Results waiting to be paid; cleared on read.
  takeResults() {
    const out = this.results;
    this.results = [];
    return out;
  }
  // Wagers to collect now that a game has begun; cleared on read.
  takeCharges() {
    const out = this.charges;
    this.charges = [];
    return out;
  }
  view(forN: number): FourView {
    return {
      phase: this.phase,
      stake: this.stake,
      pot: this.pot,
      board: this.board,
      seats: [this.seats[0]?.name ?? null, this.seats[1]?.name ?? null],
      turn: this.turn,
      you: this.seatOf(forN),
      deadline: this.deadline,
      winner: this.winner,
      forfeit: this.forfeit,
      ai: this.ai,
      rematch: this.rematch,
      watching: this.watchers.size,
    };
  }
  snapshot(): [number, number, number] {
    return [['empty', 'waiting', 'playing', 'over'].indexOf(this.phase), this.seats[0]?.n ?? 0, this.seats[1]?.n ?? 0];
  }
}
