# Reality Reconstruction Skills

AMX AIR Hubs exposes a governed six-stage workflow for recreating physical environments as interactive WebXR digital twins.

1. **Spatial capture** registers depth, LiDAR, video references, and measured scale markers.
2. **Scene reconstruction** produces a metric GLB, semantic prop graph, and simplified collision mesh.
3. **PBR calibration** resolves base-color, normal, roughness, and metalness textures without baking illumination into albedo.
4. **Light matching** records exposure, color temperature, practical fixtures, reflection probes, and time-of-day conditions.
5. **Anchor alignment** connects the reconstruction to room-scoped WebXR and geospatial coordinates.
6. **Reality validation** compares scale, silhouettes, material response, lighting, and runtime performance before release.

## Blender Pipeline

Run the deterministic generator with Blender 4.2 or later:

```powershell
blender --background --python scripts/generate-digital-twin.py -- --project-root .
```

The generator creates reusable 256px PBR texture sets under `public/textures/generated`, embeds them in `public/models/amx-digital-twin.glb`, and preserves the editable source at `assets/blender/amx-digital-twin.blend`.

## Accuracy Contract

- Captures and simulations must identify their source and confidence.
- Scale requires at least one measured reference.
- PBR base color must not contain baked highlights or shadows.
- Physical changes remain approval-gated until a verified adapter confirms execution.
- Skill runs are persisted as digital-twin events for provenance and review.
