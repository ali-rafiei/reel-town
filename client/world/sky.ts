import {
  BackSide,
  BoxGeometry,
  BufferGeometry,
  Color,
  DirectionalLight,
  Fog,
  Group,
  HemisphereLight,
  InstancedBufferAttribute,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  Object3D,
  PointLight,
  Scene,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CAMERA_REST_DISTANCE } from './camera';
import { GROUND_Y, PIER_LANTERN, PIER_LANTERNS, THREADS, groundHeight, props as layoutProps } from '../../packages/shared/layout';
import { beamHeading, clearStep, sweepAlignment } from '../../packages/shared/lighthouse';
import { headingTo } from '../../packages/shared/orientation';
import { spriteGeometry, spriteMaterial } from './sprites';
// Day/night cycle and weather rendering driven by the server's synchronized time and weather.
type Key = { t: number; top: string; horizon: string; sun: string; sunIntensity: number; hemiSky: string; hemiGround: string; hemi: number; shallow: string; deep: string };
const KEYS: Key[] = [
  { t: 0.0, top: '#101c3a', horizon: '#2a3b64', sun: '#a9bcee', sunIntensity: 0.95, hemiSky: '#5a6fa8', hemiGround: '#2c3e38', hemi: 1.9, shallow: '#3b7893', deep: '#26516f' },
  { t: 0.2, top: '#6a78bc', horizon: '#f6b48f', sun: '#ffb27a', sunIntensity: 1.3, hemiSky: '#a49ccb', hemiGround: '#5b6a4e', hemi: 1.7, shallow: '#5da0a8', deep: '#31667c' },
  { t: 0.3, top: '#6db4ec', horizon: '#dcefe8', sun: '#ffe2b4', sunIntensity: 2.2, hemiSky: '#dbe9ff', hemiGround: '#6f8a63', hemi: 2.3, shallow: '#6fd0c4', deep: '#3a9aa4' },
  { t: 0.5, top: '#5fb0f0', horizon: '#c9e9f0', sun: '#fff2cf', sunIntensity: 2.5, hemiSky: '#fff0c5', hemiGround: '#54775f', hemi: 2.4, shallow: '#74d8cb', deep: '#3ea1ab' },
  { t: 0.72, top: '#7b9fdd', horizon: '#f9c99a', sun: '#ffd093', sunIntensity: 2.0, hemiSky: '#f1d7c0', hemiGround: '#5d7150', hemi: 2.1, shallow: '#66bfb8', deep: '#3a8c96' },
  { t: 0.83, top: '#4b4d8e', horizon: '#f58a62', sun: '#ff9d6b', sunIntensity: 1.1, hemiSky: '#9a7fa8', hemiGround: '#4c5a44', hemi: 1.5, shallow: '#4f8398', deep: '#2a5372' },
  { t: 0.9, top: '#152142', horizon: '#33456f', sun: '#a9bcee', sunIntensity: 0.95, hemiSky: '#5a6fa8', hemiGround: '#2c3e38', hemi: 1.9, shallow: '#3b7893', deep: '#26516f' },
  { t: 1.0, top: '#101c3a', horizon: '#2a3b64', sun: '#a9bcee', sunIntensity: 0.95, hemiSky: '#5a6fa8', hemiGround: '#2c3e38', hemi: 1.9, shallow: '#3b7893', deep: '#26516f' },
];
export const WEATHERS = ['clear', 'cloudy', 'rain', 'fog'] as const;
export type Weather = (typeof WEATHERS)[number];
export type Atmosphere = {
  top: Color;
  horizon: Color;
  sun: Color;
  sunIntensity: number;
  hemiSky: Color;
  hemiGround: Color;
  hemi: number;
  shallow: Color;
  deep: Color;
  fogNear: number;
  fogFar: number;
  night: number; // 0 day .. 1 night
  rain: number;
  cloud: number;
  haze: number;
  fog: number;
  beamClear: number; // 0..1 of the fog the lighthouse has just swept away around the player
  lanternClear: number; // 0..1, a hand lantern in the player's hand
  beamSweep: number; // 1 while the beam is crossing you
  sunDir: Vector3;
};
const scratch = { a: new Color(), b: new Color() };
function lerpColor(out: Color, a: string, b: string, k: number) {
  scratch.a.set(a);
  scratch.b.set(b);
  return out.copy(scratch.a).lerp(scratch.b, k);
}
const RAIN_TINT = new Color('#5d6b7a'),
  FOG_TINT_DAY = new Color('#c9d3cf'),
  FOG_TINT_NIGHT = new Color('#2a3340'),
  CLOUD_TINT = new Color('#9fb0b8');
