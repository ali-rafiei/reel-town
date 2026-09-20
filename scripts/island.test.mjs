import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SHORE,
  SHORE_SOUTH,
  shoreRadius,
  shoreDistance,

  walkable,
  resolveMove,
  inPond,
  onPondDock,
  POND,
  POND_DOCK,
  groundHeight,
  GROUND,
  HILLS,
  onPier,
  PIER,
  CAST_ZONE,
  SPAWN,
  PATHS,
  onPath,
  blockers,
  capsules,
  trees,
  TREE_COUNT,
  ORCHARD_TREES,
  props,
  benchSeat,
  DRAWING_BOARDS,
  NOTICE_BOARD,
  SHOP_DOOR,
  THREADS_DOOR,
  SORTING_CRATES,
  CONTEST_SIGN,
  LOOKOUT,
  TIDE_POOLS,
  ORCHARD,
  WATERING_CAN,
  DOG,
  BUOYS,
  boatable,
  inCastZone,
  BENCH_RADIUS,
} from '../server/dist/packages/shared/layout.js';
import { LANDMARKS } from '../server/dist/packages/shared/landmarks.js';
import { stepMovement, createMoveState, MOVE } from '../server/dist/packages/shared/movement.js';
import { castLanding } from '../server/dist/packages/shared/game.js';
import { PIN_SPOTS } from '../server/dist/server/src/pins.js';
import { SORTING } from '../server/dist/server/src/minigames/sorting.js';

const insideBlocker = (x, z) =>
  blockers.some((b) => Math.hypot(x - b.x, z - b.z) < b.r) ||
  capsules.some((c) => {
    const dx = c.x2 - c.x1,
      dz = c.z2 - c.z1,
      t = Math.max(0, Math.min(1, ((x - c.x1) * dx + (z - c.z1) * dz) / (dx * dx + dz * dz)));
    return Math.hypot(x - (c.x1 + dx * t), z - (c.z1 + dz * t)) < c.r;
  });

test('the shoreline is a smooth star about three times the old island, with exactly the harmonics the water shader packs', () => {
  assert.equal(SHORE.harmonics.length, 4);
  assert.deepEqual(
    SHORE.harmonics.map(([k]) => k),
    [2, 3, 5, 7],
  );
  let area = 0,
    min = Infinity,
    max = 0;
  const steps = 3600;
  for (let i = 0; i < steps; i++) {
    const t = (i / steps) * Math.PI * 2,
      r = shoreRadius(t);
    min = Math.min(min, r);
    max = Math.max(max, r);
    area += (r * r * Math.PI) / steps;
    assert.ok(Math.abs(shoreRadius(t + Math.PI * 2) - r) < 1e-9, 'periodic');
    assert.ok(Math.abs(shoreRadius(t + 0.002) - r) < 0.05, 'continuous');
  }
  assert.ok(min >= 20 && max <= SHORE.maxRadius, `radius spans ${min.toFixed(1)}..${max.toFixed(1)}`);
  const ratio = area / (Math.PI * 15 * 15);
  assert.ok(ratio > 2.8 && ratio < 3.2, `area is ${ratio.toFixed(2)}x the old island`);
  assert.ok(Math.abs(SHORE_SOUTH - 25.2) < 0.5, `the pier leaves the sand at z ${SHORE_SOUTH.toFixed(2)}`);
  assert.ok(PIER.deckFrom < SHORE_SOUTH - 3 && CAST_ZONE.minZ >= SHORE_SOUTH - 0.5, 'planks start inland and casting starts over the water');
});

test('every point inland is walkable unless it is pond or prop, and every point at sea is not', () => {
  for (let x = -32; x <= 32; x += 0.5)
    for (let z = -32; z <= 32; z += 0.5) {
      const sd = shoreDistance(x, z);
      if (sd > 0.3) {
        const expected = (!inPond(x, z) || onPondDock(x, z)) && !insideBlocker(x, z);
        assert.equal(walkable(x, z), expected, `(${x}, ${z}) inland`);
      } else if (sd < -0.3 && !onPier(x, z) && !onPondDock(x, z)) assert.equal(walkable(x, z), false, `(${x}, ${z}) at sea`);
    }
});

