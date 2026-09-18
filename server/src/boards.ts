import { BOARD, authorTag, boardLandmark, isBoard, parseStroke, type Stroke } from '../../packages/shared/boards.js';
import { withinLandmark } from '../../packages/shared/layout.js';
import type { createBoardStore } from './db.js';
type Store = ReturnType<typeof createBoardStore>;
type Lock = { n: number; id: string; until: number };
export type BoardChange = { board: number; event: 'stroke'; stroke: Stroke } | { board: number; event: 'erase'; ids: number[] } | { board: number; event: 'lock'; n: number };
// The boards in memory, backed by the strokes table. One lock per board: the holder must
// stand at it, and the lock lapses after a while or when they walk away or leave.
export class Boards {
  private readonly strokes: Stroke[][];
  private readonly authors = new Map<number, string>();
  private readonly locks: Array<Lock | null>;
  private lastPrune = 0;
  constructor(
    private readonly store: Store,
    now = Date.now(),
  ) {
    this.strokes = Array.from({ length: BOARD.count }, (_, board) =>
      store.list(board).map((row) => {
        this.authors.set(row.id, row.author);
        return { id: row.id, a: authorTag(row.author), c: row.color, w: row.width, p: Array.from(row.points), t: row.created };
      }),
    );
    this.locks = Array.from({ length: BOARD.count }, () => null);
    this.prune(now);
  }
  // Nothing outlives a week. Returns the ids removed per board, for anyone watching.
  prune(now: number): Array<{ board: number; ids: number[] }> {
    this.lastPrune = now;
    const removed: Array<{ board: number; ids: number[] }> = [];
    this.strokes.forEach((list, board) => {
      const ids = list.filter((s) => now - s.t >= BOARD.keepMs).map((s) => s.id);
      if (!ids.length) return;
      for (const id of ids) this.store.removeAny(id);
      this.forget(board, ids);
      removed.push({ board, ids });
    });
    return removed;
  }
  state(board: number) {
    return { board, event: 'state' as const, lock: this.locks[board]?.n ?? 0, strokes: this.strokes[board] };
  }
  holder(board: number) {
    return this.locks[board]?.n ?? 0;
  }
  // Takes the board for drawing; refused when someone else holds it or the player is not there.
  lock(board: number, n: number, id: string, x: number, z: number, now: number): string | null {
    if (!isBoard(board)) return 'No such board.';
    if (!withinLandmark(boardLandmark(board), x, z)) return 'Step up to the board to draw on it.';
    const current = this.locks[board];
    if (current && current.n !== n && current.until > now) return 'Someone else is drawing here. Try another board.';
    this.locks[board] = { n, id, until: now + BOARD.lockMs };
    return null;
  }
  unlock(board: number, n: number) {
    if (isBoard(board) && this.locks[board]?.n === n) this.locks[board] = null;
  }
  release(n: number) {
    const freed: number[] = [];
    this.locks.forEach((lock, board) => {
      if (lock?.n === n) {
        this.locks[board] = null;
        freed.push(board);
      }
    });
    return freed;
  }
  // Adds a stroke for the lock holder; returns the stroke and any old line that made way
  // for it, or a reason it was refused. A full board drops its oldest line rather than
  // refusing, so a board is never stuck full of someone else's work.
  stroke(board: number, n: number, id: string, raw: unknown, now: number): { stroke: Stroke; dropped: number[] } | string {
    if (!isBoard(board)) return 'No such board.';
    const lock = this.locks[board];
    if (!lock || lock.n !== n || lock.until <= now) return 'Take the board before drawing: stand at it and pick up the chalk.';
    const input = parseStroke(raw);
    if (!input) return 'That stroke could not be read.';
    const dropped: number[] = [];
    while (this.strokes[board].length >= BOARD.maxStrokes) {
      const oldest = this.strokes[board][0];
      this.store.removeAny(oldest.id);
      this.forget(board, [oldest.id]);
      dropped.push(oldest.id);
    }
    lock.until = now + BOARD.lockMs;
    const strokeId = this.store.add(board, id, input.c, input.w, Uint8Array.from(input.p), now);
    const stroke: Stroke = { id: strokeId, a: authorTag(id), c: input.c, w: input.w, p: input.p, t: now };
    this.strokes[board].push(stroke);
    this.authors.set(strokeId, id);
    return { stroke, dropped };
  }
  // Whoever holds the chalk may wipe the board, whoever drew what is on it.
  tidy(board: number, n: number, _now: number): number[] {
    if (!isBoard(board) || this.locks[board]?.n !== n) return [];
    const ids = this.strokes[board].map((s) => s.id);
    if (!ids.length) return [];
    this.store.clear(board, null);
    this.forget(board, ids);
    return ids;
  }
  // Any line can be rubbed out by whoever is holding the chalk: a board belongs to the
  // harbour, not to whoever drew on it first.
  erase(board: number, n: number, strokeId: unknown): number[] {
    if (!isBoard(board) || !Number.isInteger(strokeId)) return [];
    if (this.locks[board]?.n !== n) return [];
    if (!this.store.removeAny(strokeId as number)) return [];
    this.forget(board, [strokeId as number]);
    return [strokeId as number];
  }
  // Clears the caller's own lines, or every line when a dockkeeper asks.
  clear(board: number, id: string, everything = false): number[] {
    if (!isBoard(board)) return [];
    const ids = this.strokes[board].filter((s) => everything || this.authors.get(s.id) === id).map((s) => s.id);
    if (!ids.length) return [];
    this.store.clear(board, everything ? null : id);
    this.forget(board, ids);
    return ids;
  }
  private forget(board: number, ids: number[]) {
    const gone = new Set(ids);
    this.strokes[board] = this.strokes[board].filter((s) => !gone.has(s.id));
    for (const strokeId of ids) this.authors.delete(strokeId);
  }
  // Once a minute, old lines are pruned; returns what went, per board.
  maintain(now: number) {
    if (now - this.lastPrune < 60000) return [];
    return this.prune(now);
  }
  // Locks lapse when the holder leaves the board or stops drawing; returns the boards freed.
  tick(now: number, positionOf: (n: number) => { x: number; z: number } | undefined) {
    const freed: number[] = [];
    this.locks.forEach((lock, board) => {
      if (!lock) return;
      const p = positionOf(lock.n);
      const away = !p || !withinLandmark({ ...boardLandmark(board), radius: boardLandmark(board).radius + 1 }, p.x, p.z);
      if (lock.until <= now || away) {
        this.locks[board] = null;
        freed.push(board);
      }
    });
    return freed;
  }
}
