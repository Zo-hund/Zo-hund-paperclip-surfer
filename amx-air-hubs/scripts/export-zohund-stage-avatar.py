import sys
from pathlib import Path

import bpy


arguments = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
if len(arguments) != 1:
    raise SystemExit("Usage: blender <zohund.blend> --background --python scripts/export-zohund-stage-avatar.py -- <avatar.gltf>")

output_path = Path(arguments[0]).resolve()
output_path.parent.mkdir(parents=True, exist_ok=True)

bpy.ops.object.select_all(action="DESELECT")
export_objects = [obj for obj in bpy.context.scene.objects if obj.type in {"ARMATURE", "MESH"}]
if not any(obj.type == "ARMATURE" for obj in export_objects) or not any(obj.type == "MESH" for obj in export_objects):
    raise SystemExit("The Stage avatar requires an armature and at least one mesh")

for obj in export_objects:
    obj.select_set(True)
bpy.context.view_layer.objects.active = next(obj for obj in export_objects if obj.type == "ARMATURE")

bpy.ops.export_scene.gltf(
    filepath=str(output_path),
    export_format="GLTF_SEPARATE",
    export_texture_dir="textures",
    export_yup=True,
    export_animations=True,
    export_cameras=False,
    export_lights=False,
    use_selection=True,
)

print(f"AMX_STAGE_AVATAR={output_path}")
