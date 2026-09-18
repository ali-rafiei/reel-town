// Anything circling the island, above the water or below it, should face the way it
// is going rather than broadside to it. Models are built nose along +X, so this is
// the Y rotation that lines that nose up with the tangent of the circle.
export function tangentHeading(angle: number) {
  return -angle - Math.PI / 2;
}

// Same convention pointed at a place instead of along a path: the Y rotation that
// aims a nose-along-+X model from one point in the world at another. Rotating +X
// about +Y by t gives (cos t, -sin t) in (x, z), so the heading inverts z.
export function headingTo(fromX: number, fromZ: number, toX: number, toZ: number) {
  return Math.atan2(-(toZ - fromZ), toX - fromX);
}
