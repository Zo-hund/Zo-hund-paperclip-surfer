import json
import re
import sys
from pathlib import Path

import bpy


arguments = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
if len(arguments) != 2:
    raise SystemExit(
        "Usage: blender --background --python scripts/prepare-built-in-avatar.py -- "
        "<source.glb> <avatar-slug>"
    )

source_path = Path(arguments[0]).resolve()
slug = arguments[1].strip().lower()
if not re.fullmatch(r"[a-z0-9-]+", slug):
    raise SystemExit("Avatar slug must contain only lowercase letters, numbers, and hyphens")

root = Path(__file__).resolve().parents[1]
runtime_dir = root / "public" / "models" / "avatars" / slug
runtime_path = runtime_dir / "avatar.gltf"
blend_path = root / "assets" / "blender" / "avatars" / f"{slug}.blend"
runtime_dir.mkdir(parents=True, exist_ok=True)
blend_path.parent.mkdir(parents=True, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
result = bpy.ops.import_scene.gltf(filepath=str(source_path))
if "FINISHED" not in result:
    raise SystemExit(f"Blender could not import {source_path}")

for armature in (obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"):
    for bone in armature.pose.bones:
        bone.custom_shape = None

avatar_meshes = [
    obj for obj in bpy.context.scene.objects
    if obj.type == "MESH" and (obj.parent is not None or bool(obj.data.materials))
]
armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
if not avatar_meshes or not armatures:
    raise SystemExit("The avatar must contain a skinned mesh and armature")

keep = {*avatar_meshes, *armatures}
for obj in list(bpy.context.scene.objects):
    if obj not in keep:
        bpy.data.objects.remove(obj, do_unlink=True)

for obj in avatar_meshes:
    obj.data.name = f"{slug}_{obj.data.name}"
bpy.context.scene.name = f"AMX_{slug}"
bpy.ops.outliner.orphans_purge(do_recursive=True)
bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))

bpy.ops.object.select_all(action="DESELECT")
for obj in keep:
    obj.select_set(True)
bpy.context.view_layer.objects.active = armatures[0]
bpy.ops.export_scene.gltf(
    filepath=str(runtime_path),
    export_format="GLTF_SEPARATE",
    export_texture_dir="textures",
    export_yup=True,
    export_animations=True,
    export_cameras=False,
    export_lights=False,
    use_selection=True,
)

report = {
    "source": str(source_path),
    "runtime": str(runtime_path),
    "blend": str(blend_path),
    "meshes": [{"name": obj.name, "vertices": len(obj.data.vertices)} for obj in avatar_meshes],
    "armatures": [obj.name for obj in armatures],
}
print("AMX_BUILT_IN_AVATAR_REPORT=" + json.dumps(report))
