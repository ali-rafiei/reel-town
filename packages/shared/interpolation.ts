// Timestamped interpolation buffer for remote entities plus a server clock estimator.
export type Sample = { t: number; x: number; z: number; vx: number; vz: number; heading: number };
export type Pose2D = { x: number; z: number; heading: number; speed: number };
export class Interpolator {
  private samples: Sample[] = [];
  private capacity: number;
  constructor(capacity = 12) {
    this.capacity = capacity;
    for (let i = 0; i < capacity; i++) this.samples.push({ t: 0, x: 0, z: 0, vx: 0, vz: 0, heading: 0 });
  }
  count = 0;
  private head = 0; // index of the newest sample
  push(t: number, x: number, z: number, vx: number, vz: number, heading: number) {
    if (this.count && t <= this.samples[this.head].t) return; // stale or duplicate snapshot
    this.head = (this.head + 1) % this.capacity;
    const s = this.samples[this.head];
    s.t = t;
    s.x = x;
    s.z = z;
    s.vx = vx;
    s.vz = vz;
    s.heading = heading;
    if (this.count < this.capacity) this.count++;
  }
  private at(indexFromNewest: number) {
    return this.samples[(this.head - indexFromNewest + this.capacity * 2) % this.capacity];
  }
  newest() {
    return this.count ? this.at(0) : null;
  }
  // Fills `out` with the pose at render time `t`; extrapolates at most `maxExtrapolate` ms past the newest sample.
  sample(t: number, out: Pose2D, maxExtrapolate = 120) {
    if (!this.count) return false;
    const newest = this.at(0);
    if (t >= newest.t) {
      const ahead = Math.min(t - newest.t, maxExtrapolate) / 1000;
      out.x = newest.x + newest.vx * ahead;
      out.z = newest.z + newest.vz * ahead;
      out.heading = newest.heading;
      out.speed = t - newest.t > maxExtrapolate ? 0 : Math.sqrt(newest.vx * newest.vx + newest.vz * newest.vz);
      return true;
    }
    for (let i = 1; i < this.count; i++) {
      const older = this.at(i),
        younger = this.at(i - 1);
      if (t >= older.t) {
        const k = (t - older.t) / (younger.t - older.t || 1);
        out.x = older.x + (younger.x - older.x) * k;
        out.z = older.z + (younger.z - older.z) * k;
        out.heading = lerpAngle(older.heading, younger.heading, k);
        const vx = older.vx + (younger.vx - older.vx) * k,
          vz = older.vz + (younger.vz - older.vz) * k;
        out.speed = Math.sqrt(vx * vx + vz * vz);
        return true;
      }
    }
    const oldest = this.at(this.count - 1);
    out.x = oldest.x;
    out.z = oldest.z;
    out.heading = oldest.heading;
    out.speed = 0;
    return true;
  }
}
export function lerpAngle(a: number, b: number, k: number) {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * k;
}
// Estimates server time from snapshot timestamps and picks an interpolation delay from measured jitter.
export class ClockSync {
  private offsets: number[] = [];
  private arrivals: number[] = [];
  private lastArrival = 0;
  offset = 0;
  ready = false;
  intervalMs: number;
  jitterMs = 0;
  constructor(intervalMs = 100, private window = 24) {
    this.intervalMs = intervalMs;
  }
  observe(serverTime: number, localNow: number) {
    const offset = serverTime - localNow;
    this.offsets.push(offset);
    if (this.offsets.length > this.window) this.offsets.shift();
    if (this.lastArrival) {
      this.arrivals.push(localNow - this.lastArrival);
      if (this.arrivals.length > this.window) this.arrivals.shift();
    }
    this.lastArrival = localNow;
    // Use the largest offset (earliest arrival relative to server time) so late packets never pull time forward.
    let best = -Infinity;
    for (const o of this.offsets) if (o > best) best = o;
    this.offset = this.ready ? this.offset + (best - this.offset) * 0.1 : best;
    if (this.arrivals.length >= 4) {
      const sorted = [...this.arrivals].sort((a, b) => a - b);
      const p90 = sorted[Math.floor(sorted.length * 0.9)];
      this.intervalMs = sorted[Math.floor(sorted.length * 0.5)];
      this.jitterMs = Math.max(0, p90 - this.intervalMs);
    }
    this.ready = true;
  }
  serverNow(localNow: number) {
    return localNow + this.offset;
  }
  // Render behind estimated server time by one snapshot interval plus observed jitter.
  renderDelay() {
    return Math.min(300, Math.max(this.intervalMs * 1.1 + 15, this.intervalMs + this.jitterMs + 25));
  }
  renderTime(localNow: number) {
    return this.serverNow(localNow) - this.renderDelay();
  }
}
