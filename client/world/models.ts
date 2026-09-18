import { BufferGeometry, Color, DataTexture, Float32BufferAttribute, Group, Mesh, NearestFilter, RedFormat, Vector3, type Material } from 'three';
import { species } from '../../packages/shared/appearance';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
// The game's 3D assets are GLB files built by tools/models (Blender). Every mesh carries
// its colour as a role on each face: `role_<name>` is filled in per player (coat, outfit),
// `c_<hex>` is a fixed colour. A part is a node of the file: the client rigs character
// parts onto pivots and bakes props straight into the world.
export type Part = {
  name: string;
  position: Vector3;
  rotation: Vector3;
  // Non-indexed positions with one role index per vertex; normals are flat, per face.
  geometry: BufferGeometry;
  roles: string[];
};
export type Model = { name: string; parts: Map<string, Part> };
const models = new Map<string, Model>();
const loading = new Map<string, Promise<Model>>();
const loader = new GLTFLoader();
export const MODEL_BASE = `${import.meta.env.BASE_URL}models/`;
// Every file the world needs before it can be built.
export const PROP_NAMES = ['pine0', 'pine1', 'pine2', 'roundtree0', 'roundtree1', 'orchardtree', 'bush0', 'bush1', 'rock0', 'rock1', 'rock2', 'house', 'threads', 'lighthouse', 'bench', 'picnic', 'stump', 'campfire', 'board', 'notice', 'bed', 'can', 'lamp', 'crate', 'bollard', 'buoy', 'boat', 'dog', 'fence', 'shell', 'lily', 'reed', 'signpost', 'cosmetics'];
export const ASSET_NAMES = [...species, ...PROP_NAMES];
// Five tones from shadow to light: with flat normals each facet takes one, which is the
// whole low-poly look of the concept sheets. Shared by everything in the world.
let gradient: DataTexture | null = null;
export function toonGradient() {
  if (!gradient) {
    gradient = new DataTexture(new Uint8Array([118, 156, 196, 228, 255]), 5, 1, RedFormat);
    gradient.minFilter = NearestFilter;
    gradient.magFilter = NearestFilter;
    gradient.generateMipmaps = false;
    gradient.needsUpdate = true;
  }
  return gradient;
}
// A prop's single part (named for the file), or its named part.
export function propPart(name: string, part = name) {
  return models.get(name)?.parts.get(part);
}
function roleOf(material: Material | Material[] | undefined) {
  const name = (Array.isArray(material) ? material[0] : material)?.name ?? '';
  return name.startsWith('role_') ? name.slice(5) : name.startsWith('c_') ? `#${name.slice(2)}` : 'fur';
}
function toPart(node: Group | Mesh): Part | null {
  const meshes = node instanceof Mesh ? [node] : (node.children.filter((c) => c instanceof Mesh) as Mesh[]);
  if (!meshes.length) return null;
  const roles: string[] = [];
  const pieces: BufferGeometry[] = [];
  for (const mesh of meshes) {
    const g = (mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()) as BufferGeometry;
    for (const key of Object.keys(g.attributes)) if (key !== 'position') g.deleteAttribute(key);
    const role = roleOf(mesh.material);
    let index = roles.indexOf(role);
    if (index < 0) index = roles.push(role) - 1;
    const count = g.attributes.position.count;
    g.setAttribute('role', new Float32BufferAttribute(new Float32Array(count).fill(index), 1));
    pieces.push(g);
  }
  const geometry = mergeGeometries(pieces, false)!;
  for (const p of pieces) p.dispose();
  geometry.computeVertexNormals();
  return { name: node.name, position: node.position.clone(), rotation: new Vector3(node.rotation.x, node.rotation.y, node.rotation.z), geometry, roles };
}
export function loadModel(name: string): Promise<Model> {
  const hit = loading.get(name);
  if (hit) return hit;
  const promise = new Promise<Model>((resolve) => {
    loader.load(
      `${MODEL_BASE}${name}.glb`,
      (gltf) => {
        const parts = new Map<string, Part>();
        for (const node of gltf.scene.children) {
          if (node.type === 'Object3D' || (node instanceof Group && !node.children.length)) {
            // An empty: an anchor such as where a hat sits.
            parts.set(node.name, { name: node.name, position: node.position.clone(), rotation: new Vector3(), geometry: new BufferGeometry(), roles: [] });
            continue;
          }
          const part = toPart(node as Group | Mesh);
          if (part) parts.set(part.name, part);
        }
        const model = { name, parts };
        models.set(name, model);
        resolve(model);
      },
      undefined,
      (error) => {
        // A missing file must not take the whole world down: the part simply has no model.
        console.warn(`model ${name} did not load`, error);
        const empty = { name, parts: new Map<string, Part>() };
        models.set(name, empty);
        resolve(empty);
      },
    );
  });
  loading.set(name, promise);
  return promise;
}
export function model(name: string) {
  return models.get(name);
}
export async function preloadModels(names: string[]) {
  await Promise.all(names.map(loadModel));
}
// A copy of a part's geometry with its roles turned into vertex colours.
const colour = new Color();
function parseHex(value: string): [number, number, number] {
  // Accepts any CSS colour string, hex or rgb(), as three does.
  colour.set(value);
  return [colour.r, colour.g, colour.b];
}
export function bake(part: Part, palette: Record<string, string>, fallback = '#cccccc') {
  const geometry = part.geometry.clone();
  const roles = part.geometry.getAttribute('role');
  const count = roles.count;
  const colors = new Float32Array(count * 3);
  const table = part.roles.map((role) => parseHex(role.startsWith('#') ? role : palette[role] ?? fallback));
  for (let i = 0; i < count; i++) {
    const c = table[roles.getX(i)] ?? table[0];
    colors[i * 3] = c[0];
    colors[i * 3 + 1] = c[1];
    colors[i * 3 + 2] = c[2];
  }
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.deleteAttribute('role');
  return geometry;
}
