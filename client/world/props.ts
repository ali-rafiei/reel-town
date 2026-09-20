import {
  AdditiveBlending,
  BoxGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  Object3D,
  DoubleSide,
  RingGeometry,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  TorusGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BUOYS, CAMPFIRE, CONTEST_SIGN, DECK_STAND_Y, DOG, GROUND_Y, ORCHARD, PIER, POND, ROWBOAT, RPS_PODIUM, SHORE, groundHeight, onPath, props as layoutProps, shoreDistance, shoreRadius, walkable } from '../../packages/shared/layout';
import { GARDEN_PLOTS, SHELL } from '../../packages/shared/activities';
import { beamHeading } from '../../packages/shared/lighthouse';
import { BOAT_Y, hullGeometry } from './boat';
import { SEA_LEVEL, SWELL } from './water';
import { bake, propPart, toonGradient } from './models';
import { tangentHeading } from '../../packages/shared/orientation';
import { viewpoint } from './entities';
import { spriteCard, spriteGeometry, spriteMaterial } from './sprites';
// Animated set dressing: a moored rowboat, chimney smoke, fish shadows under the
// surface, swaying grass, the contest target and the cast-landing preview. The smoke,
// shadows, grass, gulls, pin, hearts, flame and shop sign are paintings on cards.
export function createProps(scene: Scene, grassCount: number) {
  const dummy = new Object3D();
  const tint = new Color();
  const vertexColored = new MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient() });
  // Rowboat moored beside the pier; it goes out of sight while its owner is rowing it.
  const boat = new Mesh(hullGeometry(), vertexColored);
  boat.position.set(ROWBOAT.x, BOAT_Y, ROWBOAT.z);
  boat.rotation.y = ROWBOAT.heading;
  boat.castShadow = true;
  scene.add(boat);
  // Chimney smoke puffs, pooled.
  const smokeMaterial = spriteMaterial('fishing-shop', 'chimney-smoke', 'lit', { transparent: true, opacity: 0.55, depthWrite: false });
  const puffGeometry = spriteGeometry('fishing-shop', 'chimney-smoke', 1);
  const houseY = groundHeight(layoutProps.house.x, layoutProps.house.z);
  const puffs = Array.from({ length: 10 }, (_, i) => {
    const m = new Mesh(puffGeometry, smokeMaterial);
    m.position.set(layoutProps.house.x + 1.1, 4.9 + houseY, layoutProps.house.z - 0.9);
    m.userData.life = (i / 10) * 4;
    m.castShadow = false;
    scene.add(m);
    return m;
  });
  // Fish cruising under the surface: six painted silhouettes seen from above, lying
  // flat with the nose along +X so a single turn about Y points each the way it swims.
  const shadowCount = 14;
  const SILHOUETTES = ['minnow', 'bream', 'eel', 'ray', 'bass', 'tuna'];
  const fishShadows = SILHOUETTES.map((name) => {
    const geometry = spriteGeometry('world-billboards', `${name}-silhouette`, 2);
    geometry.rotateX(-Math.PI / 2);
    geometry.rotateY(-Math.PI / 2);
    const mesh = new InstancedMesh(geometry, spriteMaterial('world-billboards', `${name}-silhouette`, 'glow', { transparent: true, opacity: 0.45, depthWrite: false }), Math.ceil(shadowCount / SILHOUETTES.length));
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
    scene.add(mesh);
    return mesh;
  });
  // Each fish keeps a fixed distance off the coast, wherever the coast bends.
  const shadowSeeds = Array.from({ length: shadowCount }, (_, i) => ({ phase: i * 1.7, offset: 2.5 + (i % 4) * 1.4, speed: 0.12 + (i % 3) * 0.04, side: i % 2 ? 1 : -1, size: 0.85 + (i % 5) * 0.14, kind: i % SILHOUETTES.length, slot: Math.floor(i / SILHOUETTES.length) }));
  for (const s of shadowSeeds) fishShadows[s.kind].count = Math.max(fishShadows[s.kind].count, s.slot + 1);
  // Grass tufts and flowers on the island: painted tufts on two crossed cards, swaying
  // in the vertex shader. Three paintings, one instanced mesh each.
  const grassUniform = { value: 0 };
  const tuftMeshes = ['grass-tuft', 'yellow-flower-tuft', 'pink-flower-tuft'].map((name) => {
    const card = spriteGeometry('world-billboards', name, 0.7);
    card.translate(0, 0.33, 0);
    const across = card.clone().rotateY(Math.PI / 2);
    const geometry = mergeGeometries([card, across], false)!;
    card.dispose();
    across.dispose();
    const material = spriteMaterial('world-billboards', name, 'lit') as MeshToonMaterial;
    material.onBeforeCompile = (shader) => {
      shader.uniforms.time = grassUniform;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float time;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvec4 wp = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);\ntransformed.x += sin(time * 1.8 + wp.x * 0.7 + wp.z * 0.9) * 0.09 * position.y;\ntransformed.z += cos(time * 1.3 + wp.x * 0.5) * 0.05 * position.y;');
    };
    const mesh = new InstancedMesh(geometry, material, Math.max(1, grassCount));
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.count = 0;
    scene.add(mesh);
    return mesh;
  });
  {
    let placed = 0,
      attempt = 0;
    while (placed < grassCount && attempt < grassCount * 40) {
      attempt++;
      // Even scatter over the disc, kept off the paths, the pier road and the beaches.
      const a = attempt * 2.399,
        r = Math.sqrt(((attempt * 7919) % 1000) / 1000) * SHORE.maxRadius;
      const x = Math.cos(a) * r,
        z = Math.sin(a) * r;
      if (shoreDistance(x, z) < 1.8 || !walkable(x, z) || onPath(x, z, 0.4) || (Math.abs(x) < PIER.halfWidth + 1 && z > PIER.deckFrom - 3)) continue;
      dummy.position.set(x, 0.82 + groundHeight(x, z), z);
      dummy.rotation.set(0, a, 0);
      const size = 0.75 + ((attempt * 31) % 7) * 0.08;
      dummy.scale.set(size, size * (0.8 + ((attempt * 17) % 5) * 0.08), size);
      dummy.updateMatrix();
      // Mostly plain grass, with a flowering tuft every few.
      const mesh = tuftMeshes[placed % 5 === 0 ? 1 : placed % 7 === 0 ? 2 : 0];
      mesh.setMatrixAt(mesh.count++, dummy.matrix);
      placed++;
    }
    for (const mesh of tuftMeshes) mesh.instanceMatrix.needsUpdate = true;
  }
  // Contest target: floating rings plus a buoy.
  const target = new Group();
  const ringMaterials = [new MeshBasicMaterial({ color: '#f4f1e6' }), new MeshBasicMaterial({ color: '#e0574f' })];
  for (let i = 0; i < 3; i++) {
    const ring = new Mesh(new RingGeometry(0.55 + i * 0.75, 1.15 + i * 0.75, 28), ringMaterials[i % 2]);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02 + i * 0.001;
    target.add(ring);
  }
  const buoy = new Mesh(new SphereGeometry(0.35, 8, 6), ringMaterials[1]);
  buoy.position.y = 0.25;
  target.add(buoy);
  const flag = new Mesh(new BoxGeometry(0.06, 0.9, 0.06), new MeshBasicMaterial({ color: '#f4f1e6' }));
  flag.position.y = 0.7;
  target.add(flag);
  target.visible = false;
  scene.add(target);
  // Cast landing preview.
  const preview = new Mesh(new RingGeometry(0.5, 0.68, 24), new MeshBasicMaterial({ color: '#fff3c4', transparent: true, opacity: 0.75, depthWrite: false }));
  preview.rotation.x = -Math.PI / 2;
  preview.position.y = -0.4;
  preview.visible = false;
  scene.add(preview);
  // Lighthouse beam: a shaft of light sweeping the harbour after dark, and all day
  // when it is foggy, which is when a lighthouse earns its keep. Drawing a cone as
  // flat added colour gives it a hard silhouette and a hard end, which reads as a
  // translucent slab rather than light. This fades along its length and by viewing
  // angle, so it is brightest where you look through the most of it and vanishes at
  // its edges and its reach. Fog gives the light something to catch on, so the shaft
  // thickens and carries further through it.
  // Long enough to sweep the pier head from the lookout hill.
  const beamLength = 54;
  const beamGeometry = new CylinderGeometry(0.35, 4.6, beamLength, 16, 1, true);
  beamGeometry.rotateZ(Math.PI / 2);
  beamGeometry.translate(beamLength / 2, 0, 0);
  const beamMaterial = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    uniforms: { strength: { value: 0 }, haze: { value: 0 }, tint: { value: new Color('#fff1b0') }, beamLength: { value: beamLength } },
    vertexShader: `
      varying vec3 vNormalW; varying vec3 vViewW; varying float vAlong; varying vec3 vAxisW;
      uniform float beamLength;
      void main() {
        vAlong = clamp(position.x / beamLength, 0.0, 1.0);
        vec4 world = modelMatrix * vec4(position, 1.0);
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vAxisW = normalize(mat3(modelMatrix) * vec3(1.0, 0.0, 0.0));
        vViewW = cameraPosition - world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: `
      uniform float strength; uniform float haze; uniform vec3 tint;
      varying vec3 vNormalW; varying vec3 vViewW; varying float vAlong; varying vec3 vAxisW;
      void main() {
        vec3 view = normalize(vViewW);
        // Soft at the silhouette, gone at the end of its reach, and dimmed as the beam
        // swings toward the camera so a sweep never washes the harbour out.
        float facing = abs(dot(normalize(vNormalW), view));
        float sideOn = pow(1.0 - abs(dot(view, vAxisW)), 1.2);
        float reach = pow(1.0 - vAlong, mix(1.4, 0.9, haze));
        gl_FragColor = vec4(tint * strength * (1.0 + haze * 0.25) * reach * sideOn * pow(facing, 1.8), 1.0);
      }`,
  });
  const beam = new Mesh(beamGeometry, beamMaterial);
  const beamPivot = new Group();
  beamPivot.position.set(layoutProps.lighthouse.x, 8.6 + groundHeight(layoutProps.lighthouse.x, layoutProps.lighthouse.z), layoutProps.lighthouse.z);
  beamPivot.add(beam);
  scene.add(beamPivot);
  // The lamp itself, so the tower reads as lit from across the water even when the
  // shaft is pointed away from you.
  const lampMaterial = new MeshBasicMaterial({ color: '#fff3c0', transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending });
  const lamp = new Mesh(new SphereGeometry(1.15, 10, 8), lampMaterial);
  lamp.position.copy(beamPivot.position);
  scene.add(lamp);
  // Seagulls: a painted gull on a card that turns to face the camera, swapping between
  // wings-up and wings-down as it flaps.
  const GULL_COUNT = 5;
  const gullFrames = ['gull-wings-up', 'gull-wings-down'].map((name) => ({ geometry: spriteGeometry('world-billboards', name, 0.9), material: spriteMaterial('world-billboards', name, 'lit') }));
  const gulls = Array.from({ length: GULL_COUNT }, (_, i) => {
    const mesh = new Mesh(gullFrames[0].geometry, gullFrames[0].material);
    mesh.castShadow = false;
    scene.add(mesh);
    return { mesh, phase: i * 1.3, radius: 18 + i * 3, height: 15 + (i % 3) * 1.8, speed: 0.2 + i * 0.025 };
  });
  // Fireflies: tiny additive points near the trees at night.
  const fireflyCount = 40;
  const fireflies = new InstancedMesh(new SphereGeometry(0.07, 5, 4), new MeshBasicMaterial({ color: '#d9ff8a', transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false }), fireflyCount);
  fireflies.instanceMatrix.setUsage(DynamicDrawUsage);
  fireflies.frustumCulled = false;
  scene.add(fireflies);
  // Fireflies gather in three places: the orchard, the campfire and the pond.
  const fireflyHomes = [
    { x: ORCHARD.x, z: ORCHARD.z, r: 5 },
    { x: CAMPFIRE.x, z: CAMPFIRE.z, r: 3.5 },
    { x: POND.x, z: POND.z, r: 6 },
  ];
  const fireflySeeds = Array.from({ length: fireflyCount }, (_, i) => {
    const home = fireflyHomes[i % fireflyHomes.length];
    return { home, a: i * 0.83, r: 1 + (i % 7) * (home.r / 7), y: 1.2 + (i % 5) * 0.4, s: 0.6 + (i % 4) * 0.2 };
  });
  // Daily harbour pin: the painted golden star on its stone, bobbing and facing the camera.
  const pin = spriteCard('fishing-shop', 'daily-pin', 1.5, 'lit');
  pin.visible = false;
  scene.add(pin);
  // Contest sign at the end of the pier, from the modelled asset.
  const signPart = propPart('signpost');
  const sign = new Mesh(signPart ? bake(signPart, {}) : new BoxGeometry(1.5, 0.8, 0.1), vertexColored);
  sign.position.set(CONTEST_SIGN.x, DECK_STAND_Y, CONTEST_SIGN.z);
  sign.rotation.y = Math.PI + 0.35;
  sign.castShadow = true;
  scene.add(sign);
  // The games podium in the picnic clearing: a stepped wooden lectern with a round top,
  // the kind you slap a hand down on. Built from boxes and one cylinder so it costs a
  // handful of triangles and still reads from the island's high camera.
  const podiumMaterials = ['#d2a86d', '#96693c', '#6b4a2b', '#e0574f'].map((color) => new MeshToonMaterial({ color, gradientMap: toonGradient() }));
  const [lightWood, midWood, darkWood, trim] = podiumMaterials;
  const podium = new Group();
  const podiumParts: Mesh[] = [
    // Base: two steps, the lower one proud of the upper.
    new Mesh(new BoxGeometry(1.25, 0.16, 1.05), darkWood),
    new Mesh(new BoxGeometry(1.05, 0.12, 0.88), midWood),
    // Column: a light panel between two darker pilasters.
    new Mesh(new BoxGeometry(0.5, 1.15, 0.46), lightWood),
    new Mesh(new BoxGeometry(0.16, 1.15, 0.52), darkWood),
    new Mesh(new BoxGeometry(0.16, 1.15, 0.52), darkWood),
    // Cornice under the top, then the round top itself and a thin rim under it.
    new Mesh(new BoxGeometry(1.1, 0.12, 0.92), midWood),
    new Mesh(new CylinderGeometry(0.72, 0.66, 0.08, 24), darkWood),
    new Mesh(new CylinderGeometry(0.78, 0.78, 0.13, 24), lightWood),
    // A coral disc let into the top, where the pieces are played.
    new Mesh(new CylinderGeometry(0.58, 0.58, 0.02, 24), trim),
  ];
  podiumParts[0].position.y = 0.08;
  podiumParts[1].position.y = 0.22;
  podiumParts[2].position.y = 0.86;
  podiumParts[3].position.set(-0.33, 0.86, 0);
  podiumParts[4].position.set(0.33, 0.86, 0);
  podiumParts[5].position.y = 1.5;
  podiumParts[6].position.y = 1.6;
  podiumParts[7].position.y = 1.71;
  podiumParts[8].position.y = 1.785;
  for (const part of podiumParts) {
    part.castShadow = true;
    podium.add(part);
  }
  podium.position.set(RPS_PODIUM.x, groundHeight(RPS_PODIUM.x, RPS_PODIUM.z), RPS_PODIUM.z);
  podium.rotation.y = RPS_PODIUM.heading;
  // Half again as large: at lectern scale it read as a stool from the island's camera.
  podium.scale.setScalar(1.45);
  scene.add(podium);
  // Buoys for the boat course, instanced from the modelled asset.
  const buoyPart = propPart('buoy');
  const buoys = new InstancedMesh(buoyPart ? bake(buoyPart, {}) : new SphereGeometry(0.55, 9, 7), vertexColored, BUOYS.length);
  buoys.instanceMatrix.setUsage(DynamicDrawUsage);
  buoys.castShadow = true;
  scene.add(buoys);
  let nextBuoy = -1;
  // A beam of light over the next buoy on a run, and a ring on the water for its radius.
  // Neither takes fog, so the way is clear however thick the murk.
  const beaconMaterial = new MeshBasicMaterial({ color: '#ffe08a', transparent: true, opacity: 0.45, fog: false, depthWrite: false, side: DoubleSide });
  const beacon = new Group();
  const beaconBeam = new Mesh(new CylinderGeometry(0.28, 0.5, 34, 8, 1, true), beaconMaterial);
  beaconBeam.position.y = 17;
  const halo = new Mesh(new RingGeometry(2.1, 2.6, 24), beaconMaterial);
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.06;
  beacon.add(beaconBeam, halo);
  beacon.visible = false;
  scene.add(beacon);
  // The dog waiting by the garden gate: body, a head that looks about and a tail that wags.
  const dog = new Group();
  const dogY = GROUND_Y + groundHeight(DOG.x, DOG.z);
  dog.position.set(DOG.x, dogY, DOG.z);
  dog.rotation.y = -0.35;
  const dogPart = propPart('dog'),
    dogHeadPart = propPart('dog', 'doghead'),
    dogTailPart = propPart('dog', 'dogtail');
  if (dogPart) {
    const dogBody = new Mesh(bake(dogPart, {}), vertexColored);
    dogBody.castShadow = true;
    dog.add(dogBody);
  }
  const dogHead = new Group();
  dogHead.position.set(0, 0.85, 0.3);
  if (dogHeadPart) {
    dogHead.position.copy(dogHeadPart.position);
    dogHead.add(new Mesh(bake(dogHeadPart, {}), vertexColored));
  }
  dog.add(dogHead);
  const dogTail = new Group();
  dogTail.position.set(-0.1, 0.5, -0.42);
  if (dogTailPart) {
    dogTail.position.copy(dogTailPart.position);
    dogTail.add(new Mesh(bake(dogTailPart, {}), vertexColored));
  }
  dog.add(dogTail);
  const dogHearts = new Mesh(spriteGeometry('world-billboards', 'heart', 0.5), spriteMaterial('world-billboards', 'heart', 'glow', { transparent: true, opacity: 0, depthWrite: false }));
  dogHearts.visible = false;
  scene.add(dogHearts);
  let dogHeartsUntil = 0;
  scene.add(dog);
  // Today's shells at the tide pools: small pale spirals, gone once picked up.
  const shellPart = propPart('shell');
  const shellGeometry = shellPart ? bake(shellPart, {}) : new ConeGeometry(0.22, 0.28, 6);
  const shells = new InstancedMesh(shellGeometry, new MeshToonMaterial({ color: '#f4e8d2' }), SHELL.perDay);
  shells.instanceMatrix.setUsage(DynamicDrawUsage);
  shells.castShadow = true;
  shells.count = 0;
  scene.add(shells);
  let shellSpots: Array<{ i: number; x: number; z: number; type: number }> = [];
  const shellTints = ['#f4e8d2', '#e7c9b3', '#d9c7e0', '#f0d9a6', '#f2b8a8', '#e3d3ee', '#efe0c0', '#cfe3d8'];
  // Garden blooms: a plot that has been watered today shows a spray of flowers.
  const bloomGeometry = new SphereGeometry(0.16, 6, 5);
  const blooms = new InstancedMesh(bloomGeometry, new MeshToonMaterial({ color: '#f3d986' }), GARDEN_PLOTS.length * 3);
  blooms.instanceMatrix.setUsage(DynamicDrawUsage);
  blooms.count = 0;
  scene.add(blooms);
  // Campfire flame: two painted frames that flicker between them after dark.
  const flameFrames = ['campfire-1', 'campfire-2'].map((name) => ({ geometry: spriteGeometry('fishing-shop', name, 1.1), material: spriteMaterial('fishing-shop', name, 'glow', { transparent: true, opacity: 0, depthWrite: false }) }));
  const flame = new Mesh(flameFrames[0].geometry, flameFrames[0].material);
  flame.position.set(CAMPFIRE.x, GROUND_Y + groundHeight(CAMPFIRE.x, CAMPFIRE.z) + 0.75, CAMPFIRE.z);
  flame.visible = false;
  scene.add(flame);
  // Shop sign: the painted board on its rope, hung from the eave over the door.
  const shopSign = spriteCard('fishing-shop', 'shop-sign', 1.7, 'lit');
  shopSign.position.set(layoutProps.house.x, 3.65 + houseY, layoutProps.house.z + 2.2);
  scene.add(shopSign);
  return {
    update(dt: number, elapsed: number, night: number, fog = 0, sweep = 0) {
      boat.position.y = BOAT_Y + Math.sin(elapsed * 1.3) * 0.03;
      boat.rotation.z = Math.sin(elapsed * 0.9) * 0.03;
      boat.rotation.x = Math.sin(elapsed * 1.1 + 1) * 0.02;
      for (const puff of puffs) {
        puff.userData.life += dt;
        if (puff.userData.life > 4) puff.userData.life -= 4;
        const life = puff.userData.life as number;
        puff.position.set(layoutProps.house.x + 1.1 + Math.sin(life * 1.5 + elapsed * 0.3) * 0.3 + life * 0.25, 5 + houseY + life * 0.9, layoutProps.house.z - 0.9 + Math.cos(life * 1.2) * 0.2);
        puff.scale.setScalar(0.5 + life * 0.45);
        puff.visible = life < 3.6;
        puff.lookAt(viewpoint);
      }
      smokeMaterial.opacity = 0.5 - night * 0.2;
      const daylight = Math.max(0, Math.min(1, (0.72 - night) / 0.28));
      for (const mesh of fishShadows) {
        (mesh.material as MeshBasicMaterial).opacity = 0.45 * daylight;
        mesh.visible = daylight > 0.01;
      }
      for (let i = 0; i < shadowCount && daylight > 0.01; i++) {
        const s = shadowSeeds[i];
        const a = s.phase + elapsed * s.speed * s.side;
        const wobble = Math.sin(elapsed * 0.9 + s.phase) * 0.8;
        const radius = shoreRadius(a) + s.offset + wobble;
        // Just above the highest crest, so the swell never swallows them.
        dummy.position.set(Math.cos(a) * radius, SEA_LEVEL + SWELL + 0.015, Math.sin(a) * radius);
        // They swim along the circle, so the nose follows the tangent, not the radius.
        dummy.rotation.set(0, tangentHeading(a), 0);
        dummy.scale.setScalar(s.size);
        dummy.updateMatrix();
        fishShadows[s.kind].setMatrixAt(s.slot, dummy.matrix);
      }
      if (daylight > 0.01) for (const mesh of fishShadows) mesh.instanceMatrix.needsUpdate = true;
      grassUniform.value = elapsed;
      // Night life: the beam sweeps, fireflies drift, gulls roost. The lamp burns
      // through fog by day too, and the murk makes the shaft itself easier to see.
      const lit = Math.max(night, fog * 0.55);
      beamMaterial.uniforms.strength.value = lit * 0.9;
      beamMaterial.uniforms.haze.value = fog;
      beamPivot.visible = lit > 0.02;
      beamPivot.rotation.y = beamHeading(elapsed);
      // The lamp flares as it comes round to face you, which is the moment the fog
      // in front of you gives way.
      lampMaterial.opacity = Math.min(1, lit * (0.5 + fog * 0.25) * (1 + sweep * 1.4));
      lamp.scale.setScalar(1 + sweep * 0.35 * (0.5 + fog * 0.5));
      lamp.visible = lit > 0.02;
      (fireflies.material as MeshBasicMaterial).opacity = night * 0.9;
      fireflies.visible = night > 0.02;
      if (fireflies.visible)
        for (let i = 0; i < fireflyCount; i++) {
          const f = fireflySeeds[i];
          const a = f.a + elapsed * 0.15 * f.s;
          const fx = f.home.x + Math.cos(a) * f.r + Math.sin(elapsed * 1.3 + i) * 0.6,
            fz = f.home.z + Math.sin(a) * f.r + Math.cos(elapsed * 1.1 + i) * 0.6;
          dummy.position.set(fx, f.y + groundHeight(fx, fz) + Math.sin(elapsed * 2.1 + i * 0.7) * 0.35, fz);
          dummy.rotation.set(0, 0, 0);
          const twinkle = 0.5 + 0.5 * Math.sin(elapsed * 4 + i * 1.9);
          dummy.scale.setScalar(twinkle > 0.35 ? twinkle : 0);
          dummy.updateMatrix();
          fireflies.setMatrixAt(i, dummy.matrix);
        }
      if (fireflies.visible) fireflies.instanceMatrix.needsUpdate = true;
      // Gulls glide in long arcs, flapping in bursts and banking into the turn.
      // They fade away at dusk on the same schedule as the fish below, so the sky
      // never keeps their shadows after the birds have gone.
      const gullFade = Math.max(0, Math.min(1, (0.72 - night) / 0.28));
      const gullsVisible = gullFade > 0.02;
      for (const g of gulls) g.mesh.visible = gullsVisible;
      if (gullsVisible) {
        for (const g of gulls) {
          const around = g.phase + elapsed * g.speed;
          const burst = 0.16 + ((Math.sin(elapsed * 0.5 + g.phase) + 1) / 2) * 0.5;
          const flap = Math.sin(elapsed * 6.5 + g.phase) * burst;
          const rise = Math.sin(elapsed * 0.8 + g.phase);
          g.mesh.position.set(Math.cos(around) * g.radius, g.height + rise * 0.8 + flap * 0.12, Math.sin(around) * g.radius);
          // The card faces the camera; the painting flips so the bird flies the way it is going.
          g.mesh.lookAt(viewpoint);
          const heading = tangentHeading(around);
          const toCamera = Math.atan2(viewpoint.x - g.mesh.position.x, viewpoint.z - g.mesh.position.z);
          const facingRight = Math.sin(heading - toCamera) > 0;
          const frame = gullFrames[flap > 0 ? 0 : 1];
          g.mesh.geometry = frame.geometry;
          g.mesh.material = frame.material;
          g.mesh.scale.set(facingRight ? -gullFade : gullFade, gullFade, gullFade);
        }
      }
      if (target.visible) {
        target.position.y = -0.5 + Math.sin(elapsed * 1.6) * 0.06;
        target.rotation.y = elapsed * 0.3;
      }
      if (pin.visible) {
        pin.position.y = 1.55 + groundHeight(pin.position.x, pin.position.z) + Math.sin(elapsed * 2.2) * 0.12;
        pin.lookAt(viewpoint);
      }
      // Buoys ride the same swell as the boat; the next one on a run stands taller and pulses.
      for (let i = 0; i < BUOYS.length; i++) {
        const next = i === nextBuoy;
        dummy.position.set(BUOYS[i].x, SEA_LEVEL - 0.02 + Math.sin(elapsed * 1.3 + i * 1.1) * 0.08 + (next ? 0.2 : 0), BUOYS[i].z);
        dummy.rotation.set(Math.sin(elapsed * 0.9 + i) * 0.06, i * 0.7, Math.cos(elapsed * 1.1 + i) * 0.06);
        dummy.scale.setScalar(next ? 1.3 + Math.sin(elapsed * 4) * 0.1 : 1);
        dummy.updateMatrix();
        buoys.setMatrixAt(i, dummy.matrix);
      }
      buoys.instanceMatrix.needsUpdate = true;
      beacon.visible = nextBuoy >= 0;
      if (beacon.visible) {
        beacon.position.set(BUOYS[nextBuoy].x, 0, BUOYS[nextBuoy].z);
        beaconMaterial.opacity = 0.38 + Math.sin(elapsed * 4) * 0.12;
        halo.scale.setScalar(1 + Math.sin(elapsed * 2) * 0.06);
      }
      // The dog sits by the garden gate, wagging; hearts when someone pets it.
      dogTail.rotation.y = Math.sin(elapsed * 9) * 0.5;
      dogHead.rotation.y = Math.sin(elapsed * 0.7) * 0.4;
      dogHead.rotation.x = Math.sin(elapsed * 1.9) * 0.08;
      if (dogHeartsUntil > elapsed) {
        const k = 1 - (dogHeartsUntil - elapsed) / 1.6;
        dogHearts.visible = true;
        dogHearts.position.set(dog.position.x, dog.position.y + 1.4 + k * 1.2, dog.position.z);
        dogHearts.lookAt(viewpoint);
        dogHearts.scale.setScalar(0.6 + k * 0.6);
        (dogHearts.material as MeshBasicMaterial).opacity = 1 - k;
      } else dogHearts.visible = false;
      // The campfire burns after dark, flickering between its two frames.
      flame.visible = night > 0.05;
      if (flame.visible) {
        const frame = flameFrames[Math.floor(elapsed * 9) % 2];
        flame.geometry = frame.geometry;
        flame.material = frame.material;
        flame.lookAt(viewpoint);
        flame.scale.set(1 + Math.sin(elapsed * 11) * 0.08, 1 + Math.sin(elapsed * 13.3) * 0.12, 1);
        for (const f of flameFrames) f.material.opacity = night * (0.9 + Math.sin(elapsed * 17) * 0.1);
      }
    },
    setTarget(x: number, z: number, visible: boolean) {
      target.visible = visible;
      target.position.x = x;
      target.position.z = z;
    },
    setPin(x: number, z: number, visible: boolean) {
      pin.visible = visible;
      pin.position.x = x;
      pin.position.z = z;
    },
    setPreview(x: number, z: number, visible: boolean) {
      preview.visible = visible;
      preview.position.x = x;
      preview.position.z = z;
    },
    // Someone petted the dog: a heart floats up for a moment.
    petDog(elapsed: number) {
      dogHeartsUntil = elapsed + 1.6;
    },
    // The buoy a runner is heading for, or -1 when nobody is racing.
    setNextBuoy(index: number) {
      nextBuoy = index;
    },
    setMooredVisible(visible: boolean) {
      boat.visible = visible;
    },
    // Today's shells, minus the ones this player has already found.
    setShells(spots: Array<{ i: number; x: number; z: number; type: number }>, collected: number) {
      shellSpots = spots.filter((s) => !(collected & (1 << s.i)));
      shells.count = shellSpots.length;
      shellSpots.forEach((s, k) => {
        dummy.position.set(s.x, GROUND_Y + groundHeight(s.x, s.z) + 0.12, s.z);
        dummy.rotation.set(0, s.i * 1.3, 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        shells.setMatrixAt(k, dummy.matrix);
        shells.setColorAt(k, tint.set(shellTints[s.type % shellTints.length]));
      });
      shells.instanceMatrix.needsUpdate = true;
      if (shells.instanceColor) shells.instanceColor.needsUpdate = true;
    },
    setWatered(mask: number) {
      let k = 0;
      GARDEN_PLOTS.forEach((plot, i) => {
        if (!(mask & (1 << i))) return;
        for (const d of [-0.35, 0, 0.35]) {
          dummy.position.set(plot.x + d, GROUND_Y + groundHeight(plot.x, plot.z) + 0.72, plot.z + (d ? 0.12 : -0.1));
          dummy.rotation.set(0, 0, 0);
          dummy.scale.setScalar(1);
          dummy.updateMatrix();
          blooms.setMatrixAt(k, dummy.matrix);
          blooms.setColorAt(k, tint.set(k % 2 ? '#e7a0b3' : '#f3d986'));
          k++;
        }
      });
      blooms.count = k;
      blooms.instanceMatrix.needsUpdate = true;
      if (blooms.instanceColor) blooms.instanceColor.needsUpdate = true;
    },
    dispose() {
      vertexColored.dispose();
      puffGeometry.dispose();
      smokeMaterial.dispose();
      for (const mesh of fishShadows) {
        mesh.geometry.dispose();
        (mesh.material as MeshBasicMaterial).dispose();
      }
      for (const mesh of tuftMeshes) {
        mesh.geometry.dispose();
        (mesh.material as MeshToonMaterial).dispose();
      }
      target.traverse((o) => o instanceof Mesh && o.geometry.dispose());
      for (const m of ringMaterials) m.dispose();
      preview.geometry.dispose();
      (preview.material as MeshBasicMaterial).dispose();
      sign.geometry.dispose();
      shopSign.geometry.dispose();
      beaconBeam.geometry.dispose();
      beamMaterial.dispose();
      lamp.geometry.dispose();
      lampMaterial.dispose();
      for (const f of gullFrames) {
        f.geometry.dispose();
        f.material.dispose();
      }
      for (const f of flameFrames) {
        f.geometry.dispose();
        f.material.dispose();
      }
      fireflies.geometry.dispose();
      (fireflies.material as MeshBasicMaterial).dispose();
      pin.geometry.dispose();
      pin.material.dispose();
      shopSign.material.dispose();
      dogHearts.geometry.dispose();
      (dogHearts.material as MeshBasicMaterial).dispose();
      buoys.geometry.dispose();
      beaconBeam.geometry.dispose();
      halo.geometry.dispose();
      beaconMaterial.dispose();
      dog.traverse((o) => o instanceof Mesh && o.geometry.dispose());
      (dogHearts.material as MeshBasicMaterial).dispose();
      flame.geometry.dispose();
      (flame.material as MeshBasicMaterial).dispose();
      shells.geometry.dispose();
      (shells.material as MeshToonMaterial).dispose();
      blooms.geometry.dispose();
      (blooms.material as MeshToonMaterial).dispose();
      for (const part of podiumParts) part.geometry.dispose();
      for (const material of podiumMaterials) material.dispose();
    },
  };
}
