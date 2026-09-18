import {
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshToonMaterial,
  SphereGeometry,
  TorusGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { bake, propPart, toonGradient } from './models';
import {
  CAMPFIRE,
  DECK_STAND_Y,
  BOARD_SCALE,
  DRAWING_BOARDS,
  GARDEN_BEDS,
  GARDEN_FENCE,
  GROUND_Y,
  LOOKOUT_RAIL,
  NOTICE_BOARD,
  PATHS,
  PICNIC_TABLE,
  PIER,
  PIER_LANTERN,
  PIER_LANTERNS,
  PLAZA,
  POND,
  POND_DOCK,
  SORTING_CRATES,
  STUMPS,
  THREADS,
  TIDE_POOLS,
  TIDE_POOL_DISCS,
  TIDE_ROCKS,
  WATERING_CAN,
  groundHeight,
  props,
  shoreDistance,
  shoreRadius,
  trees,
  type Capsule,
} from '../../packages/shared/layout';
// The whole static island is baked into one vertex-coloured mesh: one draw call
// instead of one per plank, post, tree and roof. Only the still water of the pond and
// the tide pools sits in a second, transparent mesh.
export type TerrainPreset = { rings: number; segments: number };
const color = new Color();
function paint(geometry: BufferGeometry, hex: string) {
  color.set(hex);
  const count = geometry.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return geometry;
}
const hash = (x: number, z: number) => {
  const v = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return v - Math.floor(v);
};
const smooth = (a: number, b: number, v: number) => {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const BEACH = new Color('#e8d3a3'),
  WET_SAND = new Color('#cbb282'),
  SAND = new Color('#dfc18a'),
  GRASS_LOW = new Color('#9eb66e'),
  GRASS_MID = new Color('#7f9c58'),
  GRASS_HIGH = new Color('#6b8a4c'),
  MUD = new Color('#6f8a62'),
  PLAZA_STONE = new Color('#d9c9a4'),
  POOL_ROCK = new Color('#cdbf9c'),
  scratch = new Color();
// Ground colour at a point: beach at the water, grass inland that darkens as it climbs,
// paving in the plaza, mud in the pond and weathered rock around the tide pools.
function groundColour(x: number, z: number, h: number, out: Color) {
  const sd = shoreDistance(x, z);
  out.copy(GRASS_LOW).lerp(GRASS_MID, smooth(0.2, 0.8, h)).lerp(GRASS_HIGH, smooth(0.8, 1.4, h));
  if (sd < 1.6) out.lerp(SAND, 1 - smooth(0.8, 1.6, sd));
  if (sd < 0.9) out.lerp(BEACH, 1 - smooth(0.3, 0.9, sd));
  const pond = Math.hypot(x - POND.x, z - POND.z);
  if (pond < POND.r + 0.6) out.lerp(MUD, 1 - smooth(POND.r - 0.2, POND.r + 0.6, pond));
  const plaza = Math.hypot(x - PLAZA.x, z - PLAZA.z);
  if (plaza < PLAZA.r + 0.8) out.lerp(PLAZA_STONE, 1 - smooth(PLAZA.r - 0.6, PLAZA.r + 0.8, plaza));
  const pools = Math.hypot(x - TIDE_POOLS.x, z - TIDE_POOLS.z);
  if (pools < TIDE_POOLS.radius + 1.5) out.lerp(POOL_ROCK, 0.7 * (1 - smooth(TIDE_POOLS.radius - 0.5, TIDE_POOLS.radius + 1.5, pools)));
  const n = 1 + (hash(Math.round(x * 2), Math.round(z * 2)) - 0.5) * 0.06;
  out.multiplyScalar(n);
  return out;
}
// A displaced polar grid: rings of vertices from the centre out to the shore, then three
// skirt rings that carry the sand down under the water plane.
function buildTerrain(preset: TerrainPreset) {
  const { rings, segments } = preset;
  // A narrow wet strip at the waterline, then the sand dives under the water plane.
  const skirt: Array<[number, number]> = [
    [0.7, 0.45],
    [1.6, -0.2],
    [3.5, -1.3],
  ];
  const ringCount = rings + 1 + skirt.length;
  const positions: number[] = [],
    colors: number[] = [],
    uvs: number[] = [],
    indices: number[] = [];
  for (let j = 0; j < ringCount; j++) {
    for (let i = 0; i < segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      const shore = shoreRadius(theta);
      let r: number,
        y: number;
      if (j <= rings) {
        r = (j / rings) * shore;
        const x = Math.cos(theta) * r,
          z = Math.sin(theta) * r;
        const h = groundHeight(x, z);
        y = GROUND_Y + h;
        const pond = Math.hypot(x - POND.x, z - POND.z);
        if (pond < POND.r + 0.6) y -= 0.9 * smooth(POND.r + 0.6, POND.r - 0.6, pond);
        groundColour(x, z, h, scratch);
      } else {
        const [offset, height] = skirt[j - rings - 1];
        r = shore + offset;
        y = height;
        scratch.copy(j === rings + 1 ? WET_SAND : SAND);
      }
      positions.push(Math.cos(theta) * r, y, Math.sin(theta) * r);
      colors.push(scratch.r, scratch.g, scratch.b);
      uvs.push(0, 0);
    }
  }
  for (let j = 0; j < ringCount - 1; j++)
    for (let i = 0; i < segments; i++) {
      const a = j * segments + i,
        b = j * segments + ((i + 1) % segments),
        c = (j + 1) * segments + i,
        d = (j + 1) * segments + ((i + 1) % segments);
      // Counter-clockwise seen from above, so the ground faces the sky and is not culled.
      indices.push(a, b, c, b, d, c);
    }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
// Sandy ribbons laid along each path polyline, a hair above the grass.
function buildPaths() {
  const positions: number[] = [],
    colors: number[] = [],
    uvs: number[] = [],
    normals: number[] = [],
    indices: number[] = [];
  const tint = new Color('#d9c08f');
  for (const path of PATHS)
    for (let s = 1; s < path.points.length; s++) {
      const [x1, z1] = path.points[s - 1],
        [x2, z2] = path.points[s];
      const length = Math.hypot(x2 - x1, z2 - z1),
        steps = Math.max(1, Math.ceil(length / 0.6));
      const nx = -(z2 - z1) / length,
        nz = (x2 - x1) / length;
      const base = positions.length / 3;
      for (let k = 0; k <= steps; k++) {
        const x = x1 + ((x2 - x1) * k) / steps,
          z = z1 + ((z2 - z1) * k) / steps;
        for (const side of [-1, 1]) {
          const px = x + nx * side * (path.width / 2),
            pz = z + nz * side * (path.width / 2);
          positions.push(px, GROUND_Y + groundHeight(px, pz) + 0.035, pz);
          const shade = 1 + (hash(Math.round(px * 3), Math.round(pz * 3)) - 0.5) * 0.05;
          colors.push(tint.r * shade, tint.g * shade, tint.b * shade);
          uvs.push(0, 0);
          normals.push(0, 1, 0);
        }
        if (k > 0) {
          const a = base + (k - 1) * 2;
          indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
    }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('normal', new Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  return geometry;
}
export function buildEnvironment(terrain: TerrainPreset = { rings: 44, segments: 128 }) {
  const pieces: BufferGeometry[] = [];
  const gy = (x: number, z: number) => GROUND_Y + groundHeight(x, z);
  const place = (geometry: BufferGeometry, hex: string, x: number, y: number, z: number, rx = 0, ry = 0) => {
    geometry.rotateX(rx);
    geometry.rotateY(ry);
    geometry.translate(x, y, z);
    pieces.push(paint(geometry, hex));
    return geometry;
  };
  const box = (x: number, y: number, z: number, w: number, h: number, d: number, hex: string, ry = 0) => place(new BoxGeometry(w, h, d), hex, x, y, z, 0, ry);
  // A part of something that faces a direction: local coordinates, turned by the
  // heading, then set down on the ground at the origin.
  type Origin = { x: number; z: number; heading: number };
  const part = (geometry: BufferGeometry, hex: string, o: Origin, lx: number, ly: number, lz: number, rx = 0) => {
    if (rx) geometry.rotateX(rx);
    geometry.translate(lx, ly, lz);
    geometry.rotateY(o.heading);
    geometry.translate(o.x, gy(o.x, o.z), o.z);
    pieces.push(paint(geometry, hex));
    return geometry;
  };
  const partBox = (o: Origin, lx: number, ly: number, lz: number, w: number, h: number, d: number, hex: string) => part(new BoxGeometry(w, h, d), hex, o, lx, ly, lz);
  const capsuleOrigin = (c: Capsule): Origin & { length: number } => ({ x: (c.x1 + c.x2) / 2, z: (c.z1 + c.z2) / 2, heading: Math.atan2(c.x2 - c.x1, c.z2 - c.z1), length: Math.hypot(c.x2 - c.x1, c.z2 - c.z1) });
  // A modelled asset (tools/models) set down at an absolute height, turned and scaled.
  const assetAt = (name: string, x: number, y: number, z: number, ry = 0, scale: number | [number, number, number] = 1, palette: Record<string, string> = {}) => {
    const p = propPart(name);
    if (!p) return null;
    const g = bake(p, palette);
    const [sx, sy, sz] = typeof scale === 'number' ? [scale, scale, scale] : scale;
    if (sx !== 1 || sy !== 1 || sz !== 1) g.scale(sx, sy, sz);
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    pieces.push(g);
    return g;
  };
  // The same, standing on the ground.
  const asset = (name: string, x: number, z: number, ry = 0, scale: number | [number, number, number] = 1, dy = 0, palette: Record<string, string> = {}) => assetAt(name, x, gy(x, z) + dy, z, ry, scale, palette);
  pieces.push(buildTerrain(terrain));
  pieces.push(buildPaths());
  // Pier: a boardwalk across the sand that runs out over the water and widens into the
  // crossbar, an upside-down T. Bollards are pilings that stand through the deck.
  const deckCentre = PIER.deckTop - PIER.plankThickness / 2;
  const bollard = (x: number, z: number) => assetAt('bollard', x, -1.35, z, x * 0.7);
  for (let z = PIER.deckFrom, row = 0; z < PIER.crossStart; z += 0.7, row++) {
    box(0, deckCentre, z, 4.8, PIER.plankThickness, 0.62, row % 2 ? '#a98456' : '#b18b5b');
    if (row % 3 === 0) {
      bollard(-PIER.railX, z);
      bollard(PIER.railX, z);
    }
  }
  const crossDepth = PIER.end - PIER.crossStart,
    crossMid = (PIER.crossStart + PIER.end) / 2;
  for (let i = 0, x = -PIER.crossHalfWidth; x < PIER.crossHalfWidth - 0.01; x += 0.7, i++)
    box(x + 0.35, deckCentre, crossMid, 0.62, PIER.plankThickness, crossDepth, i % 2 ? '#a98456' : '#b18b5b');
  for (let x = -PIER.crossHalfWidth + 0.6; x <= PIER.crossHalfWidth - 0.5; x += 2.1) {
    bollard(x, PIER.end - 0.35);
    if (Math.abs(x) > PIER.halfWidth + 0.5) bollard(x, PIER.crossStart + 0.35);
  }
  for (const side of [-1, 1]) bollard(side * (PIER.crossHalfWidth - 0.35), crossMid);
  // Lamps: iron posts with a glass box (the glass itself is lit by the sky module).
  for (const lantern of PIER_LANTERNS) assetAt('lamp', lantern.x, DECK_STAND_Y, lantern.z, 0);
  // Trees from the shared layout so collision and visuals agree. Variant 3 is an orchard
  // tree heavy with fruit; the wild ones alternate conifers and broadleaves.
  for (const [i, t] of trees.entries()) {
    const s = t.scale,
      turn = (t.x * 3.1 + t.z * 1.7) % (Math.PI * 2);
    if (t.variant === 3) asset('orchardtree', t.x, t.z, turn, s);
    else if (t.variant === 2) asset(i % 2 ? 'roundtree1' : 'roundtree0', t.x, t.z, turn, s);
    else asset(`pine${t.variant}`, t.x, t.z, turn, s);
  }
  // Home: the bait shop with its red roof, inside a picket fence with a gate on the plaza side.
  const h = props.house;
  asset('house', h.x, h.z, 0);
  place(new CylinderGeometry(0.4, 0.4, 0.9, 8), '#7a5a3c', h.x + 2.5, gy(h.x + 2.5, h.z + 1.4) + 0.45, h.z + 1.4);
  asset('crate', h.x - 2.4, h.z + 1.5, 0.3, 1.1);
  const fence = GARDEN_FENCE;
  const fenceRun = (x1: number, z1: number, x2: number, z2: number) => {
    const o = capsuleOrigin({ x1, z1, x2, z2, r: 0 });
    const bays = Math.max(1, Math.round(o.length / 1.5));
    for (let i = 0; i < bays; i++) {
      const t = (i + 0.5) / bays;
      asset('fence', x1 + (x2 - x1) * t, z1 + (z2 - z1) * t, o.heading, [1, 1, o.length / bays / 1.5]);
    }
  };
  fenceRun(fence.minX, fence.minZ, fence.maxX, fence.minZ);
  fenceRun(fence.minX, fence.minZ, fence.minX, fence.maxZ);
  fenceRun(fence.maxX, fence.minZ, fence.maxX, fence.maxZ);
  fenceRun(fence.minX, fence.maxZ, fence.gate.x - fence.gate.halfWidth, fence.maxZ);
  fenceRun(fence.gate.x + fence.gate.halfWidth, fence.maxZ, fence.maxX, fence.maxZ);
  for (const side of [-1, 1]) box(fence.gate.x + side * fence.gate.halfWidth, gy(fence.gate.x, fence.maxZ) + 0.75, fence.maxZ, 0.2, 1.5, 0.2, '#a98456');
  for (let i = 0; i < 8; i++) {
    const fx = fence.minX + 1 + (i % 4) * 2.3,
      fz = fence.minZ + 1 + Math.floor(i / 4) * 5.6;
    if (Math.hypot(fx - h.x, fz - h.z) < h.r + 0.6) continue;
    asset(i % 2 ? 'bush1' : 'bush0', fx, fz, i, 0.8);
  }
  // Threads, the wardrobe shop.
  const t = THREADS;
  asset('threads', t.x, t.z, 0);
  // Lighthouse on the lookout hill.
  const l = props.lighthouse;
  asset('lighthouse', l.x, l.z, 0, 0.85, -0.3);
  // Lookout rail and the steps up the last leg of the path.
  {
    const o = capsuleOrigin(LOOKOUT_RAIL);
    const bays = Math.max(1, Math.round(o.length / 1.5));
    for (let i = 0; i < bays; i++) {
      const k = (i + 0.5) / bays;
      asset('fence', LOOKOUT_RAIL.x1 + (LOOKOUT_RAIL.x2 - LOOKOUT_RAIL.x1) * k, LOOKOUT_RAIL.z1 + (LOOKOUT_RAIL.z2 - LOOKOUT_RAIL.z1) * k, o.heading, [1, 1, o.length / bays / 1.5]);
    }
    const steps = PATHS[6].points;
    const [sx, sz] = steps[1],
      [ex, ez] = steps[2];
    const heading = Math.atan2(ex - sx, ez - sz);
    for (let k = 0.15; k < 0.95; k += 0.12) {
      const x = sx + (ex - sx) * k,
        z = sz + (ez - sz) * k;
      const step = new BoxGeometry(1.5, 0.12, 0.5);
      step.rotateY(heading);
      place(step, '#b18b5b', x, gy(x, z) + 0.02, z);
    }
  }
  // Benches, each facing its own way: two in the plaza and two picnic seats.
  for (const b of props.benches) asset('bench', b.x, b.z, b.heading);
  // Picnic table, stumps and a campfire ring.
  {
    const o = capsuleOrigin(PICNIC_TABLE);
    asset('picnic', o.x, o.z, o.heading);
  }
  for (const s of STUMPS) asset('stump', s.x, s.z, s.x, s.r / 0.4);
  asset('campfire', CAMPFIRE.x, CAMPFIRE.z);
  // Pond dock: planks out from the bank on four posts; reeds and lily pads.
  {
    const d = POND_DOCK,
      dy = GROUND_Y + 0.16;
    for (let x = d.x - d.halfW + 0.3; x < d.x + d.halfW; x += 0.6) box(x, dy, d.z, 0.55, 0.12, d.halfD * 2, Math.round(x * 10) % 2 ? '#a98456' : '#b18b5b');
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) place(new CylinderGeometry(0.1, 0.1, 1.6, 6), '#7c6547', d.x + sx * (d.halfW - 0.25), dy - 0.7, d.z + sz * (d.halfD - 0.15));
    for (let i = 0; i < 6; i++) {
      const a = 0.9 + i * 0.75,
        r = POND.r - 0.5;
      const x = POND.x + Math.cos(a) * r,
        z = POND.z + Math.sin(a) * r;
      if (Math.abs(x - d.x) < d.halfW + 0.4 && Math.abs(z - d.z) < d.halfD + 0.6) continue;
      assetAt('reed', x, GROUND_Y - 0.2, z, a, 1 + (i % 2) * 0.2);
    }
    for (let i = 0; i < 4; i++) {
      const a = 2.4 + i * 0.5,
        r = POND.r * 0.45;
      assetAt('lily', POND.x + Math.cos(a) * r, GROUND_Y - 0.28, POND.z + Math.sin(a) * r, a);
    }
  }
  // Garden: raised beds with sprouts and a watering can.
  for (const bed of GARDEN_BEDS) {
    const o = capsuleOrigin(bed);
    asset('bed', o.x, o.z, o.heading);
  }
  asset('can', WATERING_CAN.x, WATERING_CAN.z, 0.4);
  // Drawing boards around the plaza, each frame its own colour.
  const frames = ['#e0574f', '#3f8f8a', '#e9b949', '#7b5ea7', '#5e9a4b'];
  DRAWING_BOARDS.forEach((b, i) => asset('board', b.x, b.z, b.heading, BOARD_SCALE, 0, { frame: frames[i % frames.length] }));
  // Notice board by the spawn.
  asset('notice', NOTICE_BOARD.x, NOTICE_BOARD.z, 0);
  // Crates and barrels beside the pier root, where the catch gets sorted.
  const c = SORTING_CRATES;
  asset('crate', c.x - 0.4, c.z - 0.4, 0.3, 1.25);
  asset('crate', c.x + 0.5, c.z + 0.4, -0.2);
  asset('crate', c.x - 0.3, c.z - 0.5, 0.6, 1, 0.88);
  place(new CylinderGeometry(0.45, 0.45, 1, 10), '#7a5a3c', -c.x + 0.6, gy(-c.x, c.z) + 0.5, c.z - 0.3);
  place(new CylinderGeometry(0.45, 0.45, 1, 10), '#86644a', -c.x - 0.3, gy(-c.x, c.z) + 0.5, c.z + 0.6);
  // Tide pools: rocks to step around, starfish in the shallows.
  for (const [i, r] of TIDE_ROCKS.entries()) asset(`rock${i % 3}`, r.x, r.z, r.x, r.r * 0.95, -0.15);
  for (const [i, pool] of TIDE_POOL_DISCS.entries()) {
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + i;
      box(pool.x + pool.r * 0.55 + Math.cos(a) * 0.14, gy(pool.x, pool.z) + 0.03, pool.z + Math.sin(a) * 0.14, 0.26, 0.05, 0.08, '#e0784f', a);
    }
  }
  // Boulders all the way round the shore, skipping the pier mouth, and a few on the hill.
  for (let i = 0; i < 34; i++) {
    const a = i * 0.37 + 0.4,
      r = shoreRadius(a) + 0.2 + (i % 3) * 0.4;
    const x = Math.cos(a) * r,
      z = Math.sin(a) * r;
    if (Math.abs(x) < 4 && z > 0) continue;
    assetAt(`rock${i % 3}`, x, -0.35, z, a * 2.3, 0.9 + (i % 4) * 0.35);
  }
  for (const [x, z, r] of [[17.5, -8, 0.7], [10.5, -14.5, 0.55], [18.8, -13.6, 0.5]]) asset('rock1', x, z, x, r, -0.1);
  // Everything static is one flat-shaded mesh.
  const flat = pieces.map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of flat) {
    if (!g.attributes.uv) g.setAttribute('uv', new Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    if (!g.attributes.normal) g.setAttribute('normal', new Float32BufferAttribute(new Float32Array(g.attributes.position.count * 3), 3));
  }
  const merged = mergeGeometries(flat, false);
  if (!merged) throw new Error('environment pieces could not be merged');
  merged.computeVertexNormals();
  for (const g of pieces) g.dispose();
  for (const g of flat) g.dispose();
  const material = new MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() });
  const mesh = new Mesh(merged, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const group = new Group();
  group.add(mesh);
  // Still water: the pond and the tide pools, one transparent draw call between them.
  const pools: BufferGeometry[] = [];
  const pond = new CircleGeometry(POND.r + 0.15, 32);
  pond.rotateX(-Math.PI / 2);
  pond.translate(POND.x, GROUND_Y - 0.3, POND.z);
  pools.push(pond);
  for (const p of TIDE_POOL_DISCS) {
    const disc = new CircleGeometry(p.r, 14);
    disc.rotateX(-Math.PI / 2);
    disc.translate(p.x, GROUND_Y + groundHeight(p.x, p.z) + 0.02, p.z);
    pools.push(disc);
  }
  const waterGeometry = mergeGeometries(pools, false)!;
  for (const g of pools) g.dispose();
  const waterMaterial = new MeshToonMaterial({ color: '#4f9aa0', transparent: true, opacity: 0.8 });
  const still = new Mesh(waterGeometry, waterMaterial);
  still.receiveShadow = true;
  group.add(still);
  return {
    group,
    dispose() {
      merged.dispose();
      material.dispose();
      waterGeometry.dispose();
      waterMaterial.dispose();
    },
  };
}