test('walking into the sea slides along the coast at every bearing', () => {
  for (let i = 0; i < 36; i++) {
    const t = (i / 36) * Math.PI * 2;
    const r = shoreRadius(t) - 0.5;
    let x = Math.cos(t) * r,
      z = Math.sin(t) * r;
    if (!walkable(x, z) || onPier(x, z) || Math.abs(x) < 4) continue; // a tree at the water's edge or the pier mouth
    const start = { x, z };
    // Push outward and sideways: the player should be carried along the shore, not stopped.
    const out = { x: 0, z: 0 };
    let moved = 0;
    for (let step = 0; step < 30; step++) {
      const nx = x + (Math.cos(t) * 0.12 + -Math.sin(t) * 0.14),
        nz = z + (Math.sin(t) * 0.12 + Math.cos(t) * 0.14);
      resolveMove(x, z, nx, nz, out);
      assert.ok(walkable(out.x, out.z), `bearing ${i}: slid onto unwalkable ground`);
      moved += Math.hypot(out.x - x, out.z - z);
      x = out.x;
      z = out.z;
    }
    assert.ok(moved > 1.5, `bearing ${i}: moved only ${moved.toFixed(2)} from (${start.x.toFixed(1)}, ${start.z.toFixed(1)})`);
  }
});

test('the pond is water with a dock whose edges hold you like the pier head', () => {
  assert.equal(walkable(POND.x, POND.z), false);
  const tip = { x: POND_DOCK.x - POND_DOCK.halfW + 0.2, z: POND_DOCK.z };
  assert.ok(onPondDock(tip.x, tip.z) && inPond(tip.x, tip.z) && walkable(tip.x, tip.z), 'the dock tip stands over the water');
  const out = { x: 0, z: 0 };
  // Sideways off the dock: held on the planks.
  resolveMove(tip.x, tip.z, tip.x, tip.z + 1, out);
  assert.ok(onPondDock(out.x, out.z), 'stepping off the side of the dock is refused');
  assert.ok(Math.abs(out.z - tip.z) < 0.7);
  // Into the pond from the bank: slid around it.
  const bank = { x: POND.x, z: POND.z + POND.r + 0.3 };
  assert.ok(walkable(bank.x, bank.z));
  resolveMove(bank.x, bank.z, bank.x + 0.3, bank.z - 0.6, out);
  assert.ok(!inPond(out.x, out.z) && walkable(out.x, out.z));
  assert.ok(out.x > bank.x, 'the bank carries the player sideways');
});

test('elevation is modest, never under the pier or the beaches, and highest at the lighthouse', () => {
  let maxH = 0,
    maxSlope = 0;
  for (let x = -32; x <= 32; x += 0.25)
    for (let z = -32; z <= 32; z += 0.25) {
      const h = groundHeight(x, z);
      assert.ok(h >= 0);
      maxH = Math.max(maxH, h);
      maxSlope = Math.max(maxSlope, Math.abs(groundHeight(x + 0.25, z) - h) / 0.25, Math.abs(groundHeight(x, z + 0.25) - h) / 0.25);
      if (onPier(x, z) || shoreDistance(x, z) < 2 || Math.hypot(x - POND.x, z - POND.z) < POND.r + 0.5) assert.ok(h < 0.02, `ground rises ${h.toFixed(2)} at (${x}, ${z})`);
    }
  assert.ok(maxH <= GROUND.maxHeight + 1e-9, `max height ${maxH}`);
  assert.ok(maxSlope <= GROUND.maxSlope, `max slope ${maxSlope.toFixed(2)}`);
  assert.ok(groundHeight(props.lighthouse.x, props.lighthouse.z) > 1.3, 'the lighthouse stands on the hill');
  assert.equal(groundHeight(SPAWN.x, SPAWN.z), 0);
  assert.equal(HILLS.length, 3);
});

