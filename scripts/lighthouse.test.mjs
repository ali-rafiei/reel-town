import test from 'node:test';
import assert from 'node:assert/strict';
import { LIGHTHOUSE, angleDelta, beamHeading, clearStep, clearedFog, sweepAlignment } from '../server/dist/packages/shared/lighthouse.js';
import { headingTo } from '../server/dist/packages/shared/orientation.js';

const LIGHTHOUSE_X = 10,
  LIGHTHOUSE_Z = -3;

test('a heading aims a nose-along-+X model at the place it names', () => {
  for (const [x, z] of [[20, -3], [10, 10], [0, 0], [-4, 12]]) {
    const t = headingTo(LIGHTHOUSE_X, LIGHTHOUSE_Z, x, z);
    // Rotating +X about +Y by t gives (cos t, -sin t) in (x, z).
    const dx = x - LIGHTHOUSE_X,
      dz = z - LIGHTHOUSE_Z,
      len = Math.hypot(dx, dz) || 1;
    assert.ok(Math.abs(Math.cos(t) - dx / len) < 1e-12, `x at ${x},${z}`);
    assert.ok(Math.abs(-Math.sin(t) - dz / len) < 1e-12, `z at ${x},${z}`);
  }
});

test('the swathe peaks dead on, is symmetric, and ends at the cone edge', () => {
  const target = 0.8;
  assert.equal(sweepAlignment(target, target), 1);
  const half = LIGHTHOUSE.coneHalfAngle;
  assert.equal(sweepAlignment(target + half, target), 0);
  assert.equal(sweepAlignment(target - half * 1.5, target), 0);
  assert.ok(Math.abs(sweepAlignment(target + half / 2, target) - sweepAlignment(target - half / 2, target)) < 1e-12);
  // The beam heading grows without bound as time runs, so alignment has to wrap.
  assert.equal(sweepAlignment(target + Math.PI * 20, target), 1);
  assert.ok(Math.abs(angleDelta(Math.PI * 21, Math.PI)) < 1e-9);
});

test('every pass clears the fog and the murk rolls back in before the next one', () => {
  const target = headingTo(LIGHTHOUSE_X, LIGHTHOUSE_Z, 0, 20);
  const dt = 1 / 60,
    period = (Math.PI * 2) / LIGHTHOUSE.sweepSpeed;
  let clear = 0,
    passes = 0,
    armed = true,
    lowSincePass = 1,
    troughBetweenPasses = 0;
  for (let i = 1; i * dt <= period * 3; i++) {
    clear = clearStep(clear, sweepAlignment(beamHeading(i * dt), target), dt);
    if (armed && clear > 0.95) {
      if (passes) troughBetweenPasses = Math.max(troughBetweenPasses, lowSincePass);
      passes++;
      armed = false;
      lowSincePass = 1;
    }
    if (passes) lowSincePass = Math.min(lowSincePass, clear);
    if (clear < 0.2) armed = true;
  }
  assert.equal(passes, 3, 'the fog opens up once per sweep');
  assert.ok(troughBetweenPasses < 0.1, `fog is back before the next pass (was ${troughBetweenPasses})`);
});

test('the clearing decays on its own and never leaves its range', () => {
  let clear = clearStep(0, 1, 1 / 60);
  assert.ok(clear > 0.99);
  const after = clearStep(clear, 0, LIGHTHOUSE.clearDecay);
  assert.ok(after < clear * 0.4, 'one time constant takes most of it away');
  assert.equal(clearStep(0, 0, 10), 0);
  assert.ok(clearStep(1, 5, 0) <= 1, 'alignment cannot push it past full');
  assert.ok(clearStep(0, -3, 1) >= 0);
});

test('a pass opens the air up, and only as far as a clear day', () => {
  const foggyNear = 40 - 30,
    foggyFar = 110 - 70;
  assert.deepEqual(clearedFog(foggyNear, foggyFar, 0), { near: foggyNear, far: foggyFar }, 'no pass, no change');
  const swept = clearedFog(foggyNear, foggyFar, 1);
  assert.ok(swept.near > foggyNear && swept.far > foggyFar, 'you can see further mid-pass');
  assert.ok(swept.near < 40 && swept.far < 110, 'but it is still foggier than a clear day');
  // Burn is the clearing scaled by how foggy it is, so clear weather is untouched.
  assert.deepEqual(clearedFog(40, 110, 1 * 0), { near: 40, far: 110 });
  assert.deepEqual(clearedFog(foggyNear, foggyFar, 4), swept, 'clamped');
});
