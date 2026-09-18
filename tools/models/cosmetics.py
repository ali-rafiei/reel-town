"""Hats and accessories, after evidence/gpt/accessories.png: one file of parts. Hats are
authored around the hat anchor (the top of the head, brim at y 0) for a head about 0.6
wide; the client scales them to each animal. Accessories are authored in head or body
space as noted. Roles: ``outfit`` follows the clothing colour; the rest are fixed.
"""
import math
from mathutils import Matrix, Vector
from kit import Meta, sphere, box, cone, cylinder, torus, role, colour, join, finish, transform


def squash(obj, sx=1, sy=1, sz=1):
    obj.data.transform(Matrix.Diagonal(Vector((sx, sz, sy, 1))))
    return obj


def flatten(obj, x=0, y=0, z=0, sx=1, sy=1, sz=1):
    """Squashes a piece about its own centre and then places it. The primitives bake their
    position into the mesh, so squashing a piece that has already been placed would drag it
    back toward the origin: build it at the origin, squash it, then move it."""
    squash(obj, sx, sy, sz)
    return transform(obj, x, y, z)


def beanie():
    dome = role(squash(sphere('dome', 0, 0.02, 0, 0.52, 0.52, 0.5), sy=0.6), 'outfit')
    return finish(join('hat_beanie', [dome, colour(torus('brim', 0, 0.0, 0, 0.5, 0.06, segments=14, rings=6, rx=math.pi / 2), '#f2e3c7'), colour(sphere('bobble', 0, 0.36, 0, 0.11, segments=8, rings=6), '#f5dc97')]))


def bucket():
    top = role(cone('crown', 0, 0.14, 0, 0.42, 0.3, sides=12, r2=0.33), 'outfit')
    brim = role(cylinder('brim', 0, -0.01, 0, 0.64, 0.06, sides=14), 'outfit')
    return finish(join('hat_bucket', [top, brim]))


def captain():
    return finish(join('hat_captain', [colour(cone('crown', 0, 0.12, 0, 0.47, 0.22, sides=12, r2=0.4), '#f4ecd5'), colour(box('peak', 0, 0.0, 0.34, 0.66, 0.06, 0.4), '#354d58'), colour(torus('band', 0, 0.03, 0, 0.46, 0.035, segments=14, rings=5, rx=math.pi / 2), '#354d58'), colour(sphere('badge', 0, 0.15, 0.45, 0.07, segments=8, rings=6), '#e8c369')]))


def traffic_cone():
    """A road cone worn as a hat: square base, tapered body, two reflective bands."""
    base_r, tip_r, height = 0.28, 0.05, 0.84

    def radius_at(y):
        return base_r + (tip_r - base_r) * (y / height)

    bits = [
        colour(box('base', 0, 0.03, 0, 0.66, 0.07, 0.66), '#2f3438'),
        colour(box('lip', 0, 0.09, 0, 0.52, 0.05, 0.52), '#e4682f'),
        colour(cone('body', 0, height / 2 + 0.06, 0, base_r, height, sides=12, r2=tip_r), '#e4682f'),
    ]
    for i, y in enumerate((0.33, 0.55)):
        bits.append(colour(torus(f'band{i}', 0, y, 0, radius_at(y - 0.06) + 0.012, 0.045, segments=14, rings=5, rx=math.pi / 2), '#f2ece0'))
    return finish(join('hat_cone', bits))


