import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { migrate, createBoardStore } from '../server/dist/server/src/db.js';
import { Boards } from '../server/dist/server/src/boards.js';
import { BOARD, BOARD_PALETTE, parseStroke, authorTag, strokeDistance } from '../server/dist/packages/shared/boards.js';
import { DRAWING_BOARDS } from '../server/dist/packages/shared/layout.js';

const fresh = () => {
  const db = new DatabaseSync(':memory:');
  assert.equal(migrate(db), 4, 'the strokes table is migration 4');
  return new Boards(createBoardStore(db));
};
const at = (board) => DRAWING_BOARDS[board];
const ann = 'a'.repeat(64),
  bo = 'b'.repeat(64);

test('a stroke is a colour, a width and an even list of grid points; anything else is refused', () => {
  assert.deepEqual(parseStroke({ c: 1, w: 2, p: [0, 0, 10, 10, 10, 10, 20, 5] }), { c: 1, w: 2, p: [0, 0, 10, 10, 20, 5] });
  assert.equal(parseStroke({ c: BOARD_PALETTE.length, w: 0, p: [0, 0] }), null, 'colour out of range');
  assert.equal(parseStroke({ c: 0, w: 9, p: [0, 0] }), null, 'width out of range');
  assert.equal(parseStroke({ c: 0, w: 0, p: [0, 0, 5] }), null, 'odd length');
  assert.equal(parseStroke({ c: 0, w: 0, p: [1.5, 2] }), null, 'fractions');
  assert.equal(parseStroke({ c: 0, w: 0, p: [BOARD.width, 0] }), null, 'off the board');
  assert.equal(parseStroke({ c: 0, w: 0, p: Array.from({ length: BOARD.maxPoints * 2 + 2 }, (_, i) => i % 100) }), null, 'too long');
  assert.equal(parseStroke('scribble'), null);
  assert.equal(authorTag(ann).length, 8);
  assert.ok(strokeDistance({ id: 1, a: 'x', c: 0, w: 0, p: [0, 0, 10, 0] }, 5, 3) === 3);
});

test('one person draws on a board at a time, from in front of it, and the lock lapses when they leave', () => {
  const boards = fresh();
  const now = 1_000_000;
  assert.match(boards.lock(0, 1, ann, 0, 0, now), /Step up/);
  assert.equal(boards.lock(0, 1, ann, at(0).x, at(0).z, now), null);
  assert.equal(boards.holder(0), 1);
  assert.match(boards.lock(0, 2, bo, at(0).x, at(0).z, now), /Someone else/);
  assert.equal(boards.lock(1, 2, bo, at(1).x, at(1).z, now), null, 'another board is free');
  // Walking away frees the board on the next tick; so does the timeout.
  assert.deepEqual(boards.tick(now + 1, (n) => (n === 1 ? { x: 0, z: 0 } : at(1))), [0]);
  assert.equal(boards.holder(0), 0);
  assert.deepEqual(boards.tick(now + BOARD.lockMs + 1, (n) => at(n === 2 ? 1 : 0)), [1]);
  // Leaving the harbour frees every board the player held.
  boards.lock(2, 3, ann, at(2).x, at(2).z, now);
  boards.lock(3, 3, ann, at(3).x, at(3).z, now);
  assert.deepEqual(boards.release(3), [2, 3]);
  assert.equal(boards.lock(4, 9, bo, at(4).x, at(4).z, now), null);
  boards.unlock(4, 9);
  assert.equal(boards.holder(4), 0);
});

