"""The island's buildings and props, after evidence/gpt/bigger map.png.

Every asset is one mesh named for the file, authored in game units with its origin on the
ground at its centre and facing +z (toward the camera). Colours are fixed (``c_<hex>``);
the client bakes them straight into the world. Trees and rocks come in variants.
"""
import math
import random
import bpy
import bmesh
from mathutils import Matrix, Vector
from kit import Meta, sphere, box, cone, cylinder, torus, colour, role, join, finish, flat, decimate, pivot, B

WOOD = '#a98456'
WOOD_DARK = '#7c6547'
WOOD_PALE = '#d9b47a'
POST = '#5f4b33'
IRON = '#3b3a3d'
CREAM = '#f6efe0'
ROOF_RED = '#c9534b'
ROOF_PLUM = '#6d3d5a'
TEAL = '#3f8f8a'
LEAF = ['#4f7f4c', '#5f9455', '#3f6f45', '#6ea25a']
TRUNK = '#7a6046'


def ico(name, x, y, z, r, subdivisions=1):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivisions, radius=r)
    obj = bpy.context.view_layer.objects.active
    obj.name = name
    obj.data.transform(Matrix.Translation(B(x, y, z)))
    return obj


def jitter(obj, amount, seed=1):
    rnd = random.Random(seed)
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    for v in bm.verts:
        v.co += Vector((rnd.uniform(-amount, amount), rnd.uniform(-amount, amount), rnd.uniform(-amount, amount)))
    bm.to_mesh(obj.data)
    bm.free()
    return obj


def scale_about(obj, sx, sy, sz, x=0, y=0, z=0):
    obj.data.transform(Matrix.Translation(-B(x, y, z)))
    obj.data.transform(Matrix.Diagonal(Vector((sx, sz, sy, 1))))
    obj.data.transform(Matrix.Translation(B(x, y, z)))
    return obj


def canopy(name, blobs, tone, faces=260, resolution=0.09):
    """A rounded, blobby canopy from balls; low poly so the facets read."""
    m = Meta(resolution=resolution)
    for x, y, z, r in blobs:
        m.ball(x, y, z, r)
    return colour(m.build(name, faces), tone)


# --- Trees ---------------------------------------------------------------------------------
def pine(variant=0):
    """A conifer: a trunk and three rounded tiers, darker at the bottom."""
    rnd = random.Random(10 + variant)
    trunk = colour(cylinder('trunk', 0, 1.0, 0, 0.32, 2.2, sides=7), TRUNK)
    tones = (['#3f6f45', '#4f7f4c', '#5f9455'], ['#446d4a', '#557f4f', '#6a9a5a'], ['#3b6640', '#4c7c48', '#5c8f52'])[variant % 3]
    tiers = []
    for i, (y, r, h) in enumerate(((2.4, 2.1, 2.4), (3.9, 1.6, 2.0), (5.1, 1.05, 1.6))):
        tier = cone(f'tier{i}', 0, y, 0, r, h, sides=7 + i, ry=rnd.uniform(0, 1))
        jitter(tier, 0.08, seed=variant * 3 + i)
        tiers.append(colour(tier, tones[i]))
    return [finish(join(f'pine{variant}', [trunk] + tiers))]


def roundtree(variant=0):
    """A broadleaf tree: a stout trunk and a blobby canopy."""
    rnd = random.Random(20 + variant)
    trunk = colour(cylinder('trunk', 0, 1.1, 0, 0.36, 2.4, sides=7), TRUNK)
    blobs = [(0, 3.3, 0, 1.6)]
    for i in range(5):
        a = rnd.uniform(0, math.tau)
        blobs.append((math.cos(a) * 1.0, 3.2 + rnd.uniform(-0.3, 0.7), math.sin(a) * 1.0, rnd.uniform(0.8, 1.15)))
    tone = LEAF[variant % len(LEAF)]
    top = canopy('canopy', blobs, tone, faces=300)
    return [finish(join(f'roundtree{variant}', [trunk, top]))]


