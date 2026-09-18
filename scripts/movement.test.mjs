import test from 'node:test';
import assert from 'node:assert/strict';
import { MOVE, stepMovement, createMoveState, speedOf } from '../server/dist/packages/shared/movement.js';
import { walkable, props, inCastZone, onPier, PIER, SHORE_SOUTH, shoreRadius, benchSeat, benchUnder, BENCH_SEAT_Y, GROUND_Y } from '../server/dist/packages/shared/layout.js';
import { Predictor } from '../server/dist/packages/shared/prediction.js';
import { Interpolator, ClockSync } from '../server/dist/packages/shared/interpolation.js';
import { parseMoveCommand } from '../server/dist/packages/shared/protocol.js';
import { CommandQueue } from '../server/dist/server/src/commands.js';

test('movement accelerates smoothly and never exceeds the walking speed, even diagonally', () => {
  // Arrange
  const s = createMoveState(-6, -6);
  // Act
  stepMovement(s, 1, 1, MOVE.dt);
  const firstStep = speedOf(s);
  for (let i = 0; i < 60; i++) stepMovement(s, 1, 1, MOVE.dt);
  // Assert
  assert.ok(firstStep > 0 && firstStep < MOVE.speed, 'first step is a partial acceleration');
  assert.ok(Math.abs(speedOf(s) - MOVE.speed) < 1e-9, 'settles at exactly the top speed');
});

test('releasing input decelerates to a full stop instead of sliding forever', () => {
  const s = createMoveState(0, 8);
  for (let i = 0; i < 30; i++) stepMovement(s, 0, -1, MOVE.dt);
  for (let i = 0; i < 30; i++) stepMovement(s, 0, 0, MOVE.dt);
  assert.equal(speedOf(s), 0);
});

test('walking into the shoreline slides along it rather than stopping dead', () => {
  // Start half a metre inside the north shore and push out and sideways.
  const s = createMoveState(0, -(shoreRadius(-Math.PI / 2) - 0.5), 0);
  for (let i = 0; i < 30; i++) stepMovement(s, 1, -1, MOVE.dt);
  assert.ok(s.x > 2, 'kept moving sideways along the shore');
  assert.ok(walkable(s.x, s.z), 'never left the island');
});

test('walking diagonally toward the pier entrance funnels onto the planks instead of the shore', () => {
  const s = createMoveState(1.2, SHORE_SOUTH - 1.5);
  for (let i = 0; i < 120; i++) stepMovement(s, 0.35, 1, MOVE.dt);
  // The stem's rails keep the diagonal on the planks; past them the crossbar opens up.
  assert.ok(onPier(s.x, s.z) && s.z > PIER.crossStart, `ended at (${s.x.toFixed(2)}, ${s.z.toFixed(2)})`);
});

test('props such as the lighthouse block walking and the pier stays walkable', () => {
  assert.equal(walkable(props.lighthouse.x, props.lighthouse.z), false);
  assert.equal(walkable(0, 20), true);
  assert.equal(walkable(0, PIER.end + 1), false, 'past the pier head is water');
  assert.equal(walkable(4, PIER.crossStart - 2), false, 'beside the stem is water');
  const s = createMoveState(props.lighthouse.x - 3, props.lighthouse.z);
  for (let i = 0; i < 60; i++) stepMovement(s, 1, 0, MOVE.dt);
  assert.ok(!walkable(props.lighthouse.x, props.lighthouse.z) && Math.hypot(s.x - props.lighthouse.x, s.z - props.lighthouse.z) >= props.lighthouse.r - 1e-9);
});

