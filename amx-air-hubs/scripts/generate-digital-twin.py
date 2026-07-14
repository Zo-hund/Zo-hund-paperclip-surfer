import argparse
import math
import sys
from pathlib import Path

import bpy


def material(name, color, metallic=0.2, roughness=0.35, emission=None, emission_strength=0.0):
    item = bpy.data.materials.new(name)
    item.diffuse_color = (*color, 1.0)
    item.metallic = metallic
    item.roughness = roughness
    if emission:
        item.use_nodes = True
        node = item.node_tree.nodes.get("Principled BSDF")
        node.inputs["Emission Color"].default_value = (*emission, 1.0)
        node.inputs["Emission Strength"].default_value = emission_strength
    return item


def cube(name, location, scale, mat, bevel=0.08):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    modifier = obj.modifiers.new("Precision bevel", "BEVEL")
    modifier.width = bevel
    modifier.segments = 3
    obj.data.materials.append(mat)
    return obj


def cylinder(name, location, radius, depth, mat, rotation=(0, 0, 0), vertices=48):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    return obj


def torus(name, location, major_radius, minor_radius, mat, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=major_radius, minor_radius=minor_radius, major_segments=64, minor_segments=12, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    return obj


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-root", required=True)
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    args = parser.parse_args(argv)
    root = Path(args.project_root)
    blend_path = root / "assets" / "blender" / "amx-digital-twin.blend"
    glb_path = root / "public" / "models" / "amx-digital-twin.glb"
    blend_path.parent.mkdir(parents=True, exist_ok=True)
    glb_path.parent.mkdir(parents=True, exist_ok=True)

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)

    dark = material("AMX_DarkMetal", (0.07, 0.15, 0.2), 0.48, 0.34)
    panel = material("AMX_Panel", (0.1, 0.28, 0.34), 0.38, 0.36)
    cyan = material("AMX_Cyan", (0.02, 0.5, 0.72), 0.35, 0.2, (0.12, 0.85, 1.0), 3.0)
    magenta = material("AMX_Magenta", (0.45, 0.03, 0.55), 0.35, 0.2, (1.0, 0.1, 0.85), 2.4)
    green = material("AMX_Green", (0.02, 0.34, 0.18), 0.25, 0.25, (0.2, 1.0, 0.52), 2.0)
    gold = material("AMX_Gold", (0.62, 0.42, 0.08), 0.45, 0.25, (1.0, 0.68, 0.18), 1.8)
    glass = material("AMX_Glass", (0.1, 0.34, 0.42), 0.05, 0.28, (0.08, 0.65, 0.8), 1.1)

    cube("Twin_Floor", (0, -0.18, 0), (4.4, 0.18, 3.5), dark, 0.04)
    for index in range(-4, 5):
        cube(f"Floor_Line_X_{index}", (index, 0.015, 0), (0.012, 0.01, 3.35), cyan, 0.005)
    for index in range(-3, 4):
        cube(f"Floor_Line_Z_{index}", (0, 0.016, index), (4.25, 0.01, 0.012), cyan, 0.005)

    core = cube("Twin_Asset_Core", (0, 1.35, 0), (1.38, 1.35, 1.1), panel, 0.16)
    core["amx_role"] = "physical_asset"
    core["twin_id"] = "facility-cell-01"
    cube("Twin_Core_Window", (0, 1.38, 1.115), (0.9, 0.72, 0.025), glass, 0.04)
    for y in (0.55, 1.35, 2.15):
        torus(f"Core_Energy_Ring_{y}", (0, y, 0), 1.52, 0.035, cyan, (math.pi / 2, 0, 0))

    thermal = cylinder("Sensor_Temperature", (-1.95, 1.1, 0.65), 0.13, 0.85, magenta)
    thermal["amx_role"] = "sensor"
    thermal["metric"] = "temperatureC"
    vibration = cube("Sensor_Vibration", (1.8, 0.75, 0.72), (0.24, 0.24, 0.24), gold, 0.04)
    vibration["amx_role"] = "sensor"
    vibration["metric"] = "vibrationMmS"
    energy = torus("Sensor_Energy", (0, 2.85, 0), 0.42, 0.07, cyan, (math.pi / 2, 0, 0))
    energy["amx_role"] = "sensor"
    energy["metric"] = "energyKw"

    cooling_base = cylinder("Actuator_Cooling", (2.65, 0.7, -0.8), 0.72, 0.42, dark, (math.pi / 2, 0, 0))
    cooling_base["amx_role"] = "actuator"
    cooling_base["control"] = "coolingPercent"
    rotor = cylinder("Actuator_Cooling_Rotor", (2.65, 0.7, -0.54), 0.54, 0.08, green, (math.pi / 2, 0, 0), 24)
    for angle in range(0, 360, 60):
        blade = cube(f"Cooling_Blade_{angle}", (2.65, 0.7, -0.47), (0.08, 0.46, 0.035), green, 0.03)
        blade.rotation_euler.z = math.radians(angle)
        blade.parent = rotor

    cube("Pipe_Cooling_A", (2.1, 0.3, -1.7), (0.055, 0.055, 1.3), green, 0.025)
    cube("Pipe_Cooling_B", (-2.1, 0.3, -1.7), (0.055, 0.055, 1.3), cyan, 0.025)
    for x in (-3.5, 3.5):
        column = cube(f"Twin_Structure_{x}", (x, 1.7, -1.5), (0.18, 1.7, 0.18), dark, 0.04)
        column["amx_role"] = "structure"
    screen = cube("Screen_Twin", (-2.8, 1.65, 0.75), (0.82, 0.62, 0.04), glass, 0.05)
    screen.rotation_euler.y = math.radians(-18)
    screen["amx_role"] = "operator_display"

    for name, location, color, energy_value in (
        ("Twin_Key", (-4.0, 6.0, 5.0), (0.5, 0.9, 1.0), 1150),
        ("Twin_Fill", (4.0, 3.5, 2.0), (1.0, 0.18, 0.75), 700),
        ("Twin_Rim", (0.0, 4.0, -4.0), (0.25, 1.0, 0.62), 900),
    ):
        data = bpy.data.lights.new(name, type="AREA")
        data.energy = energy_value
        data.color = color
        data.shape = "DISK"
        data.size = 3.0
        obj = bpy.data.objects.new(name, data)
        obj.location = location
        bpy.context.collection.objects.link(obj)
        direction = (core.location - obj.location).to_track_quat("-Z", "Y")
        obj.rotation_euler = direction.to_euler()

    bpy.ops.object.camera_add(location=(8.2, 5.6, 10.2))
    camera = bpy.context.object
    camera.name = "Camera_Twin_Overview"
    camera.data.lens = 48
    camera.rotation_euler = ((core.location - camera.location).to_track_quat("-Z", "Y")).to_euler()
    bpy.context.scene.camera = camera

    # The procedural layout uses Y as its vertical design axis. Rotate the
    # complete authored scene into Blender/glTF Z-up space before export.
    root = bpy.data.objects.new("AMX_Digital_Twin_Root", None)
    bpy.context.collection.objects.link(root)
    for obj in list(bpy.context.scene.objects):
        if obj != root:
            obj.parent = root
    root.rotation_euler.x = math.pi / 2

    bpy.context.scene["amx_twin_schema"] = "1.0"
    bpy.context.scene["amx_twin_id"] = "facility-cell-01"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    bpy.ops.export_scene.gltf(filepath=str(glb_path), export_format="GLB", export_apply=True, export_extras=True, export_lights=True)
    print(f"Generated {blend_path}")
    print(f"Generated {glb_path}")


if __name__ == "__main__":
    main()