def party_hat():
    """A birthday cone after the sprite: teal with cream and butter spots, a cream brim
    and a coral pom on the point."""
    teal, cream, butter, coral = '#49b3ab', '#f4ecd8', '#f2d98a', '#f2724e'
    height, base_r = 0.82, 0.33
    bits = [colour(cone('cone', 0, height / 2 + 0.02, 0, base_r, height, sides=14), teal), colour(torus('brim', 0, 0.05, 0, base_r + 0.015, 0.055, segments=16, rings=6, rx=math.pi / 2), cream)]
    # Spots sit on the cone's surface, shrinking with it as they climb.
    spots = ((0.0, 0.18, 0.085, cream), (2.2, 0.24, 0.075, butter), (4.1, 0.17, 0.08, butter), (1.1, 0.42, 0.065, cream), (3.4, 0.46, 0.06, cream), (5.2, 0.38, 0.055, butter), (2.6, 0.62, 0.042, cream))
    for i, (angle, y, r, tone) in enumerate(spots):
        surface = base_r * (1 - (y - 0.02) / height)
        bits.append(colour(sphere(f'spot{i}', math.cos(angle) * surface, y, math.sin(angle) * surface, r, r, r * 0.35, segments=8, rings=6), tone))
    bits.append(colour(sphere('pom', 0, height + 0.04, 0, 0.12, 0.11, 0.12, segments=10, rings=8), coral))
    for i in range(5):
        a = i * math.tau / 5
        bits.append(colour(sphere(f'puff{i}', math.cos(a) * 0.09, height + 0.04, math.sin(a) * 0.09, 0.065, segments=6, rings=5), coral))
    return finish(join('hat_party', bits))


def flower():
    bits = [colour(torus('crown', 0, 0, 0, 0.46, 0.06, segments=14, rings=6, rx=math.pi / 2), '#54835b')]
    for i in range(6):
        t = i * math.pi / 3
        x, z = math.cos(t) * 0.46, math.sin(t) * 0.46
        for k in range(5):
            a = k * math.tau / 5
            bits.append(colour(sphere(f'petal{i}{k}', x + math.cos(a) * 0.07, 0.06, z + math.sin(a) * 0.07, 0.05, 0.03, 0.05, segments=6, rings=4), '#f3d986' if i % 2 else '#da94b2'))
        bits.append(colour(sphere(f'heart{i}', x, 0.08, z, 0.045, segments=6, rings=4), '#e0574f' if i % 2 else '#f7f1e8'))
    return finish(join('hat_flower', bits))


def beret():
    return finish(join('hat_beret', [role(squash(sphere('beret', 0.08, 0.0, -0.04, 0.54, 0.54, 0.5), sy=0.42), 'outfit'), role(torus('band', 0, -0.06, 0, 0.42, 0.04, segments=14, rings=5, rx=math.pi / 2), 'outfitDark'), role(sphere('stalk', 0.05, 0.2, -0.04, 0.05, segments=6, rings=4), 'outfit')]))


def straw():
    return finish(join('hat_straw', [colour(cone('crown', 0, 0.14, 0, 0.42, 0.3, sides=12, r2=0.34), '#e8cf8a'), colour(cylinder('brim', 0, -0.01, 0, 0.82, 0.05, sides=16), '#e8cf8a'), colour(torus('band', 0, 0.06, 0, 0.41, 0.045, segments=14, rings=5, rx=math.pi / 2), '#3f8f8a')]))


def scarf():
    """In body space, wrapped round the neck (y ~1.05) with the tail down the front."""
    wool, shade, fringe_colour = '#d4674a', '#b9503a', '#f0d9b5'
    bits = [
        colour(flatten(torus('loop', 0, 0, 0, 0.34, 0.11, segments=16, rings=7, rx=math.pi / 2), y=1.0, sy=0.8), wool),
        colour(flatten(torus('wrap', 0, 0, 0, 0.33, 0.095, segments=16, rings=7, rx=math.pi / 2, rz=0.12), y=0.88, sy=0.75), shade),
        colour(sphere('knot', 0.2, 0.9, 0.26, 0.1, 0.095, 0.09, segments=10, rings=7), wool),
        colour(box('tail', 0.22, 0.72, 0.31, 0.15, 0.34, 0.09, rz=-0.16), wool),
        colour(box('tailend', 0.26, 0.52, 0.31, 0.15, 0.2, 0.09, rz=-0.34), shade),
    ]
    for i, x in enumerate((-0.045, 0, 0.045)):
        bits.append(colour(box(f'fringe{i}', 0.29 + x, 0.41, 0.31, 0.04, 0.09, 0.07), fringe_colour))
    return finish(join('acc_scarf', bits))