test('every landmark, seat, pin spot and path is on foot from the spawn', () => {
  // Arrange: flood fill the walkable grid from where players arrive.
  const step = 0.5,
    span = 40;
  const key = (x, z) => `${Math.round(x / step)},${Math.round(z / step)}`;
  const seen = new Set([key(SPAWN.x, SPAWN.z)]);
  const queue = [[SPAWN.x, SPAWN.z]];
  assert.ok(walkable(SPAWN.x, SPAWN.z));
  while (queue.length) {
    const [x, z] = queue.pop();
    for (const [dx, dz] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
      const nx = +(x + dx).toFixed(2),
        nz = +(z + dz).toFixed(2);
      if (Math.abs(nx) > span || Math.abs(nz) > span || seen.has(key(nx, nz)) || !walkable(nx, nz)) continue;
      seen.add(key(nx, nz));
      queue.push([nx, nz]);
    }
  }
  const reachable = (x, z, what) => {
    // Any walkable grid cell within 0.75 of the point counts as standing there.
    let ok = false;
    for (let dx = -0.75; dx <= 0.75 && !ok; dx += step) for (let dz = -0.75; dz <= 0.75 && !ok; dz += step) if (seen.has(key(x + dx, z + dz))) ok = true;
    assert.ok(ok, `${what} at (${x}, ${z}) cannot be reached on foot`);
  };
  // Act / Assert: everything a prompt or a reward hangs on.
  const standing = (l) => [l.x, l.z];
  for (const [name, l] of Object.entries({ SHOP_DOOR, THREADS_DOOR, NOTICE_BOARD, SORTING_CRATES, CONTEST_SIGN, LOOKOUT, TIDE_POOLS, ORCHARD, WATERING_CAN, DOG })) reachable(...standing(l), name);
  reachable(POND_DOCK.x - POND_DOCK.halfW + 0.2, POND_DOCK.z, 'pond dock tip');
  reachable(0, PIER.end - 1, 'pier head');
  for (const b of DRAWING_BOARDS) reachable(b.x + Math.sin(b.heading) * 1.4, b.z + Math.cos(b.heading) * 1.4, 'drawing board');
  for (const bench of props.benches) {
    // You sit by pressing the prompt within bench.r + 1.4 of the bench, so that ring must be reachable.
    const seat = benchSeat(bench);
    let ok = false;
    for (let dx = -2.5; dx <= 2.5 && !ok; dx += step) for (let dz = -2.5; dz <= 2.5 && !ok; dz += step) if (Math.hypot(dx, dz) < bench.r + 1.4 && seen.has(key(bench.x + dx, bench.z + dz))) ok = true;
    assert.ok(ok, `bench at (${bench.x}, ${bench.z}) cannot be sat on; seat (${seat.x}, ${seat.z})`);
  }
  for (const spot of PIN_SPOTS) {
    assert.ok(walkable(spot.x, spot.z), `pin spot (${spot.x}, ${spot.z}) is not walkable`);
    reachable(spot.x, spot.z, 'pin spot');
  }
  for (const path of PATHS)
    for (let i = 1; i < path.points.length; i++) {
      const [x1, z1] = path.points[i - 1],
        [x2, z2] = path.points[i];
      const n = Math.ceil(Math.hypot(x2 - x1, z2 - z1) / 0.25);
      for (let k = 0; k <= n; k++) {
        const x = x1 + ((x2 - x1) * k) / n,
          z = z1 + ((z2 - z1) * k) / n;
        assert.ok(walkable(x, z) || onPier(x, z), `path runs into something at (${x.toFixed(1)}, ${z.toFixed(1)})`);
        assert.ok(onPath(x, z), 'the path function agrees with its own polyline');
      }
    }
});

