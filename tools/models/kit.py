"""Blender helpers for Reel Town's assets.

Everything is authored in the game's coordinates (x right, y up, z toward the camera) and
converted to Blender's on the way in, so the numbers here match the client. Shapes are
metaballs (for organic blends) or primitives, decimated to a low-poly count and shaded
flat. Colour is by role: every face carries a material named ``role_<name>`` (recoloured
per species and outfit by the client) or ``c_<hex>`` (a fixed colour). Run inside Blender:
``blender -b -P tools/models/build.py -- <out-dir> [names...]``.
"""
import math
import bpy
import bmesh
from mathutils import Vector, Matrix

# The metaball surface sits at about 0.573 of the element radius at threshold 0.6.
META_K = 0.573


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def B(x, y, z):
    """Game coordinates to Blender's Z-up."""
    return Vector((x, -z, y))


def G(v):
    """Blender coordinates back to the game's."""
    return (v.x, v.z, -v.y)


def link(obj):
    bpy.context.collection.objects.link(obj)
    return obj


def select_only(objs):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]


_materials = {}


def material(name, preview=None):
    """A material named for its role or colour; the diffuse colour only serves previews."""
    if name in _materials:
        return _materials[name]
    m = bpy.data.materials.new(name)
    if preview is None and name.startswith('c_'):
        h = name[2:]
        preview = tuple(int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)) + (1,)
    m.diffuse_color = preview or (0.8, 0.8, 0.8, 1)
    _materials[name] = m
    return m


PREVIEW = {
    'fur': '#eea373',
    'pale': '#fbe9d0',
    'deep': '#8f6245',
    'outfit': '#486967',
    'outfitDark': '#344c4a',
    'eye': '#2c3034',
    'white': '#ffffff',
    'pink': '#e58a90',
    'accent': '#e0a24a',
    'hand': '#fbe9d0',
    'foot': '#fbe9d0',
    'lower': '#486967',
    'glass': '#ffe9a6',
    'frame': '#e0574f',
}


def hex_rgba(h):
    h = h.lstrip('#')
    return tuple(int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)) + (1,)


def role_material(role):
    return material(f'role_{role}', hex_rgba(PREVIEW.get(role, '#cccccc')))


class Meta:
    """A metaball object built from balls and ellipsoids in game coordinates."""

    def __init__(self, resolution=0.045, threshold=0.6):
        self.mb = bpy.data.metaballs.new('meta')
        self.mb.resolution = resolution
        self.mb.render_resolution = resolution
        self.mb.threshold = threshold
        self.obj = link(bpy.data.objects.new('meta', self.mb))

    def ball(self, x, y, z, r, stiffness=2.0, negative=False):
        e = self.mb.elements.new()
        e.type = 'BALL'
        e.co = B(x, y, z)
        e.radius = r / META_K
        e.stiffness = stiffness
        e.use_negative = negative
        return self

    def ellipsoid(self, x, y, z, rx, ry, rz, stiffness=2.0, negative=False, rot=None):
        e = self.mb.elements.new()
        e.type = 'ELLIPSOID'
        e.co = B(x, y, z)
        e.radius = 1 / META_K
        e.size_x, e.size_y, e.size_z = rx, rz, ry
        e.stiffness = stiffness
        e.use_negative = negative
        if rot:
            e.rotation = rot
        return self

    def capsule(self, a, b, r, steps=None, taper=1.0):
        """A run of balls from a to b (game coordinates), the radius tapering toward b."""
        ax, ay, az = a
        bx, by, bz = b
        length = math.dist(a, b)
        n = steps or max(2, int(length / (r * 0.5)) + 1)
        for i in range(n):
            t = i / (n - 1)
            self.ball(ax + (bx - ax) * t, ay + (by - ay) * t, az + (bz - az) * t, r * (1 + (taper - 1) * t))
        return self

    def build(self, name, faces=600):
        select_only([self.obj])
        bpy.ops.object.convert(target='MESH')
        obj = bpy.context.view_layer.objects.active
        obj.name = name
        decimate(obj, faces)
        return obj


def decimate(obj, faces):
    n = len(obj.data.polygons)
    if n > faces:
        select_only([obj])
        mod = obj.modifiers.new('dec', 'DECIMATE')
        mod.ratio = faces / n
        bpy.ops.object.modifier_apply(modifier='dec')
    return obj


def flat(obj):
    select_only([obj])
    bpy.ops.object.shade_flat()
    return obj


def transform(obj, x=0, y=0, z=0, sx=1, sy=1, sz=1, rx=0, ry=0, rz=0):
    """Scale, then rotate (about game axes), then move, in game coordinates; applied to the mesh."""
    m = Matrix.Translation(B(x, y, z))
    # Game-axis rotations expressed on Blender axes: game y is Blender z, game z is -Blender y.
    if rz:
        m = m @ Matrix.Rotation(-rz, 4, 'Y')
    if ry:
        m = m @ Matrix.Rotation(ry, 4, 'Z')
    if rx:
        m = m @ Matrix.Rotation(rx, 4, 'X')
    m = m @ Matrix.Diagonal(Vector((sx, sz, sy, 1)))
    obj.data.transform(m)
    return obj


def _primitive(op, name, **kw):
    op(**kw)
    obj = bpy.context.view_layer.objects.active
    obj.name = name
    return obj


def sphere(name, x, y, z, rx, ry=None, rz=None, segments=12, rings=8):
    ry = rx if ry is None else ry
    rz = rx if rz is None else rz
    obj = _primitive(bpy.ops.mesh.primitive_uv_sphere_add, name, segments=segments, ring_count=rings, radius=1)
    return transform(obj, x, y, z, rx, ry, rz)