def backpack():
    """In body space: a round pack on the back, with straps over both shoulders."""
    canvas, leather, brass = '#b8895a', '#7f5c39', '#e8c369'
    bits = [
        colour(sphere('bag', 0, 0.66, -0.62, 0.28, 0.3, 0.22, segments=12, rings=8), canvas),
        colour(box('base', 0, 0.44, -0.62, 0.48, 0.18, 0.36), canvas),
        colour(box('flap', 0, 0.9, -0.64, 0.54, 0.13, 0.4, rx=0.12), leather),
        colour(box('lid', 0, 0.82, -0.44, 0.44, 0.16, 0.14, rx=0.3), leather),
        colour(box('buckle', 0, 0.76, -0.42, 0.1, 0.09, 0.06), brass),
        colour(box('pocket', 0, 0.56, -0.82, 0.3, 0.24, 0.08), leather),
        colour(torus('grab', 0, 0.98, -0.66, 0.07, 0.028, segments=10, rings=5, rx=math.pi / 2), leather),
    ]
    for s in (-1, 1):
        bits.append(colour(box(f'shoulder{s}', s * 0.19, 1.0, -0.06, 0.09, 0.1, 0.5, rx=0.1), leather))
        bits.append(colour(box(f'strap{s}', s * 0.19, 0.82, 0.26, 0.09, 0.42, 0.09, rz=s * 0.06), leather))
        bits.append(colour(box(f'side{s}', s * 0.27, 0.62, -0.62, 0.08, 0.26, 0.26), leather))
    bits.append(colour(box('chest', 0, 0.84, 0.3, 0.42, 0.06, 0.06), leather))
    bits.append(colour(sphere('clip', 0, 0.84, 0.33, 0.055, segments=8, rings=6), brass))
    return finish(join('acc_backpack', bits))


def satchel():
    """In body space: a bag on the right hip, on a strap over the left shoulder."""
    canvas, leather, brass = '#cfa463', '#8c6a3f', '#e8c369'
    bits = [
        colour(box('bag', 0.42, 0.54, -0.02, 0.26, 0.4, 0.42), canvas),
        colour(box('flap', 0.42, 0.72, -0.02, 0.29, 0.14, 0.45), leather),
        colour(box('front', 0.56, 0.6, -0.02, 0.05, 0.22, 0.4), leather),
        colour(box('buckle', 0.58, 0.58, -0.02, 0.06, 0.1, 0.1), brass),
        colour(box('gusset', 0.42, 0.33, -0.02, 0.26, 0.06, 0.42), leather),
        colour(box('strapfront', 0.08, 0.84, 0.3, 0.1, 0.74, 0.07, rz=0.66), leather),
        colour(box('strapback', 0.08, 0.84, -0.3, 0.1, 0.74, 0.07, rz=-0.66), leather),
        colour(box('shoulder', -0.21, 1.04, 0, 0.1, 0.09, 0.56), leather),
        colour(box('slide', 0.3, 0.63, 0.29, 0.1, 0.09, 0.05, rz=0.66), brass),
    ]
    return finish(join('acc_satchel', bits))


def bandana():
    """In body space: knotted at the neck with the cloth hanging over the chest."""
    cloth, shade, dot = '#4f7fc7', '#3c66a6', '#f7f1e8'
    bits = [
        colour(flatten(torus('band', 0, 0, 0, 0.32, 0.075, segments=16, rings=6, rx=math.pi / 2), y=1.0, sy=0.7), cloth),
        colour(flatten(cone('cloth', 0, 0, 0, 0.32, 0.28, sides=3, rx=math.pi / 2, ry=math.pi), y=0.82, z=0.4, sz=0.2), cloth),
        colour(sphere('knot', 0.24, 0.94, 0.24, 0.09, 0.085, 0.08, segments=10, rings=7), shade),
        colour(box('tailA', 0.28, 0.83, 0.25, 0.08, 0.18, 0.05, rz=-0.35), shade),
        colour(box('tailB', 0.33, 0.74, 0.23, 0.07, 0.14, 0.05, rz=-0.6), shade),
    ]
    for i, (x, y) in enumerate(((-0.1, 0.78), (0.09, 0.72), (0, 0.62))):
        bits.append(colour(sphere(f'dot{i}', x, y, 0.44, 0.04, 0.04, 0.02, segments=6, rings=4), dot))
    return finish(join('acc_bandana', bits))


