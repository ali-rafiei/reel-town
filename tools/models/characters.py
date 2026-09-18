"""The nine playable animals, after evidence/gpt/models.png and frontsideback.png.

Each builder returns the parts the client rigs: ``body`` (origin at the feet), ``head``
(origin at the neck pivot, 1.5 up), ``armL``/``armR`` (shoulder pivots), ``legL``/``legR``
(hip pivots), optional ``earL``/``earR`` (pivots in world space, parented to the head by
the client), optional ``tail`` (parented to the body), and a ``hat`` empty where a hat sits.
Parts are authored around their own pivot. Colours are roles the client fills from the
player's coat and outfit colours; ``accent`` is a fixed colour per species.
"""
import math
from mathutils import Matrix, Vector
from kit import Meta, sphere, box, cone, cylinder, torus, role, join, pivot, empty, finish, bisect

HEAD_Y = 1.5
ARM_Y = 1.02
LEG_Y = 0.17
LEG_Z = 0.08


def on(radii, yaw, pitch, lift=0.0):
    """A point on the head's ellipsoid by yaw and pitch, in head space."""
    rx, ry, rz = radii
    cy = math.cos(pitch)
    return (math.sin(yaw) * cy * (rx + lift), math.sin(pitch) * (ry + lift), math.cos(yaw) * cy * (rz + lift))


def squash(obj, sx=1, sy=1, sz=1):
    """Scales a mesh about its own origin, in game axes."""
    obj.data.transform(Matrix.Diagonal(Vector((sx, sz, sy, 1))))
    return obj


def eye(name, radii, yaw, pitch, rx, ry, catchlight=True, lift=0.012, dy=0.0):
    x, y, z = on(radii, yaw, pitch, lift)
    e = role(sphere(name, x, y + dy, z, rx, ry, rx * 0.55, segments=10, rings=7), 'eye')
    parts = [e]
    if catchlight:
        cx, cy, cz = on(radii, yaw - math.copysign(rx * 0.45, yaw or 1), pitch + ry * 0.55, lift + rx * 0.42)
        parts.append(role(sphere(f'{name}-light', cx, cy + dy, cz, rx * 0.3, rx * 0.3, rx * 0.2, segments=8, rings=6), 'white'))
    return parts


def bigeye(name, radii, yaw, pitch, white, pupil, dy=0.0):
    """The frog's eyes, for everyone: a white ball bulging out of the head with a big dark
    pupil on its front and a catchlight, set wide so the face reads from across the plaza.
    The ball stands proud of muzzles and masks, so nothing on the face covers it."""
    x, y, z = on(radii, yaw, pitch, white * 0.35)
    parts = [role(sphere(f'{name}-white', x, y + dy, z, white, white * 1.05, white * 0.8, segments=12, rings=8), 'white')]
    parts += eye(name, radii, yaw, pitch, pupil, pupil * 1.12, lift=white * 1.15 - pupil * 0.27, dy=dy)
    return parts


def smile(name, radii, pitch, span, curl=0.16, r=0.02, dy=0.0):
    """A run of beads along the head surface."""
    n = max(6, int((2 * span * max(radii[0], radii[2])) / (r * 0.7)))
    beads = []
    for i in range(n + 1):
        t = (i / n) * 2 - 1
        x, y, z = on(radii, t * span, pitch + t * t * curl, 0.004)
        beads.append(role(sphere(f'{name}-{i}', x, y + dy, z, r, r, r * 0.6, segments=6, rings=4), 'eye'))
    return beads


def cheeks(name, radii, yaw, pitch, r, role_name='blush', dy=0.0):
    out = []
    for s in (-1, 1):
        x, y, z = on(radii, s * yaw, pitch, 0.005)
        out.append(role(sphere(f'{name}{s}', x, y + dy, z, r, r * 0.65, r * 0.4, segments=8, rings=6), role_name))
    return out