test('prediction matches the authoritative result exactly once every command is acknowledged', () => {
  // Arrange: a client predicting locally and a server executing the same commands four ticks later.
  const client = new Predictor({ x: 0, z: 8 });
  const server = createMoveState(0, 8);
  const inFlight = [];
  let ack = 0;
  // Act
  for (let tick = 0; tick < 120; tick++) {
    const command = client.tick(tick < 60 ? 1 : 0, tick < 90 ? 1 : -1);
    if (command) inFlight.push(command);
    if (tick >= 4 && inFlight.length) {
      const c = inFlight.shift();
      stepMovement(server, c.dx, c.dz, MOVE.dt);
      ack = c.seq;
    }
    if (tick % 3 === 0 && ack) {
      const error = client.reconcile(ack, server);
      assert.ok(error < 1e-9, `no visible correction when server agrees (tick ${tick}, error ${error})`);
    }
  }
  while (inFlight.length) {
    const c = inFlight.shift();
    stepMovement(server, c.dx, c.dz, MOVE.dt);
    ack = c.seq;
  }
  client.reconcile(ack, server);
  // Assert
  assert.equal(client.pending.length, 0);
  assert.deepEqual([client.state.x, client.state.z], [server.x, server.z]);
});

test('a rejected move is corrected smoothly, and a large error snaps immediately', () => {
  const client = new Predictor({ x: 0, z: 8 });
  for (let i = 0; i < 6; i++) client.tick(1, 0);
  // Server refused to move (for example the player started fishing).
  const error = client.reconcile(client.seq, createMoveState(0, 8));
  assert.ok(error > 0 && error < MOVE.snapDistance);
  assert.ok(Math.abs(client.renderX(1) - error) < 1e-9, 'render position still shows the old spot');
  for (let i = 0; i < 120; i++) client.relax(1 / 60);
  assert.ok(Math.abs(client.renderX(1)) < 0.01, 'offset decays toward the authoritative position');
  client.tick(1, 0);
  client.reconcile(client.seq, createMoveState(-10, 0));
  assert.equal(client.offsetX, 0);
  assert.equal(client.renderX(1), -10);
});

test('the server executes at most the allowed command rate so flooding cannot speed a player up', () => {
  const queue = new CommandQueue();
  const s = createMoveState(0, 8);
  let seq = 0;
  // Simulate one second at 60 Hz with a client sending three commands per tick (180/s).
  for (let tick = 0; tick < 60; tick++) {
    for (let k = 0; k < 3; k++) queue.push({ seq: ++seq, dx: 0, dz: 1 }, tick * 16.67);
    queue.drain(1 / 60, (c) => stepMovement(s, c.dx, c.dz, MOVE.dt));
  }
  const honest = createMoveState(0, 8);
  for (let i = 0; i < MOVE.commandRate + MOVE.commandBurst; i++) stepMovement(honest, 0, 1, MOVE.dt);
  assert.ok(s.z - 8 <= honest.z - 8 + 1e-9, 'flooder moved no further than the rate plus burst allowance');
  assert.equal(queue.lastSeq, seq, 'dropped commands are still acknowledged so the client discards them');
  assert.ok(queue.dropped > 0);
});

test('out-of-order and duplicate commands are ignored', () => {
  const queue = new CommandQueue();
  assert.equal(queue.push({ seq: 5, dx: 0, dz: 0 }, 0), true);
  queue.drain(1, () => {});
  assert.equal(queue.push({ seq: 5, dx: 0, dz: 0 }, 0), false);
  assert.equal(queue.push({ seq: 3, dx: 0, dz: 0 }, 0), false);
});

test('interpolation buffer blends between timestamped samples and limits extrapolation', () => {
  const buffer = new Interpolator(4);
  const out = { x: 0, z: 0, heading: 0, speed: 0 };
  buffer.push(0, 0, 0, 5, 0, 0);
  buffer.push(100, 0.5, 0, 5, 0, 0);
  buffer.push(200, 1, 0, 5, 0, 0);
  buffer.push(150, 9, 9, 0, 0, 0); // stale, must be ignored
  buffer.sample(150, out);
  assert.ok(Math.abs(out.x - 0.75) < 1e-9);
  buffer.sample(1000, out);
  assert.ok(Math.abs(out.x - (1 + 5 * 0.12)) < 1e-9, 'extrapolates at most 120 ms');
  assert.equal(out.speed, 0, 'stops animating once extrapolation runs out');
  buffer.sample(-50, out);
  assert.equal(out.x, 0);
});