def orchardtree():
    trunk = colour(cylinder('trunk', 0, 0.9, 0, 0.28, 1.8, sides=7), TRUNK)
    top = canopy('canopy', [(0, 2.7, 0, 1.5), (0.7, 3.2, -0.3, 1.0), (-0.6, 3.0, 0.5, 0.9)], '#6f9a4a', faces=260)
    fruit = []
    rnd = random.Random(7)
    for i in range(9):
        a = rnd.uniform(0, math.tau)
        r = 1.35
        fruit.append(colour(sphere(f'apple{i}', math.cos(a) * r, 2.7 + math.sin(a * 1.7) * 0.8, math.sin(a) * r, 0.17, segments=7, rings=5), '#e0574f' if i % 2 else '#f0a04b'))
    return [finish(join('orchardtree', [trunk, top] + fruit))]


def bush(variant=0):
    rnd = random.Random(30 + variant)
    blobs = [(0, 0.45, 0, 0.55)] + [(rnd.uniform(-0.4, 0.4), 0.4 + rnd.uniform(0, 0.25), rnd.uniform(-0.4, 0.4), rnd.uniform(0.3, 0.45)) for _ in range(4)]
    top = canopy('bush', blobs, LEAF[(variant + 1) % len(LEAF)], faces=140, resolution=0.06)
    flowers = [colour(sphere(f'fl{i}', rnd.uniform(-0.4, 0.4), 0.7 + rnd.uniform(0, 0.2), rnd.uniform(-0.4, 0.4), 0.09, segments=6, rings=4), '#f3d986' if i % 2 else '#e7a0b3') for i in range(4)]
    return [finish(join(f'bush{variant}', [top] + flowers))]


# --- Rocks ---------------------------------------------------------------------------------
def rock(variant=0):
    rnd = random.Random(40 + variant)
    obj = ico(f'rock{variant}', 0, 0.55, 0, 1.0, subdivisions=1)
    jitter(obj, 0.16, seed=variant)
    scale_about(obj, rnd.uniform(0.9, 1.4), rnd.uniform(0.6, 0.9), rnd.uniform(0.8, 1.2), 0, 0.55, 0)
    colour(obj, ('#7d8387', '#8a9094', '#6f7579')[variant % 3])
    return [finish(obj)]


# --- Buildings -----------------------------------------------------------------------------
def house():
    """Home and the Bait Shop: white walls, a steep red roof, a chimney and a blue door."""
    bits = [colour(box('walls', 0, 1.5, 0, 4.2, 3.0, 4.2), CREAM)]
    bits.append(colour(box('base', 0, 0.2, 0, 4.4, 0.4, 4.4), '#b9a98c'))
    roof = cone('roof', 0, 4.0, 0, 3.6, 2.2, sides=4, ry=math.pi / 4)
    bits.append(colour(roof, ROOF_RED))
    bits.append(colour(box('eave', 0, 2.95, 0, 4.9, 0.18, 4.9), '#a8433d'))
    bits.append(colour(box('chimney', 1.2, 4.0, -0.9, 0.55, 1.5, 0.55), '#8c7265'))
    bits.append(colour(box('door', 0, 0.95, 2.13, 1.1, 1.9, 0.12), '#3f6f8f'))
    bits.append(colour(sphere('knob', 0.35, 0.95, 2.2, 0.06, segments=6, rings=4), '#e8c369'))
    for x in (1.25, -1.35):
        bits.append(colour(box('frame', x, 1.7, 2.12, 1.0, 1.0, 0.1), '#8c7265'))
        bits.append(colour(box('glass', x, 1.7, 2.16, 0.8, 0.8, 0.06), '#a6d9d0'))
        bits.append(colour(box('sill', x, 1.15, 2.2, 1.1, 0.1, 0.2), '#8c7265'))
    bits.append(colour(box('step', 0, 0.1, 2.5, 1.5, 0.2, 0.7), '#b9a98c'))
    return [finish(join('house', bits))]


