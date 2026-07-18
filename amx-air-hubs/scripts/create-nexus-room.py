import bpy
import math
import os
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT = os.path.join(ROOT, "public", "models", "nexus-control-room.glb")
BLEND_OUTPUT = os.path.join(ROOT, "assets", "blender", "nexus-control-room.blend")

bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)


def material(name, color, metallic=0.0, roughness=0.45, emission=None, strength=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    shader = mat.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1.0)
    shader.inputs["Metallic"].default_value = metallic
    shader.inputs["Roughness"].default_value = roughness
    emission_input = shader.inputs.get("Emission Color") or shader.inputs.get("Emission")
    if emission and emission_input:
        emission_input.default_value = (*emission, 1.0)
        shader.inputs["Emission Strength"].default_value = strength
    return mat


MAT_DARK = material("Nexus graphite", (0.012, 0.026, 0.035), 0.72, 0.28)
MAT_PANEL = material("Panel alloy", (0.025, 0.075, 0.095), 0.58, 0.24)
MAT_CYAN = material("Cyan emitter", (0.02, 0.3, 0.42), 0.25, 0.2, (0.05, 0.8, 1.0), 6.0)
MAT_MAGENTA = material("Magenta emitter", (0.3, 0.02, 0.22), 0.22, 0.2, (1.0, 0.05, 0.72), 5.0)
MAT_GOLD = material("Gold emitter", (0.28, 0.18, 0.04), 0.45, 0.22, (1.0, 0.52, 0.08), 4.0)
MAT_SCREEN = material("Screen standby", (0.015, 0.05, 0.07), 0.05, 0.18, (0.03, 0.26, 0.35), 2.0)


