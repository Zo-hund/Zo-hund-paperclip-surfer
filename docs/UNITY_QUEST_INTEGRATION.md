# Unity Quest Integration

`amx-xr-pathfinder-unity` is the native Meta Quest companion to the AMX AIR Hubs web control plane.

## Runtime boundary

The Unity client owns headset tracking, passthrough composition, room understanding, hands/controllers, spatial placement, and native rendering. The AMX web service remains authoritative for tenant scope, agent and MCP execution, LiveKit tokens, shared anchors, analytics, and OPPRRC proof.

The headset never receives LiveKit API secrets, proof-signing secrets, MCP gateway credentials, or agent provider keys.

## Meta installation

Use Unity `6000.0.66f2` or a later Unity 6 editor explicitly supported by the current Meta XR SDK. The Unity project pins Meta XR Core, Interaction, OVR Interaction, and MR Utility Kit `203.0.0` through Meta's UPM registry; imported package caches are not committed.

In Android OpenXR settings enable:

- Meta Quest Support
- Hand Tracking Subsystem
- Meta Hand Tracking Aim
- Oculus Touch Controller Profile
- Meta Quest Touch Pro Controller Profile when required

Run `AMX XR > Configure Quest Project` to assign the Android OpenXR loader and enable Meta Quest Support. The scene generator adds the tracked Meta camera rig, passthrough layer, and MRUK device-room bootstrap.

## Starter scene

Run `AMX XR > Create Quest Starter Scene` to generate `Assets/AMX/Scenes/QuestStarter.unity` with these objects:

1. `Meta XR Rig` with headset tracking and passthrough.
2. `AMX Runtime` with mission, proof, LiveKit room, and native LiveKit connector components.
3. `MRUK Room Understanding` configured to load the device room at startup.
4. `Learning Station Anchor` with the AMX bridge and native Meta spatial-anchor provider.
5. `AMX Quest Status`, a compact in-headset panel for tenant, mission, and room state.
6. Bright preview lighting and an `EditorOnly` preview camera.

The command also creates an `AMX Environment` asset with the staging HTTPS URL, serializes the canonical StreamingAssets mission JSON into an assignable Unity asset, and places the scene in Build Settings. Update the environment's tenant and learner identity before a shared test.

## Blender worlds and digital-twin simulation

The starter scene includes two Blender-authored worlds:

- `AmxDigitalTwin.fbx` is a full-scale mixed-reality facility placed with its open edge ahead of the player spawn. Startup recenter makes the direction the operator faces at launch the entrance direction. It contains four enterable rack aisles, 40 server blades, containment, cooling equipment, and a telemetry console.
- `NexusControlRoom.fbx` is the full immersive operations room. It is disabled in passthrough mode and enabled when the operator switches to immersive mode.

Regenerate the source `.blend` files and Unity FBX assets from the repository root with Blender 4.2 or later:

```powershell
$blender = 'C:\Program Files\Blender Foundation\Blender 4.2\blender.exe'
$web = (Resolve-Path 'amx-air-hubs').Path
$models = (Resolve-Path 'amx-xr-pathfinder-unity\Assets\AMX\Worlds\Models').Path
& $blender --background --python "$web\scripts\generate-digital-twin.py"
& $blender --background --python "$web\scripts\export-unity-worlds.py" -- --project-root $web --unity-assets $models --world digital-twin
& $blender --background --python "$web\scripts\export-unity-worlds.py" -- --project-root $web --unity-assets $models --world nexus
```

The Unity configurator remaps the imported materials to Quest-ready Standard PBR materials using the generated metal and concrete base-color/normal maps. It also disables imported cameras, lights, animation, and blend shapes and applies mesh compression for the mobile XR build.

`AmxDataCenterSimulation` provides five governed operating scenarios: normal operations, tenant burst, hot aisle, network degradation, and UPS transfer. It updates rack health, blade status, temperature, load, PUE, cooling, network throughput, availability, and alarms in real time. The training flow progresses through Know, Do, and Be outcomes and queues OPPRRC proof if the service is offline.

Quest Touch controls:

- Left stick: head-oriented smooth movement; hold the stick click while moving to sprint.
- Right stick left/right: snap turn in Comfort/Balanced or smooth turn in Direct mode.
- Push and hold the right stick forward: aim the parabolic teleport arc; release to teleport to a valid green destination.
- Left/right grip: grab, carry, transfer, and physically throw inspection tools.
- Touch either index trigger: reveal that controller's pointer ray; press the trigger to operate a world-console control.
- Left controller menu button: cycle Comfort, Balanced, and Direct locomotion profiles.
- Hold both thumbstick clicks for 1.15 seconds: recenter tracking.
- Right thumbstick click without the left click: ask JAZ for a scenario review.
- `A`: next operating scenario.
- `B`: previous operating scenario.
- `X`: run the next governed skill (`dcim.inspect`, `rack.thermal-map`, then `incident.runbook`).
- `Y`: switch between the mixed-reality full-scale data center and the immersive Nexus control room.

The controller action dock exposes previous/next scenario, skill, JAZ, world mode, comfort profile, and recenter commands to both pointer rays. `OVRGrabber` grip volumes drive the included thermal probe, operations tablet, and access token. `OVRPlayerController` and `CharacterController` provide gravity, slope, step, and collision handling; the AMX teleport validator rejects steep or obstructed destinations.