def threads():
    """Threads, the wardrobe shop: cream walls, a plum roof, a striped awning and a sign."""
    bits = [colour(box('walls', 0, 1.6, 0, 4.6, 3.2, 4.6), '#f3e6d2')]
    bits.append(colour(box('base', 0, 0.2, 0, 4.8, 0.4, 4.8), '#b9a98c'))
    bits.append(colour(cone('roof', 0, 4.2, 0, 3.9, 2.2, sides=4, ry=math.pi / 4), ROOF_PLUM))
    bits.append(colour(box('eave', 0, 3.15, 0, 5.2, 0.18, 5.2), '#563049'))
    bits.append(colour(box('door', 0, 1.05, 2.33, 1.2, 2.1, 0.12), '#4a3b5c'))
    for x in (-1.45, 1.45):
        bits.append(colour(box('frame', x, 1.75, 2.32, 1.15, 1.05, 0.1), '#8c7265'))
        bits.append(colour(box('glass', x, 1.75, 2.36, 0.95, 0.85, 0.06), '#a6d9d0'))
    for i in range(8):
        stripe = box('stripe', -1.925 + i * 0.55, 2.6, 2.7, 0.55, 0.08, 1.1, rx=0.35)
        bits.append(colour(stripe, TEAL if i % 2 else '#f7f1e8'))
    bits.append(colour(box('sign', 0, 3.1, 2.4, 2.8, 0.6, 0.1), '#f7f1e8'))
    bits.append(colour(box('signline', 0, 3.1, 2.46, 2.2, 0.08, 0.04), '#4a3b5c'))
    bits.append(colour(torus('hanger', 0.9, 3.2, 2.47, 0.16, 0.035, segments=10, rings=5), '#4a3b5c'))
    return [finish(join('threads', bits))]


def lighthouse():
    """A tapered white tower with red bands, a gallery, a lamp room and a green cap."""
    bits = [colour(cylinder('tower', 0, 4.0, 0, 1.35, 8.0, sides=10), CREAM)]
    scale_about(bits[0], 1, 1, 1)
    bits.append(colour(cylinder('band1', 0, 2.2, 0, 1.4, 0.9, sides=10), ROOF_RED))
    bits.append(colour(cylinder('band2', 0, 5.4, 0, 1.32, 0.9, sides=10), ROOF_RED))
    bits.append(colour(cylinder('gallery', 0, 7.7, 0, 1.7, 0.4, sides=10), '#a9684d'))
    bits.append(colour(torus('rail', 0, 8.3, 0, 1.6, 0.05, segments=12, rings=5, rx=math.pi / 2), IRON))
    for i in range(8):
        a = i / 8 * math.tau
        bits.append(colour(cylinder('baluster', math.cos(a) * 1.6, 8.05, math.sin(a) * 1.6, 0.04, 0.5, sides=5), IRON))
    bits.append(colour(cylinder('lamp', 0, 8.6, 0, 0.95, 0.9, sides=8), '#fff2b8'))
    bits.append(colour(cone('cap', 0, 9.9, 0, 1.75, 1.8, sides=10), '#456d64'))
    bits.append(colour(sphere('finial', 0, 10.9, 0, 0.14, segments=6, rings=4), IRON))
    bits.append(colour(box('door', 0, 0.9, 1.3, 0.9, 1.8, 0.2), '#4a3b5c'))
    return [finish(join('lighthouse', bits))]


# --- Furniture and small props ----------------------------------------------------------------
def bench():
    bits = [colour(box('seat', 0, 0.5, 0, 2.0, 0.12, 0.6), WOOD), colour(box('back', 0, 0.95, -0.3, 2.0, 0.5, 0.1), WOOD)]
    for x in (-0.8, 0.8):
        bits.append(colour(box('leg', x, 0.24, 0.15, 0.14, 0.48, 0.14), POST))
        bits.append(colour(box('leg', x, 0.24, -0.2, 0.14, 0.48, 0.14), POST))
    bits.append(colour(box('slat', 0, 0.78, -0.33, 2.0, 0.04, 0.06), WOOD_DARK))
    return [finish(join('bench', bits))]


def picnic():
    bits = [colour(box('top', 0, 0.74, 0, 1.0, 0.08, 2.6), WOOD)]
    for x in (-0.95, 0.95):
        bits.append(colour(box('seat', x, 0.42, 0, 0.44, 0.07, 2.6), WOOD))
    for z in (-0.9, 0.9):
        bits.append(colour(box('legA', 0, 0.36, z, 0.7, 0.72, 0.1, rz=0.35), WOOD_DARK))
        bits.append(colour(box('legB', 0, 0.36, z, 0.7, 0.72, 0.1, rz=-0.35), WOOD_DARK))
    bits.append(colour(box('cloth', 0, 0.8, -0.4, 0.34, 0.24, 0.34), '#e0574f'))
    return [finish(join('picnic', bits))]