test('clock sync tracks the earliest arrival and widens the delay under jitter', () => {
  const steady = new ClockSync(100);
  for (let i = 0; i < 10; i++) steady.observe(1000 + i * 100, 500 + i * 100);
  assert.ok(Math.abs(steady.offset - 500) < 1e-9);
  const calm = steady.renderDelay();
  const jittery = new ClockSync(100);
  for (let i = 0; i < 10; i++) jittery.observe(1000 + i * 100, 500 + i * 100 + (i % 2 ? 60 : 0));
  assert.ok(jittery.renderDelay() > calm);
  assert.ok(jittery.renderDelay() <= 300);
});

test('move commands are validated before they touch the simulation', () => {
  assert.equal(parseMoveCommand({ seq: 0, dx: 0, dz: 0 }), null);
  assert.equal(parseMoveCommand({ seq: 1.5, dx: 0, dz: 0 }), null);
  assert.equal(parseMoveCommand({ seq: 1, dx: 'up', dz: 0 }), null);
  assert.equal(parseMoveCommand({ seq: 1, dx: Infinity, dz: 0 }), null);
  assert.deepEqual(parseMoveCommand({ seq: 7, dx: 9, dz: -9 }), { seq: 7, dx: 1, dz: -1 });
});

test('the pier head is a walkable crossbar whose edges and shoulders act like walls', () => {
  // Arrange: the crossbar spans well past the stem at the seaward end.
  assert.ok(walkable(PIER.crossHalfWidth - 0.5, PIER.end - 1));
  assert.ok(!walkable(PIER.crossHalfWidth + 0.5, PIER.end - 1), 'past the end of an arm is water');
  assert.ok(!walkable(6, PIER.crossStart - 1), 'the water beside the stem is still water');
  // Act: walk out along the stem, then sideways down the arm.
  const s = createMoveState(0, PIER.crossStart - 8);
  for (let i = 0; i < 80; i++) stepMovement(s, 0, 1, MOVE.dt);
  assert.ok(s.z > PIER.crossStart, `reached the crossbar (z ${s.z.toFixed(2)})`);
  for (let i = 0; i < 120; i++) stepMovement(s, 1, 0, MOVE.dt);
  // Assert: stopped at the arm's end, still on the deck.
  assert.ok(s.x > PIER.halfWidth + 3 && s.x < PIER.crossHalfWidth, `walked out the arm to x ${s.x.toFixed(2)}`);
  assert.ok(walkable(s.x, s.z));
  // Walking back toward land from the arm is blocked by the crossbar's shoulder.
  const shoulder = createMoveState(6, PIER.crossStart + 0.6);
  for (let i = 0; i < 60; i++) stepMovement(shoulder, 0, -1, MOVE.dt);
  assert.ok(shoulder.z >= PIER.crossStart - 1e-6, `held on the deck at z ${shoulder.z.toFixed(2)}`);
  assert.ok(walkable(shoulder.x, shoulder.z));
});

test('the whole pier head can be fished from, and the island cannot', () => {
  assert.ok(inCastZone(0, PIER.end - 1));
  assert.ok(inCastZone(-8, PIER.end - 2), 'the far end of an arm is a fishing spot');
  assert.ok(inCastZone(8, PIER.end - 3));
  assert.ok(inCastZone(0, PIER.crossStart - 4), 'the stem over the water is too');
  assert.ok(!inCastZone(0, 10), 'standing on the island is not');
  assert.ok(!inCastZone(0, PIER.deckFrom + 1), 'nor is the boardwalk over the sand');
  assert.ok(!inCastZone(6, PIER.crossStart - 2), 'nor is the water beside the stem');
});

test('anything circling the island faces along its path, not broadside to it', async () => {
  const { tangentHeading } = await import('../server/dist/packages/shared/orientation.js');
  // A model built nose-along-+X, turned by this heading, must point the way it travels.
  for (const direction of [1, -1])
    for (let a = -Math.PI; a <= Math.PI; a += 0.31) {
      const heading = tangentHeading(a);
      const nose = [Math.cos(heading), -Math.sin(heading)];
      const travel = [-Math.sin(a) * direction, Math.cos(a) * direction];
      const alignment = nose[0] * travel[0] + nose[1] * travel[1];
      assert.ok(Math.abs(Math.abs(alignment) - 1) < 1e-9, `at angle ${a.toFixed(2)} the nose was off by ${(1 - Math.abs(alignment)).toFixed(4)}`);
    }
});