def torso(name, y, rx, ry, rz, hem=None, faces=420, hips=0.9, extra=None):
    """A pear-shaped body, shirt above the hem when a hem is given."""
    m = Meta(resolution=0.04)
    m.ellipsoid(0, y, 0, rx, ry, rz)
    m.ball(0, y - ry * 0.55, 0, min(rx, rz) * hips)
    for x, yy, z, r in extra or ():
        m.ball(x, yy, z, r)
    obj = m.build(name, faces)
    role(obj, 'fur')
    if hem is not None:
        bisect(obj, y=hem)
        role(obj, 'outfit', lambda x, yy, z: yy > hem)
    return obj


def limb(name, top, bottom, r, end_r, end_role, sleeve_y=None, faces=140, end_scale=(1, 1, 1), end_drop=0.35):
    """An arm or a leg: a capsule with a ball at the end, painted by height."""
    m = Meta(resolution=0.035)
    m.capsule(top, bottom, r)
    ex, ey, ez = bottom
    end_y = ey - end_r * end_drop
    m.ellipsoid(ex, end_y, ez + end_r * 0.2, end_r * end_scale[0], end_r * end_scale[1], end_r * end_scale[2])
    obj = m.build(name, faces)
    role(obj, 'fur')
    seam = ey - end_r * 0.05
    bisect(obj, y=seam)
    if sleeve_y is not None:
        bisect(obj, y=sleeve_y)
        role(obj, 'outfit', lambda x, y, z: y > sleeve_y)
    role(obj, end_role, lambda x, y, z: y < seam)
    return obj


def arms(spec_x, sleeve=True, hand='hand', r=0.13, hand_r=0.15, length=0.4, y=ARM_Y):
    out = []
    for side, name in ((-1, 'armL'), (1, 'armR')):
        obj = limb(name, (0, -0.02, 0), (0, -length, 0.03), r, hand_r, hand, sleeve_y=-0.15 if sleeve else None)
        finish(obj)
        pivot(obj, side * spec_x, y, 0.02)
        out.append(obj)
    return out


def legs(spec_x, foot='foot', r=0.15, foot_r=0.16, foot_scale=(1.1, 0.7, 1.35), faces=120):
    out = []
    for side, name in ((-1, 'legL'), (1, 'legR')):
        obj = limb(name, (0, 0.14, 0), (0, -0.02, 0), r, foot_r, foot, faces=faces, end_scale=foot_scale)
        finish(obj)
        pivot(obj, side * spec_x, LEG_Y, LEG_Z)
        out.append(obj)
    return out


def head_meta(radii, extras=None, faces=720, resolution=0.04, centre=(0, 0, 0)):
    m = Meta(resolution=resolution)
    m.ellipsoid(*centre, *radii)
    for x, y, z, r in extras or ():
        m.ball(x, y, z, r)
    obj = m.build('head', faces)
    role(obj, 'fur')
    return obj


def patch(name, role_name, elements, faces=160, resolution=0.03):
    """A smooth shape laid over the head (a muzzle, a face mask): metaball elements as
    (x, y, z, rx, ry, rz) tuples, painted one role."""
    m = Meta(resolution=resolution)
    for x, y, z, rx, ry, rz in elements:
        m.ellipsoid(x, y, z, rx, ry, rz)
    return role(m.build(name, faces), role_name)


def head_done(bits):
    head = join('head', bits)
    finish(head)
    pivot(head, 0, HEAD_Y, 0)
    return head


def ear_pair(make, x, y, z, tilt=0.0):
    """Two ear objects on pivots, built by `make(side)` around the origin."""
    out = []
    for s, name in ((-1, 'earL'), (1, 'earR')):
        ear = make(s)
        ear.name = name
        finish(ear)
        pivot(ear, s * x, HEAD_Y + y, z)
        if tilt:
            ear.rotation_euler = (0, -s * tilt, 0)
        out.append(ear)
    return out


def hat(y):
    return empty('hat', 0, HEAD_Y + y, 0)