def stump():
    bits = [colour(cylinder('stump', 0, 0.25, 0, 0.4, 0.5, sides=9), WOOD_DARK), colour(cylinder('top', 0, 0.51, 0, 0.36, 0.04, sides=9), WOOD_PALE)]
    return [finish(join('stump', bits))]


def campfire():
    bits = [colour(cylinder('ash', 0, 0.03, 0, 0.55, 0.06, sides=10), '#3d3630')]
    for i in range(8):
        a = i / 8 * math.tau
        stone = ico(f'stone{i}', math.cos(a) * 0.7, 0.14, math.sin(a) * 0.7, 0.2, subdivisions=1)
        jitter(stone, 0.04, seed=i)
        bits.append(colour(stone, '#8e948c' if i % 2 else '#a3a89a'))
    for a in (0.3, 1.4, 2.5):
        bits.append(colour(cylinder('log', 0, 0.16, 0, 0.09, 0.9, sides=6, rz=math.pi / 2, ry=a), '#6d4f33'))
    return [finish(join('campfire', bits))]


def board():
    """A drawing board: two posts, a framed white board tilted back, a chalk shelf. The frame
    is a role so each board around the plaza gets its own colour."""
    bits = []
    for x in (-1.15, 1.15):
        bits.append(colour(box('post', x, 1.15, 0, 0.11, 2.3, 0.11), WOOD_DARK))
    bits.append(role(box('frame', 0, 1.95, 0.02, 2.6, 2.0, 0.1, rx=-0.12), 'frame'))
    bits.append(colour(box('face', 0, 1.95, 0.07, 2.36, 1.77, 0.05, rx=-0.12), '#f6f0e1'))
    bits.append(colour(box('shelf', 0, 1.0, 0.45, 2.3, 0.06, 0.36), WOOD_DARK))
    return [finish(join('board', bits))]


def notice():
    bits = [colour(box('post', x, 1.0, 0, 0.12, 2.0, 0.12), WOOD_DARK) for x in (-0.9, 0.9)]
    bits.append(colour(box('face', 0, 1.5, 0.02, 2.0, 1.2, 0.1), '#b9a98c'))
    bits.append(colour(box('paper', 0, 1.5, 0.08, 1.7, 0.95, 0.03), '#f6efe0'))
    bits.append(colour(box('roof', 0, 2.3, 0.1, 2.3, 0.1, 0.7, rx=0.2), ROOF_RED))
    return [finish(join('notice', bits))]


def bed():
    """A raised garden bed with soil and rows of greens."""
    bits = [colour(box('box', 0, 0.18, 0, 1.1, 0.36, 1.5), WOOD_DARK), colour(box('soil', 0, 0.34, 0, 0.9, 0.06, 1.3), '#5d4a36')]
    for d in (-0.45, -0.15, 0.15, 0.45):
        bits.append(colour(sphere('green', 0.22, 0.5, d, 0.16, 0.14, 0.16, segments=7, rings=5), '#78b45a'))
        bits.append(colour(cone('carrot', -0.22, 0.5, d, 0.1, 0.3, sides=5), '#e88a3a'))
    return [finish(join('bed', bits))]


def can():
    bits = [colour(cylinder('body', 0, 0.25, 0, 0.28, 0.5, sides=9), '#5aa2c7'), colour(cylinder('spout', 0.42, 0.42, 0, 0.05, 0.6, sides=5, rz=-0.9), '#5aa2c7'), colour(torus('handle', 0, 0.55, 0, 0.2, 0.03, segments=10, rings=5, rx=math.pi / 2), '#4a8bb0')]
    return [finish(join('can', bits))]


