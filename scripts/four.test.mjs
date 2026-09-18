import test from 'node:test';
import assert from 'node:assert/strict';
import { FOUR, FourTable, aiMove, dropPiece, emptyBoard, winner, isFull } from '../server/dist/server/src/minigames/four.js';
import { LANDMARKS } from '../server/dist/packages/shared/landmarks.js';
import { mulberry32 } from '../server/dist/server/src/minigames/solo.js';

const here = LANDMARKS.four;
const drop = (board, cols, piece) => cols.forEach((c) => dropPiece(board, c, piece));

test('four in a row is found along every direction and columns fill up', () => {
  let board = emptyBoard();
  drop(board, [0, 1, 2, 3], 1);
  assert.equal(winner(board), 1, 'a row');
  board = emptyBoard();
  drop(board, [2, 2, 2, 2], 2);
  assert.equal(winner(board), 2, 'a column');
  board = emptyBoard();
  // A rising diagonal for player 1, with player 2 filling underneath.
  drop(board, [1, 2, 2, 3, 3, 3], 2);
  drop(board, [0, 1, 2, 3], 1);
  assert.equal(winner(board), 1, 'a diagonal');
  board = emptyBoard();
  drop(board, [2, 1, 1, 0, 0, 0], 2);
  drop(board, [3, 2, 1, 0], 1);
  assert.equal(winner(board), 1, 'the other diagonal');
  board = emptyBoard();
  for (let i = 0; i < FOUR.rows; i++) assert.ok(dropPiece(board, 0, 1) >= 0);
  assert.equal(dropPiece(board, 0, 1), -1, 'a full column refuses a piece');
  assert.equal(dropPiece(board, 9, 1), -1, 'so does a column off the board');
  assert.equal(isFull(emptyBoard()), false);
});

test('the Dockkeeper takes a win, blocks a loss, prefers the middle and never loses to a random opponent it could have stopped', () => {
  let board = emptyBoard();
  drop(board, [0, 1, 2], 2);
  assert.equal(aiMove(board, 2), 3, 'takes the win');
  board = emptyBoard();
  drop(board, [4, 5, 6], 1);
  assert.equal(aiMove(board, 2), 3, 'blocks the threat');
  assert.equal(aiMove(emptyBoard(), 2), 3, 'opens in the middle');
  // Many games against a random legal mover: the Dockkeeper never loses one it could have blocked.
  const random = mulberry32(99);
  let wins = 0,
    games = 0;
  for (let g = 0; g < 200; g++) {
    board = emptyBoard();
    let turn = g % 2;
    for (let move = 0; move < FOUR.cols * FOUR.rows; move++) {
      if (turn === 1) dropPiece(board, aiMove(board, 2), 2);
      else {
        const legal = Array.from({ length: FOUR.cols }, (_, c) => c).filter((c) => board[(FOUR.rows - 1) * FOUR.cols + c] === 0);
        dropPiece(board, legal[Math.floor(random() * legal.length)], 1);
      }
      const w = winner(board);
      if (w || isFull(board)) {
        games++;
        if (w === 2) wins++;
        break;
      }
      turn = 1 - turn;
    }
  }
  assert.ok(wins / games > 0.9, `the Dockkeeper won ${wins} of ${games}`);
});