def bow():
    """In head space, on the side of the head: two loops, a knot and two ribbons."""
    ribbon, shade = '#c94f7c', '#a53d64'
    bits = [
        colour(sphere('loopL', -0.64, 0.38, 0.12, 0.22, 0.16, 0.13, segments=10, rings=8), ribbon),
        colour(sphere('loopR', -0.3, 0.47, 0.12, 0.22, 0.16, 0.13, segments=10, rings=8), ribbon),
        colour(sphere('foldL', -0.57, 0.4, 0.12, 0.1, 0.08, 0.07, segments=8, rings=6), shade),
        colour(sphere('foldR', -0.37, 0.45, 0.12, 0.1, 0.08, 0.07, segments=8, rings=6), shade),
        colour(sphere('knot', -0.47, 0.43, 0.15, 0.1, 0.1, 0.09, segments=10, rings=7), shade),
        colour(box('tailA', -0.56, 0.22, 0.13, 0.09, 0.26, 0.05, rz=0.32), ribbon),
        colour(box('tailB', -0.38, 0.2, 0.13, 0.09, 0.3, 0.05, rz=-0.24), ribbon),
    ]
    return finish(join('acc_bow', bits))


def headphones():
    """In head space for a head 0.62 wide: a band over the top and a cup on each ear."""
    shell, cushion, accent = '#3a4a4a', '#2c6d6a', '#3f8f8a'
    bits = [
        colour(torus('band', 0, 0.04, 0, 0.63, 0.055, segments=18, rings=6, arc=math.pi, rz=math.pi), shell),
        colour(torus('pad', 0, 0.02, 0, 0.55, 0.035, segments=18, rings=5, arc=math.pi * 0.8, rz=math.pi), cushion),
    ]
    for s in (-1, 1):
        bits.append(colour(box(f'hinge{s}', s * 0.61, 0.16, 0, 0.07, 0.16, 0.07), shell))
        bits.append(colour(cylinder(f'cup{s}', s * 0.61, 0.0, 0, 0.19, 0.12, sides=12, rz=math.pi / 2), accent))
        bits.append(colour(cylinder(f'cushion{s}', s * 0.54, 0.0, 0, 0.155, 0.08, sides=12, rz=math.pi / 2), cushion))
        bits.append(colour(cylinder(f'plate{s}', s * 0.68, 0.0, 0, 0.11, 0.04, sides=10, rz=math.pi / 2), shell))
    return finish(join('acc_headphones', bits))


def lantern():
    """In arm space, hanging from the hand."""
    bits = [colour(box('handle', 0, -0.62, 0.08, 0.05, 0.3, 0.05), '#4d3b2a'), colour(box('top', 0, -0.68, 0.08, 0.24, 0.05, 0.24), '#4d3b2a'), colour(box('bottom', 0, -0.92, 0.08, 0.24, 0.05, 0.24), '#4d3b2a')]
    for c in (-1, 1):
        bits.append(colour(box(f'barA{c}', c * 0.1, -0.8, 0.08, 0.03, 0.24, 0.03), '#4d3b2a'))
        bits.append(colour(box(f'barB{c}', 0, -0.8, 0.08 + c * 0.1, 0.03, 0.24, 0.03), '#4d3b2a'))
    bits.append(colour(cone('cap', 0, -0.62, 0.08, 0.16, 0.1, sides=4, ry=math.pi / 4), '#4d3b2a'))
    return finish(join('acc_lantern', bits))


def cosmetics():
    return [beanie(), bucket(), captain(), traffic_cone(), party_hat(), flower(), beret(), straw(), scarf(), backpack(), satchel(), bandana(), bow(), headphones(), lantern()]


ASSETS = {'cosmetics': cosmetics}
