// The lighthouse beam, and the fog it burns through.
//
// On foggy days the lamp is the only thing worth looking at: the beam is lit around
// the clock, it is thicker because there is something in the air to catch it, and
// every time it sweeps over you the fog it passes through thins out for a moment
// before rolling back in. The sweep is a pure function of elapsed time and the
// clearing is a one-number state machine, so the renderer and the tests agree on
// where the light is pointing and how much of the murk it has burnt off.
export const LIGHTHOUSE = {
  /** Radians per second. A full revolution takes a little under nine seconds. */
  sweepSpeed: 0.7,
  /** Half-width of the swathe that counts as lit: wider than the visible shaft, because in fog the glow spills past it. */
  coneHalfAngle: 0.28,
  /** Seconds for the fog to close back over you after a pass. */
  clearDecay: 2.4,
  /** How much further you can see at the height of a pass. Enough to notice, not enough
   * to turn a foggy day into a clear one. */
  nearLift: 8,
  farLift: 18,
  /** Fractions of the horizon haze, the overcast dimming and the grey tint a pass lifts. */
  hazeLift: 0.2,
  sunLift: 0.1,
  tintRelief: 0.18,
};

/** Where the lamp is pointing, as a heading for a nose-along-+X model. */
export function beamHeading(elapsed: number) {
  return elapsed * LIGHTHOUSE.sweepSpeed;
}

/** Shortest signed distance between two headings, in (-pi, pi]. */
export function angleDelta(a: number, b: number) {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

/** 1 when the beam is pointed straight at a place, easing to 0 at the edge of the swathe. */
export function sweepAlignment(beam: number, target: number) {
  const off = Math.abs(angleDelta(beam, target));
  if (off >= LIGHTHOUSE.coneHalfAngle) return 0;
  const k = 1 - off / LIGHTHOUSE.coneHalfAngle;
  return k * k * (3 - 2 * k);
}

/** How much fog the lamp has burnt off: snaps up as the beam crosses you, rolls back after. */
export function clearStep(previous: number, alignment: number, dt: number) {
  const settled = previous * Math.exp(-Math.max(0, dt) / LIGHTHOUSE.clearDecay);
  return Math.min(1, Math.max(settled, Math.max(0, Math.min(1, alignment))));
}

/** The fog planes once a pass has opened the air up. `burn` is the clearing scaled by how foggy it is. */
export function clearedFog(near: number, far: number, burn: number) {
  const k = Math.max(0, Math.min(1, burn));
  return { near: near + LIGHTHOUSE.nearLift * k, far: far + LIGHTHOUSE.farLift * k };
}
