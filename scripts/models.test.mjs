import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { species } from '../server/dist/packages/shared/appearance.js';
// The GLB assets the client loads before it builds the world, built by tools/models in
// Blender. These tests read the files' JSON chunk and check that every animal carries the
// parts the rig expects, that every prop is a single node named for its file, and that the
// cosmetics file holds the hats and accessories the client dresses them in.
const DIR = new URL('../public/models/', import.meta.url);
function glb(name) {
  const data = readFileSync(new URL(`${name}.glb`, DIR));
  assert.equal(
    data.readUInt32LE(0),
    0x46546c67,
    `${name}.glb starts with the glTF magic`,
  );
  const length = data.readUInt32LE(12);
  assert.equal(
    data.readUInt32LE(16),
    0x4e4f534a,
    `${name}.glb's first chunk is JSON`,
  );
  return JSON.parse(data.subarray(20, 20 + length).toString('utf8'));
}
const nodeNames = (json) => (json.nodes ?? []).map((n) => n.name);
const triangles = (json) =>
  (json.meshes ?? []).reduce(
    (sum, m) =>
      sum +
      m.primitives.reduce(
        (s, p) => s + (json.accessors[p.indices]?.count ?? 0) / 3,
        0,
      ),
    0,
  );

test('every animal has a body, a head, two arms, two legs and a hat anchor on the rig pivots', () => {
  for (const kind of species) {
    const json = glb(kind);
    const names = nodeNames(json);
    for (const part of ['body', 'head', 'armL', 'armR', 'legL', 'legR', 'hat'])
      assert.ok(names.includes(part), `${kind} has ${part}`);
    const at = (name) =>
      json.nodes[names.indexOf(name)].translation ?? [0, 0, 0];
    assert.deepEqual(
      at('head').map((v) => +v.toFixed(2)),
      [0, 1.5, 0],
      `${kind}'s head pivot`,
    );
    assert.equal(
      +at('armL')[1].toFixed(2),
      1.02,
      `${kind}'s arms hang from the shoulder line`,
    );
    assert.equal(
      +at('legL')[1].toFixed(2),
      0.17,
      `${kind}'s legs hang from the hip line`,
    );
    assert.ok(at('hat')[1] > 1.6, `${kind}'s hat sits above the head`);
    const roles = (json.materials ?? []).map((m) => m.name);
    assert.ok(
      roles.includes('role_fur') && roles.includes('role_eye'),
      `${kind} is painted by role`,
    );
    assert.ok(
      triangles(json) < 12000,
      `${kind} stays under budget (${triangles(json)} triangles)`,
    );
  }
});

test('props are single nodes named for their file, and the rigged dog has its head and tail', () => {
  const files = readdirSync(DIR)
    .filter((f) => f.endsWith('.glb'))
    .map((f) => f.slice(0, -4));
  const props = files.filter((f) => !species.includes(f) && f !== 'cosmetics');
  assert.ok(props.length >= 30, 'the island has its props');
  for (const name of props) {
    const names = nodeNames(glb(name));
    assert.ok(names.includes(name), `${name}.glb holds a node called ${name}`);
    if (name !== 'dog') assert.equal(names.length, 1, `${name} is one piece`);
  }
  assert.deepEqual(nodeNames(glb('dog')).sort(), ['dog', 'doghead', 'dogtail']);
  assert.ok(
    (glb('board').materials ?? []).some((m) => m.name === 'role_frame'),
    'boards take a frame colour',
  );
});

test('the cosmetics file has every hat and accessory a player can wear', () => {
  const wear = nodeNames(glb('cosmetics'));
  for (const hat of [
    'beanie',
    'bucket',
    'captain',
    'cone',
    'party',
    'flower',
    'beret',
    'straw',
  ])
    assert.ok(wear.includes(`hat_${hat}`), hat);
  // Glasses are the exception: they are built in the client against each animal's own
  // eyes, so one baked pair for every head is not in the file.
  for (const acc of [
    'scarf',
    'backpack',
    'satchel',
    'bandana',
    'bow',
    'headphones',
    'lantern',
  ])
    assert.ok(wear.includes(`acc_${acc}`), acc);
  assert.ok(!wear.includes('acc_glasses'), 'glasses are not baked');
});
