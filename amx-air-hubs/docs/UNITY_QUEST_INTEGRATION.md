# Unity Quest Integration

`amx-xr-pathfinder-unity` is the native Meta Quest companion to the AMX AIR Hubs web control plane.

## Runtime boundary

The Unity client owns headset tracking, passthrough composition, room understanding, hands/controllers, spatial placement, and native rendering. The AMX web service remains authoritative for tenant scope, agent and MCP execution, LiveKit tokens, shared anchors, analytics, and OPPRRC proof.

The headset never receives LiveKit API secrets, proof-signing secrets, MCP gateway credentials, or agent provider keys.

## Meta installation

Use Unity `6000.0.66f2` or a later Unity 6 editor explicitly supported by the current Meta XR SDK. Install Meta XR All-in-One SDK through Meta's Unity Package Manager wrapper. Do not commit imported vendor packages.

In Android OpenXR settings enable:

- Meta Quest Support
- Hand Tracking Subsystem
- Meta Hand Tracking Aim
- Oculus Touch Controller Profile
- Meta Quest Touch Pro Controller Profile when required

Use Interaction SDK Quick Actions to create the Unity XR interaction rig. Install MR Utility Kit and add its room bootstrap before enabling anchor publication.

## Starter scene

Run `AMX XR > Create Quest Starter Scene` to generate `Assets/AMX/Scenes/QuestStarter.unity` with these objects:

1. `XR Origin` from Interaction SDK Quick Actions.
2. `AMX Runtime` with `AmxMissionRuntime`.
3. `AMX LiveKit` with `AmxLiveKitRoomBridge`.
4. `AMX Proof Sync` with `AmxProofSyncService`.
5. `Learning Station Anchor` with `AmxSpatialAnchorBridge`.
6. A world-space status panel bound to each component's `statusChanged` event.

The command also creates an `AMX Environment` asset with the staging HTTPS URL, serializes the canonical StreamingAssets mission JSON into an assignable Unity asset, adds bright preview lighting, and places the scene in Build Settings. Replace its preview camera with the Interaction SDK rig after importing Meta XR. Update the environment's tenant and learner identity before a shared test.

## LiveKit

`AmxLiveKitRoomBridge` requests a short-lived participant token from `POST /api/livekit/token`. It intentionally does not claim a room connection until a native Unity LiveKit adapter implementing `IAmxLiveKitConnector` is installed and assigned.

The official SDK can be installed from `https://github.com/livekit/client-sdk-unity.git#v1.4.0`. As of this integration it is labeled Developer Preview by LiveKit, so pin the version and complete the Quest device release gate before production use.

The adapter must:

- Connect only with the server URL and participant token returned by AMX.
- Publish microphone/camera only after explicit user permission.
- Subscribe to agent and participant tracks.
- Disconnect and release media tracks when the scene exits.

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

Before distributing an APK:

- Resolve every required OpenXR and Meta project validation issue.
- Test room scanning and anchor restoration on Quest 3/3S hardware.
- Verify hand, controller, passthrough, microphone, and network permission flows.
- Confirm a minimum sustained 72 FPS for the complete mission.
- Verify offline proof queueing and online synchronization.
- Verify tenant isolation and that secrets are absent from the APK.
- Test LiveKit reconnection and agent departure/rejoin behavior.

Official references:

- [Meta XR All-in-One SDK](https://developers.meta.com/horizon/downloads/package/meta-xr-sdk-all-in-one-upm/)
- [Interaction SDK with Unity XR](https://developers.meta.com/horizon/documentation/unity/unity-isdk-getting-started-unityxr/)
- [Unity Meta OpenXR package](https://docs.unity3d.com/Manual/com.unity.xr.meta-openxr.html)
