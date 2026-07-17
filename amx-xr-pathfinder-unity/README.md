# AMX XR Path Finder for Meta Quest

Unity 6 companion client for AMX AIR Hubs learning missions on Meta Quest.

## Baseline

- Unity `6000.2.14f1` (Meta XR SDK 203 requires at least `6000.0.66f2`)
- OpenXR with Meta Quest Support
- Unity Meta OpenXR `2.4.0`
- XR Interaction Toolkit and XR Hands
- Meta XR All-in-One SDK `203.0` installed separately through Unity Package Manager
- MR Utility Kit for room understanding and persistent anchors
- AMX HTTPS APIs for agents, tools, rooms, anchors, and proof

## Open the project

1. Add this folder in Unity Hub using Unity `6000.2.14f1` or another Unity 6 editor supported by the installed Meta SDK.
2. Allow Unity Package Manager to restore the packages in `Packages/manifest.json`.
3. Install Meta XR All-in-One SDK from Meta's Unity Package Manager download flow.
4. Run `AMX XR > Configure Quest Project`, then `AMX XR > Create Quest Starter Scene`.
5. Open Project Settings > XR Plug-in Management > OpenXR and enable OpenXR for Android.
6. Enable Meta Quest Support, Hand Tracking Subsystem, Meta Hand Tracking Aim, and the intended controller profiles.
7. Run OpenXR Project Validation and resolve all required issues.

See `../amx-air-hubs/docs/UNITY_QUEST_INTEGRATION.md` for scene wiring, LiveKit, MRUK, proof, and build guidance.

The starter scene contains a validated staging environment, mission runtime, proof replay service, LiveKit bridge, shared-anchor bridge, bright preview lighting, and an editor camera. Replace the preview camera with the Interaction SDK rig after importing Meta XR.

The official LiveKit Unity SDK can be pinned to `v1.4.0` with `https://github.com/livekit/client-sdk-unity.git#v1.4.0`. It currently identifies itself as Developer Preview; qualify it on Quest hardware before treating it as a production transport.
