// Island layout shared by the server (collision) and the client (rendering).
// Everything geometric lives here so a prompt can never appear where the action is
// refused, a tree can never be drawn where nobody collides with it, and the water's
// foam always breaks on the shore the players actually walk along.

// ---- Shoreline -------------------------------------------------------------------
// The coast is a star shape: a mean radius plus four harmonics of the polar angle. One
// function serves collision, the shore slide, the terrain rim, foam in the water shader
// and everything that orbits the island. Mean radius 26 is about three times the area of
// the original 15-unit disc; the bay to the north and the lobe to the east are the
// harmonics at work.
export const SHORE = {
  base: 26,
  // [wave number, amplitude, phase]. Exactly four: the water shader packs them into two vec4s.
  harmonics: [
    [2, 2.2, -0.5],
    [3, 1.6, 1.1],
    [5, 0.9, 2.6],
    [7, 0.5, 0.3],
  ] as const,
  maxRadius: 30,
};
export function shoreRadius(theta: number) {
  let r = SHORE.base;
  for (const [k, a, p] of SHORE.harmonics) r += a * Math.cos(k * theta + p);
  return r;
}
// Positive inland, negative at sea; roughly metres.
export function shoreDistance(x: number, z: number) {
  return shoreRadius(Math.atan2(z, x)) - Math.hypot(x, z);
}
export const ISLAND_RADIUS = SHORE.base;
// Where the pier leaves the sand.
export const SHORE_SOUTH = shoreRadius(Math.PI / 2);
// The top of the grass in world units; every prop that stands on the ground starts here.
export const GROUND_Y = 0.86;

// ---- Pier --------------------------------------------------------------------------
// The pier is an upside-down T: a stem out from the island that widens into a
// crossbar at the seaward end, giving everyone room to stand and fish. The stem's
// planks start at deckFrom, well inland, so the road onto the pier reads as one path.
// railX is the line the stem's pilings stand on, just inside the edge of the planks.
export const PIER = { halfWidth: 2.2, start: 0, deckFrom: 20, end: 37, crossHalfWidth: 9, crossStart: 33.6, plankThickness: 0.25, deckTop: 1.025, railX: 2.1 };
// Anything standing on the planks rests here: a shade under the surface, so nothing
// hovers over the deck and nothing sinks into it.
export const DECK_STAND_Y = PIER.deckTop - 0.04;
// The lanterns, measured from their base so the post, glass and cap stay together.
export const PIER_LANTERN = { postHeight: 2.2, postCentreY: DECK_STAND_Y + 1.1, glassY: DECK_STAND_Y + 2.46, capY: DECK_STAND_Y + 2.84, lightY: DECK_STAND_Y + 2.35 };
// Fishing happens over the water: the stem beyond the sand and the whole crossbar.
export const CAST_ZONE = { minZ: 25 };
// Two lanterns at the outer corners of the pier head, the only lamps on the island: a
// lamp that cannot afford a real light reads as a dead post at night, and the presets
// can afford two.
export const PIER_LANTERNS = [-1, 1].map((side) => ({ x: side * (PIER.crossHalfWidth - 0.75), z: PIER.end - 0.6 }));
export function onPier(x: number, z: number) {
  if (z < PIER.start || z >= PIER.end) return false;
  return Math.abs(x) < PIER.halfWidth || (z >= PIER.crossStart && Math.abs(x) < PIER.crossHalfWidth);
}
export function onIsland(x: number, z: number) {
  return shoreDistance(x, z) > 0;
}
export function inCastZone(x: number, z: number) {
  return z > CAST_ZONE.minZ && onPier(x, z);
}

