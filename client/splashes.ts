import * as T from 'three';
import { viewpoint } from './world/entities';
import { spriteGeometry, spriteMaterial } from './world/sprites';
export function createSplashes(scene: T.Scene) {
  const capacity = 256,
    geometry = new T.SphereGeometry(0.085, 5, 4),
    material = new T.MeshBasicMaterial({ color: '#c7f2e8' }),
    mesh = new T.InstancedMesh(geometry, material, capacity);
  mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
  mesh.frustumCulled = false;
  scene.add(mesh);
  // Golden sparkles are the painted spark on a card that turns to the camera.
  const sparkleMaterial = spriteMaterial('fishing-shop', 'gold-sparkle', 'glow'),
    sparkleMesh = new T.InstancedMesh(spriteGeometry('fishing-shop', 'gold-sparkle', 0.5), sparkleMaterial, 64);
  sparkleMesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
  sparkleMesh.frustumCulled = false;
  scene.add(sparkleMesh);
  const sparkles: Array<{ p: T.Vector3; v: T.Vector3; life: number }> = Array.from({ length: 64 }, () => ({ p: new T.Vector3(), v: new T.Vector3(), life: 0 }));
  let sparkleCursor = 0;
  const dummy = new T.Object3D();
  const drops: Array<{
    p: T.Vector3;
    v: T.Vector3;
    life: number;
    total: number;
  }> = [];
  let cursor = 0;
  const rings: Array<{
    mesh: T.Mesh<T.PlaneGeometry, T.Material>;
    life: number;
  }> = [];
  function burst(x: number, z: number, strong = false) {
    const amount = strong ? 35 : 12;
    for (let i = 0; i < amount; i++) {
      const a = i * 2.39996;
      const speed = (strong ? 2.3 : 1.3) * (0.4 + Math.random() * 0.6);
      const drop = {
        p: new T.Vector3(x, -0.43, z),
        v: new T.Vector3(
          Math.cos(a) * speed,
          (strong ? 5 : 2.8) * (0.65 + Math.random() * 0.35),
          Math.sin(a) * speed,
        ),
        life: strong ? 1.5 : 1,
        total: strong ? 1.5 : 1,
      };
      drops[cursor] = drop;
      cursor = (cursor + 1) % capacity;
    }
    if (rings.length >= 16) {
      const r = rings.shift()!;
      scene.remove(r.mesh);
      r.mesh.geometry.dispose();
      r.mesh.material.dispose();
    }
    // The painted splash ring, lying on the water.
    const ring = new T.Mesh(spriteGeometry('fishing-shop', 'splash-ring', 0.8), spriteMaterial('fishing-shop', 'splash-ring', 'glow', { transparent: true, opacity: 0.8, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, -0.5, z);
    scene.add(ring);
    rings.push({ mesh: ring, life: 1.2 });
  }
  // Golden sparkles for rare catches; reuses a fixed pool, no allocation per burst.
  function sparkle(x: number, z: number, amount = 24) {
    for (let i = 0; i < amount; i++) {
      const s = sparkles[sparkleCursor];
      sparkleCursor = (sparkleCursor + 1) % sparkles.length;
      const a = Math.random() * Math.PI * 2,
        speed = 1 + Math.random() * 2.2;
      s.p.set(x, 0.2, z);
      s.v.set(Math.cos(a) * speed, 3 + Math.random() * 3.5, Math.sin(a) * speed);
      s.life = 1.1 + Math.random() * 0.6;
    }
  }
  function update(dt: number) {
    for (let i = 0; i < capacity; i++) {
      const d = drops[i];
      if (d && d.life > 0) {
        d.life -= dt;
        d.v.y -= 6 * dt;
        d.p.addScaledVector(d.v, dt);
        dummy.position.copy(d.p);
        dummy.scale.setScalar(
          d.life > 0 && d.p.y > -0.6 ? Math.min(1, d.life * 3) : 0,
        );
      } else dummy.scale.setScalar(0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < sparkles.length; i++) {
      const s = sparkles[i];
      if (s.life > 0) {
        s.life -= dt;
        s.v.y -= 5 * dt;
        s.p.addScaledVector(s.v, dt);
        dummy.position.copy(s.p);
        dummy.lookAt(viewpoint);
        dummy.rotateZ(s.life * 4);
        dummy.scale.setScalar(Math.min(1, s.life * 2));
      } else dummy.scale.setScalar(0);
      dummy.updateMatrix();
      sparkleMesh.setMatrixAt(i, dummy.matrix);
    }
    sparkleMesh.instanceMatrix.needsUpdate = true;
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      r.life -= dt;
      if (r.life <= 0) {
        scene.remove(r.mesh);
        r.mesh.geometry.dispose();
        r.mesh.material.dispose();
        rings.splice(i, 1);
      } else {
        r.mesh.scale.setScalar(1 + (1.2 - r.life) * 3);
        (r.mesh.material as T.MeshBasicMaterial).opacity = r.life * 0.55;
      }
    }
  }
  function dispose() {
    scene.remove(sparkleMesh);
    sparkleMesh.geometry.dispose();
    sparkleMaterial.dispose();
    scene.remove(mesh);
    geometry.dispose();
    material.dispose();
    for (const r of rings) {
      scene.remove(r.mesh);
      r.mesh.geometry.dispose();
      r.mesh.material.dispose();
    }
  }
  return { burst, sparkle, update, dispose };
}