def box(name, x, y, z, w, h, d, rx=0, ry=0, rz=0):
    obj = _primitive(bpy.ops.mesh.primitive_cube_add, name, size=1)
    return transform(obj, x, y, z, w, h, d, rx, ry, rz)


def cone(name, x, y, z, r, h, sides=8, rx=0, ry=0, rz=0, r2=0):
    obj = _primitive(bpy.ops.mesh.primitive_cone_add, name, vertices=sides, radius1=r, radius2=r2, depth=h)
    # Blender's cone points along its Z; the game's points along y, which is the same axis.
    return transform(obj, x, y, z, 1, 1, 1, rx, ry, rz)


def cylinder(name, x, y, z, r, h, sides=8, rx=0, ry=0, rz=0):
    obj = _primitive(bpy.ops.mesh.primitive_cylinder_add, name, vertices=sides, radius=r, depth=h)
    return transform(obj, x, y, z, 1, 1, 1, rx, ry, rz)


def torus(name, x, y, z, r, tube, segments=12, rings=6, rx=0, ry=0, rz=0, arc=None):
    obj = _primitive(bpy.ops.mesh.primitive_torus_add, name, major_segments=segments, minor_segments=rings, major_radius=r, minor_radius=tube)
    # A Blender torus lies flat (around Z); the game's default torus faces the camera (around z).
    transform(obj, 0, 0, 0, 1, 1, 1, math.pi / 2, 0, 0)
    if arc is not None:
        keep_arc(obj, arc)
    return transform(obj, x, y, z, 1, 1, 1, rx, ry, rz)


def keep_arc(obj, arc):
    """Keeps the part of a camera-facing ring below the horizontal that a smile needs."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    half = arc / 2
    kill = []
    for v in bm.verts:
        gx, gy, _ = G(v.co)
        a = math.atan2(-gy, gx)  # angle from +x going down
        if not (math.pi / 2 - half <= a <= math.pi / 2 + half):
            kill.append(v)
    bmesh.ops.delete(bm, geom=kill, context='VERTS')
    bm.to_mesh(obj.data)
    bm.free()
    return obj


def bisect(obj, y=None, x=None, z=None):
    """Cuts the mesh along an axis plane (game coordinates) so a painted seam is crisp."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    cuts = []
    if y is not None:
        cuts.append((B(0, y, 0), Vector((0, 0, 1))))
    if x is not None:
        cuts.append((B(x, 0, 0), Vector((1, 0, 0))))
    if z is not None:
        cuts.append((B(0, 0, z), Vector((0, 1, 0))))
    for co, no in cuts:
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=co, plane_no=no)
    bm.to_mesh(obj.data)
    bm.free()
    return obj


def role(obj, name, where=None):
    """Assigns a role material to every face, or to the faces whose centre satisfies `where`
    (a predicate on game coordinates)."""
    mat = role_material(name) if not name.startswith('c_') else material(name)
    mats = obj.data.materials
    if mat.name not in [m.name for m in mats if m]:
        mats.append(mat)
    index = [m.name for m in mats].index(mat.name)
    for p in obj.data.polygons:
        if where is None or where(*G(p.center)):
            p.material_index = index
    return obj


def colour(obj, hex_value, where=None):
    return role(obj, f'c_{hex_value.lstrip("#").lower()}', where)


def join(name, objs):
    """Joins several meshes into one object named `name`, keeping every material."""
    objs = [o for o in objs if o is not None]
    select_only(objs)
    bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    obj.name = name
    return obj


def pivot(obj, x, y, z):
    """Places a part authored around its own origin at its pivot in the world."""
    obj.location = B(x, y, z)
    return obj


def empty(name, x, y, z):
    obj = link(bpy.data.objects.new(name, None))
    obj.location = B(x, y, z)
    return obj


def finish(obj, faces=None):
    """Optional decimation, flat shading, and a clean mesh."""
    if faces:
        decimate(obj, faces)
    flat(obj)
    select_only([obj])
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.remove_doubles(threshold=0.0005)
    bpy.ops.mesh.quads_convert_to_tris()
    bpy.ops.object.mode_set(mode='OBJECT')
    return obj


def export(path, objs):
    select_only(objs)
    bpy.ops.export_scene.gltf(
        filepath=str(path),
        export_format='GLB',
        use_selection=True,
        export_yup=True,
        export_apply=True,
        export_materials='EXPORT',
        export_normals=False,
        export_texcoords=False,
        export_animations=False,
        export_skins=False,
        export_cameras=False,
        export_lights=False,
        export_extras=True,
    )


def preview(path, objs, distance=6.5, height=1.2, look_y=1.15, size=(600, 700), angle=0.0):
    """A Workbench render with the preview colours, for checking shapes without the game."""
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_WORKBENCH'
    scene.display.shading.light = 'STUDIO'
    scene.display.shading.color_type = 'MATERIAL'
    scene.display.shading.show_shadows = False
    scene.display.shading.show_cavity = True
    scene.render.resolution_x, scene.render.resolution_y = size
    scene.render.film_transparent = False
    world = bpy.data.worlds.new('w') if not scene.world else scene.world
    scene.world = world
    world.color = (0.85, 0.9, 0.78)
    cam_data = bpy.data.cameras.new('cam')
    cam_data.lens = 50
    cam = link(bpy.data.objects.new('cam', cam_data))
    cam.location = B(math.sin(angle) * distance, height, math.cos(angle) * distance)
    direction = B(0, look_y, 0) - cam.location
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    scene.camera = cam
    for o in bpy.data.objects:
        o.hide_render = o.type not in ('MESH',) or o not in objs
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(cam)