test('the table seats two, runs turns with a clock, pays a rematch, and forfeits a walkout', () => {
  const table = new FourTable();
  let now = 100000;
  assert.match(table.handle(1, 'Ann', 0, 0, 'sit', undefined, now), /Walk over/, 'must be at the table');
  assert.equal(table.handle(1, 'Ann', here.x, here.z, 'sit', undefined, now), null);
  assert.equal(table.phase, 'waiting');
  assert.equal(table.handle(2, 'Bo', here.x, here.z, 'sit', undefined, now), null);
  assert.equal(table.phase, 'playing');
  assert.equal(table.turn, 0);
  assert.match(table.handle(2, 'Bo', here.x, here.z, 'drop', 3, now), /Not your turn/);
  assert.match(table.handle(3, 'Cy', here.x, here.z, 'sit', undefined, now), /game is on/);
  assert.equal(table.handle(3, 'Cy', here.x + 1, here.z, 'watch', undefined, now), null);
  assert.equal(table.view(3).watching, 1);
  assert.equal(table.view(3).you, -1);
  assert.equal(table.view(1).you, 0);
  // Ann wins in column 3 while Bo plays elsewhere.
  for (let i = 0; i < 3; i++) {
    assert.equal(table.handle(1, 'Ann', here.x, here.z, 'drop', 3, now), null);
    assert.equal(table.handle(2, 'Bo', here.x, here.z, 'drop', 0 + (i % 2), now), null);
  }
  assert.equal(table.handle(1, 'Ann', here.x, here.z, 'drop', 3, now), null);
  assert.equal(table.phase, 'over');
  assert.equal(table.winner, 1);
  const results = table.takeResults();
  assert.deepEqual(results.map((r) => [r.n, r.outcome, r.forfeit, r.vsAi]), [[1, 'win', false, false], [2, 'loss', false, false]]);
  assert.deepEqual(table.takeResults(), [], 'results are paid once');
  // Both want another: the board resets and play continues.
  table.handle(1, 'Ann', here.x, here.z, 'rematch', undefined, now);
  assert.equal(table.phase, 'over');
  table.handle(2, 'Bo', here.x, here.z, 'rematch', undefined, now);
  assert.equal(table.phase, 'playing');
  assert.ok(table.board.every((c) => c === 0));
  // A turn left too long is a forfeit against whoever was thinking.
  table.tick(now + FOUR.turnMs + 1, () => here);
  assert.equal(table.phase, 'over');
  assert.equal(table.forfeit, true);
  assert.equal(table.winner, 2);
  assert.deepEqual(table.takeResults().map((r) => [r.n, r.outcome, r.forfeit]), [[1, 'loss', true], [2, 'win', true]]);
  // Walking out during a game forfeits it and frees the seat.
  now += 1000;
  table.handle(1, 'Ann', here.x, here.z, 'rematch', undefined, now);
  table.handle(2, 'Bo', here.x, here.z, 'rematch', undefined, now);
  assert.equal(table.phase, 'playing');
  table.handle(2, 'Bo', here.x, here.z, 'leave', undefined, now);
  assert.equal(table.phase, 'over');
  assert.equal(table.winner, 1);
  assert.equal(table.seats[1], null);
  // A watcher who wanders off is dropped.
  assert.equal(table.tick(now, (n) => (n === 3 ? { x: here.x + 30, z: here.z } : here)), true);
  assert.equal(table.view(1).watching, 0);
});

test('alone at the table you can play the Dockkeeper, who moves on its own clock, and a rematch is immediate', () => {
  const table = new FourTable();
  let now = 5000;
  table.handle(7, 'Dee', here.x, here.z, 'sit', undefined, now);
  assert.equal(table.handle(7, 'Dee', here.x, here.z, 'solo', undefined, now), null);
  assert.equal(table.phase, 'playing');
  assert.equal(table.ai, true);
  assert.equal(table.view(7).seats[1], 'Dockkeeper');
  table.handle(7, 'Dee', here.x, here.z, 'drop', 3, now);
  assert.equal(table.turn, 1);
  assert.equal(table.tick(now, () => here), true, 'the drop needs a fresh view');
  assert.equal(table.tick(now + 100, () => here), false, 'the Dockkeeper waits a moment');
  assert.equal(table.tick(now + FOUR.aiDelayMs + 1, () => here), true);
  assert.equal(table.turn, 0, 'and then it has moved');
  assert.equal(table.board.filter((c) => c === 2).length, 1);
  // Play out the game with the human dropping in column 0 forever; the Dockkeeper wins or draws.
  for (let i = 0; i < 60 && table.phase === 'playing'; i++) {
    now += 1000;
    if (table.turn === 0) table.handle(7, 'Dee', here.x, here.z, 'drop', i % 7, now);
    table.tick(now + FOUR.aiDelayMs + 1, () => here);
  }
  assert.equal(table.phase, 'over');
  const [result] = table.takeResults();
  assert.equal(result.n, 7);
  assert.equal(result.vsAi, true);
  table.handle(7, 'Dee', here.x, here.z, 'rematch', undefined, now);
  assert.equal(table.phase, 'playing', 'no need to wait for the Dockkeeper to agree');
  // A second person sitting down replaces the Dockkeeper between games.
  table.handle(7, 'Dee', here.x, here.z, 'leave', undefined, now);
  assert.equal(table.phase, 'empty');
  assert.deepEqual(table.snapshot(), [0, 0, 0]);
});