// ---- Elevation -----------------------------------------------------------------------
// Modest hills: a lookout under the lighthouse, a rise behind the orchard, a knoll
// behind the house. Height fades to nothing at the beaches, the pier root and the pond,
// so the deck stays flat and no slope is steep enough to need collision. Clients read
// their height from x and z; the wire protocol stays two-dimensional.
const smooth = (a: number, b: number, v: number) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export const HILLS = [
  { x: 12, z: -10, r: 9, h: 1.6 },
  { x: -2, z: -16, r: 6.5, h: 0.6 },
  { x: -17, z: 2, r: 6.5, h: 0.5 },
];
export const GROUND = { maxHeight: 1.6, maxSlope: 0.45 };

// ---- Pond ---------------------------------------------------------------------------
// A fishing pond in the north-west with a short plank dock out from its bank.
export const POND = { x: -13, z: -11, r: 4.2 };
export const POND_DOCK = { x: -10.4, z: -9.5, halfW: 1.8, halfD: 0.7 };
export function inPond(x: number, z: number) {
  const dx = x - POND.x,
    dz = z - POND.z;
  return dx * dx + dz * dz < POND.r * POND.r;
}
export function onPondDock(x: number, z: number) {
  return Math.abs(x - POND_DOCK.x) < POND_DOCK.halfW && Math.abs(z - POND_DOCK.z) < POND_DOCK.halfD;
}
export function groundHeight(x: number, z: number) {
  let h = 0;
  for (const b of HILLS) {
    const d2 = ((x - b.x) ** 2 + (z - b.z) ** 2) / (b.r * b.r);
    if (d2 < 1) h += b.h * smooth(0, 1, 1 - d2);
  }
  if (h === 0) return 0;
  return h * smooth(2, 10, shoreDistance(x, z)) * smooth(POND.r + 0.5, POND.r + 4, Math.hypot(x - POND.x, z - POND.z));
}

// ---- Paths ---------------------------------------------------------------------------
export type Path = { points: [number, number][]; width: number };
export const PATHS: Path[] = [
  { width: 2.4, points: [[0, PIER.deckFrom], [0, 12], [0, 6]] }, // pier road up to the plaza
  { width: 1.6, points: [[-5, 5.2], [-11, 5], [-14, 5.6]] }, // plaza to the garden gate
  { width: 1.6, points: [[5, 9], [8.5, 13.8], [12, 15.6]] }, // plaza to the Threads door
  { width: 1.6, points: [[-3, 0], [-8, -6], [-8.6, -8.6]] }, // plaza to the pond dock
  { width: 1.4, points: [[-8, -6], [-6, -13], [-5, -15]] }, // branch to the orchard
  { width: 1.6, points: [[3, 0], [4, -6], [5, -12]] }, // plaza to the picnic clearing
  { width: 1.4, points: [[4, -6], [9, -10.5], [15, -12.5]] }, // branch up to the lookout
  { width: 1.6, points: [[5, 5.2], [14, 1.5], [20.5, 0.5]] }, // plaza to the tide pools
];
function segmentDistance(x: number, z: number, x1: number, z1: number, x2: number, z2: number) {
  const dx = x2 - x1,
    dz = z2 - z1,
    length2 = dx * dx + dz * dz || 1;
  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (z - z1) * dz) / length2));
  return Math.hypot(x - (x1 + dx * t), z - (z1 + dz * t));
}
// Distance to the edge of the nearest path; zero or less means standing on it.
export function pathDistance(x: number, z: number) {
  let best = Infinity;
  for (const path of PATHS)
    for (let i = 1; i < path.points.length; i++) {
      const [x1, z1] = path.points[i - 1],
        [x2, z2] = path.points[i];
      best = Math.min(best, segmentDistance(x, z, x1, z1, x2, z2) - path.width / 2);
    }
  return best;
}
export function onPath(x: number, z: number, margin = 0) {
  return pathDistance(x, z) <= margin;
}