test('strokes need the chalk, persist, and can be erased by whoever holds it', () => {
  const boards = fresh();
  const now = 2_000_000;
  const line = { c: 2, w: 1, p: [10, 10, 40, 40] };
  assert.match(boards.stroke(0, 1, ann, line, now), /Take the board/);
  boards.lock(0, 1, ann, at(0).x, at(0).z, now);
  const { stroke: s1 } = boards.stroke(0, 1, ann, line, now);
  assert.equal(typeof s1, 'object');
  assert.equal(s1.a, authorTag(ann));
  assert.equal(s1.t, now);
  assert.match(boards.stroke(0, 1, ann, { c: 0, w: 0, p: [1] }, now), /could not be read/);
  boards.unlock(0, 1);
  boards.lock(0, 2, bo, at(0).x, at(0).z, now);
  const { stroke: s2 } = boards.stroke(0, 2, bo, { c: 3, w: 0, p: [5, 5] }, now);
  assert.equal(boards.state(0).strokes.length, 2);
  // Bo holds the chalk, so Ann's line is Bo's to rub out; Ann, who does not, cannot.
  assert.deepEqual(boards.erase(0, 1, s1.id), [], 'the chalk is what erases, not authorship');
  assert.deepEqual(boards.erase(0, 2, s1.id), [s1.id]);
  assert.deepEqual(boards.erase(0, 2, s1.id), [], 'a line is erased once');
  assert.deepEqual(boards.clear(0, ann), [], "nothing of Ann's is left");
  assert.deepEqual(boards.clear(0, bo), [s2.id]);
  assert.equal(boards.state(0).strokes.length, 0);
  // A dockkeeper wipes everything.
  boards.stroke(0, 2, bo, line, now);
  boards.unlock(0, 2);
  boards.lock(0, 1, ann, at(0).x, at(0).z, now);
  boards.stroke(0, 1, ann, line, now);
  assert.equal(boards.clear(0, 'z'.repeat(64), true).length, 2);
  // A full board refuses more.
  for (let i = 0; i < BOARD.maxStrokes; i++) boards.stroke(0, 1, ann, { c: 0, w: 0, p: [i % BOARD.width, 1] }, now);
  assert.equal(boards.stroke(0, 1, ann, line, now).dropped.length, 1, 'a full board makes room');
  assert.equal(boards.state(0).strokes.length, BOARD.maxStrokes);
});

test('drawings age out: a full board drops its oldest line, the chalk holder can wipe it, and nothing outlives a week', () => {
  const db = new DatabaseSync(':memory:');
  migrate(db);
  const store = createBoardStore(db);
  const boards = new Boards(store, 0);
  const day = 24 * 3600000;
  boards.lock(0, 1, ann, at(0).x, at(0).z, 0);
  const first = boards.stroke(0, 1, ann, { c: 0, w: 0, p: [1, 1] }, 0);
  assert.equal(first.dropped.length, 0);
  for (let i = 1; i < BOARD.maxStrokes; i++) boards.stroke(0, 1, ann, { c: 0, w: 0, p: [i % BOARD.width, 2] }, 1000);
  const overflow = boards.stroke(0, 1, ann, { c: 1, w: 1, p: [3, 3] }, 2000);
  assert.deepEqual(overflow.dropped, [first.stroke.id], 'the oldest line makes way');
  assert.equal(boards.state(0).strokes.length, BOARD.maxStrokes);
  // Bo cannot erase Ann's lines, but a day later, holding the chalk, he can clear them.
  boards.unlock(0, 1);
  const later = 2000 + day;
  boards.lock(0, 2, bo, at(0).x, at(0).z, later);
  boards.stroke(0, 2, bo, { c: 2, w: 0, p: [9, 9] }, later);
  assert.equal(boards.tidy(0, 9, later).length, 0, 'only the chalk holder wipes the board');
  const tidied = boards.tidy(0, 2, later);
  assert.equal(tidied.length, BOARD.maxStrokes, 'the whole board went, fresh lines and all');
  assert.deepEqual(boards.state(0).strokes, [], 'nothing is left on it');
  boards.stroke(0, 2, bo, { c: 2, w: 0, p: [9, 9] }, later);
  // A week on, even the fresh line is gone, on the next maintenance pass and on a restart.
  assert.deepEqual(boards.maintain(later + 1000), [], 'not yet time to prune');
  const surviving = boards.state(0).strokes.map((line) => line.id);
  const pruned = boards.maintain(later + BOARD.keepMs + 1);
  assert.deepEqual(pruned, [{ board: 0, ids: surviving }]);
  boards.lock(1, 1, ann, at(1).x, at(1).z, 0);
  boards.stroke(1, 1, ann, { c: 0, w: 0, p: [4, 4] }, 0);
  assert.equal(new Boards(store, 8 * day).state(1).strokes.length, 0, 'a restart prunes too');
});

test('strokes survive a restart because they live in the database', () => {
  const db = new DatabaseSync(':memory:');
  migrate(db);
  const store = createBoardStore(db);
  const first = new Boards(store);
  first.lock(1, 1, ann, at(1).x, at(1).z, 5);
  const { stroke: s } = first.stroke(1, 1, ann, { c: 4, w: 3, p: [1, 2, 3, 4] }, 5);
  const second = new Boards(store, 6);
  assert.deepEqual(second.state(1).strokes, [s]);
  second.lock(1, 2, bo, at(1).x, at(1).z, 6);
  assert.deepEqual(second.erase(1, 2, s.id), [s.id], 'and can be rubbed out after a restart');
});