test('a wager is set by the first seat, matched by the second, collected at the start and paid to the winner', () => {
  // Arrange: one player sits down and puts 50 gold on the table.
  const table = new FourTable();
  const now = 1000;
  table.handle(1, 'Ada', here.x, here.z, 'sit', undefined, now, 300);
  assert.equal(table.handle(1, 'Ada', here.x, here.z, 'stake', undefined, now, 300, 50), null);
  assert.equal(table.view(1).stake, 50);
  assert.equal(table.takeCharges().length, 0, 'nothing is collected while the table waits');

  // Act / Assert: the second seat has to match it, and afford it.
  assert.match(table.handle(2, 'Bo', here.x, here.z, 'sit', undefined, now, 300), /Match it/);
  assert.match(table.handle(2, 'Bo', here.x, here.z, 'sit', undefined, now, 20, 50), /more gold/);
  assert.equal(table.handle(2, 'Bo', here.x, here.z, 'sit', undefined, now, 300, 50), null);
  assert.equal(table.phase, 'playing');
  assert.deepEqual(table.takeCharges(), [{ n: 1, amount: 50 }, { n: 2, amount: 50 }]);
  assert.equal(table.view(1).pot, 100);

  // Act: seat one wins.
  for (const col of [0, 1, 2, 3]) {
    table.handle(1, 'Ada', here.x, here.z, 'drop', col, now);
    if (table.phase === 'playing') table.handle(2, 'Bo', here.x, here.z, 'drop', col, now);
  }
  assert.equal(table.winner, 1);
  const results = table.takeResults();
  assert.deepEqual(results.map((r) => [r.n, r.outcome, r.wager]), [[1, 'win', 50], [2, 'loss', 50]]);
});

test('a wagered game returns both stakes on a draw, and a table with nobody at it carries no wager', () => {
  const table = new FourTable();
  const now = 1000;
  table.handle(1, 'Ada', here.x, here.z, 'sit', undefined, now, 300);
  table.handle(1, 'Ada', here.x, here.z, 'stake', undefined, now, 300, 25);
  table.handle(2, 'Bo', here.x, here.z, 'sit', undefined, now, 300, 25);
  table.takeCharges();
  // Fill the board to a draw: each player always picks a column that does not win for them.
  while (table.phase === 'playing') {
    const who = table.turn === 0 ? 1 : 2;
    const piece = table.turn + 1;
    const safe = [0, 1, 2, 3, 4, 5, 6].filter((col) => {
      const copy = table.board.slice();
      return dropPiece(copy, col, piece) >= 0 && winner(copy) !== piece;
    });
    assert.ok(safe.length, 'a drawn game is always reachable from this position');
    table.handle(who, who === 1 ? 'Ada' : 'Bo', here.x, here.z, 'drop', safe[0], now);
  }
  assert.equal(table.winner, 3, 'the board filled with no line');
  assert.deepEqual(table.takeResults().map((r) => [r.outcome, r.wager]), [['draw', 25], ['draw', 25]]);
  // Both leave: the next pair at the table starts at nothing.
  table.handle(1, 'Ada', here.x, here.z, 'leave', undefined, now);
  table.handle(2, 'Bo', here.x, here.z, 'leave', undefined, now);
  assert.equal(table.stake, 0);
  assert.equal(table.view(1).stake, 0);
});

test('the Dockkeeper never plays for gold', () => {
  const table = new FourTable();
  const now = 1000;
  table.handle(1, 'Ada', here.x, here.z, 'sit', undefined, now, 300);
  table.handle(1, 'Ada', here.x, here.z, 'stake', undefined, now, 300, 100);
  table.handle(1, 'Ada', here.x, here.z, 'solo', undefined, now, 300);
  assert.equal(table.stake, 0);
  assert.equal(table.takeCharges().length, 0);
  // Only the player who sat down first names the wager, and only before the game.
  assert.match(table.handle(2, 'Bo', here.x, here.z, 'stake', undefined, now, 300, 10), /sat down first/);
});
