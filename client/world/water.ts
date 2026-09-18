import { Color, Mesh, PlaneGeometry, ShaderMaterial, UniformsLib, UniformsUtils, Vector3, Vector4 } from 'three';
import { fogHoleUniforms } from './foghole';
import { PIER, SHORE, SHORE_SOUTH } from '../../packages/shared/layout';
// The mean sea surface and how far the swell rises above it; anything that floats is placed against these.
export const SEA_LEVEL = -0.6;
export const SWELL = 0.135;
// Stylised water: vertex waves with analytic normals, toon-banded lighting,
// shoreline foam, banded sun glints, sky fresnel, rain speckles and scene fog.
export function createWater(segments: number) {
  const uniforms = UniformsUtils.merge([
    UniformsLib.fog,
    fogHoleUniforms,
    {
      time: { value: 0 },
      shallowColor: { value: new Color('#4aa19d') },
      deepColor: { value: new Color('#2f7480') },
      foamColor: { value: new Color('#e6f7f1') },
      skyColor: { value: new Color('#c6e6ea') },
      sunColor: { value: new Color('#fff2cf') },
      sunDir: { value: new Vector3(0, 1, 0) },
      rain: { value: 0 },
      night: { value: 0 },
      // The shoreline harmonics, packed so the shader draws foam on the coast players walk along.
      shoreBase: { value: SHORE.base },
      shoreAmp: { value: new Vector4(...SHORE.harmonics.map((h) => h[1])) },
      shorePhase: { value: new Vector4(...SHORE.harmonics.map((h) => h[2])) },
      pierRoot: { value: SHORE_SOUTH },
      pierShape: { value: new Vector3(PIER.halfWidth, PIER.crossHalfWidth, PIER.crossStart) },
      pierEnd: { value: PIER.end },
    },
  ]);
  const material = new ShaderMaterial({
    uniforms,
    fog: true,
    vertexShader: `uniform float time;
varying vec3 vWorldPos; varying vec3 vNormal;
#include <fog_pars_vertex>
void main(){
  vec3 p = position;
  float a1 = p.x * 0.35 + time * 1.1;
  float a2 = p.z * 0.42 - time * 0.9 + p.x * 0.1;
  float a3 = (p.x + p.z) * 0.8 + time * 1.7;
  p.y += sin(a1) * 0.06 + sin(a2) * 0.05 + sin(a3) * 0.025;
  float dx = 0.35 * cos(a1) * 0.06 + 0.1 * cos(a2) * 0.05 + 0.8 * cos(a3) * 0.025;
  float dz = 0.42 * cos(a2) * 0.05 + 0.8 * cos(a3) * 0.025;
  vNormal = normalize(vec3(-dx, 1.0, -dz));
  vec4 worldPos = modelMatrix * vec4(p, 1.0);
  vWorldPos = worldPos.xyz;
  vec4 mvPosition = viewMatrix * worldPos;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`,
    fragmentShader: `uniform vec3 shallowColor, deepColor, foamColor, skyColor, sunColor, sunDir;
uniform float time, rain, night, shoreBase, pierRoot, pierEnd;
uniform vec4 shoreAmp, shorePhase;
uniform vec3 pierShape;
float shoreRadius(float t) { return shoreBase + dot(shoreAmp, cos(vec4(2.0, 3.0, 5.0, 7.0) * t + shorePhase)); }
varying vec3 vWorldPos; varying vec3 vNormal;
#include <fog_pars_fragment>
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
void main(){
  float r = length(vWorldPos.xz);
  float sr = shoreRadius(atan(vWorldPos.z, vWorldPos.x));
  float shore = smoothstep(sr + 9.0, sr + 0.5, r);
  vec3 base = mix(deepColor, shallowColor, 0.25 + shore * 0.75);
  float ndl = max(dot(vNormal, sunDir), 0.0);
  float band = floor(ndl * 3.0 + 0.5) / 3.0;
  vec3 color = base * (0.86 + 0.22 * band);
  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  vec3 h = normalize(viewDir + sunDir);
  float spec = pow(max(dot(vNormal, h), 0.0), 90.0);
  color += sunColor * step(0.35, spec) * (0.32 - night * 0.18);
  float fres = pow(1.0 - max(dot(viewDir, vNormal), 0.0), 3.0);
  color = mix(color, skyColor, fres * 0.45);
  float foamBand = smoothstep(sr + 1.9, sr + 0.1, r) * (0.65 + 0.35 * sin(time * 1.4 + r * 2.5));
  float n = noise(vWorldPos.xz * 1.6 + vec2(time * 0.35, -time * 0.25));
  float foam = step(0.58 - foamBand * 0.38, n) * foamBand;
  // Pier posts churn the water a little too.
  // Churn along the pier: the stem out to the crossbar, then around the crossbar itself.
  float stem = smoothstep(pierShape.x + 1.2, pierShape.x + 0.1, abs(vWorldPos.x)) * smoothstep(pierRoot - 1.0, pierRoot + 1.0, vWorldPos.z) * smoothstep(pierShape.z + 0.6, pierShape.z - 1.2, vWorldPos.z);
  float crossbar = smoothstep(pierShape.y + 1.3, pierShape.y + 0.1, abs(vWorldPos.x)) * smoothstep(pierShape.z - 1.4, pierShape.z + 0.2, vWorldPos.z) * smoothstep(pierEnd + 1.5, pierEnd - 0.2, vWorldPos.z);
  float pier = max(stem, crossbar);
  foam += pier * step(0.72, noise(vWorldPos.xz * 3.0 + vec2(-time * 0.4, time * 0.2))) * 0.8;
  float ripple = rain * step(0.965, noise(vWorldPos.xz * 3.5 + floor(time * 9.0) * 7.0));
  color = mix(color, foamColor, clamp(foam + ripple, 0.0, 0.9));
  gl_FragColor = vec4(color, 1.0);
  #include <fog_fragment>
}`,
  });
  const geometry = new PlaneGeometry(260, 260, segments, segments);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new Mesh(geometry, material);
  mesh.position.y = SEA_LEVEL;
  mesh.frustumCulled = false;
  return {
    mesh,
    material,
    geometry,
    update(elapsed: number, shallow: Color, deep: Color, sky: Color, sun: Color, sunDir: Vector3, rain: number, night: number) {
      uniforms.time.value = elapsed;
      (uniforms.shallowColor.value as Color).copy(shallow);
      (uniforms.deepColor.value as Color).copy(deep);
      (uniforms.skyColor.value as Color).copy(sky);
      (uniforms.sunColor.value as Color).copy(sun);
      (uniforms.sunDir.value as Vector3).copy(sunDir);
      uniforms.rain.value = rain;
      uniforms.night.value = night;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
