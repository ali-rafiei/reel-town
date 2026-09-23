import {
  BoxGeometry,
  DoubleSide,
  Material,
  MeshBasicMaterial,
  MeshDepthMaterial,
  PlaneGeometry,
  RGBADepthPacking,
  BufferAttribute,
  BufferGeometry,
  CatmullRomCurve3,
  CircleGeometry,
  Color,
  CylinderGeometry,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshToonMaterial,
  Object3D,
  SphereGeometry,
  TorusGeometry,
  TubeGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TRIM_AUTO, isLayered, isTintedHat, sanitizeAppearance, type Appearance, type Species } from '../packages/shared/appearance';
import { lookFor } from '../packages/shared/fishlook';
import { fishTexture } from './fishart';
import { bake, model, propPart, toonGradient, type Part } from './world/models';
export { toonGradient };
// Every avatar is rigged from the species' GLB (built in Blender by tools/models): one
// flat-shaded, vertex-coloured mesh per animated pivot, all sharing one stepped toon
// material, so a harbour of twelve players costs about a dozen draw calls each. The file's
// faces carry roles (coat, pale, deep, outfit…) that are filled in from the player's colours,
// so one model serves every palette. Hats, clothes and accessories are small procedural
// pieces attached to the same pivots.
const templates = new Map<string, BufferGeometry>();
const templateSet = new Set<BufferGeometry>();
let material: MeshToonMaterial | null = null;
let lineMaterial: LineBasicMaterial | null = null;
let shadowMaterial: MeshToonMaterial | null = null;
let lanternGlass: MeshToonMaterial | null = null;
const tint = new Color();
const EYE = '#2c3034';
const CREAM = '#fff4e2';
// Every hand lantern in the harbour shares one glass, so one number lights them all.
export function setLanternGlow(intensity: number) {
  if (lanternGlass) lanternGlass.emissiveIntensity = intensity;
}
function lanternGlassMaterial() {
  return (lanternGlass ??= new MeshToonMaterial({ color: '#ffe9a6', emissive: '#ffcf66', emissiveIntensity: 0.4 }));
}
function template<G extends BufferGeometry>(key: string, make: () => G): G {
  let g = templates.get(key) as G | undefined;
  if (!g) {
    g = make();
    templates.set(key, g);
    templateSet.add(g);
  }
  return g;
}
export function avatarMaterial() {
  return (material ??= new MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() }));
}
export function disposeAvatarCaches() {
  for (const g of templates.values()) g.dispose();
  templates.clear();
  templateSet.clear();
  material?.dispose();
  material = null;
  lineMaterial?.dispose();
  lineMaterial = null;
  shadowMaterial?.dispose();
  shadowMaterial = null;
  lanternGlass?.dispose();
  lanternGlass = null;
}
// Accumulates transformed, coloured copies of template geometry and merges them into one
// flat-shaded mesh: the cosmetics.
class Batch {
  private pieces: BufferGeometry[] = [];
  add(geometry: BufferGeometry, color: string, x: number, y: number, z: number, sx = 1, sy = sx, sz = sx, rx = 0, ry = 0, rz = 0) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
    if (sx !== 1 || sy !== 1 || sz !== 1) g.scale(sx, sy, sz);
    if (rx) g.rotateX(rx);
    if (ry) g.rotateY(ry);
    if (rz) g.rotateZ(rz);
    g.translate(x, y, z);
    tint.set(color);
    const count = g.attributes.position.count,
      colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      colors[i * 3] = tint.r;
      colors[i * 3 + 1] = tint.g;
      colors[i * 3 + 2] = tint.b;
    }
    g.setAttribute('color', new Float32BufferAttribute(colors, 3));
    g.deleteAttribute('uv');
    this.pieces.push(g);
    return this;
  }
  build(parent: Object3D, castShadow = true) {
    if (!this.pieces.length) return null;
    const merged = mergeGeometries(this.pieces, false)!;
    for (const p of this.pieces) p.dispose();
    this.pieces = [];
    merged.computeVertexNormals();
    const mesh = new Mesh(merged, avatarMaterial());
    mesh.castShadow = castShadow;
    parent.add(mesh);
    return mesh;
  }
}
type Radii = [number, number, number];
// What the cosmetics need to know about each animal's shape, matching tools/models/characters.py.
// eyes: where one eye sits in head space and how big it is — x and y its centre, z the
// front of the ball, r its radius — taken from the same numbers characters.py builds the
// face from, so glasses land on the eyes of every animal instead of near them. `side` is
// how far out the head is at eye height, where the arm of a pair of glasses rides.
type Eyes = { x: number; y: number; z: number; r: number; side: number };
type Spec = { head: Radii; torso: { y: number; r: Radii }; hatScale: number; hatY: number; eyes: Eyes; hands: 'pale' | 'fur' | 'deep'; feet: 'pale' | 'fur' | 'deep'; accent: string };
const SPECS: Record<Species, Spec> = {
  cat: { head: [0.66, 0.6, 0.6], torso: { y: 0.72, r: [0.42, 0.4, 0.37] }, hatScale: 1.4, hatY: 0.45, eyes: { x: 0.353, y: 0.039, z: 0.685, r: 0.15, side: 0.646 }, hands: 'pale', feet: 'pale', accent: '#e58a90' },
  monkey: { head: [0.64, 0.6, 0.6], torso: { y: 0.72, r: [0.42, 0.4, 0.37] }, hatScale: 1.37, hatY: 0.45, eyes: { x: 0.293, y: 0.052, z: 0.697, r: 0.14, side: 0.625 }, hands: 'pale', feet: 'pale', accent: '#f6dcb8' },
  frog: { head: [0.8, 0.54, 0.66], torso: { y: 0.68, r: [0.5, 0.38, 0.42] }, hatScale: 1.59, hatY: 0.65, eyes: { x: 0.43, y: 0.4, z: 0.45, r: 0.18, side: 0.42 }, hands: 'fur', feet: 'fur', accent: '#fff5dc' },
  bird: { head: [0.6, 0.58, 0.58], torso: { y: 0.72, r: [0.44, 0.42, 0.38] }, hatScale: 1.28, hatY: 0.43, eyes: { x: 0.312, y: 0.032, z: 0.674, r: 0.15, side: 0.587 }, hands: 'fur', feet: 'deep', accent: '#e0a24a' },
  axolotl: { head: [0.7, 0.58, 0.6], torso: { y: 0.72, r: [0.42, 0.4, 0.37] }, hatScale: 1.46, hatY: 0.43, eyes: { x: 0.387, y: 0.025, z: 0.679, r: 0.15, side: 0.685 }, hands: 'fur', feet: 'fur', accent: '#e07a95' },
  bear: { head: [0.68, 0.62, 0.62], torso: { y: 0.72, r: [0.5, 0.42, 0.42] }, hatScale: 1.44, hatY: 0.47, eyes: { x: 0.333, y: 0.093, z: 0.7, r: 0.14, side: 0.659 }, hands: 'fur', feet: 'deep', accent: '#3b2f28' },
  rabbit: { head: [0.62, 0.6, 0.58], torso: { y: 0.72, r: [0.4, 0.4, 0.36] }, hatScale: 1.34, hatY: 0.45, eyes: { x: 0.31, y: 0.039, z: 0.68, r: 0.15, side: 0.606 }, hands: 'fur', feet: 'pale', accent: '#efb0b4' },
  fish: { head: [0.7, 0.62, 0.6], torso: { y: 0.72, r: [0.42, 0.4, 0.37] }, hatScale: 1.46, hatY: 0.45, eyes: { x: 0.477, y: 0.034, z: 0.648, r: 0.17, side: 0.685 }, hands: 'fur', feet: 'deep', accent: '#e07d86' },
  blob: { head: [0.82, 0.96, 0.7], torso: { y: 0.7, r: [0.82, 0.62, 0.7] }, hatScale: 1.2, hatY: 0.24, eyes: { x: 0.3, y: 0.06, z: 0.54, r: 0.14, side: 0.52 }, hands: 'fur', feet: 'deep', accent: '#a8d1b8' },
};
// The colours a species' roles take for one player.
function paletteFor(a: Appearance, spec: Spec) {
  const base = new Color(a.color);
  const cream = base.clone().lerp(new Color(CREAM), 0.8).getStyle();
  const deep = base.clone().multiplyScalar(0.6).getStyle();
  const pick = (kind: 'pale' | 'fur' | 'deep') => (kind === 'pale' ? cream : kind === 'deep' ? deep : a.color);
  return {
    fur: a.color,
    pale: base.clone().lerp(new Color(CREAM), 0.55).getStyle(),
    cream,
    deep,
    dark: base.clone().multiplyScalar(0.8).getStyle(),
    outfit: a.outfitColor,
    outfitDark: new Color(a.outfitColor).multiplyScalar(0.72).getStyle(),
    eye: EYE,
    white: '#ffffff',
    pink: '#e58a90',
    blush: '#f0a0a6',
    accent: spec.accent,
    hand: pick(spec.hands),
    foot: pick(spec.feet),
    lower: a.outfitColor,
    glass: '#ffe9a6',
  };
}
// Round spectacles built to the animal's own eyes rather than scaled to fit them: a lens
// ringing each eye, a bridge across the gap, and an arm running back to the side of the head.
function glasses(head: Object3D, eyes: Eyes) {
  const frame = '#394a43';
  const lens = eyes.r * 1.08;
  const bar = eyes.r * 0.2;
  const ring = template('lens', () => new TorusGeometry(1, 0.24, 5, 14));
  const stick = template('box', () => new BoxGeometry(1, 1, 1));
  const batch = new Batch();
  for (const s of [-1, 1]) {
    batch.add(ring, frame, s * eyes.x, eyes.y, eyes.z, lens);
    const from: [number, number, number] = [s * (eyes.x + lens * 0.92), eyes.y, eyes.z - lens * 0.25];
    const to: [number, number, number] = [s * eyes.side, eyes.y + eyes.r * 0.12, eyes.z - lens * 0.25 - eyes.z * 0.75];
    const dx = to[0] - from[0],
      dz = to[2] - from[2];
    batch.add(stick, frame, (from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2, bar, bar, Math.hypot(dx, dz), 0, Math.atan2(dx, dz));
  }
  batch.add(stick, frame, 0, eyes.y, eyes.z - lens * 0.12, Math.max(bar, (eyes.x - lens) * 2), bar, bar);
  batch.build(head);
}
export type AvatarModel = ReturnType<typeof makeAvatar>;
export function makeAvatar(input: Partial<Appearance>) {
  const a = sanitizeAppearance(input),
    kind = a.species as Species,
    spec = SPECS[kind],
    asset = model(kind),
    palette = paletteFor(a, spec),
    group = new Group(),
    body = new Group(),
    head = new Group(),
    hat = new Group();
  // A garment worn over a shirt takes the clothing colour, and the shirt and sleeves under
  // it take the player's second colour: in one colour the coat was invisible against the
  // body it covered, and in one fixed cream every layered outfit looked the same.
  if (isLayered(a.outfit)) palette.outfit = a.shirtColor;
  group.add(body);
  body.add(head);
  head.position.set(0, 1.5, 0);
  head.add(hat);
  const hatAnchor = asset?.parts.get('hat');
  const hatY = hatAnchor ? hatAnchor.position.y - 1.5 : spec.hatY;
  hat.position.set(0, hatY, 0);
  hat.scale.setScalar(spec.hatScale);
  const sphere = template('sphere', () => new SphereGeometry(1, 12, 8));
  const small = template('small', () => new SphereGeometry(1, 8, 6));
  const box = template('box', () => new BoxGeometry(1, 1, 1));
  const bodyBatch = new Batch(),
    headBatch = new Batch();
  const H = spec.head;
  const torso = spec.torso;
  const outfitDark = palette.outfitDark;
  // Every accent on an outfit — cuffs, hems, pockets, bands, buttons — takes the trim
  // colour. On AUTO each piece keeps the colour it was painted with, which is the look
  // every outfit had before the trim could be chosen.
  const trim = (painted: string) => (a.trimColor === TRIM_AUTO ? painted : a.trimColor);
  // A part of the model on its pivot: a group placed where the file says, holding the baked mesh.
  const mount = (part: Part | undefined, parent: Object3D, origin: Vector3 | null, into?: Group) => {
    const pivot = into ?? new Group();
    if (part) {
      if (!into) {
        pivot.position.copy(part.position);
        if (origin) pivot.position.sub(origin);
        pivot.rotation.set(part.rotation.x, part.rotation.y, part.rotation.z);
      }
      if (part.geometry.attributes.position) {
        const mesh = new Mesh(bake(part, palette), avatarMaterial());
        mesh.castShadow = true;
        pivot.add(mesh);
      }
    }
    if (!into) parent.add(pivot);
    return pivot;
  };
  const headOrigin = new Vector3(0, 1.5, 0);
  if (asset) {
    mount(asset.parts.get('body'), body, null, body);
    mount(asset.parts.get('head'), head, headOrigin, head);
  } else {
    // No model for this animal: a plain placeholder so the harbour still works.
    bodyBatch.add(sphere, a.outfitColor, 0, torso.y, 0, torso.r[0], torso.r[1], torso.r[2]);
    headBatch.add(sphere, a.color, 0, 0, 0, H[0], H[1], H[2]);
  }
  const arms = (['armL', 'armR'] as const).map((name, i) => {
    const pivot = mount(asset?.parts.get(name), body, null);
    if (!asset?.parts.get(name)) pivot.position.set((i ? 1 : -1) * 0.42, 1.02, 0.02);
    return pivot;
  });
  const legs = (['legL', 'legR'] as const).map((name, i) => {
    const pivot = mount(asset?.parts.get(name), body, null);
    if (!asset?.parts.get(name)) pivot.position.set((i ? 1 : -1) * 0.2, 0.17, 0.08);
    return pivot;
  });
  const ears: Group[] = [];
  for (const name of ['earL', 'earR'] as const) {
    const part = asset?.parts.get(name);
    if (part) ears.push(mount(part, head, headOrigin));
  }
  const tailPart = asset?.parts.get('tail');
  const tail: Group | null = tailPart ? mount(tailPart, body, null) : null;
  // Clothes that are more than a painted tee: shells that follow the torso.
  const shell = (key: string, thetaStart: number, thetaLength: number, phiStart = 0, phiLength = Math.PI * 2) =>
    template(`${key}-${thetaStart.toFixed(2)}-${thetaLength.toFixed(2)}-${phiStart.toFixed(2)}-${phiLength.toFixed(2)}`, () => new SphereGeometry(1, 12, 8, phiStart, phiLength, thetaStart, thetaLength));
  const dress = (geometry: BufferGeometry, colour: string, grow = 1.07) => bodyBatch.add(geometry, colour, 0, torso.y, 0, torso.r[0] * grow, torso.r[1] * grow, torso.r[2] * grow);
  // The body is a pear: an ellipsoid with a ball for the hips, the way characters.py builds
  // it. Trousers follow that ball, not the ellipsoid, or they sit inside the hips unseen.
  const hipY = torso.y - torso.r[1] * 0.55,
    hipR = Math.min(torso.r[0], torso.r[2]) * 0.9;
  const trousers = (geometry: BufferGeometry, colour: string, grow = 1.22) => bodyBatch.add(geometry, colour, 0, hipY, 0, hipR * grow, hipR * grow, hipR * grow);
  // Where a shell's surface is, by polar angle from the top and azimuth from front centre.
  const onTorso = (theta: number, from: number, grow: number): [number, number, number] => [torso.r[0] * grow * Math.sin(from) * Math.sin(theta), torso.y + torso.r[1] * grow * Math.cos(theta), torso.r[2] * grow * Math.cos(from) * Math.sin(theta)];
  if (a.outfit === 'raincoat') {
    // A hooded slicker: the coat over the whole torso, a hood bunched behind the neck,
    // a storm flap down the front, patch pockets and a darker hem.
    dress(shell('coat', 0, Math.PI * 0.86), a.outfitColor, 1.22);
    dress(shell('hem', Math.PI * 0.78, Math.PI * 0.08), trim(outfitDark), 1.24);
    bodyBatch.add(box, trim(outfitDark), 0, torso.y + 0.02, torso.r[2] * 1.25, 0.1, torso.r[1] * 1.3, 0.04);
    for (let i = 0; i < 3; i++) bodyBatch.add(small, trim('#f4deb0'), 0, torso.y + 0.2 - i * 0.19, torso.r[2] * 1.25, 0.035);
    for (const s of [-1, 1]) {
      const [px, py, pz] = onTorso(Math.PI * 0.62, s * Math.PI * 0.17, 1.25);
      bodyBatch.add(box, trim(outfitDark), px, py, pz, 0.16, 0.13, 0.03, Math.PI * 0.62 - Math.PI / 2);
    }
    bodyBatch.add(template('hood', () => new SphereGeometry(1, 10, 8, 0, Math.PI, 0, Math.PI * 0.7)), a.outfitColor, 0, torso.y + torso.r[1] * 0.74, -torso.r[2] * 0.42, 0.34, 0.3, 0.3, 0.5, Math.PI);
    bodyBatch.add(template('collar', () => new TorusGeometry(0.3, 0.07, 5, 12)), trim(outfitDark), 0, torso.y + torso.r[1] * 0.8, 0, 1, 1, 1, Math.PI / 2);
  } else if (a.outfit === 'overalls') {
    // Denim over a cream shirt: trousers to the waist, a bib on the chest and a strap
    // over each shoulder to the back, every piece a shell that follows the torso.
    const denim = a.outfitColor,
      strap = Math.PI * 0.055,
      lean = Math.PI * 0.14;
    trousers(shell('pants', Math.PI * 0.35, Math.PI * 0.65), denim);
    dress(shell('bib', Math.PI * 0.28, Math.PI * 0.24, Math.PI * 0.34, Math.PI * 0.32), denim, 1.22);
    for (const s of [-1, 1]) {
      dress(shell('strap', 0, Math.PI * 0.31, Math.PI * 0.5 + s * lean - strap, strap * 2), denim, 1.22);
      dress(shell('strap', 0, Math.PI * 0.46, Math.PI * 1.5 - s * lean - strap, strap * 2), denim, 1.22);
      const [bx, by, bz] = onTorso(Math.PI * 0.3, s * lean, 1.25);
      bodyBatch.add(small, trim('#e8c369'), bx, by, bz, 0.035);
    }
    // A patch pocket on the bib and a hem band where the denim meets the shirt.
    const [px, py, pz] = onTorso(Math.PI * 0.41, 0, 1.23);
    bodyBatch.add(box, trim(outfitDark), px, py, pz, 0.17, 0.14, 0.03, Math.PI * 0.41 - Math.PI / 2);
    bodyBatch.add(template('waistband', () => new TorusGeometry(1, 0.13, 5, 16)), trim(outfitDark), 0, hipY + hipR * 0.5, 0, hipR * 1.16, hipR * 1.16, 0.7, Math.PI / 2);
  } else if (a.outfit === 'hoodie') {
    // A pullover with a hood down the back, a kangaroo pocket and drawstrings.
    dress(shell('hoodie', 0, Math.PI * 0.74), a.outfitColor, 1.22);
    dress(shell('cuff', Math.PI * 0.68, Math.PI * 0.07), trim(outfitDark), 1.23);
    bodyBatch.add(template('hoodback', () => new SphereGeometry(1, 10, 8, 0, Math.PI, 0, Math.PI * 0.68)), a.outfitColor, 0, torso.y + torso.r[1] * 0.72, -torso.r[2] * 0.5, 0.36, 0.32, 0.32, 0.65, Math.PI);
    bodyBatch.add(template('hoodrim', () => new TorusGeometry(1, 0.13, 5, 12)), trim(outfitDark), 0, torso.y + torso.r[1] * 0.86, -torso.r[2] * 0.18, 0.34, 0.3, 0.34, Math.PI * 0.42);
    // A kangaroo pocket across the belly: a shell patch, so it follows the body.
    dress(shell('pouch', Math.PI * 0.46, Math.PI * 0.2, Math.PI * 0.26, Math.PI * 0.48), trim(outfitDark), 1.235);
    for (const s of [-1, 1]) {
      const [dx, dy, dz] = onTorso(Math.PI * 0.32, s * Math.PI * 0.05, 1.24);
      bodyBatch.add(box, trim(palette.cream), dx, dy, dz, 0.035, 0.26, 0.035);
      bodyBatch.add(small, trim('#e8c369'), dx, dy - 0.14, dz, 0.03);
    }
  }
  if (a.outfit === 'striped') for (const t of [0.3, 0.44]) dress(shell('band', Math.PI * t, Math.PI * 0.07), trim('#f5e4c4'), 1.115);
  if (a.outfit === 'cardigan') {
    // The cardigan itself is the clothing colour, over a shirt of its own; the placket
    // and its buttons are trim.
    for (const phi of [0.1, 0.6]) dress(shell('lapel', 0, Math.PI * 0.62, Math.PI * phi, Math.PI * 0.3), a.outfitColor, 1.18);
    dress(shell('back', 0, Math.PI * 0.62, Math.PI * 1.08, Math.PI * 0.84), a.outfitColor, 1.18);
    bodyBatch.add(box, trim('#f2e3c7'), 0, torso.y, torso.r[2] * 1.17, 0.14, 0.58, 0.06);
    for (let i = 0; i < 3; i++) bodyBatch.add(small, trim('#8c6a3f'), 0.08, torso.y + 0.18 - i * 0.17, torso.r[2] * 1.21, 0.03);
  }
  if (a.outfit === 'sweater') {
    for (let i = 0; i < 6; i++) bodyBatch.add(box, trim('#f5e4c4'), -0.21 + i * 0.085, torso.y + 0.06, torso.r[2] * 1.11, 0.11, 0.04, 0.03, 0, 0, i % 2 ? -0.7 : 0.7);
    bodyBatch.add(template('collar', () => new TorusGeometry(0.3, 0.06, 5, 12)), trim(outfitDark), 0, torso.y + torso.r[1] * 0.78, 0, 1, 1, 1, Math.PI / 2);
  }
  if (a.outfit === 'vest') {
    // The vest is the clothing colour over a shirt of its own, its pockets the trim.
    for (const phi of [0.08, 0.58]) dress(shell('vest', 0, Math.PI * 0.66, Math.PI * phi, Math.PI * 0.34), a.outfitColor, 1.19);
    dress(shell('vest', 0, Math.PI * 0.66, Math.PI * 1.08, Math.PI * 0.84), a.outfitColor, 1.19);
    for (const s of [-1, 1]) bodyBatch.add(box, trim(outfitDark), s * 0.2, torso.y - 0.08, torso.r[2] * 1.17, 0.14, 0.07, 0.03);
  }
  // A hat of plain cloth takes the hat colour rather than the clothing one; the hats that
  // are a thing before they are a hat carry their own colours and never look this up.
  const hatPalette = isTintedHat(a.hat) ? { ...palette, outfit: a.hatColor, outfitDark: new Color(a.hatColor).multiplyScalar(0.72).getStyle() } : palette;
  // Hats and accessories come from the cosmetics file, baked with those colours.
  const wear = (name: string, parent: Object3D, x = 0, y = 0, z = 0, scale: number | [number, number, number] = 1, ry = 0, paint = palette) => {
    const part = propPart('cosmetics', name);
    if (!part) return null;
    const g = bake(part, paint);
    const [sx, sy, sz] = typeof scale === 'number' ? [scale, scale, scale] : scale;
    if (sx !== 1 || sy !== 1 || sz !== 1) g.scale(sx, sy, sz);
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    const mesh = new Mesh(g, avatarMaterial());
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  };
  if (a.hat !== 'none') wear(`hat_${a.hat}`, hat, 0, 0, 0, 1, 0, hatPalette);
  // Accessories: glasses and the bow on the head, the rest on the body or the left arm.
  const torsoScale: [number, number, number] = [torso.r[0] / 0.42, torso.r[1] / 0.4, torso.r[2] / 0.37];
  if (a.accessory === 'glasses') glasses(head, spec.eyes);
  if (a.accessory === 'bow') wear('acc_bow', head, 0, 0, 0, [H[0] / 0.6, H[1] / 0.6, H[2] / 0.6]);
  if (a.accessory === 'headphones') wear('acc_headphones', head, 0, 0, 0, [(H[0] + 0.02) / 0.62, (H[1] + 0.04) / 0.62, 1]);
  if (a.accessory === 'scarf' || a.accessory === 'backpack' || a.accessory === 'satchel' || a.accessory === 'bandana') {
    const mesh = wear(`acc_${a.accessory}`, body, 0, 0, 0, torsoScale);
    if (mesh) mesh.position.y = torso.y - 0.72 * torsoScale[1];
  }
  if (a.accessory === 'lantern') {
    wear('acc_lantern', arms[0]);
    const glass = new Mesh(template('lantern-glass', () => new BoxGeometry(0.16, 0.2, 0.16)), lanternGlassMaterial());
    glass.position.set(0, -0.8, 0.08);
    arms[0].add(glass);
  }
  bodyBatch.build(body);
  headBatch.build(head);
  shadowMaterial ??= new MeshToonMaterial({ color: '#657b56' });
  const shadow = new Mesh(template('blob-shadow', () => new CircleGeometry(0.6, 12)), shadowMaterial);
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.025;
  group.add(shadow);
  const bob = new Batch().add(small, '#e57851', 0, 0, 0, 0.15).build(group, false)!;
  bob.visible = false;
  const rodPivot = new Group();
  rodPivot.position.set(arms[1].position.x + 0.06, 0.7, 0.14);
  body.add(rodPivot);
  new Batch()
    .add(
      template('rod', () => new TubeGeometry(new CatmullRomCurve3([new Vector3(0, 0, 0), new Vector3(0, 0.7, 0.04), new Vector3(0, 1.4, 0.17), new Vector3(0, 2, 0.4)]), 12, 0.026, 5, false)),
      '#725636',
      0,
      0,
      0,
    )
    .add(template('grip', () => new CylinderGeometry(0.055, 0.055, 0.32, 6)), '#3c5b50', 0, 0.13, 0)
    .build(rodPivot);
  const rodTip = new Object3D();
  rodTip.position.set(0, 2, 0.4);
  rodPivot.add(rodTip);
  rodPivot.visible = false;
  const lineGeometry = new BufferGeometry();
  lineGeometry.setAttribute('position', new BufferAttribute(new Float32Array(33 * 3), 3));
  lineMaterial ??= new LineBasicMaterial({ color: '#fff0c1', transparent: true, opacity: 0.9 });
  const line = new Line(lineGeometry, lineMaterial);
  line.frustumCulled = false;
  line.visible = false;
  group.add(line);
  // The fish held up after a catch: the species' painting on a card, sized by its length.
  // The entity turns the card to face the camera each frame.
  const prizeFish = new Group();
  group.add(prizeFish);
  prizeFish.visible = false;
  // Unlit: the painting carries its own shading, and a lit card went muddy under the low sun.
  const prizeMaterial = new MeshBasicMaterial({ transparent: true, alphaTest: 0.5, side: DoubleSide });
  const prizeDepth = new MeshDepthMaterial({ depthPacking: RGBADepthPacking, alphaTest: 0.5 });
  const prizeMesh = new Mesh(template('card', () => new PlaneGeometry(1.5, 1)), prizeMaterial);
  prizeMesh.customDepthMaterial = prizeDepth;
  prizeMesh.castShadow = true;
  prizeFish.add(prizeMesh);
  function setPrize(name?: string) {
    const texture = fishTexture(name);
    prizeMaterial.map = texture;
    prizeDepth.map = texture;
    prizeMaterial.needsUpdate = true;
    prizeDepth.needsUpdate = true;
    const width = 0.9 + 0.6 * lookFor(name).length;
    prizeMesh.scale.set(width, width, 1);
  }
  setPrize();
  return {
    group,
    body,
    head,
    hat,
    hatY,
    arms,
    legs,
    ears,
    tail,
    shadow,
    bob,
    rodPivot,
    rodTip,
    line,
    lineGeometry,
    prizeFish,
    setPrize,
    prizeMaterials: [prizeMaterial, prizeDepth] as Material[],
    appearance: a,
  };
}
// Baked and merged geometries are unique per avatar; templates and materials are shared until the world is disposed.
export function disposeAvatar(model: AvatarModel) {
  model.group.removeFromParent();
  for (const material of model.prizeMaterials) material.dispose();
  model.group.traverse((o) => {
    if (o instanceof Mesh && !templateSet.has(o.geometry)) o.geometry.dispose();
  });
  model.lineGeometry.dispose();
}