// ---- Zones and landmarks -------------------------------------------------------------
export type Blocker = { x: number; z: number; r: number };
// A rounded segment: fences, raised beds, the picnic table, the lookout rail.
export type Capsule = { x1: number; z1: number; x2: number; z2: number; r: number };
export type Landmark = { x: number; z: number; radius: number };
export type Bench = Blocker & { heading: number };
export type Tree = { x: number; z: number; scale: number; variant: number };
// Where a new arrival stands: the south edge of the plaza, facing the pier.
export const SPAWN = { x: 0, z: 12, jitter: 2 };
export const PLAZA = { x: 0, z: 5, r: 7 };
// Community drawing boards ring the plaza and face its centre.
// The boards stand half again as large as they used to, so they read from across the
// plaza without towering over it. They belong to the plaza and stay in it.
export const BOARD_SCALE = 1.5;
export const DRAWING_BOARDS: Array<Landmark & { heading: number }> = [
  { x: -6.2, z: 1.5, radius: 2.6, heading: Math.PI / 2 },
  { x: -7, z: 8, radius: 2.6, heading: Math.PI / 2 },
  { x: 6.2, z: 1.5, radius: 2.6, heading: -Math.PI / 2 },
  { x: 7, z: 8, radius: 2.6, heading: -Math.PI / 2 },
  { x: 0, z: -2, radius: 2.6, heading: 0 },
];
export const NOTICE_BOARD: Landmark = { x: -3.5, z: 14, radius: 1.8 };
// The games podium: a wooden lectern with a round top, standing beside the path up to
// the picnic clearing so you pass it on the way to the picnic table. Its prompt radius
// clears every other prompt on the island — see the island tests — because two prompts
// over one patch of ground means one of them can never be reached.
export const RPS_PODIUM: Landmark & { heading: number } = { x: 1.8, z: -8.2, radius: 2.2, heading: Math.atan2(-1.8, 13.2) };
// Home: the bait shop inside its garden fence, gate on the plaza side.
export const GARDEN_FENCE = { minX: -18.5, maxX: -9.5, minZ: -3.5, maxZ: 4.5, gate: { x: -14, halfWidth: 1.4 } };
export const DOG: Landmark = { x: -10.5, z: 7.4, radius: 1.6 };
// Threads, the wardrobe shop, south-east of the plaza with its door toward the camera.
export const THREADS: Blocker = { x: 12, z: 11, r: 2.9 };
export const THREADS_DOOR: Landmark = { x: 12, z: 13.9, radius: 3.2 };
// Orchard and garden, north-west.
export const ORCHARD = { x: -5, z: -17, r: 5 };
export const ORCHARD_TREES: Tree[] = [-8.5, -5, -1.5].flatMap((x) => [-15.5, -19].map((z) => ({ x, z, scale: 0.9, variant: 3 })));
export const GARDEN_BEDS: Capsule[] = [-12.5, -14.5, -16.5].map((z) => ({ x1: -1.6, z1: z, x2: -0.4, z2: z, r: 0.5 }));
export const WATERING_CAN: Landmark = { x: -2.6, z: -11.4, radius: 2.6 };
// Picnic clearing, north-centre: a table with a seat on each side, stumps and a campfire.
export const PICNIC_TABLE: Capsule = { x1: 3.9, z1: -15, x2: 6.1, z2: -15, r: 0.55 };
export const STUMPS: Blocker[] = [
  { x: 2.2, z: -17.5, r: 0.45 },
  { x: 7.8, z: -18, r: 0.45 },
  { x: 8.4, z: -13, r: 0.45 },
];
export const CAMPFIRE: Blocker = { x: 5, z: -19, r: 0.8 };
// Tide pools on the east lobe: rocks to step around, shallow pools to walk through.
export const TIDE_POOLS: Landmark = { x: 23.5, z: 0.5, radius: 4 };
export const TIDE_ROCKS: Blocker[] = [
  { x: 25.5, z: -1.5, r: 0.9 },
  { x: 26, z: 2.5, r: 0.8 },
  { x: 23, z: 3.8, r: 0.6 },
  { x: 22, z: -2.8, r: 0.7 },
];
export const TIDE_POOL_DISCS = [
  { x: 23.5, z: 0.5, r: 1.3 },
  { x: 25, z: 2, r: 0.9 },
  { x: 22.5, z: -1, r: 0.7 },
];
// The lighthouse stands on the north-east hill; the lookout is the railed ledge beside it.
export const LOOKOUT: Landmark = { x: 15, z: -12.5, radius: 2.5 };
export const LOOKOUT_RAIL: Capsule = { x1: 17.4, z1: -11.2, x2: 14.4, z2: -14.9, r: 0.25 };
// Harbour: the moored rowboat beside the pier stem.
export const ROWBOAT = { x: 6.4, z: PIER.crossStart - 4.5, heading: 0.42 };
export const props = {
  house: { x: -14, z: 0, r: 2.75 } as Blocker,
  lighthouse: { x: 13, z: -9.5, r: 1.9 } as Blocker,
  benches: [
    { x: -2.8, z: 9.2, r: 1.05, heading: 0 },
    { x: 2.8, z: 9.2, r: 1.05, heading: 0 },
    { x: 5, z: -16.2, r: 1.05, heading: 0 },
    { x: 5, z: -13.8, r: 1.05, heading: Math.PI },
  ] as Bench[],
};
// Where a rower pushes off: beside the moored boat, over open water.
export const BOAT_SPAWN = { x: ROWBOAT.x + 2.4, z: ROWBOAT.z - 1, heading: Math.PI / 2 };
// Buoy course for the boat run: hugs the coast nine units out, and leaves the harbour
// mouth in front of the pier clear for anglers and the contest target. The course starts
// at the buoy nearest the mooring and runs counter-clockwise as seen from above; the
// camera looks down from +z, so on screen that is decreasing angle in world terms.
export const BUOY_ANGLES = [25, 60, 120, 160, 200, 240, 280, 325].map((d) => (d * Math.PI) / 180);
const buoyRing = BUOY_ANGLES.map((t) => {
  const r = shoreRadius(t) + 9;
  return { x: Math.cos(t) * r, z: Math.sin(t) * r };
});
const firstBuoy = buoyRing.reduce((best, b, i) => (Math.hypot(b.x - BOAT_SPAWN.x, b.z - BOAT_SPAWN.z) < Math.hypot(buoyRing[best].x - BOAT_SPAWN.x, buoyRing[best].z - BOAT_SPAWN.z) ? i : best), 0);
export const BUOYS = buoyRing.map((_, k) => buoyRing[(firstBuoy - k + buoyRing.length) % buoyRing.length]);
// Where a boat may go: off the beach, inside the course, clear of the pier.
export const BOAT_BOUNDS = { shoreMargin: 1.4, pierMargin: 1.2, courseRadius: 44 };
export function nearPier(x: number, z: number, m: number) {
  if (z < PIER.start - m || z >= PIER.end + m) return false;
  return Math.abs(x) < PIER.halfWidth + m || (z >= PIER.crossStart - m && Math.abs(x) < PIER.crossHalfWidth + m);
}
export function boatable(x: number, z: number) {
  return shoreDistance(x, z) <= -BOAT_BOUNDS.shoreMargin && Math.hypot(x, z) <= BOAT_BOUNDS.courseRadius && !nearPier(x, z, BOAT_BOUNDS.pierMargin);
}
// A boat that would run aground slides along whichever axis is still open water.
export function resolveBoat(x: number, z: number, nx: number, nz: number, out: { x: number; z: number }) {
  if (boatable(nx, nz)) {
    out.x = nx;
    out.z = nz;
  } else if (boatable(nx, z)) {
    out.x = nx;
    out.z = z;
  } else if (boatable(x, nz)) {
    out.x = x;
    out.z = nz;
  } else {
    out.x = x;
    out.z = z;
  }
  return out;
}
// Nothing grows or gets scattered inside these: the zones need their open ground.
// Every place a player stops to do something, kept clear of trees along with the ground
// just south of it, which is where a trunk would stand between the camera and the spot.
const ACTIVITY_SPOTS: Blocker[] = [
  { x: DOG.x, z: DOG.z, r: 4 },
  { x: THREADS_DOOR.x, z: THREADS_DOOR.z, r: 5 },
  { x: props.house.x, z: props.house.z + 3.2, r: 4.5 },
  { x: NOTICE_BOARD.x, z: NOTICE_BOARD.z, r: 3.5 },
  { x: WATERING_CAN.x, z: WATERING_CAN.z, r: 4 },
  { x: CAMPFIRE.x, z: CAMPFIRE.z, r: 3.5 },
  { x: POND_DOCK.x, z: POND_DOCK.z, r: 3.5 },
  ...props.benches.map((b) => ({ x: b.x, z: b.z, r: 3.5 })),
  ...DRAWING_BOARDS.map((b) => ({ x: b.x, z: b.z, r: 3.6 })),
  { x: RPS_PODIUM.x, z: RPS_PODIUM.z, r: 3.6 },
  ...GARDEN_BEDS.map((b) => ({ x: (b.x1 + b.x2) / 2, z: (b.z1 + b.z2) / 2, r: 3 })),
];
const KEEP_CLEAR: Blocker[] = [
  { x: PLAZA.x, z: PLAZA.z, r: PLAZA.r + 2.5 },
  ...ACTIVITY_SPOTS,
  ...ACTIVITY_SPOTS.map((s) => ({ x: s.x, z: s.z + 3.5, r: s.r })),
  { x: 5, z: -15, r: 4.5 },
  { x: TIDE_POOLS.x, z: TIDE_POOLS.z, r: 5 },
  { x: POND.x, z: POND.z, r: 6 },
  { x: THREADS.x, z: THREADS.z, r: 4.5 },
  { x: props.house.x, z: props.house.z + 0.5, r: 6.5 },
  { x: props.lighthouse.x, z: props.lighthouse.z, r: 3.5 },
  { x: LOOKOUT.x, z: LOOKOUT.z, r: 3.5 },
  { x: 5.5, z: 17.5, r: 4.5 },
  { x: 0, z: 20, r: 5 },
  { x: NOTICE_BOARD.x, z: NOTICE_BOARD.z, r: 2.5 },
  { x: DOG.x, z: DOG.z, r: 2 },
  { x: WATERING_CAN.x, z: WATERING_CAN.z, r: 2.5 },
  { x: -1, z: -14.5, r: 3 },
  { x: THREADS_DOOR.x, z: THREADS_DOOR.z, r: 3 },
  { x: props.house.x, z: props.house.z + 3.2, r: 3 },
  ...DRAWING_BOARDS.map((b) => ({ x: b.x, z: b.z, r: 2.8 })),
  { x: RPS_PODIUM.x, z: RPS_PODIUM.z, r: 2.8 },
];
export const TREE_COUNT = 38;
// Wild trees are placed by a fixed linear congruential generator, so the server and the
// client agree on every trunk without ever sharing a list.
export const trees: Tree[] = (() => {
  let s = 7;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;
  const list: Tree[] = [...ORCHARD_TREES];
  for (let i = 0; i < 4000 && list.length < TREE_COUNT + ORCHARD_TREES.length; i++) {
    const x = (rnd() * 2 - 1) * SHORE.maxRadius,
      z = (rnd() * 2 - 1) * SHORE.maxRadius;
    if (shoreDistance(x, z) < 2.5 || onPath(x, z, 1.6) || inPond(x, z) || onPier(x, z)) continue;
    if (KEEP_CLEAR.some((k) => Math.hypot(x - k.x, z - k.z) < k.r)) continue;
    if (list.some((t) => Math.hypot(x - t.x, z - t.z) < 2.8)) continue;
    list.push({ x, z, scale: 0.85 + Math.floor(rnd() * 5) * 0.08, variant: Math.floor(rnd() * 3) });
  }
  return list;
})();
const fenceSides = (() => {
  const f = GARDEN_FENCE,
    r = 0.25;
  return [
    { x1: f.minX, z1: f.minZ, x2: f.maxX, z2: f.minZ, r },
    { x1: f.minX, z1: f.minZ, x2: f.minX, z2: f.maxZ, r },
    { x1: f.maxX, z1: f.minZ, x2: f.maxX, z2: f.maxZ, r },
    // The plaza side has the gate in the middle.
    { x1: f.minX, z1: f.maxZ, x2: f.gate.x - f.gate.halfWidth, z2: f.maxZ, r },
    { x1: f.gate.x + f.gate.halfWidth, z1: f.maxZ, x2: f.maxX, z2: f.maxZ, r },
  ] as Capsule[];
})();
export const blockers: Blocker[] = [
  props.house,
  props.lighthouse,
  THREADS,
  ...props.benches,
  { x: NOTICE_BOARD.x, z: NOTICE_BOARD.z, r: 0.5 },
  { x: DOG.x, z: DOG.z, r: 0.5 },
  ...STUMPS,
  CAMPFIRE,
  ...TIDE_ROCKS,
  // The podium is a post: you walk round it, not through it.
  { x: RPS_PODIUM.x, z: RPS_PODIUM.z, r: 0.62 },
  ...trees.map((t) => ({ x: t.x, z: t.z, r: 0.55 * t.scale })),
];
// A drawing board is a wide, thin panel: it stops you walking through it without walling
// off the ground in front of it, which a circle its width would.
const boardWalls: Capsule[] = DRAWING_BOARDS.map((b) => {
  const halfWidth = 1.05 * BOARD_SCALE,
    ax = Math.cos(b.heading) * halfWidth,
    az = -Math.sin(b.heading) * halfWidth;
  return { x1: b.x - ax, z1: b.z - az, x2: b.x + ax, z2: b.z + az, r: 0.42 };
});
export const capsules: Capsule[] = [...fenceSides, ...GARDEN_BEDS, PICNIC_TABLE, LOOKOUT_RAIL, ...boardWalls];
// Ground you can be on at all: land, deck or dock, whatever props stand on it.
export function standable(x: number, z: number) {
  return (onIsland(x, z) && !inPond(x, z)) || onPier(x, z) || onPondDock(x, z);
}
export function walkable(x: number, z: number) {
  if (!standable(x, z)) return false;
  for (const b of blockers) {
    const dx = x - b.x,
      dz = z - b.z;
    if (dx * dx + dz * dz < b.r * b.r) return false;
  }
  for (const c of capsules) if (segmentDistance(x, z, c.x1, c.z1, c.x2, c.z2) < c.r) return false;
  return true;
}
const EDGE = 0.001;
const PIER_FUNNEL = 0.9;
// Resolves a proposed move by sliding along the shoreline, pier rails, the pond bank and
// prop colliders instead of stopping dead. Returns the accepted position.
export function resolveMove(x: number, z: number, nx: number, nz: number, out: { x: number; z: number }) {
  let px = nx,
    pz = nz;
  if (!onIsland(px, pz) && !onPier(px, pz)) {
    const fromDeck = onPier(x, z) && !onIsland(x, z);
    if (!fromDeck && Math.abs(px) < PIER.halfWidth + PIER_FUNNEL && pz >= PIER.start && pz < PIER.crossStart) {
      // Stepping off the sand beside the pier funnels the player onto the planks.
      px = Math.max(-PIER.halfWidth + EDGE, Math.min(PIER.halfWidth - EDGE, px));
    } else if (fromDeck) {
      // Walking off the decking: slide along whichever edge was crossed, so the
      // crossbar's corners and its inner shoulders act like walls.
      if (!onPier(px, z) && !onIsland(px, z)) px = x;
      if (!onPier(px, pz) && !onIsland(px, pz)) pz = z;
    } else {
      // Walking into the sea: slide around the shore at this bearing.
      const length = Math.hypot(px, pz) || 1;
      const radius = shoreRadius(Math.atan2(pz, px)) - EDGE;
      px = (px / length) * radius;
      pz = (pz / length) * radius;
    }
  }
  if (inPond(px, pz) && !onPondDock(px, pz)) {
    if (onPondDock(x, z)) {
      // The dock's edges act like rails, the same as the pier head's.
      if (inPond(px, z) && !onPondDock(px, z)) px = x;
      if (inPond(px, pz) && !onPondDock(px, pz)) pz = z;
    } else {
      // Walking into the pond from the bank: slide around it.
      const dx = px - POND.x,
        dz = pz - POND.z,
        d = Math.hypot(dx, dz) || 1e-6;
      px = POND.x + (dx / d) * (POND.r + EDGE);
      pz = POND.z + (dz / d) * (POND.r + EDGE);
    }
  }
  for (const b of blockers) {
    const dx = px - b.x,
      dz = pz - b.z,
      d2 = dx * dx + dz * dz;
    if (d2 < b.r * b.r) {
      // Someone who is already inside walks out under their own steam instead of being
      // thrown clear: that is how a player gets up off a bench they were seated on.
      if ((x - b.x) ** 2 + (z - b.z) ** 2 < b.r * b.r) continue;
      const d = Math.sqrt(d2) || 1e-6;
      const push = (b.r + EDGE) / d;
      px = b.x + dx * push;
      pz = b.z + dz * push;
    }
  }
  for (const c of capsules) {
    const dx = c.x2 - c.x1,
      dz = c.z2 - c.z1,
      length2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((px - c.x1) * dx + (pz - c.z1) * dz) / length2));
    const cx = c.x1 + dx * t,
      cz = c.z1 + dz * t;
    const ox = px - cx,
      oz = pz - cz,
      d = Math.hypot(ox, oz);
    if (d < c.r) {
      const push = (c.r + EDGE) / (d || 1e-6);
      px = cx + (d ? ox : 1) * push;
      pz = cz + oz * push;
    }
  }
  // Someone standing inside a prop — a player on a bench they sat down on — is let out
  // onto any ground at all, or they would be pinned there; everyone else is held to the
  // ground that is clear of props.
  if (walkable(px, pz) || (!walkable(x, z) && standable(px, pz))) {
    out.x = px;
    out.z = pz;
  } else {
    out.x = x;
    out.z = z;
  }
  return out;
}
// Interaction landmarks. Client prompts and server-side checks read the same values
// so a prompt can never appear where the action is refused (or the reverse).
// The contest sign stands against the pier rail: walking the middle of the pier to
// fish stays outside it, so the prompt only appears when you step up to the sign.
export const CONTEST_SIGN: Landmark = { x: -1.6, z: PIER.end - 1.6, radius: 1.3 };
export const SORTING_CRATES: Landmark = { x: 5.5, z: 17.5, radius: 3.5 };
export const SHOP_DOOR: Landmark = { x: props.house.x, z: props.house.z + 3.2, radius: 3.6 };
export const BENCH_RADIUS = 2.4;
export function withinLandmark(landmark: Landmark, x: number, z: number) {
  const dx = x - landmark.x,
    dz = z - landmark.z;
  return dx * dx + dz * dz <= landmark.radius * landmark.radius;
}
// Where a player sits: on the seat itself, a little forward of the backrest, facing the
// way the bench faces. Sitting is the one time a player stands inside a blocker.
export const BENCH_SEAT_Y = GROUND_Y + 0.56;
export function benchSeat(bench: Bench) {
  return { x: bench.x + Math.sin(bench.heading) * 0.06, z: bench.z + Math.cos(bench.heading) * 0.06, heading: bench.heading };
}
// The bench a player is sitting on, if they are on one: within a hand's width of its seat.
export function benchUnder(x: number, z: number) {
  for (const bench of props.benches) {
    const seat = benchSeat(bench);
    if (Math.hypot(x - seat.x, z - seat.z) < 0.4) return bench;
  }
  return null;
}