def box(name, location, scale, mat, bevel=0.08):
    bpy.ops.mesh.primitive_cube_add(location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        modifier = obj.modifiers.new("Edge softening", "BEVEL")
        modifier.width = bevel
        modifier.segments = 3
    obj.data.materials.append(mat)
    return obj


def cylinder(name, location, radius, depth, mat, vertices=64):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    return obj


def torus(name, location, major, minor, mat, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(major_radius=major, minor_radius=minor, major_segments=72, minor_segments=12, location=location, rotation=rotation)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(mat)
    return obj


def screen_surface(name, location, scale, mat):
    bpy.ops.mesh.primitive_plane_add(
        size=2,
        location=(location[0], location[1] - 0.12, location[2]),
        rotation=(math.pi / 2, 0, 0),
    )
    obj = bpy.context.object
    obj.name = name
    obj.scale = (scale[0] * 0.96, scale[2] * 0.96, 1)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    obj.data.materials.append(mat)
    return obj


box("Nexus_Floor", (0, 0, -0.18), (5.5, 5.6, 0.18), MAT_DARK, 0.04)
box("Nexus_BackWall", (0, 5.25, 2.75), (5.5, 0.16, 2.9), MAT_DARK, 0.04)
box("Nexus_LeftWall", (-5.35, 0.4, 2.5), (0.16, 4.8, 2.7), MAT_DARK, 0.04)
box("Nexus_RightWall", (5.35, 0.4, 2.5), (0.16, 4.8, 2.7), MAT_DARK, 0.04)

for x in (-4.6, -2.3, 0, 2.3, 4.6):
    box(f"FloorRail_{x}", (x, 0, 0.015), (0.025, 5.0, 0.025), MAT_CYAN if x in (-4.6, 0, 4.6) else MAT_PANEL, 0.01)
for y in (-4.1, -2.0, 0.2, 2.4, 4.6):
    box(f"FloorCross_{y}", (0, y, 0.02), (5.0, 0.025, 0.025), MAT_PANEL, 0.01)

screen_specs = [
    ("Screen_Agent_Left", (-3.25, 5.02, 2.75), (1.35, 0.055, 0.86), MAT_MAGENTA),
    ("Screen_User", (0, 5.0, 2.82), (1.75, 0.055, 1.02), MAT_SCREEN),
    ("Screen_Agent_Right", (3.25, 5.02, 2.75), (1.35, 0.055, 0.86), MAT_GOLD),
]
for name, location, scale, screen_mat in screen_specs:
    box(f"{name}_Frame", (location[0], location[1] + 0.08, location[2]), (scale[0] + 0.12, 0.08, scale[2] + 0.12), MAT_PANEL, 0.09)
    box(f"{name}_Backplate", location, scale, screen_mat, 0.035)
    screen_surface(name, location, scale, screen_mat)
    box(f"{name}_Signal", (location[0], location[1] - 0.08, location[2] - scale[2] - 0.18), (scale[0] * 0.72, 0.025, 0.025), MAT_CYAN, 0.01)

for x in (-3.2, 3.2):
    console = box(f"OperatorConsole_{x}", (x, 0.25, 0.68), (1.35, 0.85, 0.28), MAT_PANEL, 0.12)
    console.rotation_euler.x = math.radians(-8)
    box(f"ConsoleGlow_{x}", (x, -0.55, 0.96), (1.05, 0.04, 0.22), MAT_MAGENTA if x < 0 else MAT_GOLD, 0.025).rotation_euler.x = math.radians(-8)
    box(f"ConsoleBase_{x}", (x, 0.35, 0.28), (0.8, 0.55, 0.28), MAT_DARK, 0.1)

cylinder("HoloBase", (0, 1.15, 0.22), 1.35, 0.34, MAT_PANEL)
torus("HoloBaseRing", (0, 1.15, 0.43), 1.18, 0.035, MAT_CYAN)
torus("HoloOrbit_A", (0, 1.15, 1.72), 0.95, 0.018, MAT_CYAN, (math.pi / 2, 0, 0))
torus("HoloOrbit_B", (0, 1.15, 1.72), 0.78, 0.018, MAT_MAGENTA, (math.pi / 2, math.radians(58), 0))
torus("HoloOrbit_C", (0, 1.15, 1.72), 0.7, 0.014, MAT_GOLD, (math.pi / 2, math.radians(-54), 0))
bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=4, radius=0.54, location=(0, 1.15, 1.72))
holo = bpy.context.object
holo.name = "Nexus_Hologram"
holo.data.materials.append(MAT_CYAN)

for x in (-4.75, 4.75):
    for z in (0.8, 2.1, 3.4, 4.7):
        box(f"WallBeacon_{x}_{z}", (x, 4.98, z), (0.06, 0.045, 0.38), MAT_MAGENTA if x < 0 else MAT_CYAN, 0.015)


def light(name, light_type, location, energy, color, size=1.0):
    bpy.ops.object.light_add(type=light_type, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.data.energy = energy
    obj.data.color = color
    if hasattr(obj.data, "shape"):
        obj.data.shape = "DISK"
        obj.data.size = size
    return obj


def point_at(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


key = light("Nexus_Key_Area", "AREA", (-3.5, -1.8, 4.8), 1150, (0.12, 0.75, 1.0), 4.5)
point_at(key, (0, 1.2, 1.2))
fill = light("Nexus_Fill_Area", "AREA", (3.5, 1.0, 4.2), 900, (1.0, 0.08, 0.62), 3.5)
point_at(fill, (0, 1.5, 1.4))
light("Hologram_Point", "POINT", (0, 1.15, 2.15), 520, (0.08, 0.78, 1.0), 1.0)
light("Console_Left_Point", "POINT", (-3.2, -0.2, 1.45), 260, (1.0, 0.05, 0.55), 1.0)
light("Console_Right_Point", "POINT", (3.2, -0.2, 1.45), 260, (1.0, 0.45, 0.06), 1.0)

bpy.ops.object.camera_add(location=(0, -9.4, 4.15))
camera = bpy.context.object
camera.name = "Nexus_Camera"
camera.data.lens = 42
point_at(camera, (0, 1.4, 1.65))
bpy.context.scene.camera = camera

world = bpy.context.scene.world
world.color = (0.002, 0.005, 0.009)
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.002, 0.006, 0.012, 1.0)
world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.08

bpy.context.scene.render.engine = "BLENDER_EEVEE_NEXT"
bpy.context.scene.render.resolution_x = 1600
bpy.context.scene.render.resolution_y = 900
os.makedirs(os.path.dirname(OUTPUT), exist_ok=True)
os.makedirs(os.path.dirname(BLEND_OUTPUT), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=BLEND_OUTPUT)
bpy.ops.export_scene.gltf(
    filepath=OUTPUT,
    export_format="GLB",
    export_apply=True,
    export_cameras=True,
    export_lights=True,
    export_yup=True,
)
print(f"Exported {OUTPUT}")
