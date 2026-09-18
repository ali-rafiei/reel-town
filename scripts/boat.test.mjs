import test from 'node:test';
import assert from 'node:assert/strict';
import { boatable, resolveBoat, BUOYS, BOAT_SPAWN, BOAT_BOUNDS, shoreDistance, nearPier, PIER, walkable } from '../server/dist/packages/shared/layout.js';
import { BOAT, MOVE, createMoveState, stepMovement, copyMoveState } from '../server/dist/packages/shared/movement.js';
import { ROW } from '../server/dist/packages/shared/protocol.js';
import { BUOY, BuoyRun, buoyScore } from '../server/dist/server/src/minigames/buoy.js';
import { LANDMARKS } from '../server/dist/packages/shared/landmarks.js';

test('the water a boat may use is off the beach, inside the course and clear of the pier', () => {
  assert.equal(boatable(0, 0), false, 'the island is not water');
  assert.equal(boatable(0, 60), false, 'the open sea beyond the course is out of bounds');
  assert.equal(boatable(0, PIER.end + 0.5), false, 'right against the pier head');
  assert.equal(boatable(PIER.halfWidth + 0.5, PIER.crossStart - 3), false, 'right beside the stem');
  assert.ok(boatable(BOAT_SPAWN.x, BOAT_SPAWN.z), 'the push-off point is on the water');
  for (const b of BUOYS) assert.ok(boatable(b.x, b.z));
  // Every boatable sample is at least the shore margin off the coast and not near the pier.
  for (let x = -45; x <= 45; x += 1.5)
    for (let z = -45; z <= 45; z += 1.5)
      if (boatable(x, z)) {
        assert.ok(shoreDistance(x, z) <= -BOAT_BOUNDS.shoreMargin);
        assert.ok(!nearPier(x, z, BOAT_BOUNDS.pierMargin));
        assert.ok(Math.hypot(x, z) <= BOAT_BOUNDS.courseRadius);
      }
  assert.ok(walkable(LANDMARKS.buoy.x, LANDMARKS.buoy.z), 'the mooring is on the planks');
});

test('a boat rows faster than a walker, slides along the shore and the pier, and never runs aground', () => {
  const boat = createMoveState(BOAT_SPAWN.x, BOAT_SPAWN.z, 0, 'boat');
  // Row straight at the island for twenty seconds.
  for (let i = 0; i < 30 * 20; i++) {
    stepMovement(boat, -1, -1, MOVE.dt);
    assert.ok(boatable(boat.x, boat.z), `ran aground at (${boat.x.toFixed(1)}, ${boat.z.toFixed(1)})`);
  }
  assert.ok(shoreDistance(boat.x, boat.z) <= -BOAT_BOUNDS.shoreMargin + 1e-6);
  // Top speed is the boat's, not the walker's.
  const open = createMoveState(30, 30, 0, 'boat');
  let top = 0;
  for (let i = 0; i < 90; i++) {
    stepMovement(open, 0, -1, MOVE.dt);
    top = Math.max(top, Math.hypot(open.vx, open.vz));
  }
  assert.ok(Math.abs(top - BOAT.speed) < 0.05 && BOAT.speed > MOVE.speed);
  // Walking is untouched: the same call with the default mode still stops at the shore.
  const walker = createMoveState(0, 20, 0);
  assert.equal(walker.mode, 'walk');
  for (let i = 0; i < 30 * 6; i++) stepMovement(walker, 0.5, -1, MOVE.dt);
  assert.ok(walkable(walker.x, walker.z));
  // A state from an older server without a mode copies as walking.
  const to = createMoveState();
  copyMoveState({ x: 1, z: 2, vx: 0, vz: 0, heading: 0 }, to);
  assert.equal(to.mode, 'walk');
  // From just off the south beach, a push straight at the sand goes nowhere.
  const out = { x: 0, z: 0 };
  const edge = { x: 6, z: 26.9 };
  assert.ok(boatable(edge.x, edge.z));
  assert.equal(boatable(edge.x, edge.z - 3), false);
  resolveBoat(edge.x, edge.z, edge.x, edge.z - 3, out);
  assert.deepEqual(out, edge, 'a move fully aground is refused');
  assert.equal(ROW.mode, 13);
  assert.equal(ROW.length, 14);
});

test('a buoy run times from leaving the mooring, takes the buoys in order and scores by time', () => {
  const run = new BuoyRun(1, 1, 0);
  assert.equal(run.tick(100, BOAT_SPAWN), null, 'sitting at the mooring does not start the clock');
  // Rounding the second buoy first means nothing; the first one counts.
  assert.equal(run.tick(1000, BUOYS[1]), null);
  assert.equal(run.startedAt, 1000);
  assert.equal(run.next, 0);
  let t = 2000;
  for (const [i, b] of BUOYS.entries()) {
    const event = run.tick(t, { x: b.x + 1, z: b.z + 1 });
    assert.equal(event.next, i + 1);
    t += 5000;
  }
  assert.equal(run.finished(t), true);
  const summary = run.summary();
  assert.equal(summary.checkpoints, BUOYS.length);
  assert.equal(summary.timeMs, t - 5000 - 1000);
  assert.equal(summary.score, buoyScore(summary.timeMs));
  assert.ok(buoyScore(30000) > buoyScore(60000) && buoyScore(60000) > buoyScore(200000));
  assert.equal(buoyScore(1e9), BUOY.finishBonus, 'finishing at all is worth something');
  assert.equal(run.tick(t + 1, BUOYS[0]), null, 'a finished run stays finished');
  assert.equal(new BuoyRun(2, 1, 0).finished(BUOY.timeoutMs + 1), true, 'and an abandoned one times out');
});

test('the course starts at the buoy nearest the mooring and runs anticlockwise on screen', () => {
  const d = (b) => Math.hypot(b.x - BOAT_SPAWN.x, b.z - BOAT_SPAWN.z);
  for (const b of BUOYS) assert.ok(d(BUOYS[0]) <= d(b), 'the first buoy is the nearest');
  // The camera looks down from +z, so anticlockwise on screen is decreasing world angle.
  for (let i = 0; i < BUOYS.length - 1; i++) {
    const a = Math.atan2(BUOYS[i].z, BUOYS[i].x),
      b = Math.atan2(BUOYS[i + 1].z, BUOYS[i + 1].x);
    const turn = (a - b + Math.PI * 4) % (Math.PI * 2);
    assert.ok(turn > 0 && turn < Math.PI, `buoy ${i + 1} to ${i + 2} turns anticlockwise`);
  }
});
