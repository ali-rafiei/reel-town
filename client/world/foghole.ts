import { Camera, ShaderChunk, ShaderLib, UniformsLib, Vector3 } from 'three';
// A hole in the scene fog around one point. The lighthouse beam and a hand lantern clear
// the air around the player, and only there: the rest of the island keeps its weather,
// and other players see nothing change. Patched into three's fog chunks so every fogged
// material takes part; the uniform values are plain objects, which three shares by
// reference across programs instead of cloning, so one write reaches them all.
const hole = { x: 0, y: 0, z: 0, w: 0 }; // centre in view space, radius in w
const strength = { x: 0, y: 0, z: 0, w: 0 }; // x: how much of the fog the hole removes
const holeUniform = { value: hole };
const strengthUniform = { value: strength };
const fogLib = UniformsLib.fog as Record<string, { value: unknown }>;
fogLib.fogHole = holeUniform;
fogLib.fogHoleK = strengthUniform;
// The shader library merged its uniforms at import time, so each fogged library gets them too.
for (const lib of Object.values(ShaderLib) as Array<{ uniforms: Record<string, { value: unknown }> }>) {
  if (lib.uniforms && 'fogColor' in lib.uniforms) {
    lib.uniforms.fogHole = holeUniform;
    lib.uniforms.fogHoleK = strengthUniform;
  }
}
ShaderChunk.fog_pars_vertex += '\nvarying vec3 vFogHoleView;';
ShaderChunk.fog_vertex += '\n#ifdef USE_FOG\n\tvFogHoleView = mvPosition.xyz;\n#endif';
ShaderChunk.fog_pars_fragment += '\nuniform vec4 fogHole;\nuniform vec4 fogHoleK;\nvarying vec3 vFogHoleView;';
ShaderChunk.fog_fragment = `#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	float fogHoleD = distance( vFogHoleView, fogHole.xyz );
	float fogHoleT = fogHoleK.x * ( 1.0 - smoothstep( fogHole.w * 0.3, fogHole.w, fogHoleD ) );
	fogFactor *= 1.0 - fogHoleT;
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`;
const centre = new Vector3();
// Places the hole around a world point for this frame.
export function setFogHole(x: number, y: number, z: number, radius: number, amount: number, camera: Camera) {
  centre.set(x, y, z).applyMatrix4(camera.matrixWorldInverse);
  hole.x = centre.x;
  hole.y = centre.y;
  hole.z = centre.z;
  hole.w = amount > 0.001 ? radius : 0;
  strength.x = Math.max(0, Math.min(1, amount));
}
// The custom water shader keeps its own uniform table; it borrows the shared objects.
export const fogHoleUniforms = { fogHole: holeUniform, fogHoleK: strengthUniform };
