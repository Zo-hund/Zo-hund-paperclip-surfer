import bpy
import math
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
GLB_PATH = ROOT / "public" / "models" / "amx-mark.glb"
BLEND_PATH = ROOT / "assets" / "blender" / "amx-mark.blend"


def material(name, base, emission):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    node = mat.node_tree.nodes.get("Principled BSDF")
    node.inputs["Base Color"].default_value = (*base, 1.0)
    node.inputs["Metallic"].default_value = 0.82
    node.inputs["Roughness"].default_value = 0.2
    node.inputs["Emission Color"].default_value = (*emission, 1.0)
    node.inputs["Emission Strength"].default_value = 3.5
    return mat


def prism(name, points, depth, mat, angle=0.0):
    count = len(points)
    vertices = [(x, y, -depth / 2) for x, y in points] + [(x, y, depth / 2) for x, y in points]
    faces = [tuple(range(count - 1, -1, -1)), tuple(range(count, count * 2))]
    for index in range(count):
        following = (index + 1) % count
        faces.append((index, following, following + count, index + count))
    mesh = bpy.data.meshes.new(f"{name}_mesh")
    mesh.from_pydata(vertices, [], faces)
    mesh.materials.append(mat)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.rotation_euler[2] = angle
    bevel = obj.modifiers.new("Edge bevel", "BEVEL")
    bevel.width = 0.055
    bevel.segments = 3
    return obj


bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)

cyan = material("AMX Cyan", (0.01, 0.32, 0.72), (0.0, 0.72, 1.0))
magenta = material("AMX Magenta", (0.42, 0.03, 0.55), (1.0, 0.05, 0.78))
dark = material("AMX Core", (0.004, 0.01, 0.035), (0.0, 0.04, 0.12))

root = bpy.data.objects.new("AMX_MARK", None)
bpy.context.collection.objects.link(root)

blade_shape = [(0.72, -0.30), (2.35, -0.28), (2.72, 0.0), (2.35, 0.28), (0.72, 0.30), (1.03, 0.0)]
for index, degrees in enumerate((90, 210, 330)):
    blade = prism(f"AMX_Blade_{index + 1}", blade_shape, 0.32, cyan if index == 0 else magenta, math.radians(degrees))
    blade.parent = root

for index, degrees in enumerate((90, 210, 330)):
    spoke = prism(f"AMX_Spoke_{index + 1}", [(0.27, -0.08), (1.16, -0.08), (1.16, 0.08), (0.27, 0.08)], 0.38, cyan, math.radians(degrees))
    spoke.parent = root

bpy.ops.mesh.primitive_torus_add(major_radius=0.52, minor_radius=0.12, major_segments=64, minor_segments=12)
ring = bpy.context.object
ring.name = "AMX_Core_Ring"
ring.data.materials.append(cyan)
ring.parent = root

bpy.ops.mesh.primitive_cylinder_add(vertices=64, radius=0.37, depth=0.28)
core = bpy.context.object
core.name = "AMX_Core"
core.data.materials.append(dark)
core.parent = root

bpy.ops.mesh.primitive_uv_sphere_add(segments=32, ring_count=16, radius=0.16, location=(0, 0, 0.22))
signal = bpy.context.object
signal.name = "AMX_Signal"
signal.data.materials.append(magenta)
signal.parent = root

root.scale = (0.72, 0.72, 0.72)
bpy.context.scene.world.color = (0.002, 0.004, 0.012)

GLB_PATH.parent.mkdir(parents=True, exist_ok=True)
BLEND_PATH.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
bpy.ops.export_scene.gltf(
    filepath=str(GLB_PATH),
    export_format="GLB",
    use_selection=False,
    export_apply=True,
    export_yup=True,
)
print(f"Created {GLB_PATH}")