export function createSky(scene: Scene, sun: DirectionalLight, hemi: HemisphereLight, lanternLights: number, rainDrops: number) {
  const atmosphere: Atmosphere = {
    top: new Color(),
    horizon: new Color(),
    sun: new Color(),
    sunIntensity: 2,
    hemiSky: new Color(),
    hemiGround: new Color(),
    hemi: 2,
    shallow: new Color(),
    deep: new Color(),
    fogNear: 40,
    fogFar: 110,
    night: 0,
    rain: 0,
    cloud: 0,
    haze: 0,
    fog: 0,
    beamClear: 0,
    lanternClear: 0,
    beamSweep: 0,
    sunDir: new Vector3(0, 1, 0),
  };
  const weatherBlend: Record<Weather, number> = { clear: 1, cloudy: 0, rain: 0, fog: 0 };
  const focus = new Vector3();
  let targetWeather: Weather = 'clear',
    time = 0.5,
    beamClear = 0,
    lanternClear = 0;
  // Sky dome: gradient, sun glow and procedural stars, following the camera.
  const skyMaterial = new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: atmosphere.top },
      horizon: { value: atmosphere.horizon },
      sunColor: { value: atmosphere.sun },
      sunDir: { value: atmosphere.sunDir },
      night: { value: 0 },
      haze: { value: 0 },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w; }`,
    fragmentShader: `uniform vec3 top, horizon, sunColor, sunDir; uniform float night, haze; varying vec3 vDir;
