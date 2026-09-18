import { BoxGeometry, BufferGeometry, Color, ConeGeometry, CylinderGeometry, Float32BufferAttribute } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { bake, propPart } from './models';
import { SEA_LEVEL } from './water';
// Where a hull's origin sits: its bottom (0.05 above the origin) stays under every trough,
// its floor (0.58 above) above every crest, so the water never shows inside the boat.
export const BOAT_Y = SEA_LEVEL - 0.26;
// The rowboat hull: a hollow box with a dark floor, rim, seats, a bow and an oar, built
// once and shared by the moored boat and every rower on the water.
const tint = new Color();
function paint(geometry: BufferGeometry, hex: string) {
  tint.set(hex);
  const count = geometry.attributes.position.count,
    colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = tint.r;
    colors[i * 3 + 1] = tint.g;
    colors[i * 3 + 2] = tint.b;
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  return geometry;
}
let hull: BufferGeometry | null = null;
export function hullGeometry() {
  if (hull) return hull;
  // The modelled rowboat when it has loaded; the box hull below is the fallback.
  const part = propPart('boat');
  if (part) return (hull = bake(part, {}));
  const pieces: BufferGeometry[] = [];
  const add = (g: BufferGeometry, hex: string, x: number, y: number, z: number) => {
    g.translate(x, y, z);
    pieces.push(paint(g, hex));
  };
  add(new BoxGeometry(1.35, 0.5, 3.1), '#b98e58', 0, 0.25, 0);
  add(new BoxGeometry(1.05, 0.08, 2.7), '#6d4f33', 0, 0.5, 0);
  for (const [x, w, d] of [[-0.62, 0.14, 3.1], [0.62, 0.14, 3.1]] as const) add(new BoxGeometry(w, 0.28, d), '#8e6b43', x, 0.62, 0);
  add(new BoxGeometry(1.35, 0.28, 0.14), '#8e6b43', 0, 0.62, -1.5);
  for (const z of [-0.8, 0.5]) add(new BoxGeometry(1.1, 0.1, 0.32), '#d9b47a', 0, 0.6, z);
  const bow = new ConeGeometry(0.72, 1.1, 4);
  bow.rotateX(Math.PI / 2);
  bow.rotateZ(Math.PI / 4);
  add(bow, '#b98e58', 0, 0.3, 2.05);
  const oar = new CylinderGeometry(0.04, 0.04, 2.4, 5);
  oar.rotateZ(Math.PI / 2);
  oar.rotateY(0.3);
  add(oar, '#e2c88f', 0.6, 0.72, 0.1);
  hull = mergeGeometries(pieces, false)!;
  for (const p of pieces) p.dispose();
  return hull;
}
export function disposeHull() {
  hull?.dispose();
  hull = null;
}