def lamp():
    """A plaza lamp post: an iron post with a glass box and a little roof."""
    bits = [colour(cylinder('post', 0, 1.1, 0, 0.07, 2.2, sides=6), IRON), colour(box('foot', 0, 0.08, 0, 0.3, 0.16, 0.3), IRON)]
    bits.append(colour(box('base', 0, 2.2, 0, 0.44, 0.06, 0.44), IRON))
    for sx in (-1, 1):
        for sz in (-1, 1):
            bits.append(colour(box('bar', sx * 0.2, 2.42, sz * 0.2, 0.04, 0.44, 0.04), IRON))
    bits.append(colour(box('top', 0, 2.65, 0, 0.46, 0.05, 0.46), IRON))
    bits.append(colour(cone('cap', 0, 2.8, 0, 0.36, 0.3, sides=4, ry=math.pi / 4), IRON))
    return [finish(join('lamp', bits))]


def crate():
    bits = [colour(box('box', 0, 0.35, 0, 0.7, 0.7, 0.7), WOOD)]
    for y in (0.12, 0.58):
        bits.append(colour(box('band', 0, y, 0, 0.74, 0.06, 0.74), WOOD_DARK))
    return [finish(join('crate', bits))]


def bollard():
    bits = [colour(box('post', 0, 1.4, 0, 0.28, 2.8, 0.28), WOOD_DARK), colour(cylinder('cap', 0, 2.85, 0, 0.2, 0.12, sides=8), POST)]
    return [finish(join('bollard', bits))]


def buoy():
    bits = [colour(sphere('float', 0, 0.3, 0, 0.55, 0.5, 0.55, segments=9, rings=7), '#e0574f'), colour(cylinder('band', 0, 0.42, 0, 0.5, 0.2, sides=10), '#f4f1e6'), colour(cylinder('post', 0, 1.2, 0, 0.06, 1.1, sides=5), '#4d3b2a'), colour(box('flag', 0.16, 1.65, 0, 0.42, 0.28, 0.04), '#e9b949')]
    return [finish(join('buoy', bits))]


def boat():
    """The rowboat: a pale hull, a dark floor slab, rims, a stern board, two seats, a bow
    wedge and an oar. Every part sinks a little into its neighbour: no two faces share a
    plane, so nothing fights for depth as the boat bobs."""
    body = colour(box('hull', 0, 0.275, 0, 1.35, 0.45, 3.1), '#b98e58')  # y 0.05..0.5
    bits = [body, colour(box('floor', 0, 0.535, -0.03, 1.12, 0.09, 2.96), '#6d4f33')]  # y 0.49..0.58, into the rims and stern
    for x in (-0.62, 0.62):
        bits.append(colour(box('rim', x, 0.62, 0, 0.14, 0.36, 3.1), '#8e6b43'))  # y 0.44..0.8
    bits.append(colour(box('stern', 0, 0.62, -1.5, 1.35, 0.36, 0.14), '#8e6b43'))
    bow = cone('bow', 0, 0, 0, 1.0, 1.1, sides=4, ry=math.pi / 4)
    # Squash the base's depth (Blender y) to the hull's height, keep the length (Blender z): a low wedge.
    bow.data.transform(Matrix.Diagonal(Vector((0.955, 0.318, 1, 1))))
    bow.data.transform(Matrix.Rotation(math.pi / 2, 4, 'X'))
    bow.data.transform(Matrix.Translation(B(0, 0.275, 2.08)))
    bits.append(colour(bow, '#b98e58'))
    for z in (-0.8, 0.5):
        bits.append(colour(box('seat', 0, 0.615, z, 1.16, 0.09, 0.32), WOOD_PALE))  # y 0.57..0.66, ends inside the rims
    bits.append(colour(cylinder('oar', 0.6, 0.72, 0.1, 0.04, 2.4, sides=5, rz=math.pi / 2, ry=0.3), '#e2c88f'))
    return [finish(join('boat', bits))]


