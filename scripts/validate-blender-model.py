import json
import math
import sys
from pathlib import Path

import bpy


def model_path() -> Path:
    arguments = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    if len(arguments) != 1:
        raise SystemExit("Usage: blender --background --python scripts/validate-blender-model.py -- <model.glb>")
    return Path(arguments[0]).resolve()


path = model_path()
bpy.ops.wm.read_factory_settings(use_empty=True)
result = bpy.ops.import_scene.gltf(filepath=str(path))
if "FINISHED" not in result:
    raise SystemExit(f"Blender could not import {path}")

report = []
invalid_total = 0
for obj in sorted((item for item in bpy.context.scene.objects if item.type == "MESH"), key=lambda item: item.name):
    invalid = sum(
        1
        for vertex in obj.data.vertices
        if not all(math.isfinite(coordinate) for coordinate in vertex.co)
    )
    invalid_total += invalid
    report.append({"name": obj.name, "vertices": len(obj.data.vertices), "invalidVertices": invalid})

print("AMX_MODEL_REPORT=" + json.dumps({"path": str(path), "meshes": report, "invalidVertices": invalid_total}))
if invalid_total:
    raise SystemExit(f"Model contains {invalid_total} non-finite vertices")
