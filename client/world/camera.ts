import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import { SPAWN } from '../../packages/shared/layout';
// Third-person follow camera with velocity look-ahead, orbit inertia and smooth zoom.
const REST_ZOOM = 27,
  DOLLY = Math.hypot(0.92, 0.95), // the rig sits this many zoom units from the player
  MIN_ZOOM = 14,
  // Far enough back to take in the whole island; the fog planes follow the dolly out.
  MAX_ZOOM = 46;
/** How far back the camera sits at its resting zoom, which is where the weather is tuned to look right. */
export const CAMERA_REST_DISTANCE = REST_ZOOM * DOLLY;
export class CameraRig {
  readonly camera = new PerspectiveCamera(43, 1, 0.1, 220);
  angle = 0.12;
  zoom = REST_ZOOM;
  private targetZoom = REST_ZOOM;
  private angularVelocity = 0;
  private readonly focus = new Vector3(SPAWN.x, 0, SPAWN.z);
  private readonly lookTarget = new Vector3();
  private readonly desired = new Vector3();
  private dragging = false;
  private lastX = 0;
  private lastMove = 0;
  private readonly touches = new Map<number, { x: number; y: number }>();
  private pinchDistance = 0;
  constructor(private host: HTMLElement) {
    this.camera.position.set(25, 30, 40);
    host.addEventListener('pointerdown', this.down);
    window.addEventListener('pointermove', this.move);
    window.addEventListener('pointerup', this.up);
    window.addEventListener('pointercancel', this.up);
    host.addEventListener('wheel', this.wheel, { passive: true });
    host.addEventListener('contextmenu', this.context);
  }
  private down = (e: PointerEvent) => {
    if (e.pointerType === 'touch') {
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.touches.size === 2) {
        this.pinchDistance = this.touchSpan();
        this.dragging = false;
        return;
      }
    }
    if (e.button === 2 || e.pointerType === 'touch') {
      this.dragging = true;
      this.lastX = e.clientX;
      this.lastMove = performance.now();
      this.angularVelocity = 0;
    }
  };
  private touchSpan() {
    const [a, b] = [...this.touches.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }
  private move = (e: PointerEvent) => {
    const touch = this.touches.get(e.pointerId);
    if (touch) {
      touch.x = e.clientX;
      touch.y = e.clientY;
      if (this.touches.size === 2) {
        const span = this.touchSpan();
        if (this.pinchDistance > 0 && span > 0) this.pinch(span / this.pinchDistance);
        this.pinchDistance = span;
        return;
      }
    }
    if (!this.dragging) return;
    const now = performance.now(),
      dx = e.clientX - this.lastX,
      elapsed = Math.max(1, now - this.lastMove) / 1000;
    const delta = -dx * 0.006;
    this.angle += delta;
    this.angularVelocity = delta / elapsed;
    this.lastX = e.clientX;
    this.lastMove = now;
  };
  private up = (e: PointerEvent) => {
    this.touches.delete(e.pointerId);
    this.pinchDistance = 0;
    this.dragging = false;
  };
  private wheel = (e: WheelEvent) => {
    this.targetZoom = MathUtils.clamp(this.targetZoom + e.deltaY * 0.015, MIN_ZOOM, MAX_ZOOM);
  };
  private context = (e: Event) => e.preventDefault();
  pinch(scale: number) {
    this.targetZoom = MathUtils.clamp(this.targetZoom / scale, MIN_ZOOM, MAX_ZOOM);
  }
  update(dt: number, x: number, z: number, vx: number, vz: number, snap = false) {
    if (!this.dragging && this.angularVelocity) {
      this.angle += this.angularVelocity * dt;
      this.angularVelocity *= Math.exp(-6 * dt);
      if (Math.abs(this.angularVelocity) < 0.01) this.angularVelocity = 0;
    }
    this.zoom = MathUtils.damp(this.zoom, this.targetZoom, 6, dt);
    // Look slightly ahead of the player so turns read before the body arrives.
    const leadX = x + vx * 0.3,
      leadZ = z + vz * 0.3;
    if (snap) this.focus.set(leadX, 0, leadZ);
    else {
      this.focus.x = MathUtils.damp(this.focus.x, leadX, 5, dt);
      this.focus.z = MathUtils.damp(this.focus.z, leadZ, 5, dt);
    }
    this.desired.set(this.focus.x + Math.sin(this.angle) * this.zoom * 0.92, this.zoom * 0.95, this.focus.z + Math.cos(this.angle) * this.zoom * 0.92);
    if (snap) this.camera.position.copy(this.desired);
    else {
      this.camera.position.x = MathUtils.damp(this.camera.position.x, this.desired.x, 7, dt);
      this.camera.position.y = MathUtils.damp(this.camera.position.y, this.desired.y, 7, dt);
      this.camera.position.z = MathUtils.damp(this.camera.position.z, this.desired.z, 7, dt);
    }
    this.lookTarget.set(this.focus.x, 0.9, this.focus.z);
    this.camera.lookAt(this.lookTarget);
  }
  // Rotates raw screen-space axes into world axes relative to the camera yaw.
  worldAxes(dx: number, dz: number, out: { dx: number; dz: number }) {
    out.dx = dx * Math.cos(this.angle) + dz * Math.sin(this.angle);
    out.dz = -dx * Math.sin(this.angle) + dz * Math.cos(this.angle);
    return out;
  }
  resize(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
  dispose() {
    this.host.removeEventListener('pointerdown', this.down);
    window.removeEventListener('pointermove', this.move);
    window.removeEventListener('pointerup', this.up);
    window.removeEventListener('pointercancel', this.up);
    this.host.removeEventListener('wheel', this.wheel);
    this.host.removeEventListener('contextmenu', this.context);
  }
}