The Comfort profile uses slower movement, 30-degree snap turns, and the strongest peripheral vignette. Balanced uses moderate movement, 45-degree snap turns, and a medium vignette. Direct uses faster movement, continuous turning, and a light vignette. Teleport remains available in every profile. Face an open play-space direction when launching the app; startup recenter places the player just outside the full-scale data-center entrance in that direction. Move or teleport forward to enter it. `Y` replaces the data center with the Nexus control room and restores it when pressed again.

Agent and tool requests use the real AMX endpoints when the configured API origin is authorized. On an offline or owner-authenticated stage, the headset returns a clearly labeled local governed simulation result so workshops can continue without pretending a remote tool ran.

## LiveKit

`AmxLiveKitRoomBridge` requests a short-lived participant token from `POST /api/livekit/token`. `AmxLiveKitConnector` uses the pinned LiveKit Unity SDK to connect, render remote video on the learning-station surface, and create spatialized audio sources for remote users and agents.

The starter scene joins `AMX-QUEST` automatically as a receive-only participant and reports token and room state on the headset panel and in `adb logcat`. Camera and microphone publishing remain disabled until a separate, explicit consent control enables them.

The Quest build uses Unity's `Activity` Android entry point because the LiveKit plugin initializes its audio bridge through JNI. Keep camera and microphone permissions in the Android manifest even while local publishing is disabled so a later consented media session can request them at runtime.

The official SDK can be installed from `https://github.com/livekit/client-sdk-unity.git#v1.4.0`. As of this integration it is labeled Developer Preview by LiveKit, so pin the version and complete the Quest device release gate before production use.

The connector:

- Connect only with the server URL and participant token returned by AMX.
- Publish microphone/camera only after explicit user permission.
- Subscribe to agent and participant tracks.
- Disconnect and release media tracks when the scene exits.

The public HTTPS stage can serve as the initial Quest API origin, but native clients need an explicit Supabase access-token flow instead of a browser cookie. Set the HTTPS origin in `AMX Environment.asset`, enroll the device to the intended tenant, and send the member bearer token on protected API calls. Never copy a browser cookie, LiveKit API key, or LiveKit API secret into the APK.

## Spatial anchors

Implement `IAmxSpatialAnchorProvider` with MRUK/Meta spatial anchors. The provider creates or restores the device-native persistent handle; `AmxSpatialAnchorBridge` sends the shared pose and opaque handle to `/api/anchors`.

Never treat the cloud pose as a substitute for device localization. Restore the native anchor first, then use the AMX pose for room synchronization and diagnostics.

## Agent tools

The Unity runtime uses the existing governed endpoints:

- `POST /api/agents/respond`
- `POST /api/agents/tools/invoke`

Tool results include source and status. A `blocked` trace must remain blocked in the headset UI. Physical actuation requires a separate authorized control plane and must not be inferred from an agent response.

## OPPRRC proof

Mission completion posts a `proof:complete` envelope to `/api/sync`. Failed submissions are retained in a replayable `PlayerPrefs` queue and `AmxProofSyncService` retries them in order. Production should move this queue to an encrypted local store before collecting sensitive evidence.

The server may add its HMAC attestation after validating the record. Client signatures identify the local record but are not a replacement for server attestation.

## Build gate

Create the scene and build the development APK in batch mode:

```powershell
$unity = 'C:\Program Files\Unity\Hub\Editor\6000.2.14f1\Editor\Unity.exe'
$project = (Resolve-Path 'amx-xr-pathfinder-unity').Path
$env:BEE_BUILD_THREADS = '1'
& $unity -batchmode -nographics -quit -projectPath $project -executeMethod AMX.XR.Editor.AmxQuestProjectConfigurator.CreateStarterScene -logFile -
& $unity -batchmode -nographics -quit -projectPath $project -executeMethod AMX.XR.Editor.AmxQuestProjectConfigurator.BuildQuestDevelopmentApk -logFile -
```

The output is `amx-xr-pathfinder-unity/Builds/Quest/AMX-XR-Path-Finder-development.apk` with package id `cc.amxairhubs.pathfinder`. The development method uses IL2CPP Debug to bypass optimizer instability in very large generated XR/LiveKit translation units, so its APK is intentionally much larger than a release build. The configurator pins IL2CPP conversion to one worker; `BEE_BUILD_THREADS=1` also limits native Clang workers and prevents memory-pressure failures on workstations with many CPU cores.

With Developer Mode enabled and the Quest connected by USB, install, launch, and collect runtime diagnostics with:

```powershell
& 'amx-xr-pathfinder-unity\Scripts\install-quest-development.ps1' -Capture
```

The script waits for the in-headset USB debugging approval, replaces the existing development build, launches the Quest activity, prints AMX simulation logs, and optionally saves a headset capture under `Builds/Quest/diagnostics`.

Before distributing an APK:

- Resolve every required OpenXR and Meta project validation issue.
- Test room scanning and anchor restoration on Quest 3/3S hardware.
- Verify hand, controller, passthrough, microphone, and network permission flows.
- Confirm a minimum sustained 72 FPS for the complete mission.
- Verify offline proof queueing and online synchronization.
- Verify tenant isolation and that secrets are absent from the APK.
- Test LiveKit reconnection and agent departure/rejoin behavior.
- Confirm the native API origin accepts an enrolled Quest identity without relying on browser cookies.

Official references:

- [Meta XR All-in-One SDK](https://developers.meta.com/horizon/downloads/package/meta-xr-sdk-all-in-one-upm/)
- [Interaction SDK with Unity XR](https://developers.meta.com/horizon/documentation/unity/unity-isdk-getting-started-unityxr/)
- [Unity Meta OpenXR package](https://docs.unity3d.com/Manual/com.unity.xr.meta-openxr.html)