test('the zones leave each other room: trees are deterministic and away from everything, buoys sit at sea clear of the harbour mouth', () => {
  assert.equal(trees.length, TREE_COUNT + ORCHARD_TREES.length, 'the tree generator placed every tree it was asked for');
  assert.deepEqual(trees, JSON.parse(JSON.stringify(trees)), 'plain data, so the server and the client build the same list');
  const landmarks = [SHOP_DOOR, THREADS_DOOR, NOTICE_BOARD, SORTING_CRATES, LOOKOUT, TIDE_POOLS, WATERING_CAN, DOG, ...DRAWING_BOARDS];
  for (const t of trees.slice(ORCHARD_TREES.length)) {
    assert.ok(shoreDistance(t.x, t.z) >= 2.5, `tree in the surf at (${t.x.toFixed(1)}, ${t.z.toFixed(1)})`);
    assert.ok(!onPath(t.x, t.z, 1.2), `tree on a path at (${t.x.toFixed(1)}, ${t.z.toFixed(1)})`);
    for (const l of landmarks) assert.ok(Math.hypot(t.x - l.x, t.z - l.z) >= 2.5, `tree crowds a landmark at (${t.x.toFixed(1)}, ${t.z.toFixed(1)})`);
  }
  for (const b of BUOYS) {
    assert.ok(shoreDistance(b.x, b.z) < -6, `buoy too close to shore at (${b.x.toFixed(1)}, ${b.z.toFixed(1)})`);
    assert.ok(boatable(b.x, b.z));
    assert.ok(!(Math.abs(b.x) <= PIER.crossHalfWidth + 3 && b.z > PIER.crossStart - 2), 'the harbour mouth stays clear');
    assert.ok(!(Math.abs(b.x) <= 8 && b.z >= PIER.end + 3 - 5 && b.z <= PIER.end + 8 + 5), 'the contest target zone stays clear');
  }
  assert.deepEqual({ x: SORTING.station.x, z: SORTING.station.z, radius: SORTING.radius }, SORTING_CRATES);
});

test('every cast from the fishing deck lands in open water', () => {
  for (let z = CAST_ZONE.minZ + 0.2; z < PIER.end; z += 1.2)
    for (let x = -PIER.crossHalfWidth + 0.5; x < PIER.crossHalfWidth; x += 1.5) {
      if (!inCastZone(x, z)) continue;
      for (const power of [0, 0.5, 1])
        for (const aim of [-1, -0.4, 0, 0.4, 1]) {
          const p = castLanding(x, z, power, aim);
          assert.ok(shoreDistance(p.x, p.z) < 0 && !onPier(p.x, p.z), `landing (${p.x.toFixed(1)}, ${p.z.toFixed(1)}) from (${x.toFixed(1)}, ${z.toFixed(1)}) power ${power} aim ${aim}`);
        }
    }
});

test('a player can walk from the spawn down the pier road and onto the deck without a snag', () => {
  const s = createMoveState(SPAWN.x, SPAWN.z, 0);
  for (let i = 0; i < 30 * 8; i++) stepMovement(s, 0, 1, MOVE.dt);
  assert.ok(s.z > PIER.crossStart, `reached z ${s.z.toFixed(1)}`);
  assert.ok(onPier(s.x, s.z));
});

test("the games podium's prompt clears every other prompt on the island", () => {
  // Two prompts over one patch of ground means whichever loses the HUD's ordering can
  // never be reached from inside the overlap. Several older pairs on this island do
  // overlap (the benches by the picnic table, the orchard and the garden); the podium
  // was placed so that it adds no more.
  const others = [
    ...Object.entries(LANDMARKS)
      .filter(([id]) => id !== 'rps')
      .map(([id, m]) => ({ id, x: m.x, z: m.z, r: m.radius })),
    ...DRAWING_BOARDS.map((b, i) => ({ id: `board${i}`, x: b.x, z: b.z, r: b.radius })),
    ...props.benches.map((b, i) => ({ id: `bench${i}`, x: b.x, z: b.z, r: BENCH_RADIUS })),
  ];
  const podium = LANDMARKS.rps;
  const clashes = others
    .map((o) => ({ id: o.id, gap: Math.hypot(o.x - podium.x, o.z - podium.z) - (o.r + podium.radius) }))
    .filter((o) => o.gap < 0)
    .map((o) => `${o.id} overlaps by ${(-o.gap).toFixed(2)}`);
  assert.deepEqual(clashes, [], 'the podium must not share ground with another prompt');
  // And it must be somewhere a player can actually stand to use it.
  assert.ok(walkable(podium.x, podium.z + 1.4), 'there is ground to stand on in front of it');
});