# --- Cat -----------------------------------------------------------------------------------
def cat():
    H = (0.66, 0.6, 0.6)
    head = head_meta(H, extras=[(-0.26, -0.14, 0.42, 0.16), (0.26, -0.14, 0.42, 0.16)])
    bits = [head, patch('muzzle', 'pale', [(0, -0.2, 0.5, 0.27, 0.16, 0.16)])]
    for s in (-1, 1):
        bits += bigeye('eye', H, s * 0.52, 0.06, 0.15, 0.1)
        bx, by, bz = on(H, s * 0.32, 0.75, 0.012)
        bits.append(role(box('brow', bx, by, bz, 0.05, 0.16, 0.05, rx=0.75, rz=s * 0.2), 'deep'))
        for yy, ln in ((0.06, 0.2), (-0.06, 0.16)):
            cx, cy, cz = on(H, s * 1.1, yy, 0.012)
            bits.append(role(box('cheek', cx, cy, cz, ln, 0.05, 0.05, ry=-s * 1.1), 'deep'))
        for w in (-0.14, -0.04):
            bits.append(role(box('whisker', s * 0.42, -0.2 + w, 0.55, 0.32, 0.012, 0.012, ry=s * 0.55, rz=s * (w + 0.09) * 1.5), 'white'))
    fx, fy, fz = on(H, 0, 0.8, 0.012)
    bits.append(role(box('stripe', fx, fy, fz, 0.055, 0.22, 0.05, rx=0.8), 'deep'))
    bits.append(role(cone('nose', 0, -0.15, 0.68, 0.05, 0.065, sides=3, rx=math.pi), 'pink'))
    bits += smile('smile', H, -0.34, 0.14, 0.1, 0.014)
    parts = [head_done(bits)]

    def ear(s):
        outer = role(squash(cone('ear', 0, 0.3, 0, 0.32, 0.7, sides=4, ry=math.pi / 4), sz=0.5), 'fur')
        inner = role(squash(cone('inner', 0, 0.27, 0.09, 0.19, 0.48, sides=4, ry=math.pi / 4), sz=0.35), 'pink')
        return join('ear', [outer, inner])

    parts += ear_pair(ear, 0.42, 0.34, -0.06, tilt=0.22)
    body = torso('body', 0.72, 0.42, 0.4, 0.37, hem=0.56)
    parts.append(finish(body))
    tail_meta = Meta(resolution=0.035)
    curve = [(0, 0, 0), (0.12, 0.05, -0.3), (0.3, 0.3, -0.42), (0.36, 0.62, -0.36)]
    for a, b in zip(curve, curve[1:]):
        tail_meta.capsule(a, b, 0.085)
    tail = role(tail_meta.build('tail', 160), 'fur')
    rings = [role(sphere('ring', x, y, z, 0.1, segments=8, rings=6), 'deep') for (x, y, z) in ((0.08, 0.02, -0.2), (0.24, 0.2, -0.4), (0.34, 0.48, -0.38))]
    tail = finish(join('tail', [tail] + rings))
    pivot(tail, 0.1, 0.42, -0.3)
    parts.append(tail)
    parts += arms(0.42)
    parts += legs(0.2)
    parts.append(hat(0.45))
    return parts


# --- Monkey --------------------------------------------------------------------------------
def monkey():
    H = (0.64, 0.6, 0.6)
    head = head_meta(H)
    # The pale heart-shaped face: two lobes over the brows and a chin below.
    bits = [head, patch('mask', 'pale', [(-0.2, 0.16, 0.4, 0.26, 0.24, 0.2), (0.2, 0.16, 0.4, 0.26, 0.24, 0.2), (0, -0.1, 0.42, 0.4, 0.34, 0.2)], faces=260)]
    for s in (-1, 1):
        bits += bigeye('eye', H, s * 0.44, 0.08, 0.14, 0.095)
        bits.append(role(sphere('nostril', s * 0.04, -0.17, H[2] + 0.02, 0.025, 0.02, 0.02, segments=6, rings=4), 'deep'))
    bits += smile('smile', H, -0.44, 0.16, 0.1, 0.014)
    parts = [head_done(bits)]

    def ear(s):
        rim = role(sphere('ear', 0, 0, 0, 0.27, 0.27, 0.09), 'deep')
        inner = role(sphere('inner', s * 0.03, 0, 0.05, 0.17, 0.17, 0.06), 'pale')
        return join('ear', [rim, inner])

    parts += ear_pair(ear, 0.62, 0.1, -0.02)
    body = torso('body', 0.72, 0.42, 0.4, 0.37, hem=0.56)
    parts.append(finish(body))
    tail_meta = Meta(resolution=0.035)
    curve = [(0, 0, 0), (0, 0.3, -0.24), (0, 0.6, -0.04), (0, 0.5, 0.26), (0, 0.24, 0.32)]
    for a, b in zip(curve, curve[1:]):
        tail_meta.capsule(a, b, 0.06)
    tail = finish(role(tail_meta.build('tail', 200), 'fur'))
    pivot(tail, 0, 0.5, -0.34)
    parts.append(tail)
    parts += arms(0.42)
    parts += legs(0.2)
    parts.append(hat(0.45))
    return parts


