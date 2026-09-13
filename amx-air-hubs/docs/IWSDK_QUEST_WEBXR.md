# IWSDK Quest WebXR Runtime

AMX AIR Hubs uses Meta Immersive Web SDK (IWSDK) for the browser Quest path and Unity Meta XR for the native APK path. Both runtimes load the same Blender-authored data-center model and connect to the same AMX mission, room, agent, and proof state.

## Runtime boundary

| Mode | Renderer | Runtime |
| --- | --- | --- |
| Browser 3D | Three.js WebGPU with WebGL fallback | AMX desktop scene |
| Quest browser VR | Three.js WebGL/WebXR | IWSDK ECS, locomotion, grabbing, and physics |
| Native Quest APK | Unity 6 OpenXR | Meta XR SDK and MR Utility Kit |

WebXR on Quest uses the IWSDK WebGL renderer. WebGPU remains enabled for non-immersive browser scenes; it is not forced into an immersive WebXR session.

## Start the managed runtime

Requirements are Node.js 20.19+ or 22.12+ and pnpm 9+.

```powershell
pnpm install --frozen-lockfile
pnpm --filter @amx/air-hubs dev
pnpm --filter @amx/air-hubs dev:status
```

Open the runtime URL reported by `dev:status`, then visit `/play/vr/webxr-creator`. The Vite development plugin emulates a Meta Quest 3 and exposes the running IWSDK world to the local agent tools.

Stop the managed browser and runtime with:

```powershell
pnpm --filter @amx/air-hubs dev:down
```

## Quest controller map

- Left thumbstick moves relative to the headset view.
- Right thumbstick snap-turns or smooth-turns according to Comfort Settings.
- Trigger selects the three training tools and world targets.
- Grip grabs the cooling override, thermal scanner, and network probe from a distance.
- Tracked-hand pinch can grab the same tools.
- Teleport remains available through IWSDK's locomotion action mapping.

The player starts at `[2.75, 0.08, 2.9]`, inside the right-side service entrance of the full-scale 8.8 m by 7 m data-center floor. The network probe is within reach, Rack 04 is straight ahead, and the central twin remains visible without blocking the spawn. The Blender world is registered as both a static locomotion environment and a Havok triangle-mesh collider.

Locomotion currently runs on the main thread. In IWSDK 0.4.2, the worker path resets this scene's configured initial XR origin to `(0, 0, 0)`; the pod is small enough to remain within the Quest performance budget without the worker, and this keeps browser preview and headset placement identical.

## Agent-readable ECS

The runtime exposes these AMX components to IWSDK scene and ECS inspection tools:

- `AMXDigitalTwinNode`: rack identity, temperature, utilization, cooling, health, and simulation time.
- `AMXControllerDiagnostics`: left/right connection and trigger state.
- `AMXSkillProp`: skill identity, display label, and activation count.

Select and grab transitions are written into the existing AMX run timeline through `ModeExperiencePage`. The browser host also publishes runtime readiness, render counters, camera position, player position, and player quaternion as `data-*` diagnostics for release smoke tests.

## AI and IWER workflow

Warm the local IWSDK reference index once:

```powershell
pnpm --filter @amx/air-hubs reference:warmup
```

With the managed runtime running, inspect the available MCP and CLI surface:

```powershell
pnpm --filter @amx/air-hubs xr:status
pnpm --filter @amx/air-hubs exec iwsdk mcp inspect
pnpm --filter @amx/air-hubs exec iwsdk scene hierarchy
pnpm --filter @amx/air-hubs exec iwsdk ecs list-components
```

A controller test should verify this sequence:

1. Accept the emulated immersive session.
2. Confirm both controller diagnostics become connected.
3. Move the left thumbstick and confirm the XR origin changes position.
4. Turn with the right thumbstick.
5. Aim at a training prop and press trigger.
6. Hold grip, move the controller, and confirm `AMXSkillProp.activationCount` advances when the prop is grabbed.

## Blender and production assets

`assets/blender/amx-digital-twin.blend` is the editable source. `public/models/amx-digital-twin.glb` is the web runtime asset. Generated metal and concrete base-color, normal, and roughness maps are preloaded through IWSDK `AssetManager` and rebound to the GLB materials at startup.

Regenerate both source and GLB with Blender 4.2 or later:

```powershell
$blender = 'C:\Program Files\Blender Foundation\Blender 4.2\blender.exe'
& $blender --background --python scripts/generate-digital-twin.py -- --project-root $PWD
```

Production remains a static HTTPS Vite deployment. Run `pnpm verify` before publishing and test the staged `/play/vr/webxr-creator` route in Meta Quest Browser.

## Troubleshooting

- A desktop browser without IWER will fall back from VR to Browser 3D.
- Quest requires HTTPS, except for the browser's localhost exception.
- If the world loads but movement fails, inspect `AMX_Mini_Data_Center_Pod` for `LocomotionEnvironment` and confirm the locomotion system is running.
- If controllers do not appear, check the browser's immersive-session permission and inspect `AMXControllerDiagnostics` before changing mission code.
- If Havok returns HTML instead of WASM in development, keep `@babylonjs/havok` as a direct dependency and excluded from Vite dependency prebundling.
- If props are dark, verify the six generated PBR textures return HTTP 200, custom lighting remains enabled, and renderer exposure remains `1.42`.

Primary IWSDK references: [project setup](https://iwsdk.dev/guides/01-project-setup), [runtime overview](https://iwsdk.dev/guides/overview), and [AI-native development](https://iwsdk.dev/ai/).