float hash3(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
void main(){
  float h = clamp(vDir.y, 0.0, 1.0);
  vec3 c = mix(horizon, top, pow(h, 0.55));
  float s = max(dot(vDir, sunDir), 0.0);
  c += sunColor * (pow(s, 240.0) * 1.3 + pow(s, 6.0) * 0.22) * (1.0 - night * 0.6);
  float star = step(0.9965, hash3(floor(vDir * 260.0))) * night * smoothstep(0.02, 0.25, vDir.y);
  c += vec3(star) * (0.6 + 0.4 * hash3(floor(vDir * 261.0)));
  c = mix(c, horizon, haze * (1.0 - h));
  gl_FragColor = vec4(c, 1.0);
}`,
  });
  const sky = new Mesh(new SphereGeometry(160, 24, 12), skyMaterial);
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  scene.add(sky);
  scene.fog = new Fog('#c6e6ea', 40, 110);
  // Clouds: painted clouds on cards that face the camera, drifting slowly; hidden in fog.
  // One material per cloud: each fades on its own as it drifts near the camera, which
  // rides between y 13 and 38 and would otherwise have clouds pass through the view.
  const cloudMaterials: MeshBasicMaterial[] = [];
  const clouds: Mesh[] = [];
  const cloudGroup = new Group();
  scene.add(cloudGroup);
  for (let i = 0; i < 16; i++) {
    const painting = `cloud-${(i % 3) + 1}`;
    const cloudMaterial = spriteMaterial('world-billboards', painting, 'glow', { transparent: true, opacity: 0.9, depthWrite: false }) as MeshBasicMaterial;
    cloudMaterials.push(cloudMaterial);
    const cloud = new Mesh(spriteGeometry('world-billboards', painting, 7), cloudMaterial);
    cloud.position.set(((i * 37) % 170) - 85, 44 + (i % 3) * 5, ((i * 53) % 170) - 85);
    cloud.scale.setScalar(1.6 + (i % 4) * 0.4);
    // Where this one sits when the sky closes over: lower and wider than its clear-day spot.
    cloud.userData.clearY = cloud.position.y;
    cloud.userData.clearScale = cloud.scale.x;
    cloud.castShadow = false;
    cloudGroup.add(cloud);
    clouds.push(cloud);
  }
  // Rain: instanced streaks animated entirely in the vertex shader.
  let rainMesh: InstancedMesh | null = null;
  const rainMaterial = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { time: { value: 0 }, intensity: { value: 0 }, center: { value: new Vector3() } },
    vertexShader: `uniform float time; uniform vec3 center; attribute vec3 seed; varying float vAlpha;
void main(){
  float fall = mod(seed.y - time * (9.0 + seed.z * 4.0), 26.0);
  vec3 offset = vec3(center.x + seed.x, fall - 2.0, center.z + seed.z * 20.0 - 10.0);
  vec3 p = position * vec3(1.0, 1.0 + seed.z, 1.0) + offset;
  vAlpha = smoothstep(0.0, 2.0, fall) * smoothstep(26.0, 20.0, fall);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`,
    fragmentShader: `uniform float intensity; varying float vAlpha; void main(){ gl_FragColor = vec4(0.82, 0.9, 0.98, vAlpha * intensity * 0.55); }`,
  });
  function buildRain(count: number) {
    rainMesh?.geometry.dispose();
    if (rainMesh) scene.remove(rainMesh);
    rainMesh = null;
    if (!count) return;
    const geometry = new BoxGeometry(0.03, 0.55, 0.03);
    const seeds = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      seeds[i * 3] = (Math.random() - 0.5) * 44;
      seeds[i * 3 + 1] = Math.random() * 26;
      seeds[i * 3 + 2] = Math.random();
    }
    const instanced = new InstancedMesh(geometry, rainMaterial, count);
    // Per-instance data lives in a plain attribute so the shader, not the CPU, moves every drop.
    geometry.setAttribute('seed', new InstancedBufferAttribute(seeds, 3));
    const dummy = new Object3D();
    for (let i = 0; i < count; i++) {
      dummy.updateMatrix();
      instanced.setMatrixAt(i, dummy.matrix);
    }
    instanced.frustumCulled = false;
    instanced.visible = false;
    scene.add(instanced);
    rainMesh = instanced;
  }
  buildRain(rainDrops);
  // Everything that glows warm after dark shares one material and one geometry: the two
  // pier-head lanterns and the windows of the two shops, so the island reads as lived in
  // at night for a single draw call. The lanterns also get real point lights.
  const glassMaterial = new MeshToonMaterial({ color: '#ffe9a6', emissive: '#ffcf66', emissiveIntensity: 0 });
  const glassPieces: BufferGeometry[] = [];
  const glassAt = (x: number, y: number, z: number, w: number, h: number, d: number) => {
    const g = new BoxGeometry(w, h, d);
    g.translate(x, y, z);
    glassPieces.push(g);
  };
  const lights: PointLight[] = [];
  for (const lantern of PIER_LANTERNS) {
    glassAt(lantern.x, PIER_LANTERN.glassY, lantern.z, 0.36, 0.38, 0.36);
    if (lights.length < lanternLights) {
      const light = new PointLight('#ffb85c', 0, 11, 1.6);
      light.position.set(lantern.x, PIER_LANTERN.lightY, lantern.z);
      scene.add(light);
      lights.push(light);
    }
  }
  const house = layoutProps.house,
    houseY = GROUND_Y + groundHeight(house.x, house.z),
    threadsY = GROUND_Y + groundHeight(THREADS.x, THREADS.z);
  // The panes stand a few centimetres proud of the window frames in the wall mesh, so the
  // two never share a plane and fight over the same pixels.
  glassAt(house.x + 1.25, houseY + 1.7, house.z + 2.22, 0.8, 0.8, 0.06);
  glassAt(house.x - 1.35, houseY + 1.7, house.z + 2.22, 0.8, 0.8, 0.06);
  glassAt(THREADS.x - 1.45, threadsY + 1.75, THREADS.z + 2.42, 0.95, 0.85, 0.06);
  glassAt(THREADS.x + 1.45, threadsY + 1.75, THREADS.z + 2.42, 0.95, 0.85, 0.06);
  const glassGeometry = mergeGeometries(glassPieces, false)!;
  for (const g of glassPieces) g.dispose();
  const glass = new Mesh(glassGeometry, glassMaterial);
  glass.frustumCulled = false;
  scene.add(glass);
  function sample(t: number) {
    let i = 0;
    while (i < KEYS.length - 2 && KEYS[i + 1].t <= t) i++;
    const a = KEYS[i],
      b = KEYS[i + 1],
      k = (t - a.t) / (b.t - a.t || 1);
    lerpColor(atmosphere.top, a.top, b.top, k);
    lerpColor(atmosphere.horizon, a.horizon, b.horizon, k);
    lerpColor(atmosphere.sun, a.sun, b.sun, k);
    lerpColor(atmosphere.hemiSky, a.hemiSky, b.hemiSky, k);
    lerpColor(atmosphere.hemiGround, a.hemiGround, b.hemiGround, k);
    lerpColor(atmosphere.shallow, a.shallow, b.shallow, k);
    lerpColor(atmosphere.deep, a.deep, b.deep, k);
    atmosphere.sunIntensity = a.sunIntensity + (b.sunIntensity - a.sunIntensity) * k;
    atmosphere.hemi = a.hemi + (b.hemi - a.hemi) * k;
  }
  const api = {
    atmosphere,
    set(nextTime: number, weather: string) {
      time = nextTime;
      if ((WEATHERS as readonly string[]).includes(weather)) targetWeather = weather as Weather;
    },
    update(dt: number, elapsed: number, focusX: number, focusZ: number, cameraPosition: Vector3, lantern = false) {
      for (const w of WEATHERS) {
        const target = w === targetWeather ? 1 : 0;
        weatherBlend[w] += (target - weatherBlend[w]) * Math.min(1, dt * 0.6);
      }
      sample(time);
      const elevation = Math.sin((time - 0.25) * Math.PI * 2);
      atmosphere.night = 1 - Math.min(1, Math.max(0, (elevation + 0.15) / 0.35));
      const az = 0.9;
      const el = elevation > -0.1 ? elevation : -elevation; // the moon takes over below the horizon
      const horizontal = Math.sqrt(Math.max(0, 1 - el * el));
      atmosphere.sunDir.set(Math.cos(az) * horizontal, Math.max(0.08, el), Math.sin(az) * horizontal).normalize();
      atmosphere.rain = weatherBlend.rain;
      atmosphere.cloud = weatherBlend.cloudy + weatherBlend.rain;
      atmosphere.fog = weatherBlend.fog;
      atmosphere.haze = weatherBlend.fog * 0.9 + weatherBlend.rain * 0.35 + weatherBlend.cloudy * 0.32;
      // Every time the lamp sweeps over you it burns a hole in the fog, which then rolls
      // back in behind it: the air opens up, the grey lifts off the horizon and a little
      // more of the sun gets through.
      const sweep = sweepAlignment(beamHeading(elapsed), headingTo(layoutProps.lighthouse.x, layoutProps.lighthouse.z, focusX, focusZ));
      beamClear = clearStep(beamClear, sweep, dt);
      atmosphere.beamClear = beamClear;
      atmosphere.beamSweep = sweep;
      // The beam and a hand lantern clear the air only around the player (see foghole.ts):
      // the scene's own fog, haze and light stay as the weather made them.
      lanternClear += ((lantern ? 1 : 0) - lanternClear) * Math.min(1, dt * 1.2);
      atmosphere.lanternClear = lanternClear;
      // Weather tints.
      const gray = weatherBlend.cloudy * 0.55 + weatherBlend.rain * 0.6;
      atmosphere.top.lerp(RAIN_TINT, gray);
      atmosphere.horizon.lerp(CLOUD_TINT, weatherBlend.cloudy * 0.7).lerp(RAIN_TINT, weatherBlend.rain * 0.5);
      const fogTint = atmosphere.night > 0.5 ? FOG_TINT_NIGHT : FOG_TINT_DAY;
      const murk = weatherBlend.fog;
      atmosphere.top.lerp(fogTint, murk * 0.7);
      atmosphere.horizon.lerp(fogTint, murk * 0.85);
      atmosphere.shallow.lerp(RAIN_TINT, gray * 0.7).lerp(fogTint, murk * 0.35);
      atmosphere.deep.lerp(RAIN_TINT, gray * 0.7).lerp(fogTint, murk * 0.35);
      // Overcast is flat light, not dark light: the sun goes behind the lid and the sky
      // itself carries the scene, so the hemisphere below keeps most of its strength.
      const sunScale = 1 - weatherBlend.cloudy * 0.62 - weatherBlend.rain * 0.7 - weatherBlend.fog * 0.45;
      // Fog belongs to the world, not to how far the camera has been pulled back: without
      // this, zooming out in thick weather would leave you looking at a blank wall of it.
      const dolly = Math.max(0, cameraPosition.distanceTo(focus.set(focusX, 1, focusZ)) - CAMERA_REST_DISTANCE);
      atmosphere.fogNear = 40 - weatherBlend.fog * 30 - weatherBlend.rain * 14 - weatherBlend.cloudy * 8 + dolly;
      atmosphere.fogFar = 110 - weatherBlend.fog * 70 - weatherBlend.rain * 40 - weatherBlend.cloudy * 26 + dolly;
      // Lights.
      // Cloud takes the warmth out of the light as well as the strength: under an
      // overcast sky the harbour is lit grey-blue, which is what tells you it is not sunny.
      sun.color.copy(atmosphere.sun).lerp(CLOUD_TINT, weatherBlend.cloudy * 0.65 + weatherBlend.rain * 0.5);
      sun.intensity = atmosphere.sunIntensity * sunScale;
      // The shadow map follows the player: the island is too wide to cover at one
      // texel density, and only the ground around you needs crisp shadows.
      sun.target.position.set(focusX, 0, focusZ);
      sun.position.copy(atmosphere.sunDir).multiplyScalar(60).add(sun.target.position);
      hemi.color.copy(atmosphere.hemiSky).lerp(RAIN_TINT, gray * 0.5).lerp(CLOUD_TINT, weatherBlend.cloudy * 0.45);
      hemi.groundColor.copy(atmosphere.hemiGround).lerp(CLOUD_TINT, weatherBlend.cloudy * 0.3);
      hemi.intensity = atmosphere.hemi * (1 - gray * 0.15 + weatherBlend.cloudy * 0.08);
      const fog = scene.fog as Fog;
      fog.color.copy(atmosphere.horizon);
      fog.near = atmosphere.fogNear;
      fog.far = atmosphere.fogFar;
      // Sky dome follows the camera so the gradient never shows an edge.
      sky.position.copy(cameraPosition);
      skyMaterial.uniforms.night.value = atmosphere.night;
      skyMaterial.uniforms.haze.value = atmosphere.haze;
      // Clouds drift and fade with the weather.
      const cloudVisible = 1 - weatherBlend.fog;
      cloudGroup.visible = cloudVisible > 0.02;
      const wanted = 3 + Math.round(Math.min(1, atmosphere.cloud) * 13);
      clouds.forEach((cloud, i) => {
        cloud.position.x += dt * (0.6 + (i % 3) * 0.2);
        if (cloud.position.x > 90) cloud.position.x = -90;
        // A cloud drifting close to the camera would wash the whole harbour out, so
        // each one thins as it approaches and is gone before it can pass through view.
        const near = Math.min(1, Math.max(0, (cloud.position.distanceTo(cameraPosition) - 14) / 22));
        const material = cloudMaterials[i];
        // Under cloud the deck comes down and spreads: a low, wide ceiling rather than a
        // few fair-weather puffs high overhead.
        const lid = Math.min(1, atmosphere.cloud);
        cloud.position.y = (cloud.userData.clearY as number) - lid * 6;
        cloud.scale.setScalar((cloud.userData.clearScale as number) * (1 + lid * 0.5));
        cloud.lookAt(cameraPosition);
        material.opacity = (0.9 + lid * 0.1) * cloudVisible * near;
        material.color.setRGB(1, 1, 1).lerp(RAIN_TINT, gray).lerp(atmosphere.horizon, atmosphere.night * 0.6);
        cloud.visible = i < wanted && material.opacity > 0.02;
      });
      // Rain.
      if (rainMesh) {
        rainMesh.visible = atmosphere.rain > 0.02;
        rainMaterial.uniforms.time.value = elapsed;
        rainMaterial.uniforms.intensity.value = atmosphere.rain;
        (rainMaterial.uniforms.center.value as Vector3).set(focusX, 0, focusZ);
      }
      // Lanterns.
      const glow = atmosphere.night * (0.85 + Math.sin(elapsed * 7) * 0.08 + Math.sin(elapsed * 13.7) * 0.07);
      glassMaterial.emissiveIntensity = glow * 1.6;
      for (const light of lights) light.intensity = glow * 22;
    },
    setRain(count: number) {
      buildRain(count);
    },
    setLanternLights(count: number) {
      lights.forEach((light, i) => (light.visible = i < count));
    },
    dispose() {
      sky.geometry.dispose();
      skyMaterial.dispose();
      for (const c of clouds) c.geometry.dispose();
      for (const material of cloudMaterials) material.dispose();
      rainMesh?.geometry.dispose();
      rainMaterial.dispose();
      glassGeometry.dispose();
      glassMaterial.dispose();
    },
  };
  return api;
}
