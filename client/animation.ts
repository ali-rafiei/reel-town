// Character animation state machine with eased pose blending and secondary motion springs.
// Poses are plain numeric records that are reused every frame; nothing is allocated per update.
export type AnimState =
  | 'idle'
  | 'walk'
  | 'cast'
  | 'wait'
  | 'bite'
  | 'reel'
  | 'catch'
  | 'wave'
  | 'heart'
  | 'dance'
  | 'sit'
  | 'benchsit'
  | 'row'
  | 'sell'
  | 'minigame';
export type Pose = {
  bodyY: number;
  bodyTilt: number;
  bodyLean: number;
  bodyYaw: number;
  bodyScaleY: number;
  headNod: number;
  headTilt: number;
  headTurn: number;
  armX: [number, number];
  armZ: [number, number];
  armY: [number, number];
  legZ: [number, number];
  legY: [number, number];
  legX: [number, number];
  rodX: number;
  rodY: number;
  rod: number; // 0 hidden, 1 shown
  hatLift: number;
};
export type AnimContext = {
  t: number; // world time in seconds (shared phase for ambient motion)
  speed: number; // 0..1 of top speed
  gait: number; // accumulated stride phase
  castAge: number; // seconds since the cast began
  emoteAge: number;
  stateTime: number;
};
export const CAST_DURATION = 0.85;
export function createPose(): Pose {
  return {
    bodyY: 0,
    bodyTilt: 0,
    bodyLean: 0,
    bodyYaw: 0,
    bodyScaleY: 1,
    headNod: 0,
    headTilt: 0,
    headTurn: 0,
    armX: [0, 0],
    armZ: [-0.1, 0.1],
    armY: [1.02, 1.02],
    legZ: [0.08, 0.08],
    legY: [0.17, 0.17],
    legX: [0, 0],
    rodX: 0,
    rodY: 0,
    rod: 0,
    hatLift: 0,
  };
}
const ease = (k: number) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
function rest(p: Pose) {
  p.bodyY = 0;
  p.bodyTilt = 0;
  p.bodyLean = 0;
  p.bodyYaw = 0;
  p.bodyScaleY = 1;
  p.headNod = 0;
  p.headTilt = 0;
  p.headTurn = 0;
  p.armX[0] = p.armX[1] = 0;
  p.armZ[0] = -0.1;
  p.armZ[1] = 0.1;
  p.armY[0] = p.armY[1] = 1.02;
  p.legZ[0] = p.legZ[1] = 0.08;
  p.legY[0] = p.legY[1] = 0.17;
  p.legX[0] = p.legX[1] = 0;
  p.rodX = 0;
  p.rodY = 0;
  p.rod = 0;
  p.hatLift = 0;
}
const poses: Record<AnimState, (c: AnimContext, p: Pose) => void> = {
  idle(c, p) {
    rest(p);
    const breath = Math.sin(c.t * 2);
    p.bodyY = breath * 0.018;
    p.bodyScaleY = 1 + breath * 0.008;
    p.armZ[0] = -0.1 + breath * 0.02;
    p.armZ[1] = 0.1 - breath * 0.02;
    p.headNod = Math.sin(c.t * 0.7) * 0.04;
    p.headTurn = Math.sin(c.t * 0.45) * 0.12;
  },
  walk(c, p) {
    rest(p);
    const s = c.speed,
      g = c.gait;
    const stride = Math.sin(g),
      lift = Math.max(0, stride);
    for (let i = 0; i < 2; i++) {
      const phase = i ? -stride : stride,
        up = i ? Math.max(0, -stride) : lift;
      p.legZ[i] = 0.08 + phase * 0.22 * s;
      p.legY[i] = 0.17 + up * 0.12 * s;
      p.legX[i] = phase * 0.22 * s;
      p.armX[i] = -phase * 0.55 * s;
    }
    p.bodyY = (1 - Math.cos(g * 2)) * 0.028 * s;
    p.bodyTilt = Math.sin(g) * 0.03 * s;
    p.bodyLean = 0.06 * s + Math.sin(g * 2) * 0.015 * s;
    p.headNod = -Math.cos(g * 2) * 0.03 * s;
    p.hatLift = (1 - Math.cos(g * 2)) * 0.01 * s;
  },
  wave(c, p) {
    poses.idle(c, p);
    const a = c.emoteAge;
    p.armY[1] = 1.3;
    p.armZ[1] = 2.35 + Math.sin(a * 9) * 0.32;
    p.armX[1] = Math.sin(a * 9) * 0.14;
    p.bodyTilt = -0.05;
    p.headTilt = 0.08;
  },
  heart(c, p) {
    poses.idle(c, p);
    const a = c.emoteAge;
    const hop = Math.max(0, Math.sin(a * 6)) * 0.08;
    p.bodyY += hop;
    p.armY[0] = p.armY[1] = 1.32;
    p.armZ[0] = -1.9;
    p.armZ[1] = 1.9;
    p.armX[0] = p.armX[1] = -0.6;
    p.headTilt = Math.sin(a * 3) * 0.12;
  },
  dance(c, p) {
    rest(p);
    const a = c.emoteAge * 8;
    p.bodyTilt = Math.sin(a) * 0.15;
    p.bodyY = (1 - Math.cos(a)) * 0.06;
    p.bodyYaw = Math.sin(a * 0.5) * 0.25;
    p.armZ[0] = -0.8 - Math.sin(a) * 0.9;
    p.armZ[1] = 0.8 - Math.sin(a) * 0.9;
    p.armY[0] = p.armY[1] = 1.15;
    p.armX[0] = Math.cos(a) * 0.4;
    p.armX[1] = -Math.cos(a) * 0.4;
    p.legZ[0] = 0.08 + Math.sin(a) * 0.12;
    p.legZ[1] = 0.08 - Math.sin(a) * 0.12;
    p.headTilt = -Math.sin(a) * 0.15;
    p.hatLift = (1 - Math.cos(a)) * 0.02;
  },
  sit(c, p) {
    rest(p);
    p.bodyScaleY = 0.65;
    p.bodyY = -0.02;
    p.legZ[0] = p.legZ[1] = 0.38;
    p.legY[0] = p.legY[1] = 0.1;
    p.legX[0] = p.legX[1] = -1.1;
    p.armX[0] = p.armX[1] = 0.35;
    p.headNod = 0.05 + Math.sin(c.t * 1.5) * 0.03;
    p.bodyTilt = Math.sin(c.t * 1.2) * 0.015;
  },
  // Sitting on a bench: the seat takes the weight, so the legs hang over the front edge
  // and swing, the back settles against the rest and the hands rest on the seat.
  benchsit(c, p) {
    rest(p);
    const swing = Math.sin(c.t * 1.1),
      breath = Math.sin(c.t * 1.8);
    p.legX[0] = -0.22 + swing * 0.09;
    p.legX[1] = -0.22 - swing * 0.09;
    p.legZ[0] = p.legZ[1] = 0.14;
    p.legY[0] = p.legY[1] = 0.12;
    p.armX[0] = p.armX[1] = 0.42;
    p.armZ[0] = -0.16;
    p.armZ[1] = 0.16;
    p.armY[0] = p.armY[1] = 0.98;
    p.bodyY = breath * 0.012;
    p.bodyLean = -0.09;
    p.bodyScaleY = 0.94 + breath * 0.006;
    p.headNod = 0.04 + breath * 0.02;
    p.headTurn = Math.sin(c.t * 0.4) * 0.14;
    p.bodyTilt = Math.sin(c.t * 0.9) * 0.012;
  },
  // Rowing: seated, both arms pulling together, the body rocking with the stroke.
  row(c, p) {
    poses.sit(c, p);
    const a = c.gait * 0.8;
    const pull = Math.sin(a);
    p.armY[0] = p.armY[1] = 1.06;
    p.armZ[0] = -0.35;
    p.armZ[1] = 0.35;
    p.armX[0] = p.armX[1] = -0.55 + pull * 0.85;
    p.bodyLean = 0.08 + pull * 0.14;
    p.headNod = -0.02 - pull * 0.06;
    p.bodyY += Math.max(0, -pull) * 0.02;
  },
  cast(c, p) {
    rest(p);
    const k = clamp01((c.castAge - 0.2) / 0.65);
    const wind = clamp01(c.castAge / 0.2);
    p.rod = 1;
    p.rodX = k === 0 ? -0.9 * wind : -0.9 + 1.8 * ease(k);
    p.armX[1] = -0.7 * wind + k * 1.1;
    p.armZ[1] = 0.25;
    p.armX[0] = 0.15 * wind - k * 0.3;
    p.bodyLean = -0.16 * wind + 0.3 * ease(k);
    p.bodyYaw = -0.25 * wind + 0.35 * ease(k);
    p.headNod = -0.1 * wind + 0.15 * k;
    p.legZ[0] = -0.05;
    p.legZ[1] = 0.2;
  },
  wait(c, p) {
    rest(p);
    p.rod = 1;
    p.rodX = 0.85 + Math.sin(c.t * 1.3) * 0.02;
    p.armX[1] = 0.5;
    p.armZ[1] = 0.25;
    p.armX[0] = 0.15;
    p.bodyY = Math.sin(c.t * 2) * 0.012;
    p.bodyLean = 0.04;
    p.headNod = 0.16 + Math.sin(c.t * 0.9) * 0.03;
    p.headTurn = Math.sin(c.t * 0.35) * 0.08;
  },
  bite(c, p) {
    poses.wait(c, p);
    p.rodX = 0.95 + Math.sin(c.t * 22) * 0.05;
    p.bodyLean = -0.06;
    p.bodyY += 0.04;
    p.headNod = 0.25;
    p.armX[1] = 0.35;
    p.armX[0] = -0.2;
    p.armZ[0] = -0.4;
    p.hatLift = 0.05;
  },
  reel(c, p) {
    rest(p);
    const strain = Math.sin(c.t * 8);
    p.rod = 1;
    p.rodX = 0.6 + strain * 0.05;
    p.armX[1] = 0.35 + strain * 0.06;
    p.armZ[1] = 0.3;
    p.armX[0] = 0.55;
    p.armZ[0] = -0.55;
    p.armY[0] = 1.0;
    p.bodyLean = -0.18 + strain * 0.02;
    p.bodyTilt = strain * 0.02;
    p.legZ[0] = -0.12;
    p.legZ[1] = 0.22;
    p.legX[0] = -0.2;
    p.legX[1] = 0.2;
    p.headNod = 0.22;
  },
  catch(c, p) {
    rest(p);
    const a = clamp01(c.stateTime / 0.55);
    const hop = Math.sin(a * Math.PI);
    p.rod = 1;
    p.rodX = 0.2;
    p.bodyY = hop * 0.28;
    p.bodyLean = -0.12;
    p.armY[0] = p.armY[1] = 1.3;
    p.armZ[0] = -2.4;
    p.armZ[1] = 2.2;
    p.armX[0] = p.armX[1] = -0.3;
    p.headNod = -0.25;
    p.legY[0] = p.legY[1] = 0.17 + hop * 0.1;
    p.legZ[0] = p.legZ[1] = 0.02;
    p.hatLift = hop * 0.12;
  },
  sell(c, p) {
    poses.idle(c, p);
    p.armX[1] = -1.2;
    p.armZ[1] = 0.2;
    p.headNod = 0.12 + Math.sin(c.stateTime * 6) * 0.05;
    p.bodyLean = 0.08;
  },
  minigame(c, p) {
    poses.idle(c, p);
    p.armX[0] = p.armX[1] = -0.5;
    p.armZ[0] = -0.4;
    p.armZ[1] = 0.4;
    p.bodyLean = 0.06;
  },
};
const transitionSeconds: Partial<Record<AnimState, number>> = { cast: 0.08, bite: 0.1, catch: 0.1, walk: 0.14, idle: 0.22, sit: 0.3, row: 0.2 };
function blendPose(from: Pose, to: Pose, k: number, out: Pose) {
  const mix = (a: number, b: number) => a + (b - a) * k;
  out.bodyY = mix(from.bodyY, to.bodyY);
  out.bodyTilt = mix(from.bodyTilt, to.bodyTilt);
  out.bodyLean = mix(from.bodyLean, to.bodyLean);
  out.bodyYaw = mix(from.bodyYaw, to.bodyYaw);
  out.bodyScaleY = mix(from.bodyScaleY, to.bodyScaleY);
  out.headNod = mix(from.headNod, to.headNod);
  out.headTilt = mix(from.headTilt, to.headTilt);
  out.headTurn = mix(from.headTurn, to.headTurn);
  for (let i = 0; i < 2; i++) {
    out.armX[i] = mix(from.armX[i], to.armX[i]);
    out.armZ[i] = mix(from.armZ[i], to.armZ[i]);
    out.armY[i] = mix(from.armY[i], to.armY[i]);
    out.legZ[i] = mix(from.legZ[i], to.legZ[i]);
    out.legY[i] = mix(from.legY[i], to.legY[i]);
    out.legX[i] = mix(from.legX[i], to.legX[i]);
  }
  out.rodX = mix(from.rodX, to.rodX);
  out.rodY = mix(from.rodY, to.rodY);
  out.rod = mix(from.rod, to.rod);
  out.hatLift = mix(from.hatLift, to.hatLift);
}
export class Animator {
  state: AnimState = 'idle';
  previous: AnimState = 'idle';
  blend = 1;
  stateTime = 0;
  previousTime = 0;
  readonly pose = createPose();
  private readonly current = createPose();
  private readonly outgoing = createPose();
  private readonly context: AnimContext = { t: 0, speed: 0, gait: 0, castAge: 0, emoteAge: 0, stateTime: 0 };
  set(state: AnimState) {
    if (state === this.state) return;
    this.previous = this.state;
    this.previousTime = this.stateTime;
    this.state = state;
    this.stateTime = 0;
    this.blend = 0;
  }
  update(dt: number, t: number, speed: number, gait: number, castAge: number, emoteAge: number) {
    this.stateTime += dt;
    this.previousTime += dt;
    const c = this.context;
    c.t = t;
    c.speed = speed;
    c.gait = gait;
    c.castAge = castAge;
    c.emoteAge = emoteAge;
    c.stateTime = this.stateTime;
    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + dt / (transitionSeconds[this.state] ?? 0.18));
      poses[this.state](c, this.current);
      c.stateTime = this.previousTime;
      poses[this.previous](c, this.outgoing);
      blendPose(this.outgoing, this.current, ease(this.blend), this.pose);
    } else poses[this.state](c, this.pose);
    return this.pose;
  }
}
// Critically damped spring used for ears, tails and hats that trail the body.
export class Spring {
  value = 0;
  velocity = 0;
  constructor(
    private stiffness = 120,
    private damping = 14,
  ) {}
  update(target: number, dt: number) {
    const accel = (target - this.value) * this.stiffness - this.velocity * this.damping;
    this.velocity += accel * dt;
    this.value += this.velocity * dt;
    return this.value;
  }
}
export function locomotionState(speed: number): AnimState {
  return speed > 0.04 ? 'walk' : 'idle';
}
