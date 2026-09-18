import { MathUtils, Mesh, Vector3, type BufferAttribute } from 'three';
import { Animator, Spring, CAST_DURATION, type AnimState } from '../animation';
import { disposeAvatar, makeAvatar, type AvatarModel } from '../avatar';
import { sanitizeAppearance, type Appearance } from '../../packages/shared/appearance';
import { Interpolator, type Pose2D } from '../../packages/shared/interpolation';
import { ANGLE_SCALE, EMOTES, FISH_PHASES, POSITION_SCALE, ROW, VELOCITY_SCALE, type PlayerRow, type RosterEntry } from '../../packages/shared/protocol';
import { BENCH_SEAT_Y, benchUnder, groundHeight, onPier } from '../../packages/shared/layout';
import { BOAT_Y, hullGeometry } from './boat';
import { avatarMaterial } from '../avatar';
import type { createSplashes } from '../splashes';
const tip = new Vector3(),
  start = new Vector3(),
  end = new Vector3(),
  up = new Vector3(0, 1.2, 0);
export type SplashSystem = ReturnType<typeof createSplashes>;
// Where the camera is this frame, so held-up catches can turn to face it.
export const viewpoint = new Vector3();
// Standing, the avatar's origin rides this high so its feet meet the grass; its hips are
// this far above that origin, which is what a seat carries.
const STAND_Y = 1;
const HIP_Y = 0.17;
// One networked player: synchronized state, an interpolation buffer for
// remote players, the animated avatar and its DOM name label.
export class PlayerEntity {
  name = '';
  gold: number | undefined;
  appearance: Appearance;
  signature = '';
  model: AvatarModel;
  readonly animator = new Animator();
  readonly interpolator = new Interpolator();
  readonly pose: Pose2D = { x: 0, z: 0, heading: 0, speed: 0 };
  readonly ears = [new Spring(140, 16), new Spring(140, 16)];
  readonly tail = new Spring(60, 9);
  readonly hat = new Spring(180, 18);
  readonly squash = new Spring(220, 18);
  gait = 0;
  emote = '';
  emoteReceivedAge = 0;
  fishPhase = '';
  castAge = 0;
  castId = 0;
  landedCastId = 0;
  waterX = 0;
  waterZ = 0;
  receivedAt = 0;
  catchUntil = 0;
  catchPerfect = false;
  tension = 0.3;
  // Rowing: the avatar sits in a hull that follows the heading, low over the water.
  boating = false;
  private boat: Mesh | null = null;
  escapeUntil = 0;
  escapeShown = false;
  private nibbleAt = -1;
  private lastPhase = '';
  justCaught = false;
  label: HTMLDivElement;
  private readonly textNode: Text;
  private labelText = '';
  private bubble: HTMLSpanElement | null = null;
  bubbleUntil = 0;
  private lastHeading = 0;
  private lastBodyY = 0;
  // Sitting on a bench rather than on the grass: the avatar rides up onto the seat.
  private onBench = false;
  private seatLift = 0;
  private lastVx = 0;
  private lastVz = 0;
  constructor(
    public readonly n: number,
    entry: RosterEntry | undefined,
    labels: HTMLElement,
  ) {
    this.appearance = sanitizeAppearance(entry?.appearance);
    this.name = entry?.name ?? '';
    this.gold = entry?.gold;
    this.signature = JSON.stringify(this.appearance);
    this.model = makeAvatar(this.appearance);
    this.label = document.createElement('div');
    this.label.className = 'playerlabel';
    this.textNode = document.createTextNode('');
    this.label.appendChild(this.textNode);
    labels.appendChild(this.label);
  }
  applyRoster(entry: RosterEntry) {
    this.name = entry.name;
    this.gold = entry.gold;
    const appearance = sanitizeAppearance(entry.appearance);
    const signature = JSON.stringify(appearance);
    if (signature !== this.signature) {
      const parent = this.model.group.parent;
      const { position } = this.model.group;
      const heading = this.model.body.rotation.y;
      disposeAvatar(this.model);
      this.appearance = appearance;
      this.signature = signature;
      this.model = makeAvatar(appearance);
      this.model.group.position.copy(position);
      this.model.body.rotation.y = heading;
      parent?.add(this.model.group);
    }
  }
  // Remote players: push a timestamped sample; own player: only the synchronized flags are used.
  applyRow(row: PlayerRow, serverTime: number, now: number, isSelf: boolean) {
    if (!isSelf)
      this.interpolator.push(
        serverTime,
        row[ROW.x] / POSITION_SCALE,
        row[ROW.z] / POSITION_SCALE,
        row[ROW.vx] / VELOCITY_SCALE,
        row[ROW.vz] / VELOCITY_SCALE,
        row[ROW.heading] / ANGLE_SCALE,
      );
    this.emote = EMOTES[row[ROW.emote]] || '';
    this.emoteReceivedAge = row[ROW.emoteAge] / 1000;
    const phase = FISH_PHASES[row[ROW.fishPhase]] || '';
    // A line that was live and is suddenly gone without a catch means the fish escaped.
    if ((this.lastPhase === 'reeling' || this.lastPhase === 'bite') && !phase && !this.justCaught) this.escapeUntil = now + 1200;
    this.justCaught = false;
    this.lastPhase = phase;
    this.fishPhase = phase;
    this.castAge = row[ROW.castAge] / 1000;
    this.castId = row[ROW.castId];
    if (!isSelf) this.boating = row[ROW.mode] === 1;
    if (this.fishPhase) {
      this.waterX = row[ROW.waterX] / VELOCITY_SCALE;
      this.waterZ = row[ROW.waterZ] / VELOCITY_SCALE;
    }
    this.receivedAt = now;
  }
  say(text: string, now: number) {
    if (!this.bubble) {
      this.bubble = document.createElement('span');
      this.bubble.className = 'bubble';
    }
    this.bubble.textContent = text;
    this.bubbleUntil = now + 4000 + text.length * 50;
    if (!this.bubble.parentNode) this.label.insertBefore(this.bubble, this.textNode);
  }
  celebrate(t: number, waterX: number, waterZ: number, perfect: boolean, fish?: string) {
    this.model.setPrize(fish);
    this.justCaught = true;
    this.escapeUntil = 0;
    this.catchUntil = t + 1.8;
    this.catchPerfect = perfect;
    this.waterX = waterX;
    this.waterZ = waterZ;
  }
  currentState(t: number, speed: number): AnimState {
    if (this.boating) return speed > 0.04 ? 'row' : 'sit';
    if (this.catchUntil > t) return 'catch';
    const sinceReceive = (performance.now() - this.receivedAt) / 1000;
    if (this.fishPhase) {
      if (this.castAge + sinceReceive < CAST_DURATION) return 'cast';
      return this.fishPhase === 'bite' ? 'bite' : this.fishPhase === 'reeling' ? 'reel' : 'wait';
    }
    if (this.emote === 'sit') return this.onBench ? 'benchsit' : 'sit';
    if (this.emote === 'wave' || this.emote === 'heart' || this.emote === 'dance') return this.emote;
    return speed > 0.04 ? 'walk' : 'idle';
  }
  // Drives the avatar toward (x, z, heading) with the given normalized speed.
  update(dt: number, t: number, x: number, z: number, heading: number, speed: number, splashes: SplashSystem, realShadows: boolean) {
    const m = this.model,
      g = m.group;
    const now = performance.now();
    const sinceReceive = (now - this.receivedAt) / 1000;
    g.position.x = x;
    g.position.z = z;
    this.onBench = this.emote === 'sit' && !this.boating && !!benchUnder(x, z);
    const state = this.currentState(t, speed);
    this.animator.set(state);
    this.gait += dt * (7 + speed * 6) * speed;
    const pose = this.animator.update(dt, t, speed, this.gait, this.castAge + sinceReceive, this.emoteReceivedAge + sinceReceive);
    // Heading eases toward the target; the body banks into the turn.
    const delta = Math.atan2(Math.sin(heading - m.body.rotation.y), Math.cos(heading - m.body.rotation.y));
    const turn = delta * (1 - Math.exp(-14 * dt));
    m.body.rotation.y += turn;
    const turnRate = dt > 0 ? turn / dt : 0;
    this.lastHeading = m.body.rotation.y;
    // Feet on the ground: the deck is flat, the island rises gently under the grass; a
    // rower sits low in the hull on the swell.
    // Easing the lift rather than snapping it means the character lowers onto the bench.
    this.seatLift += ((this.onBench ? BENCH_SEAT_Y - HIP_Y - STAND_Y : 0) - this.seatLift) * (1 - Math.exp(-9 * dt));
    g.position.y = this.boating ? BOAT_Y + 0.58 + Math.sin(t * 1.3) * 0.03 + pose.bodyY * 0.5 : STAND_Y + this.seatLift + (onPier(x, z) ? 0 : groundHeight(x, z)) + pose.bodyY;
    if (this.boating && !this.boat) {
      this.boat = new Mesh(hullGeometry(), avatarMaterial());
      this.boat.castShadow = true;
      this.boat.position.y = -0.58;
      g.add(this.boat);
    }
    if (this.boat) {
      this.boat.visible = this.boating;
      this.boat.rotation.y = m.body.rotation.y;
      this.boat.rotation.z = Math.sin(t * 0.9) * 0.03;
    }
    m.body.rotation.z = pose.bodyTilt - MathUtils.clamp(turnRate * 0.03, -0.12, 0.12) * speed;
    m.body.rotation.x = pose.bodyLean;
    // Squash and stretch from the body's own vertical motion, not from walking uphill.
    const vy = (pose.bodyY - this.lastBodyY) / Math.max(dt, 1e-3);
    this.lastBodyY = pose.bodyY;
    const squash = this.squash.update(MathUtils.clamp(-vy * 0.05, -0.08, 0.08), dt);
    m.body.scale.set(1 - squash * 0.6, pose.bodyScaleY + squash, 1 - squash * 0.6);
    m.head.rotation.x = pose.headNod;
    m.head.rotation.z = pose.headTilt;
    m.head.rotation.y = pose.headTurn + pose.bodyYaw;
    m.hat.position.y = MathUtils.lerp(m.hat.position.y, m.hatY + pose.hatLift + this.hat.update(-vy * 0.02, dt), 1 - Math.exp(-20 * dt));
    for (let i = 0; i < 2; i++) {
      const arm = m.arms[i],
        leg = m.legs[i];
      arm.rotation.x = pose.armX[i];
      arm.rotation.z = pose.armZ[i];
      arm.position.y = pose.armY[i];
      leg.position.z = pose.legZ[i];
      leg.position.y = pose.legY[i];
      leg.rotation.x = pose.legX[i];
    }
    // Secondary motion: ears trail acceleration and gait, tail wags when idle and swings with turns.
    const ax = 0,
      accelForward = speed > 0.02 ? Math.min(1, speed) : 0;
    for (let i = 0; i < m.ears.length; i++) {
      const target = -accelForward * 0.25 + Math.sin(this.gait * 2 + i * 0.7) * 0.12 * speed + Math.sin(t * 1.5 + i) * 0.02 - vy * 0.08 + ax;
      m.ears[i].rotation.x = this.ears[i].update(target, dt);
    }
    if (m.tail) {
      const wag = state === 'idle' || state === 'wait' ? Math.sin(t * 3.2) * 0.35 : state === 'catch' || state === 'heart' ? Math.sin(t * 16) * 0.5 : Math.sin(this.gait) * 0.2 * speed;
      m.tail.rotation.y = this.tail.update(wag - turnRate * 0.12, dt);
      m.tail.rotation.x = -speed * 0.25;
    }
    m.shadow.visible = !realShadows && !this.boating;
    m.shadow.scale.setScalar(1 - pose.bodyY * 0.6);
    // Rod, line and bobber.
    const catching = this.catchUntil > t;
    const active = pose.rod > 0.01 || catching;
    m.rodPivot.visible = active;
    m.line.visible = active && (!!this.fishPhase || catching);
    m.bob.visible = m.line.visible;
    m.prizeFish.visible = catching;
    const strain = state === 'reel' ? 0.35 + this.tension * 0.5 : 0;
    m.rodPivot.rotation.x = pose.rodX - strain * 0.35;
    m.rodPivot.rotation.z = pose.rodY + Math.sin(t * 9) * strain * 0.05;
    m.rodPivot.scale.set(1, 1 - strain * 0.12, 1 + strain * 0.08);
    if (catching) {
      const age = 1.8 - (this.catchUntil - t);
      m.prizeFish.position.set(0, 2.7 + Math.sin(Math.min(1, age / 1.8) * Math.PI) * 0.5, 0);
      m.prizeFish.rotation.y = Math.atan2(viewpoint.x - x, viewpoint.z - z) + Math.sin(t * 3) * 0.12;
      m.prizeFish.scale.setScalar(this.catchPerfect ? 1.35 : 1);
    }
    if (m.line.visible) {
      const castAge = this.castAge + sinceReceive;
      const casting = !!this.fishPhase && castAge < CAST_DURATION;
      const castProgress = MathUtils.clamp((castAge - 0.2) / 0.65, 0, 1);
      m.body.updateMatrixWorld(true);
      m.rodTip.getWorldPosition(tip);
      start.copy(g.position).add(up);
      end.set(this.waterX, -0.45, this.waterZ);
      if (casting) {
        end.lerpVectors(start, end, castProgress);
        end.y += Math.sin(castProgress * Math.PI) * 3;
      } else if (catching) {
        const progress = 1 - (this.catchUntil - t) / 1.8;
        end.lerp(start, Math.min(1, progress * 3));
        end.y += Math.sin(Math.min(1, progress * 3) * Math.PI) * 2;
      } else {
        // Waiting: gentle float with occasional nibbles that tease a bite; bite: hard tugging.
        const nibblePhase = (castAge * 0.55 + this.castId * 0.37) % 1;
        const nibble = this.fishPhase === 'waiting' && nibblePhase > 0.82 && nibblePhase < 0.9 ? Math.sin(((nibblePhase - 0.82) / 0.08) * Math.PI) * 0.18 : 0;
        if (nibble > 0.12 && this.nibbleAt !== Math.floor(castAge * 0.55 + this.castId * 0.37)) {
          this.nibbleAt = Math.floor(castAge * 0.55 + this.castId * 0.37);
          splashes.burst(this.waterX, this.waterZ);
        }
        end.y += Math.sin(t * 3) * 0.045 - nibble + (this.fishPhase === 'bite' ? Math.sin(t * 22) * 0.12 - 0.15 : 0);
      }
      if (!casting && this.fishPhase && this.landedCastId !== this.castId) {
        splashes.burst(this.waterX, this.waterZ);
        this.landedCastId = this.castId;
      }
      m.bob.position.copy(end).sub(g.position);
      tip.sub(g.position);
      end.sub(g.position);
      const points = m.lineGeometry.attributes.position as BufferAttribute;
      const sag = casting ? 0.25 : state === 'reel' ? 0.5 - this.tension * 0.45 : 0.5;
      for (let i = 0; i <= 32; i++) {
        const f = i / 32;
        points.setXYZ(i, MathUtils.lerp(tip.x, end.x, f), MathUtils.lerp(tip.y, end.y, f) - Math.sin(f * Math.PI) * sag, MathUtils.lerp(tip.z, end.z, f));
      }
      points.needsUpdate = true;
    }
    this.lastVx = 0;
    this.lastVz = 0;
  }
  // Only touches the DOM when the visible text actually changes.
  updateLabel(isSelf: boolean, now: number) {
    if (this.bubble && this.bubbleUntil <= now && this.bubble.parentNode) this.bubble.remove();
    const text =
      (this.emote === 'heart' ? '♥ ' : this.fishPhase === 'bite' ? '! ' : '') +
      this.name +
      (typeof this.gold === 'number' ? ` · ${this.gold} gold` : '');
    if (text !== this.labelText) {
      this.labelText = text;
      this.textNode.textContent = text;
    }
    if (this.label.dataset.state !== this.animator.state) this.label.dataset.state = this.animator.state;
  }
  dispose() {
    disposeAvatar(this.model);
    this.label.remove();
  }
}