def dog():
    """A small brown-and-cream dog sitting up: body, a head on a neck pivot and a tail on
    its own pivot, so it can look about and wag."""
    m = Meta(resolution=0.035)
    m.ellipsoid(0, 0.45, 0, 0.3, 0.32, 0.42)
    m.ball(0, 0.72, 0.22, 0.18)
    body = colour(m.build('dog', 360), '#b9895a')
    bits = [body, colour(sphere('chest', 0, 0.42, 0.3, 0.2, 0.26, 0.16), '#f2e3c7')]
    for s in (-1, 1):
        bits.append(colour(sphere('paw', s * 0.16, 0.08, 0.32, 0.09, 0.07, 0.12), '#f2e3c7'))
    body = finish(join('dog', bits))
    hm = Meta(resolution=0.03)
    hm.ball(0, 0, 0, 0.25)
    hm.ball(0, -0.07, 0.22, 0.14)
    head = colour(hm.build('doghead', 260), '#b9895a')
    hbits = [head, colour(sphere('muzzle', 0, -0.09, 0.26, 0.11, 0.09, 0.08), '#f2e3c7'), colour(sphere('nose', 0, -0.05, 0.36, 0.045, segments=6, rings=4), '#3b2f28')]
    for s in (-1, 1):
        hbits.append(colour(sphere('eye', s * 0.1, 0.05, 0.2, 0.035, segments=6, rings=4), '#2c3034'))
        hbits.append(colour(cone('ear', s * 0.2, 0.22, -0.05, 0.09, 0.26, sides=4, rz=-s * 0.3), '#8c6444'))
    head = finish(join('doghead', hbits))
    pivot(head, 0, 0.85, 0.3)
    tail = finish(colour(cone('dogtail', 0, 0.18, -0.1, 0.06, 0.4, sides=5, rx=-1.2), '#8c6444'))
    pivot(tail, -0.1, 0.5, -0.42)
    return [body, head, tail]


def fence():
    """One fence bay: two posts and two rails, 1.5 long along z, centred."""
    bits = [colour(box('post', 0, 0.55, z, 0.14, 1.1, 0.14), '#b89f74') for z in (-0.75, 0.75)]
    for y in (0.45, 0.85):
        bits.append(colour(box('rail', 0, y, 0, 0.08, 0.08, 1.5), '#c9b48b'))
    return [finish(join('fence', bits))]


def shell():
    m = Meta(resolution=0.02)
    m.ellipsoid(0, 0.06, 0, 0.16, 0.08, 0.14)
    obj = colour(m.build('shell', 60), '#f4dcc2')
    return [finish(obj)]


def lily():
    bits = [colour(cylinder('pad', 0, 0.02, 0, 0.42, 0.04, sides=7), '#7fae55'), colour(sphere('flower', 0.1, 0.1, 0.05, 0.09, 0.08, 0.09, segments=6, rings=4), '#e7a0b3')]
    return [finish(join('lily', bits))]


def reed():
    bits = [colour(cylinder('stalk', 0, 0.55, 0, 0.04, 1.1, sides=5), '#6f8a62'), colour(sphere('head', 0, 1.12, 0, 0.09, 0.16, 0.09, segments=6, rings=4), '#8a6a4b')]
    return [finish(join('reed', bits))]


def signpost():
    """The contest sign: a post with a board and a bullseye."""
    bits = [colour(cylinder('post', 0, 0.7, 0, 0.07, 1.4, sides=6), WOOD_DARK), colour(box('board', 0, 1.5, 0, 1.5, 0.8, 0.1), WOOD_PALE)]
    bits.append(colour(torus('ring', 0, 1.5, 0.08, 0.28, 0.05, segments=12, rings=5), '#e0574f'))
    bits.append(colour(cylinder('bull', 0, 1.5, 0.09, 0.12, 0.04, sides=10, rx=math.pi / 2), '#e0574f'))
    return [finish(join('signpost', bits))]


ASSETS = {
    'pine0': lambda: pine(0),
    'pine1': lambda: pine(1),
    'pine2': lambda: pine(2),
    'roundtree0': lambda: roundtree(0),
    'roundtree1': lambda: roundtree(1),
    'orchardtree': orchardtree,
    'bush0': lambda: bush(0),
    'bush1': lambda: bush(1),
    'rock0': lambda: rock(0),
    'rock1': lambda: rock(1),
    'rock2': lambda: rock(2),
    'house': house,
    'threads': threads,
    'lighthouse': lighthouse,
    'bench': bench,
    'picnic': picnic,
    'stump': stump,
    'campfire': campfire,
    'board': board,
    'notice': notice,
    'bed': bed,
    'can': can,
    'lamp': lamp,
    'crate': crate,
    'bollard': bollard,
    'buoy': buoy,
    'boat': boat,
    'dog': dog,
    'fence': fence,
    'shell': shell,
    'lily': lily,
    'reed': reed,
    'signpost': signpost,
}
