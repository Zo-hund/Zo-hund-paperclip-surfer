# AMX XR Path Finder for Meta Quest

Unity 6 companion client for AMX AIR Hubs learning missions on Meta Quest.

## Baseline

- Unity `6000.2.14f1` (Meta XR SDK 203 requires at least `6000.0.66f2`)
- OpenXR with Meta Quest Support
- Unity Meta OpenXR `2.4.0`
- XR Interaction Toolkit and XR Hands
- Meta XR Core, Interaction, OVR Interaction, and MR Utility Kit `203.0.0` from Meta's UPM registry
- MR Utility Kit for room understanding and persistent anchors
- AMX HTTPS APIs for agents, tools, rooms, anchors, and proof

## Open the project

1. Add this folder in Unity Hub using Unity `6000.2.14f1` or another Unity 6 editor supported by the installed Meta SDK.
2. Allow Unity Package Manager to restore the packages in `Packages/manifest.json`.
3. Allow the pinned Meta XR and LiveKit packages in `Packages/manifest.json` to restore.
4. Run `AMX XR > Configure Quest Project` to select Android, assign OpenXR, and enable Meta Quest support.
5. Run `AMX XR > Create Quest Starter Scene`.
6. Enable the hand-tracking and controller profiles required by the mission.
7. Run OpenXR Project Validation and resolve any device-specific required issues.

Build a development APK with `AMX XR > Build Quest Development APK`. For automation, invoke Unity with `-executeMethod AMX.XR.Editor.AmxQuestProjectConfigurator.BuildQuestDevelopmentApk`; output is written to `Builds/Quest/AMX-XR-Path-Finder-development.apk`.

See `../amx-air-hubs/docs/UNITY_QUEST_INTEGRATION.md` for scene wiring, LiveKit, MRUK, proof, and build guidance.

The starter scene contains a validated staging environment, mission runtime, proof replay service, a native LiveKit connector, MRUK device room loading, persistent Meta spatial anchors, bright preview lighting, a Meta XR camera rig with passthrough, and an `EditorOnly` preview camera.

The official LiveKit Unity SDK can be pinned to `v1.4.0` with `https://github.com/livekit/client-sdk-unity.git#v1.4.0`. It currently identifies itself as Developer Preview; qualify it on Quest hardware before treating it as a production transport.

## Meta Horizon Device Manager distribution

The managed Quest release is an externally hosted APK with package ID
`cc.amxairhubs.pathfinder`. Do not upload `AMX-XR-Path-Finder-development.apk`:
it is a development build and uses Android's debug certificate.

Set the release signing values in the current process and run the release build:

```powershell
$env:AMX_QUEST_KEYSTORE_PATH = 'C:\secure\amx-quest-release.keystore'
$env:AMX_QUEST_KEYSTORE_PASSWORD = '<secret>'
$env:AMX_QUEST_KEY_ALIAS = 'amx-quest-release'
$env:AMX_QUEST_KEY_PASSWORD = '<secret>'
$env:AMX_QUEST_VERSION_NAME = '1.0.0'
$env:AMX_QUEST_VERSION_CODE = '1'
.\Scripts\build-quest-release.ps1
```

The build emits:

- `Builds/Quest/AMX-XR-Path-Finder-release.apk`
- `Builds/Quest/AMX-XR-Path-Finder-release.json`

The JSON contains the APK file name, package ID, version, size, build time, and
SHA-256 value required by Device Manager. Host the APK at a direct HTTPS download
URL, then use **Apps & content > Manage apps > Add app > Externally hosted**. Add
the URL and SHA-256 value, complete Meta's compatibility scan, and assign the app
first to a test preset before a fleet-wide rollout.

Keep the keystore and passwords outside source control. Every future update must
use the same signing key and a larger `AMX_QUEST_VERSION_CODE`.
