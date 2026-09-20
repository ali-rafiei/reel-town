import { LANDMARKS } from '../../../packages/shared/landmarks.js';
import { withinLandmark } from '../../../packages/shared/layout.js';
// Rock paper scissors at the podium in the picnic clearing: two players, best of three,
// gold on the line.
// Each round runs a clock the whole way down and a pick can be changed until it stops,
// so whatever is highlighted when time runs out is what gets played.
export const RPS = {
  // How long a match runs, named by whoever steps up first. The match ends the moment
  // one of them has the majority, so a best of seven can still be over in four rounds.
  lengths: [3, 5, 7] as const,
  defaultLength: 3,
  // Ties replay, so the round cap is a multiple of the length: a pair who keep drawing —
  // or both walk off — still finish.
  tieAllowance: 3,
  pickMs: 5000,
  revealMs: 2600,
  rematchMs: 20000,
  aiPickMs: 1400,
  watchMargin: 3,
  reward: { human: 8, ai: 4, draw: 2 },
  maxStake: 1000,
  stakes: [0, 10, 25, 50, 100, 250, 500, 750, 1000] as const,
};
export const winsFor = (bestOf: number) => Math.ceil(bestOf / 2);
export const maxRoundsFor = (bestOf: number) => bestOf * RPS.tieAllowance;
export const MOVES = ['rock', 'paper', 'scissors'] as const;
export type Move = (typeof MOVES)[number];
export const isMove = (v: unknown): v is Move => typeof v === 'string' && (MOVES as readonly string[]).includes(v);
export type Seat = { n: number; name: string };
export type RpsPhase = 'empty' | 'waiting' | 'picking' | 'reveal' | 'over';
export type RpsRound = { picks: [Move | null, Move | null]; winner: 0 | 1 | 2 };
export type RpsView = {
  phase: RpsPhase;
  // Gold each seat has put up, and what is in the middle. The wager is named by whoever
  // stepped up first and has to be matched by the player who takes them on.
  stake: number;
  pot: number;
  seats: [string | null, string | null];
  you: -1 | 0 | 1;
  deadline: number;
  // How many rounds this match is played over, and which round is on.
  bestOf: number;
  round: number;
  wins: [number, number];
  // Your own pick, live, and whether each seat has something highlighted. An opponent's
  // choice never leaves the server until the reveal.
  pick: Move | null;
  picked: [boolean, boolean];
  last: RpsRound | null;
  winner: 0 | 1 | 2 | 3;
  forfeit: boolean;
  ai: boolean;
  rematch: [boolean, boolean];
  watching: number;
};
export type RpsResult = { n: number; outcome: 'win' | 'loss' | 'draw'; forfeit: boolean; vsAi: boolean; wager: number };
export type RpsCharge = { n: number; amount: number };
// Who takes a round: 0 a draw, 1 the first pick, 2 the second. A seat with nothing
// highlighted when the clock stops has played nothing and loses the round on that.
export function beats(a: Move | null, b: Move | null): 0 | 1 | 2 {
  if (a === b) return 0;
  if (!a) return 2;
  if (!b) return 1;
  return (a === 'rock' && b === 'scissors') || (a === 'paper' && b === 'rock') || (a === 'scissors' && b === 'paper') ? 1 : 2;
}
export class RpsPodium {
  phase: RpsPhase = 'empty';
  seats: [Seat | null, Seat | null] = [null, null];
  picks: [Move | null, Move | null] = [null, null];
  wins: [number, number] = [0, 0];
  round = 0;
  last: RpsRound | null = null;
  deadline = 0;
  ai = false;
  aiPickAt = 0;
  rematch: [boolean, boolean] = [false, false];
  readonly watchers = new Set<number>();
  winner: 0 | 1 | 2 | 3 = 0;
  forfeit = false;
  stake = 0;
  pot = 0;
  bestOf: number = RPS.defaultLength;
  private dirty = false;
  private results: RpsResult[] = [];
  private charges: RpsCharge[] = [];
  constructor(private readonly landmark = LANDMARKS.rps) {}
  seatOf(n: number): -1 | 0 | 1 {
    return this.seats[0]?.n === n ? 0 : this.seats[1]?.n === n ? 1 : -1;
  }
  isSeated(n: number) {
    return this.seatOf(n) >= 0;
  }
  involves(n: number) {
    return this.isSeated(n) || this.watchers.has(n);
  }
  private startMatch(now: number) {
    // The wager is collected as the match begins, so a podium nobody plays at costs nothing.
    this.pot = 0;
    if (this.stake > 0 && !this.ai && this.seats[0] && this.seats[1]) {
      for (const seat of this.seats) if (seat) this.charges.push({ n: seat.n, amount: this.stake });
      this.pot = this.stake * 2;
    }
    this.wins = [0, 0];
    this.round = 0;
    this.last = null;
    this.winner = 0;
    this.forfeit = false;
    this.rematch = [false, false];
    this.startRound(now);
  }
  private startRound(now: number) {
    this.round++;
    this.picks = [null, null];
    this.phase = 'picking';
    this.deadline = now + RPS.pickMs;
    this.aiPickAt = this.ai ? now + RPS.aiPickMs : 0;
    this.dirty = true;
  }
  // The clock has run out: whatever each seat had highlighted is what they played.
  private resolveRound(now: number) {
    const won = beats(this.picks[0], this.picks[1]);
    if (won) this.wins[won - 1]++;
    this.last = { picks: [this.picks[0], this.picks[1]], winner: won };
    this.phase = 'reveal';
    this.deadline = now + RPS.revealMs;
    this.dirty = true;
  }
  // A match stops the moment one side holds the majority; the cap only catches a pair
  // who keep tying or have both stopped playing.
  private matchOver() {
    const needed = winsFor(this.bestOf);
    if (this.wins[0] >= needed) return 1 as const;
    if (this.wins[1] >= needed) return 2 as const;
    if (this.round >= maxRoundsFor(this.bestOf)) return this.wins[0] === this.wins[1] ? (3 as const) : ((this.wins[0] > this.wins[1] ? 1 : 2) as 1 | 2);
    return 0 as const;
  }
  private finish(now: number, who: 1 | 2 | 3, forfeit: boolean) {
    this.phase = 'over';
    this.winner = who;
    this.forfeit = forfeit;
    this.deadline = now + RPS.rematchMs;
    this.rematch = [false, false];
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
    this.bestOf = RPS.defaultLength;
    this.picks = [null, null];
    this.wins = [0, 0];
    this.round = 0;
    this.last = null;
    this.rematch = [false, false];
    this.deadline = 0;
    this.dirty = true;
  }
  // One player's action; returns a message for them when it is refused. `coins` is what
  // the player has on them, which is what a wager can be set to or matched from.
  handle(n: number, name: string, x: number, z: number, action: unknown, move: unknown, now: number, coins = 0, stake?: unknown, length?: unknown): string | null {
    const seat = this.seatOf(n);
    const playing = this.phase === 'picking' || this.phase === 'reveal';
    switch (action) {
      case 'sit': {
        if (seat >= 0) return null;
        if (!withinLandmark(this.landmark, x, z)) return 'Walk over to the podium to play.';
        if (playing) return 'A match is on. Watch this one, or wait for the next.';
        const free: 0 | 1 | -1 = this.seats[0] ? (this.seats[1] && this.seats[1].n !== 0 ? -1 : 1) : 0;
        if (free === -1) return 'Both sides are taken.';
        // Taking on a player with gold up means matching it, and saying so: the amount
        // comes back with the request, so nobody is signed up to a wager they never saw.
        if (free === 1 && this.stake > 0) {
          if (stake !== this.stake) return `There is ${this.stake} gold on this match. Match it to play.`;
          if (coins < this.stake) return `You need ${this.stake - coins} more gold to match that wager.`;
        }
        if (free === 0) this.stake = 0;
        if (this.ai) {
          // A real opponent takes the Dockkeeper's place.
          this.ai = false;
          this.seats[1] = null;
        }
        this.watchers.delete(n);
        this.seats[free] = { n, name };
        this.phase = this.seats[0] && this.seats[1] ? 'picking' : 'waiting';
        if (this.phase === 'picking') this.startMatch(now);
        this.dirty = true;
        return null;
      }
      case 'stake': {
        if (seat !== 0) return 'Only whoever stepped up first sets the wager.';
        if (this.phase !== 'waiting') return 'The wager is set before the other player steps up.';
        if (!Number.isInteger(stake) || (stake as number) < 0 || (stake as number) > RPS.maxStake) return null;
        if ((stake as number) > coins) return `You only have ${coins} gold.`;
        this.stake = stake as number;
        this.dirty = true;
        return null;
      }
      case 'length': {
        if (seat !== 0) return 'Only whoever stepped up first sets the length.';
        if (this.phase !== 'waiting') return 'The length is set before the other player steps up.';
        if (!(RPS.lengths as readonly number[]).includes(length as number)) return null;
        this.bestOf = length as number;
        this.dirty = true;
        return null;
      }
      case 'solo': {
        if (seat < 0 || playing) return null;
        if (this.seats[0] && this.seats[1] && this.seats[1].n !== 0) return 'Someone is already playing you.';
        // The Dockkeeper plays for the fun of it, never for gold.
        this.stake = 0;
        const me = this.seats[seat as 0 | 1]!;
        this.seats = [me, { n: 0, name: 'Dockkeeper' }];
        this.ai = true;
        this.startMatch(now);
        return null;
      }
      case 'pick': {
        // Highlighting, not committing: this can change until the clock stops.
        if (this.phase !== 'picking' || seat < 0) return null;
        if (!isMove(move)) return null;
        this.picks[seat as 0 | 1] = move;
        this.dirty = true;
        return null;
      }
      case 'leave': {
        this.watchers.delete(n);
        if (seat < 0) return null;
        if (playing) this.finish(now, (seat === 0 ? 2 : 1) as 1 | 2, true);
        this.seats[seat as 0 | 1] = null;
        if (this.ai) {
          this.ai = false;
          this.seats[1] = null;
        }
        if (!this.seats[0] && !this.seats[1]) this.clear();
        else if (this.phase !== 'over') this.phase = 'waiting';
        // A podium nobody is playing at carries no wager into the next pair.
        if (this.phase === 'waiting' && !this.seats[0]) {
          this.stake = 0;
          this.bestOf = RPS.defaultLength;
        }
        this.dirty = true;
        return null;
      }
      case 'rematch': {
        if (this.phase !== 'over' || seat < 0) return null;
        if (this.stake > 0 && !this.ai && coins < this.stake) return `Another match is ${this.stake} gold and you have ${coins}.`;
        this.rematch[seat as 0 | 1] = true;
        this.dirty = true;
        if (this.ai || (this.rematch[0] && this.rematch[1])) this.startMatch(now);
        return null;
      }
      case 'watch': {
        if (seat >= 0) return null;
        if (Math.hypot(x - this.landmark.x, z - this.landmark.z) > this.landmark.radius + RPS.watchMargin) return 'Come closer to watch.';
        this.watchers.add(n);
        this.dirty = true;
        return null;
      }
      default:
        return null;
    }
  }
  // Clocks: the Dockkeeper's pick, a round's timer running out, the pause on a reveal,
  // a finished match nobody rematched, and watchers who wandered off.
  tick(now: number, positionOf: (n: number) => { x: number; z: number } | undefined) {
    if (this.phase === 'picking') {
      if (this.ai && this.aiPickAt && now >= this.aiPickAt) {
        this.aiPickAt = 0;
        this.picks[1] = MOVES[Math.floor(Math.random() * MOVES.length)];
        this.dirty = true;
      }
      if (now >= this.deadline) this.resolveRound(now);
    } else if (this.phase === 'reveal' && now >= this.deadline) {
      const over = this.matchOver();
      if (over) this.finish(now, over, false);
      else this.startRound(now);
    } else if (this.phase === 'over' && now >= this.deadline) {
      // Nobody asked for another match: the podium frees up for the next pair.
      if (this.ai) this.clear();
      else {
        this.rematch = [false, false];
        this.deadline = 0;
        this.phase = this.seats[0] || this.seats[1] ? 'waiting' : 'empty';
        if (this.seats[0] && this.seats[1]) this.startMatch(now);
        this.dirty = true;
      }
    }
    // Deleting while iterating a Set is safe: skipped entries are simply not visited.
    for (const n of this.watchers) {
      const p = positionOf(n);
      if (!p || Math.hypot(p.x - this.landmark.x, p.z - this.landmark.z) > this.landmark.radius + RPS.watchMargin + 1) {
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
  // Wagers to collect now that a match has begun; cleared on read.
  takeCharges() {
    const out = this.charges;
    this.charges = [];
    return out;
  }
  view(forN: number): RpsView {
    const you = this.seatOf(forN);
    return {
      phase: this.phase,
      stake: this.stake,
      pot: this.pot,
      seats: [this.seats[0]?.name ?? null, this.seats[1]?.name ?? null],
      you,
      deadline: this.deadline,
      bestOf: this.bestOf,
      round: this.round,
      wins: [this.wins[0], this.wins[1]],
      pick: you >= 0 ? this.picks[you as 0 | 1] : null,
      picked: [!!this.picks[0], !!this.picks[1]],
      last: this.last,
      winner: this.winner,
      forfeit: this.forfeit,
      ai: this.ai,
      rematch: [this.rematch[0], this.rematch[1]],
      watching: this.watchers.size,
    };
  }
  snapshot(): [number, number, number] {
    return [['empty', 'waiting', 'picking', 'reveal', 'over'].indexOf(this.phase), this.seats[0]?.n ?? 0, this.seats[1]?.n ?? 0];
  }
}
