import argparse
import runpy
import shutil
import sys
from pathlib import Path

import bpy


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-root", required=True)
    parser.add_argument("--unity-assets", required=True)
    parser.add_argument("--world", choices=("nexus", "digital-twin"), required=True)
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    return parser.parse_args(argv)


def prepare_nexus(root):
    runpy.run_path(str(root / "scripts" / "create-nexus-room.py"), run_name="__main__")
    blend_path = root / "assets" / "blender" / "nexus-control-room.blend"
    blend_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))


def prepare_digital_twin(root):
    blend_path = root / "assets" / "blender" / "amx-digital-twin.blend"
    if Path(bpy.data.filepath).resolve() != blend_path.resolve():
        bpy.ops.wm.open_mainfile(filepath=str(blend_path))


def copy_unity_textures(root, unity_assets):
    source = root / "public" / "textures" / "generated"
    target = unity_assets.parent / "Textures"
    target.mkdir(parents=True, exist_ok=True)
    for texture in source.glob("*.png"):
        shutil.copy2(texture, target / texture.name)


def export_meshes(output):
    bpy.ops.object.select_all(action="DESELECT")
    meshes = [item for item in bpy.context.scene.objects if item.type == "MESH"]
    for item in meshes:
        item.hide_set(False)
        item.hide_render = False
        item.select_set(True)

    output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.fbx(
        filepath=str(output),
        use_selection=True,
        object_types={"MESH"},
        apply_unit_scale=True,
        apply_scale_options="FBX_SCALE_ALL",
        axis_forward="-Z",
        axis_up="Y",
        use_mesh_modifiers=True,
        mesh_smooth_type="FACE",
        add_leaf_bones=False,
        path_mode="COPY",
        embed_textures=True,
        bake_anim=False,
    )
    print(f"Exported {len(meshes)} meshes to {output}")


def main():
    args = parse_args()
    root = Path(args.project_root).resolve()
    unity_assets = Path(args.unity_assets).resolve()
    if args.world == "nexus":
        prepare_nexus(root)
        output = unity_assets / "NexusControlRoom.fbx"
    else:
        prepare_digital_twin(root)
        copy_unity_textures(root, unity_assets)
        output = unity_assets / "AmxDigitalTwin.fbx"
    export_meshes(output)


if __name__ == "__main__":
    main()
