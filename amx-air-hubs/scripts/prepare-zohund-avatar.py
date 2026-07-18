import json
import sys
from pathlib import Path

import bpy


arguments = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
if len(arguments) != 3:
    raise SystemExit(
        "Usage: blender --background --python scripts/prepare-zohund-avatar.py -- "
        "<source.glb> <runtime.glb> <source.blend>"
    )

source_path, runtime_path, blend_path = (Path(value).resolve() for value in arguments)
runtime_path.parent.mkdir(parents=True, exist_ok=True)
blend_path.parent.mkdir(parents=True, exist_ok=True)
texture_path = runtime_path.parent.parent / "textures" / "zohund"
texture_path.mkdir(parents=True, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
result = bpy.ops.import_scene.gltf(filepath=str(source_path))
if "FINISHED" not in result:
    raise SystemExit(f"Blender could not import {source_path}")

# Blender creates an unrigged, material-free sphere to visualize the imported bones.
# It is an authoring helper, not visible character geometry.
removed_helpers = []
for armature in (obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"):
    for bone in armature.pose.bones:
        if bone.custom_shape and not bone.custom_shape.data.materials:
            bone.custom_shape = None
for obj in list(bpy.context.scene.objects):
    if obj.type == "MESH" and obj.parent is None and not obj.data.materials:
        removed_helpers.append(obj.name)
        bpy.data.objects.remove(obj, do_unlink=True)

avatar_meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
if not avatar_meshes or not armatures:
    raise SystemExit("The cleaned asset must contain a skinned mesh and armature")

for obj in avatar_meshes:
    obj.data.name = f"ZOHUND_{obj.data.name}"
bpy.context.scene.name = "ZOHUND_Avatar"

texture_names = {
    "BASE_COLOR_TEXTURE_ALPHA": "base-color.png",
    "METALLIC_ROUGHNESS_TEXTURE_ALPHA": "metallic-roughness.png",
    "NORMAL_TEXTURE_ALPHA": "normal.png",
}
exported_textures = []
for image_name, file_name in texture_names.items():
    image = bpy.data.images.get(image_name)
    if image is None:
        raise SystemExit(f"Missing required avatar texture: {image_name}")
    image.filepath_raw = str(texture_path / file_name)
    image.file_format = "PNG"
    image.save()
    exported_textures.append(str(texture_path / file_name))

bpy.ops.object.select_all(action="DESELECT")
for obj in [*armatures, *avatar_meshes]:
    obj.select_set(True)
bpy.context.view_layer.objects.active = armatures[0]
bpy.ops.outliner.orphans_purge(do_recursive=True)

bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
bpy.ops.export_scene.gltf(
    filepath=str(runtime_path),
    export_format="GLB",
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
    "removedHelpers": removed_helpers,
    "textures": exported_textures,
    "meshes": [{"name": obj.name, "vertices": len(obj.data.vertices)} for obj in avatar_meshes],
    "armatures": [obj.name for obj in armatures],
}
print("AMX_AVATAR_REPORT=" + json.dumps(report))