# --- Frog ----------------------------------------------------------------------------------
def frog():
    H = (0.8, 0.54, 0.66)
    c = (0, -0.06, 0)
    head = head_meta(H, extras=[(-0.42, 0.3, 0.12, 0.23), (0.42, 0.3, 0.12, 0.23)], centre=c, faces=900)
    role(head, 'pale', lambda x, y, z: z > 0.3 and y < -0.18)
    bits = [head]
    for s in (-1, 1):
        bits.append(role(sphere('white', s * 0.43, 0.4, 0.3, 0.18, 0.17, 0.15, segments=10, rings=7), 'white'))
        bits.append(role(sphere('pupil', s * 0.44, 0.42, 0.43, 0.09, 0.1, 0.05, segments=8, rings=6), 'eye'))
        bits.append(role(sphere('light', s * 0.4, 0.47, 0.46, 0.025, segments=6, rings=4), 'white'))
        bits.append(role(sphere('nostril', s * 0.09, 0.04, H[2] - 0.02, 0.02, 0.015, 0.015, segments=6, rings=4), 'deep'))
    parts = [head_done(bits)]
    body = torso('body', 0.68, 0.5, 0.38, 0.42, hem=0.54, hips=0.85)
    parts.append(finish(body))
    for side, name in ((-1, 'armL'), (1, 'armR')):
        arm = limb(name, (0, -0.02, 0), (0, -0.4, 0.03), 0.13, 0.13, 'fur', sleeve_y=-0.15)
        fingers = [role(sphere('finger', t, -0.5, 0.1, 0.045, 0.04, 0.07, segments=6, rings=4), 'fur') for t in (-0.08, 0, 0.08)]
        arm = finish(join(name, [arm] + fingers))
        pivot(arm, side * 0.5, ARM_Y, 0.02)
        parts.append(arm)
    parts += legs(0.28, foot='fur', foot_scale=(1.2, 0.6, 1.5))
    parts.append(hat(0.65))
    return parts