test('everything standing on the pier rests on the planks rather than hovering', async () => {
  const { PIER, DECK_STAND_Y, PIER_LANTERN } = await import('../server/dist/packages/shared/layout.js');
  // The deck surface, and the line anything standing on it is planted at.
  assert.ok(DECK_STAND_Y <= PIER.deckTop && DECK_STAND_Y > PIER.deckTop - 0.1, 'planted just inside the planks');
  // The lantern post starts at that line and its glass and cap stack above it.
  const postBase = PIER_LANTERN.postCentreY - PIER_LANTERN.postHeight / 2;
  assert.ok(Math.abs(postBase - DECK_STAND_Y) < 1e-9, `lantern post base ${postBase} should sit on ${DECK_STAND_Y}`);
  assert.ok(PIER_LANTERN.glassY > PIER_LANTERN.postCentreY, 'the glass sits above the middle of the post');
  assert.ok(PIER_LANTERN.capY > PIER_LANTERN.glassY, 'and the cap above the glass');
  assert.ok(PIER_LANTERN.lightY > PIER.deckTop && PIER_LANTERN.lightY < PIER_LANTERN.capY, 'the lamp glows inside the lantern');
});

test('the two lanterns stand on the pier head, one at each outer corner', async () => {
  const { PIER, PIER_LANTERNS, onPier } = await import('../server/dist/packages/shared/layout.js');
  assert.equal(PIER_LANTERNS.length, 2, 'only the lamps that can afford a real light exist');
  for (const lantern of PIER_LANTERNS) {
    assert.ok(onPier(lantern.x, lantern.z), `lantern at (${lantern.x}, ${lantern.z}) is off the deck`);
    assert.ok(lantern.z >= PIER.crossStart, 'on the crossbar, where people fish');
    assert.ok(Math.abs(lantern.x) <= PIER.crossHalfWidth && Math.abs(lantern.x) > PIER.crossHalfWidth - 1.5, 'at the outer corner');
  }
  assert.equal(PIER_LANTERNS[0].x, -PIER_LANTERNS[1].x, 'one each side');
});

test('sitting puts a player on the bench and keeps them there, and standing up walks them off it', () => {
  // Arrange: the seat is on the bench itself, not a step out in front of it.
  const bench = props.benches[0];
  const seat = benchSeat(bench);
  assert.ok(Math.hypot(seat.x - bench.x, seat.z - bench.z) < 0.2, 'the seat is the bench, not the ground in front of it');
  assert.equal(benchUnder(seat.x, seat.z), bench, 'a player there is sitting on that bench');
  assert.equal(benchUnder(0, 12), null, 'and nobody at the spawn is');
  assert.ok(BENCH_SEAT_Y > GROUND_Y, 'the seat is off the ground, so the avatar rides up onto it');

  // Act: seated means frozen, tick after tick.
  const s = createMoveState(seat.x, seat.z, seat.heading);
  for (let i = 0; i < 90; i++) stepMovement(s, 0, 0, MOVE.dt, true);
  // Assert: the bench is a blocker, and resolving used to throw the sitter clear of it.
  assert.equal(s.x, seat.x, 'still on the seat');
  assert.equal(s.z, seat.z);
  assert.equal(speedOf(s), 0);

  // Act / Assert: getting up walks out of the bench a step at a time, never in one jump.
  const up = createMoveState(seat.x, seat.z, seat.heading);
  const maxStep = MOVE.speed * MOVE.dt + 1e-6;
  let previous = { x: up.x, z: up.z };
  for (let i = 0; i < 60; i++) {
    stepMovement(up, Math.sin(bench.heading), Math.cos(bench.heading), MOVE.dt);
    assert.ok(Math.hypot(up.x - previous.x, up.z - previous.z) <= maxStep, `step ${i} is a walk, not a teleport`);
    previous = { x: up.x, z: up.z };
  }
  assert.ok(Math.hypot(up.x - bench.x, up.z - bench.z) > bench.r, 'and ends up clear of the bench');
  assert.equal(benchUnder(up.x, up.z), null);
});
