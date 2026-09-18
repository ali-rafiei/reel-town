"""Builds Reel Town's GLB assets. Usage, from the repo root:

    blender -b -P tools/models/build.py -- public/models [name ...] [--preview <dir>]

Without names, every asset is built. Each asset is a function in characters.py, props.py or
cosmetics.py that returns the list of objects to export.
"""
import sys
import importlib
from pathlib import Path

HERE = Path(__file__).resolve().parent
if str(HERE) not in sys.path:
    sys.path.insert(0, str(HERE))

import kit  # noqa: E402

argv = sys.argv[sys.argv.index('--') + 1 :] if '--' in sys.argv else []
out = Path(argv[0] if argv else 'public/models')
preview_dir = None
names = []
i = 1
while i < len(argv):
    if argv[i] == '--preview':
        preview_dir = Path(argv[i + 1])
        i += 2
    else:
        names.append(argv[i])
        i += 1

registry = {}
for module_name in ('characters', 'props', 'cosmetics'):
    try:
        module = importlib.import_module(module_name)
    except ModuleNotFoundError:
        continue
    registry.update(module.ASSETS)

out.mkdir(parents=True, exist_ok=True)
if preview_dir:
    preview_dir.mkdir(parents=True, exist_ok=True)
for name in names or list(registry):
    kit.reset()
    kit._materials.clear()
    build = registry[name]
    objs = build()
    kit.export(out / f'{name}.glb', objs)
    size = (out / f'{name}.glb').stat().st_size
    faces = sum(len(o.data.polygons) for o in objs if o.type == 'MESH')
    print(f'built {name}: {faces} faces, {size // 1024} KB')
    if preview_dir:
        options = getattr(build, 'preview', {})
        kit.preview(preview_dir / f'{name}.png', objs, **options)
        if getattr(build, 'turnaround', False):
            for label, angle in (('side', 1.5708), ('back', 3.1416)):
                kit.preview(preview_dir / f'{name}-{label}.png', objs, angle=angle, **options)