# --- Bird ----------------------------------------------------------------------------------
def bird():
    H = (0.6, 0.58, 0.58)
    head = head_meta(H)
    bits = [head]
    for z, h, tilt in ((0.0, 0.46, -0.4), (-0.16, 0.4, -0.8), (-0.3, 0.3, -1.1)):
        bits.append(role(cone('crest', 0, H[1] - 0.04, z, 0.12, h + 0.1, sides=4, rx=tilt), 'deep'))
    for s in (-1, 1):
        bits += bigeye('eye', H, s * 0.5, 0.05, 0.15, 0.1)
    beak = cone('beak', 0, 0, 0, 0.16, 0.36, sides=4, ry=math.pi / 4)
    beak.data.transform(Matrix.Rotation(math.pi / 2, 4, 'X'))
    beak.data.transform(Matrix.Translation(Vector((0, -(H[2] + 0.1), -0.12))))
    bits.append(role(beak, 'accent'))
    bits.append(role(sphere('chin', 0, -0.3, 0.36, 0.34, 0.2, 0.2), 'pale'))
    parts = [head_done(bits)]
    body = torso('body', 0.72, 0.44, 0.42, 0.38)
    role(body, 'outfit', lambda x, y, z: y > 0.56)
    bisect(body, y=0.56)
    role(body, 'outfit', lambda x, y, z: y > 0.56)
    role(body, 'pale', lambda x, y, z: z > 0.2 and y > 0.5 and abs(x) < 0.3)
    bits = [body]
    for i in range(6):
        bits.append(role(box('zig', -0.21 + i * 0.085, 0.82, 0.38 * 1.02, 0.11, 0.035, 0.03, rz=(-0.7 if i % 2 else 0.7)), 'accent'))
    for s in (-1, 0, 1):
        bits.append(role(cone('feather', s * 0.12, 0.52 + abs(s) * 0.03, -0.38 - 0.2, 0.11, 0.5, sides=4, rx=-math.pi / 2 + 0.5, rz=s * 0.25), 'deep'))
    parts.append(finish(join('body', bits)))
    for s, name in ((-1, 'armL'), (1, 'armR')):
        wing = role(sphere(name, s * 0.02, -0.26, -0.03, 0.09, 0.36, 0.22, segments=10, rings=8), 'fur')
        tip = role(sphere('tip', s * 0.03, -0.56, -0.06, 0.07, 0.16, 0.19, segments=8, rings=6), 'deep')
        bars = [role(box('bar', s * 0.06, y, 0.02, 0.05, 0.035, 0.26), 'pale') for y in (-0.3, -0.42)]
        wing = finish(join(name, [wing, tip] + bars))
        pivot(wing, s * 0.42, ARM_Y, 0.02)
        parts.append(wing)
    for s, name in ((-1, 'legL'), (1, 'legR')):
        shin = role(cylinder(name, 0, 0.02, 0, 0.045, 0.3, sides=6), 'accent')
        toes = [role(box('toe', math.sin(t) * 0.09, -0.14, math.cos(t) * 0.1, 0.04, 0.035, 0.2, ry=-t), 'accent') for t in (-0.5, 0, 0.5)]
        toes.append(role(box('heel', 0, -0.14, -0.08, 0.04, 0.035, 0.12), 'accent'))
        leg = finish(join(name, [shin] + toes))
        pivot(leg, s * 0.16, LEG_Y, LEG_Z)
        parts.append(leg)
    parts.append(hat(0.43))
    return parts


# --- Axolotl -------------------------------------------------------------------------------
def axolotl():
    H = (0.7, 0.58, 0.6)
    head = head_meta(H)
    bits = [head]
    for s in (-1, 1):
        for i in range(3):
            angle = s * (0.45 + i * 0.5)
            y0 = 0.16 - i * 0.16
            ln = 0.46 - i * 0.05
            m = Meta(resolution=0.03)
            root = (s * (H[0] - 0.1), y0, -0.06)
            tip = (root[0] + math.sin(angle) * ln, y0 + math.cos(angle) * ln, -0.06)
            m.capsule(root, tip, 0.05, taper=0.7)
            for k in range(1, 4):
                t = k / 3.2
                m.ball(root[0] + math.sin(angle) * ln * t, y0 + math.cos(angle) * ln * t, -0.06, 0.09 - k * 0.012)
            bits.append(role(m.build('frond', 90), 'accent'))
        bits += bigeye('eye', H, s * 0.54, 0.04, 0.15, 0.1)
    bits += cheeks('cheek', H, 0.72, -0.22, 0.09)
    parts = [head_done(bits)]
    body = torso('body', 0.72, 0.42, 0.4, 0.37, hem=0.56)
    parts.append(finish(body))
    fin = role(squash(cone('tail', 0, 0.08, -0.34, 0.3, 0.8, sides=3, rx=-math.pi / 2 - 0.3), sx=1.1, sy=0.5), 'accent')
    inner = role(squash(cone('inner', 0, 0.08, -0.3, 0.3, 0.8, sides=3, rx=-math.pi / 2 - 0.3), sx=0.8, sy=0.52, sz=0.85), 'fur')
    tail = finish(join('tail', [fin, inner]))
    pivot(tail, 0, 0.4, -0.06)
    parts.append(tail)
    parts += arms(0.42, hand='fur')
    parts += legs(0.2, foot='fur')
    parts.append(hat(0.43))
    return parts


# --- Bear ----------------------------------------------------------------------------------
def bear():
    H = (0.68, 0.62, 0.62)
    head = head_meta(H)
    bits = [head, patch('muzzle', 'pale', [(0, -0.18, 0.5, 0.3, 0.22, 0.2)])]
    for s in (-1, 1):
        bits += bigeye('eye', H, s * 0.48, 0.14, 0.14, 0.095)
        bx, by, bz = on(H, s * 0.42, 0.44, 0.012)
        bits.append(role(box('brow', bx, by, bz, 0.16, 0.035, 0.04, rx=0.3, ry=-s * 0.4, rz=-s * 0.15), 'deep'))
    bits.append(role(sphere('nose', 0, -0.1, H[2] + 0.12, 0.09, 0.065, 0.06, segments=8, rings=6), 'accent'))
    bits += smile('smile', H, -0.42, 0.14, 0.08, 0.014)
    parts = [head_done(bits)]

    def ear(s):
        outer = role(sphere('ear', 0, 0, 0, 0.21, 0.21, 0.16), 'fur')
        inner = role(sphere('inner', 0, 0, 0.1, 0.12, 0.12, 0.06), 'pale')
        return join('ear', [outer, inner])

    parts += ear_pair(ear, 0.48, 0.5, -0.04)
    body = torso('body', 0.72, 0.5, 0.42, 0.42, hem=0.54)
    bits = [body, role(sphere('tail', 0, 0.48, -0.44, 0.13), 'fur')]
    parts.append(finish(join('body', bits)))
    parts += arms(0.5, hand='fur', r=0.16, hand_r=0.17)
    parts += legs(0.24, foot='foot', r=0.18, foot_r=0.18)
    parts.append(hat(0.47))
    return parts


# --- Rabbit --------------------------------------------------------------------------------
def rabbit():
    H = (0.62, 0.6, 0.58)
    head = head_meta(H, extras=[(0, -0.16, 0.46, 0.16)])
    bits = [head]
    for s in (-1, 1):
        bits += bigeye('eye', H, s * 0.48, 0.06, 0.15, 0.1)
    bits += cheeks('cheek', H, 0.7, -0.22, 0.1)
    bits.append(role(sphere('nose', 0, -0.12, H[2] + 0.02, 0.045, 0.035, 0.03, segments=8, rings=6), 'pink'))
    bits += smile('smile', H, -0.3, 0.14, 0.1, 0.013)
    parts = [head_done(bits)]

    def ear(s):
        outer = role(sphere('ear', 0, 0.42, 0, 0.16, 0.5, 0.11, segments=10, rings=8), 'fur')
        inner = role(sphere('inner', 0, 0.44, 0.07, 0.09, 0.36, 0.05, segments=8, rings=6), 'pink')
        return join('ear', [outer, inner])

    parts += ear_pair(ear, 0.25, 0.44, -0.02, tilt=0.14)
    body = torso('body', 0.72, 0.4, 0.4, 0.36, hem=0.56)
    bits = [body, role(sphere('tail', 0, 0.48, -0.4, 0.15), 'white')]
    parts.append(finish(join('body', bits)))
    parts += arms(0.4, hand='fur')
    parts += legs(0.19, foot='foot', foot_scale=(1.1, 0.7, 1.7))
    parts.append(hat(0.45))
    return parts


# --- Fish ----------------------------------------------------------------------------------
def fish():
    H = (0.7, 0.62, 0.6)
    head = head_meta(H)
    bits = [head]
    for s in (-1, 1):
        bits += bigeye('eye', H, s * 0.68, 0.05, 0.17, 0.11)
    bits.append(role(squash(torus('lips', 0, -0.2, H[2] + 0.02, 0.13, 0.055, segments=12, rings=6), sy=0.9, sz=0.7), 'accent'))
    for i in range(4):
        bits.append(role(cone('spine', 0, H[1] - 0.05 - i * 0.06, 0.18 - i * 0.16, 0.08, 0.3 - i * 0.03, sides=4, rx=-0.2 - i * 0.25), 'deep'))
    for yaw, pitch, r in ((0.3, 0.55, 0.075), (-0.5, 0.45, 0.06), (0.95, -0.35, 0.065), (-1.0, -0.3, 0.06), (0.15, 0.2, 0.04)):
        x, y, z = on(H, yaw, pitch, 0.004)
        bits.append(role(sphere('scale', x, y, z, r, r * 0.8, r * 0.35, segments=6, rings=4), 'deep'))
    parts = [head_done(bits)]
    body = torso('body', 0.72, 0.42, 0.4, 0.37, hem=0.5)
    bits = [body]
    for x, y in ((-0.2, 0.62), (0.24, 0.5), (0.05, 0.88)):
        bits.append(role(sphere('scale', x, y, -0.37 * 0.85, 0.06, 0.05, 0.03, segments=6, rings=4), 'deep'))
    for s in (-1, 1):
        bits.append(role(squash(cone('tailfin', 0, 0.62 + s * 0.14, -0.67, 0.3, 0.8, sides=3, rx=-math.pi / 2 + s * 0.6), sx=0.9, sy=0.5, sz=0.5), 'deep'))
    parts.append(finish(join('body', bits)))
    for s, name in ((-1, 'armL'), (1, 'armR')):
        fin = role(squash(cone(name, s * 0.05, -0.28, 0, 0.22, 0.5, sides=3, rx=math.pi, rz=s * 0.35), sz=0.45), 'deep')
        finish(fin)
        pivot(fin, s * 0.44, ARM_Y, 0.02)
        parts.append(fin)
    for s, name in ((-1, 'legL'), (1, 'legR')):
        stub = role(sphere(name, 0, 0.06, 0, 0.14, 0.18, 0.14), 'fur')
        fin = role(squash(cone('fin', 0, -0.1, 0.16, 0.22, 0.5, sides=3, rx=-math.pi / 2), sx=0.8, sy=0.5, sz=0.8), 'deep')
        leg = finish(join(name, [stub, fin]))
        pivot(leg, s * 0.2, LEG_Y, LEG_Z)
        parts.append(leg)
    parts.append(hat(0.45))
    return parts


# --- Blob ----------------------------------------------------------------------------------
def blob():
    m = Meta(resolution=0.045)
    m.ellipsoid(0, 0.7, 0, 0.82, 0.62, 0.7)
    m.ellipsoid(0, 1.28, 0, 0.6, 0.56, 0.52)
    body = m.build('body', 700)
    role(body, 'fur')
    bisect(body, y=1.04)
    role(body, 'lower', lambda x, y, z: y < 1.04)
    parts = [finish(body)]
    bits = []
    for s in (-1, 1):
        bits.append(role(sphere('white', s * 0.3, 0.06, 0.42, 0.14, 0.15, 0.12, segments=12, rings=8), 'white'))
        bits.append(role(sphere('eye', s * 0.31, 0.06, 0.51, 0.09, 0.105, 0.05, segments=8, rings=6), 'eye'))
        bits.append(role(sphere('light', s * 0.27, 0.11, 0.545, 0.028, segments=6, rings=4), 'white'))
        bits.append(role(sphere('cheek', s * 0.42, -0.06, 0.46, 0.08, 0.05, 0.04, segments=6, rings=4), 'deep'))
    parts.append(head_done(bits))
    for s, name in ((-1, 'armL'), (1, 'armR')):
        nub = finish(role(sphere(name, s * 0.06, -0.16, 0.02, 0.16, 0.24, 0.15), 'fur'))
        nub.rotation_euler = (0, 0, s * 0.3)
        pivot(nub, s * 0.78, ARM_Y, 0.02)
        parts.append(nub)
    for s, name in ((-1, 'legL'), (1, 'legR')):
        foot = finish(role(sphere(name, 0, -0.06, 0.1, 0.22, 0.1, 0.28), 'lower'))
        pivot(foot, s * 0.34, LEG_Y, LEG_Z)
        parts.append(foot)
    parts.append(hat(0.24))
    return parts


ASSETS = {'cat': cat, 'monkey': monkey, 'frog': frog, 'bird': bird, 'axolotl': axolotl, 'bear': bear, 'rabbit': rabbit, 'fish': fish, 'blob': blob}
for fn in ASSETS.values():
    fn.turnaround = True
