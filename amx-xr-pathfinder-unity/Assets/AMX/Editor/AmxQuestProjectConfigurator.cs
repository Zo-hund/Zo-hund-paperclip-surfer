using System.Linq;
using AMX.XR.Configuration;
using AMX.XR.Integrations;
using AMX.XR.Missions;
using AMX.XR.Proof;
using AMX.XR.Realtime;
using AMX.XR.Simulation;
using AMX.XR.Spatial;
using Meta.XR.MRUtilityKit;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.Build.Reporting;
using UnityEditor.SceneManagement;
using UnityEditor.XR.Management;
using UnityEditor.XR.Management.Metadata;
using UnityEditor.XR.OpenXR.Features;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.SceneManagement;
using UnityEngine.XR.Management;
using UnityEngine.XR.OpenXR;
using UnityEngine.XR.OpenXR.Features.MetaQuestSupport;

namespace AMX.XR.Editor
{
    public static class AmxQuestProjectConfigurator
    {
        private const string MenuPath = "AMX XR/Configure Quest Project";
        private const string EnvironmentPath = "Assets/AMX/Configuration/AMX Environment.asset";
        private const string MissionPath = "Assets/StreamingAssets/amx/missions/data-center-operator.json";
        private const string MissionAssetPath = "Assets/AMX/Configuration/Data Center Operator Mission.asset";
        private const string ScenePath = "Assets/AMX/Scenes/QuestStarter.unity";
        private const string VideoMaterialPath = "Assets/AMX/Configuration/LiveKit Display.mat";
        private const string StatusMaterialPath = "Assets/AMX/Configuration/Quest Status Panel.mat";
        private const string ControllerRayMaterialPath = "Assets/AMX/Configuration/Controller Ray.mat";
        private const string TeleportValidMaterialPath = "Assets/AMX/Configuration/Teleport Valid.mat";
        private const string TeleportInvalidMaterialPath = "Assets/AMX/Configuration/Teleport Invalid.mat";
        private const string ControllerActionMaterialPath = "Assets/AMX/Configuration/Controller Action.mat";
        private const string ComfortVignetteMaterialPath = "Assets/AMX/Configuration/Comfort Vignette.mat";
        private const string NexusModelPath = "Assets/AMX/Worlds/Models/NexusControlRoom.fbx";
        private const string DigitalTwinModelPath = "Assets/AMX/Worlds/Models/AmxDigitalTwin.fbx";
        private const string WorldMaterialFolder = "Assets/AMX/Worlds/Materials";
        private const string WorldTextureFolder = "Assets/AMX/Worlds/Textures";
        private const string XrSettingsPath = "Assets/XR/XRGeneralSettingsPerBuildTarget.asset";
        private const string MetaCameraRigPath = "Packages/com.meta.xr.sdk.core/Prefabs/OVRCameraRig.prefab";
        private const string MetaControllerPrefabPath = "Packages/com.meta.xr.sdk.core/Prefabs/OVRControllerPrefab.prefab";
        private const string DevelopmentApkPath = "Builds/Quest/AMX-XR-Path-Finder-development.apk";
        private const string ReleaseApkPath = "Builds/Quest/AMX-XR-Path-Finder-release.apk";
        private const string ReleaseManifestPath = "Builds/Quest/AMX-XR-Path-Finder-release.json";
        private static readonly string[] RequiredOpenXrFeatureIds =
        {
            "com.meta.openxr.feature.metaxr",
            "com.unity.openxr.feature.input.oculustouch",
            "com.unity.openxr.feature.input.metaquestplus",
            "com.unity.openxr.feature.input.metaquestpro",
            "com.unity.openxr.feature.input.handtracking",
            "com.unity.openxr.feature.input.metahandtrackingaim",
            "com.unity.openxr.feature.compositionlayers"
        };

        [MenuItem(MenuPath)]
        public static void Configure()
        {
            PlayerSettings.companyName = "AMX AIR Hubs";
            PlayerSettings.productName = "AMX XR Path Finder";
            PlayerSettings.SetApplicationIdentifier(NamedBuildTarget.Android, "cc.amxairhubs.pathfinder");
            PlayerSettings.SetScriptingBackend(NamedBuildTarget.Android, ScriptingImplementation.IL2CPP);
            PlayerSettings.SetIl2CppCompilerConfiguration(NamedBuildTarget.Android,
                Il2CppCompilerConfiguration.Release);
            PlayerSettings.SetAdditionalIl2CppArgs("--jobs=1 --bee-jobs=1");
            PlayerSettings.Android.targetArchitectures = AndroidArchitecture.ARM64;
            PlayerSettings.Android.minSdkVersion = AndroidSdkVersions.AndroidApiLevel32;
            PlayerSettings.Android.targetSdkVersion = AndroidSdkVersions.AndroidApiLevelAuto;
            PlayerSettings.Android.applicationEntry = AndroidApplicationEntry.Activity;
            PlayerSettings.colorSpace = ColorSpace.Linear;
            PlayerSettings.MTRendering = true;
            PlayerSettings.stereoRenderingPath = StereoRenderingPath.Instancing;
            PlayerSettings.SetGraphicsAPIs(BuildTarget.Android, new[] { GraphicsDeviceType.Vulkan });
            PlayerSettings.Android.forceInternetPermission = true;
            PlayerSettings.Android.forceSDCardPermission = false;
            ConfigureOpenXr();
            ConfigureMetaCapabilities();

            var symbols = PlayerSettings.GetScriptingDefineSymbols(NamedBuildTarget.Android).Split(';').Where(value => !string.IsNullOrWhiteSpace(value)).ToHashSet();
            symbols.Add("AMX_QUEST");
            PlayerSettings.SetScriptingDefineSymbols(NamedBuildTarget.Android, string.Join(";", symbols));

            EditorUserBuildSettings.SwitchActiveBuildTarget(BuildTargetGroup.Android, BuildTarget.Android);
            AssetDatabase.SaveAssets();
            Debug.Log("AMX Quest settings applied with Android OpenXR, Meta Quest support, and deterministic IL2CPP scripting.");
        }

        [MenuItem("AMX XR/Create Quest Starter Scene")]
        public static void CreateStarterScene()
        {
            EnsureFolder("Assets/AMX", "Configuration");
            EnsureFolder("Assets/AMX", "Scenes");

            var environment = AssetDatabase.LoadAssetAtPath<AmxEnvironment>(EnvironmentPath);
            if (!environment)
            {
                environment = ScriptableObject.CreateInstance<AmxEnvironment>();
                AssetDatabase.CreateAsset(environment, EnvironmentPath);
            }
            Assign(environment, "defaultMissionId", "data-center-operator", "defaultAgentId", "jaz");

            var mission = AssetDatabase.LoadAssetAtPath<TextAsset>(MissionAssetPath);
            if (!mission)
            {
                var sourcePath = System.IO.Path.Combine(Application.dataPath, "StreamingAssets/amx/missions/data-center-operator.json");
                if (!System.IO.File.Exists(sourcePath)) throw new System.IO.FileNotFoundException("AMX starter mission is missing.", sourcePath);
                mission = new TextAsset(System.IO.File.ReadAllText(sourcePath));
                AssetDatabase.CreateAsset(mission, MissionAssetPath);
            }

            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            var runtime = new GameObject("AMX Runtime");
            var missionRuntime = runtime.AddComponent<AmxMissionRuntime>();
            Assign(missionRuntime, "environment", environment, "missionJson", mission);
            Assign(runtime.AddComponent<AmxProofSyncService>(), "environment", environment);

            var station = GameObject.CreatePrimitive(PrimitiveType.Quad);
            station.name = "Learning Station Anchor";
            station.transform.SetPositionAndRotation(new Vector3(0f, 1.45f, 3f), Quaternion.identity);
            station.transform.localScale = new Vector3(1.4f, 0.8f, 1f);
            var stationRenderer = station.GetComponent<Renderer>();
            stationRenderer.sharedMaterial = EnsureVideoMaterial();
            stationRenderer.enabled = false;
            var anchorProvider = station.AddComponent<AmxMetaSpatialAnchorProvider>();
            Assign(station.AddComponent<AmxSpatialAnchorBridge>(), "environment", environment, "anchorTarget", station.transform,
                "providerComponent", anchorProvider);

            var liveKitConnector = runtime.AddComponent<AmxLiveKitConnector>();
            Assign(liveKitConnector, "videoSurface", station.GetComponent<Renderer>());
            var roomBridge = runtime.AddComponent<AmxLiveKitRoomBridge>();
            Assign(roomBridge, "environment", environment, "joinOnStart", true,
                "connectorComponent", liveKitConnector);

            var worldOrigin = new GameObject("AMX Player-Aligned World").transform;
            var statusPanel = CreateStatusPanel(environment, missionRuntime, roomBridge);
            statusPanel.SetParent(worldOrigin, true);

            var roomUnderstanding = new GameObject("MRUK Room Understanding");
            var mruk = roomUnderstanding.AddComponent<MRUK>();
            mruk.SceneSettings = new MRUK.MRUKSettings
            {
                DataSource = MRUK.SceneDataSource.Device,
                LoadSceneOnStartup = true
            };

            var cameraRig = CreateMetaCameraRig(out var passthroughLayer);
            var nexusWorld = InstantiateWorldModel(NexusModelPath, "Nexus Control Room", Vector3.one, new Vector3(0f, 0f, 0f), false);
            nexusWorld.SetActive(false);
            var digitalTwin = InstantiateWorldModel(DigitalTwinModelPath, "AMX Enterable Data Center", Vector3.one,
                new Vector3(0f, 0f, 4.15f), true);
            nexusWorld.transform.SetParent(worldOrigin, true);
            digitalTwin.transform.SetParent(worldOrigin, true);
            CreateLocomotionColliders(nexusWorld, digitalTwin);
            var telemetryText = CreateSimulationConsole();
            telemetryText.transform.parent.SetParent(worldOrigin, true);
            var simulation = runtime.AddComponent<AmxDataCenterSimulation>();
            Assign(simulation, "nexusWorld", nexusWorld.transform, "digitalTwin", digitalTwin.transform,
                "telemetryText", telemetryText, "missionRuntime", missionRuntime);
            var simulationInput = runtime.AddComponent<AmxQuestSimulationInput>();
            Assign(simulationInput, "simulation", simulation,
                "passthroughLayer", passthroughLayer);
            var locomotion = CreateQuestLocomotion(cameraRig);
            CreateControllerHands(cameraRig);
            CreateControllerActionDock(telemetryText.transform.parent, simulation, simulationInput, locomotion);
            CreateGrabbableInspectionTools(worldOrigin);

            var lightObject = new GameObject("Key Light");
            var light = lightObject.AddComponent<Light>();
            light.type = LightType.Directional;
            light.intensity = 0.85f;
            light.color = new Color(0.96f, 0.98f, 1f);
            lightObject.transform.rotation = Quaternion.Euler(42f, -32f, 0f);
            lightObject.transform.SetParent(worldOrigin, true);
            light.shadows = LightShadows.Soft;

            RenderSettings.ambientMode = AmbientMode.Flat;
            RenderSettings.ambientLight = new Color(0.12f, 0.15f, 0.19f);
            RenderSettings.reflectionIntensity = 0.45f;
            CreatePointLight("Twin Cyan Fill", new Vector3(-2.6f, 3.2f, -0.8f), new Color(0.22f, 0.82f, 1f), 1.15f, 8f).SetParent(worldOrigin, true);
            CreatePointLight("Twin Warm Fill", new Vector3(2.8f, 2.6f, 0.4f), new Color(1f, 0.52f, 0.2f), 0.9f, 7f).SetParent(worldOrigin, true);
            CreatePointLight("Pod Work Light", new Vector3(0f, 3.8f, 2.2f), new Color(0.9f, 0.96f, 1f), 1.35f, 9f).SetParent(worldOrigin, true);

            var cameraObject = new GameObject("Preview Camera");
            cameraObject.tag = "EditorOnly";
            var camera = cameraObject.AddComponent<Camera>();
            camera.clearFlags = CameraClearFlags.SolidColor;
            camera.backgroundColor = new Color(0.025f, 0.04f, 0.075f);
            cameraObject.AddComponent<AudioListener>();
            cameraObject.transform.SetPositionAndRotation(new Vector3(0f, 1.6f, -2.5f), Quaternion.Euler(4f, 0f, 0f));

            EditorSceneManager.SaveScene(scene, ScenePath);
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };
            AssetDatabase.SaveAssets();
            Selection.activeGameObject = runtime;
            Debug.Log($"AMX Quest starter scene created at {ScenePath} with Meta camera tracking and passthrough.");
        }

        [MenuItem("AMX XR/Build Quest Development APK")]
        public static void BuildQuestDevelopmentApk()
        {
            Configure();
            PlayerSettings.SetIl2CppCompilerConfiguration(NamedBuildTarget.Android,
                Il2CppCompilerConfiguration.Debug);
            CreateStarterScene();

            var outputPath = System.IO.Path.GetFullPath(DevelopmentApkPath);
            System.IO.Directory.CreateDirectory(System.IO.Path.GetDirectoryName(outputPath));
            if (System.IO.File.Exists(outputPath)) System.IO.File.Delete(outputPath);

            var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions
            {
                scenes = new[] { ScenePath },
                locationPathName = outputPath,
                target = BuildTarget.Android,
                targetGroup = BuildTargetGroup.Android,
                options = BuildOptions.Development
            });

            if (report.summary.result != BuildResult.Succeeded)
            {
                throw new BuildFailedException($"Quest APK build failed with {report.summary.totalErrors} errors.");
            }

            Debug.Log($"AMX Quest development APK created at {outputPath} ({report.summary.totalSize} bytes).");
        }

        [MenuItem("AMX XR/Build Quest Release APK")]
        public static void BuildQuestReleaseApk()
        {
            Configure();
            ConfigureReleaseSigning();
            PlayerSettings.SetIl2CppCompilerConfiguration(NamedBuildTarget.Android,
                Il2CppCompilerConfiguration.Release);
            CreateStarterScene();

            var outputPath = System.IO.Path.GetFullPath(ReleaseApkPath);
            System.IO.Directory.CreateDirectory(System.IO.Path.GetDirectoryName(outputPath));
            if (System.IO.File.Exists(outputPath)) System.IO.File.Delete(outputPath);

            var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions
            {
                scenes = new[] { ScenePath },
                locationPathName = outputPath,
                target = BuildTarget.Android,
                targetGroup = BuildTargetGroup.Android,
                options = BuildOptions.None
            });

            if (report.summary.result != BuildResult.Succeeded)
            {
                throw new BuildFailedException($"Quest release APK build failed with {report.summary.totalErrors} errors.");
            }

            var sha256 = ComputeSha256(outputPath);
            var manifest = new QuestReleaseManifest
            {
                appName = PlayerSettings.productName,
                packageId = PlayerSettings.GetApplicationIdentifier(NamedBuildTarget.Android),
                versionName = PlayerSettings.bundleVersion,
                versionCode = PlayerSettings.Android.bundleVersionCode,
                fileName = System.IO.Path.GetFileName(outputPath),
                sizeBytes = new System.IO.FileInfo(outputPath).Length,
                sha256 = sha256,
                builtAtUtc = System.DateTime.UtcNow.ToString("O")
            };
            var manifestPath = System.IO.Path.GetFullPath(ReleaseManifestPath);
            System.IO.File.WriteAllText(manifestPath, JsonUtility.ToJson(manifest, true));
            Debug.Log($"AMX Quest release APK created at {outputPath} ({manifest.sizeBytes} bytes, SHA256 {sha256}).");
        }

        private static void ConfigureReleaseSigning()
        {
            var keystorePath = RequiredEnvironmentVariable("AMX_QUEST_KEYSTORE_PATH");
            var keystorePassword = RequiredEnvironmentVariable("AMX_QUEST_KEYSTORE_PASSWORD");
            var keyAlias = RequiredEnvironmentVariable("AMX_QUEST_KEY_ALIAS");
            var keyPassword = RequiredEnvironmentVariable("AMX_QUEST_KEY_PASSWORD");
            var versionName = RequiredEnvironmentVariable("AMX_QUEST_VERSION_NAME");
            var versionCodeValue = RequiredEnvironmentVariable("AMX_QUEST_VERSION_CODE");

            if (!System.IO.File.Exists(keystorePath))
            {
                throw new BuildFailedException($"Quest release keystore does not exist: {keystorePath}");
            }
            if (!int.TryParse(versionCodeValue, out var versionCode) || versionCode < 1)
            {
                throw new BuildFailedException("AMX_QUEST_VERSION_CODE must be a positive integer.");
            }

            PlayerSettings.bundleVersion = versionName;
            PlayerSettings.Android.bundleVersionCode = versionCode;
            PlayerSettings.Android.useCustomKeystore = true;
            PlayerSettings.Android.keystoreName = System.IO.Path.GetFullPath(keystorePath);
            PlayerSettings.Android.keystorePass = keystorePassword;
            PlayerSettings.Android.keyaliasName = keyAlias;
            PlayerSettings.Android.keyaliasPass = keyPassword;
        }

        private static string RequiredEnvironmentVariable(string name)
        {
            var value = System.Environment.GetEnvironmentVariable(name);
            if (string.IsNullOrWhiteSpace(value))
            {
                throw new BuildFailedException($"{name} is required for a Quest release build.");
            }
            return value.Trim();
        }

        private static string ComputeSha256(string filePath)
        {
            using var stream = System.IO.File.OpenRead(filePath);
            using var hash = System.Security.Cryptography.SHA256.Create();
            return string.Concat(hash.ComputeHash(stream).Select(value => value.ToString("x2")));
        }

        [System.Serializable]
        private sealed class QuestReleaseManifest
        {
            public string appName;
            public string packageId;
            public string versionName;
            public int versionCode;
            public string fileName;
            public long sizeBytes;
            public string sha256;
            public string builtAtUtc;
        }

        private static void ConfigureOpenXr()
        {
            EnsureFolder("Assets", "XR");
            var settingsPerTarget = AssetDatabase.LoadAssetAtPath<XRGeneralSettingsPerBuildTarget>(XrSettingsPath);
            if (!settingsPerTarget)
            {
                settingsPerTarget = ScriptableObject.CreateInstance<XRGeneralSettingsPerBuildTarget>();
                AssetDatabase.CreateAsset(settingsPerTarget, XrSettingsPath);
            }

            if (!settingsPerTarget.HasManagerSettingsForBuildTarget(BuildTargetGroup.Android))
            {
                settingsPerTarget.CreateDefaultManagerSettingsForBuildTarget(BuildTargetGroup.Android);
            }

            EditorBuildSettings.AddConfigObject(XRGeneralSettings.k_SettingsKey, settingsPerTarget, true);
            var manager = settingsPerTarget.ManagerSettingsForBuildTarget(BuildTargetGroup.Android);
            if (!XRPackageMetadataStore.AssignLoader(manager, typeof(OpenXRLoader).FullName, BuildTargetGroup.Android))
            {
                throw new System.InvalidOperationException("Could not assign the Android OpenXR loader.");
            }

            FeatureHelpers.RefreshFeatures(BuildTargetGroup.Android);
            var openXrSettings = OpenXRSettings.GetSettingsForBuildTargetGroup(BuildTargetGroup.Android);
            var metaQuestFeature = openXrSettings ? openXrSettings.GetFeature<MetaQuestFeature>() : null;
            if (!metaQuestFeature)
            {
                throw new System.InvalidOperationException("Meta Quest OpenXR support is unavailable.");
            }

            metaQuestFeature.enabled = true;
            EditorUtility.SetDirty(metaQuestFeature);
            foreach (var featureId in RequiredOpenXrFeatureIds)
            {
                var feature = FeatureHelpers.GetFeatureWithIdForBuildTarget(BuildTargetGroup.Android, featureId);
                if (!feature)
                {
                    throw new System.InvalidOperationException($"Required OpenXR feature is unavailable: {featureId}");
                }

                feature.enabled = true;
                EditorUtility.SetDirty(feature);
            }

            EditorUtility.SetDirty(settingsPerTarget);
        }

        private static void ConfigureMetaCapabilities()
        {
            var config = OVRProjectConfig.CachedProjectConfig;
            config.handTrackingSupport = OVRProjectConfig.HandTrackingSupport.ControllersAndHands;
            config.anchorSupport = OVRProjectConfig.AnchorSupport.Enabled;
            config.sharedAnchorSupport = OVRProjectConfig.FeatureSupport.Required;
            config.colocationSessionSupport = OVRProjectConfig.FeatureSupport.Supported;
            config.sceneSupport = OVRProjectConfig.FeatureSupport.Required;
            config.insightPassthroughSupport = OVRProjectConfig.FeatureSupport.Required;
            config.isPassthroughCameraAccessEnabled = true;
            OVRProjectConfig.CommitProjectConfig(config);
        }

        private static OVRCameraRig CreateMetaCameraRig(out OVRPassthroughLayer passthroughLayer)
        {
            var cameraRigPrefab = AssetDatabase.LoadAssetAtPath<GameObject>(MetaCameraRigPath);
            if (!cameraRigPrefab)
            {
                throw new System.IO.FileNotFoundException("The Meta XR camera rig prefab is missing.", MetaCameraRigPath);
            }

            var cameraRig = (GameObject)PrefabUtility.InstantiatePrefab(cameraRigPrefab);
            cameraRig.name = "Meta XR Rig";
            var manager = cameraRig.GetComponent<OVRManager>() ?? cameraRig.AddComponent<OVRManager>();
            manager.isInsightPassthroughEnabled = true;
            passthroughLayer = cameraRig.GetComponent<OVRPassthroughLayer>() ?? cameraRig.AddComponent<OVRPassthroughLayer>();
            passthroughLayer.overlayType = OVROverlay.OverlayType.Underlay;
            passthroughLayer.hidden = false;
            passthroughLayer.textureOpacity = 1f;

            foreach (var camera in cameraRig.GetComponentsInChildren<Camera>(true))
            {
                camera.clearFlags = CameraClearFlags.SolidColor;
                camera.backgroundColor = Color.clear;
            }

            return cameraRig.GetComponent<OVRCameraRig>();
        }

        private static void CreateLocomotionColliders(GameObject nexusWorld, GameObject digitalTwin)
        {
            var floor = new GameObject("Quest Walkable Floor");
            floor.transform.position = new Vector3(0f, -0.11f, 0f);
            var floorCollider = floor.AddComponent<BoxCollider>();
            floorCollider.size = new Vector3(18f, 0.2f, 18f);

            foreach (var renderer in nexusWorld.GetComponentsInChildren<Renderer>(true))
            {
                var name = renderer.name;
                if (name == "Nexus_Floor" || name.Contains("Wall") || name.StartsWith("OperatorConsole") ||
                    name.StartsWith("ConsoleBase") || name.StartsWith("HoloBase"))
                    if (!renderer.GetComponent<Collider>()) renderer.gameObject.AddComponent<BoxCollider>();
            }

            foreach (var renderer in digitalTwin.GetComponentsInChildren<Renderer>(true))
            {
                var name = renderer.name;
                if (name == "Twin_Asset_Core" || name.EndsWith("_Frame") || name.StartsWith("Actuator_Cooling") ||
                    name.StartsWith("Twin_Structure") || name == "Screen_Twin")
                    if (!renderer.GetComponent<Collider>()) renderer.gameObject.AddComponent<BoxCollider>();
            }
        }

        private static AmxQuestLocomotion CreateQuestLocomotion(OVRCameraRig cameraRig)
        {
            if (!cameraRig) throw new System.InvalidOperationException("The Meta camera rig has no OVRCameraRig component.");
            var rigRoot = cameraRig.gameObject;
            var controller = rigRoot.GetComponent<CharacterController>();
            if (!controller) controller = rigRoot.AddComponent<CharacterController>();
            controller.height = 1.78f;
            controller.radius = 0.24f;
            controller.center = new Vector3(0f, 0.89f, 0f);
            controller.stepOffset = 0.22f;
            controller.slopeLimit = 45f;
            controller.skinWidth = 0.035f;
            controller.minMoveDistance = 0.001f;

            var player = rigRoot.GetComponent<OVRPlayerController>();
            if (!player) player = rigRoot.AddComponent<OVRPlayerController>();
            player.Acceleration = 0.1f;
            player.Damping = 0.32f;
            player.BackAndSideDampen = 0.72f;
            player.RotationAmount = 1.05f;
            player.RotationRatchet = 45f;
            player.SnapRotation = true;
            player.HmdRotatesY = true;
            player.HmdResetsY = true;
            player.GravityModifier = 0.45f;
            player.useProfileData = true;

            var teleportArcObject = new GameObject("Right Controller Teleport Arc");
            teleportArcObject.transform.SetParent(cameraRig.rightControllerAnchor, false);
            var teleportArc = teleportArcObject.AddComponent<LineRenderer>();
            teleportArc.useWorldSpace = true;
            teleportArc.widthMultiplier = 0.018f;
            teleportArc.numCornerVertices = 3;
            teleportArc.numCapVertices = 4;
            teleportArc.alignment = LineAlignment.View;
            teleportArc.sharedMaterial = EnsureUnlitMaterial(TeleportValidMaterialPath, "Teleport Valid", new Color(0.04f, 0.95f, 0.62f, 0.92f));
            teleportArc.enabled = false;

            var reticle = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            reticle.name = "Teleport Destination";
            reticle.transform.localScale = new Vector3(0.2f, 0.006f, 0.2f);
            Object.DestroyImmediate(reticle.GetComponent<Collider>());
            var reticleRenderer = reticle.GetComponent<Renderer>();
            reticleRenderer.sharedMaterial = teleportArc.sharedMaterial;
            reticle.SetActive(false);

            var vignette = GameObject.CreatePrimitive(PrimitiveType.Quad);
            vignette.name = "Comfort Vignette";
            vignette.transform.SetParent(cameraRig.centerEyeAnchor, false);
            vignette.transform.localPosition = new Vector3(0f, 0f, 0.32f);
            vignette.transform.localRotation = Quaternion.identity;
            vignette.transform.localScale = new Vector3(0.86f, 0.58f, 1f);
            Object.DestroyImmediate(vignette.GetComponent<Collider>());
            var vignetteRenderer = vignette.GetComponent<Renderer>();
            vignetteRenderer.sharedMaterial = EnsureComfortVignetteMaterial();
            vignetteRenderer.shadowCastingMode = ShadowCastingMode.Off;
            vignetteRenderer.receiveShadows = false;

            var statusObject = new GameObject("Locomotion Status");
            statusObject.transform.SetParent(cameraRig.centerEyeAnchor, false);
            statusObject.transform.localPosition = new Vector3(-0.38f, -0.29f, 1.05f);
            var status = statusObject.AddComponent<TextMesh>();
            status.anchor = TextAnchor.UpperLeft;
            status.alignment = TextAlignment.Left;
            status.characterSize = 0.0018f;
            status.fontSize = 42;
            status.color = new Color(0.62f, 0.92f, 1f);
            status.richText = false;

            var locomotion = rigRoot.AddComponent<AmxQuestLocomotion>();
            Assign(locomotion, "cameraRig", cameraRig, "playerController", player, "characterController", controller,
                "teleportSource", cameraRig.rightControllerAnchor, "teleportArc", teleportArc,
                "teleportReticle", reticle.transform, "teleportReticleRenderer", reticleRenderer,
                "validTeleportMaterial", teleportArc.sharedMaterial,
                "invalidTeleportMaterial", EnsureUnlitMaterial(TeleportInvalidMaterialPath, "Teleport Invalid", new Color(1f, 0.12f, 0.18f, 0.92f)),
                "comfortVignette", vignetteRenderer, "locomotionStatus", status);
            return locomotion;
        }

        private static void CreateControllerHands(OVRCameraRig cameraRig)
        {
            CreateControllerHand(cameraRig.leftControllerAnchor, cameraRig.gameObject, OVRInput.Controller.LTouch,
                new Color(0.05f, 0.78f, 1f, 0.72f));
            CreateControllerHand(cameraRig.rightControllerAnchor, cameraRig.gameObject, OVRInput.Controller.RTouch,
                new Color(1f, 0.08f, 0.68f, 0.72f));
        }

        private static void CreateControllerHand(Transform anchor, GameObject playerRoot, OVRInput.Controller controller,
            Color rayColor)
        {
            var controllerPrefab = AssetDatabase.LoadAssetAtPath<GameObject>(MetaControllerPrefabPath);
            if (!controllerPrefab)
                throw new System.IO.FileNotFoundException("Meta's controller model prefab is missing.", MetaControllerPrefabPath);
            var controllerObject = (GameObject)PrefabUtility.InstantiatePrefab(controllerPrefab);
            controllerObject.name = controller == OVRInput.Controller.LTouch ? "Left Touch Controller" : "Right Touch Controller";
            controllerObject.transform.SetParent(anchor, false);
            var model = controllerObject.GetComponent<OVRControllerHelper>();
            model.m_controller = controller;

            var grabObject = new GameObject(controller == OVRInput.Controller.LTouch ? "Left Grip Grabber" : "Right Grip Grabber");
            grabObject.transform.SetParent(anchor, false);
            var rigidbody = grabObject.AddComponent<Rigidbody>();
            rigidbody.isKinematic = true;
            rigidbody.useGravity = false;
            rigidbody.collisionDetectionMode = CollisionDetectionMode.ContinuousSpeculative;
            var grabVolume = grabObject.AddComponent<SphereCollider>();
            grabVolume.radius = 0.095f;
            grabVolume.isTrigger = true;
            var grabber = grabObject.AddComponent<OVRGrabber>();
            Assign(grabber, "m_parentHeldObject", false, "m_moveHandPosition", false,
                "m_gripTransform", grabObject.transform, "m_grabVolumes", new Collider[] { grabVolume },
                "m_controller", controller, "m_parentTransform", anchor, "m_player", playerRoot);

            var rayObject = new GameObject(controller == OVRInput.Controller.LTouch ? "Left Controller Ray" : "Right Controller Ray");
            rayObject.transform.SetParent(anchor, false);
            rayObject.transform.localPosition = new Vector3(0f, 0f, 0.035f);
            var beam = rayObject.AddComponent<LineRenderer>();
            beam.useWorldSpace = true;
            beam.widthMultiplier = 0.007f;
            beam.numCapVertices = 3;
            beam.alignment = LineAlignment.View;
            beam.sharedMaterial = EnsureUnlitMaterial(ControllerRayMaterialPath, "Controller Ray", Color.white);
            beam.startColor = rayColor;
            beam.endColor = new Color(rayColor.r, rayColor.g, rayColor.b, 0.2f);

            var reticle = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            reticle.name = controller == OVRInput.Controller.LTouch ? "Left Ray Reticle" : "Right Ray Reticle";
            reticle.transform.localScale = Vector3.one * 0.027f;
            Object.DestroyImmediate(reticle.GetComponent<Collider>());
            reticle.GetComponent<Renderer>().sharedMaterial = beam.sharedMaterial;
            reticle.SetActive(false);

            var controllerRay = rayObject.AddComponent<AmxQuestControllerRay>();
            Assign(controllerRay, "controller", controller, "beam", beam, "reticle", reticle.transform);
        }

        private static void CreateControllerActionDock(Transform consolePanel, AmxDataCenterSimulation simulation,
            AmxQuestSimulationInput simulationInput, AmxQuestLocomotion locomotion)
        {
            var dock = new GameObject("Controller Action Dock");
            dock.transform.SetPositionAndRotation(
                consolePanel.position + consolePanel.rotation * new Vector3(0f, -0.73f, -0.015f), consolePanel.rotation);

            var backplate = GameObject.CreatePrimitive(PrimitiveType.Cube);
            backplate.name = "Action Dock Backplate";
            backplate.transform.SetParent(dock.transform, false);
            backplate.transform.localScale = new Vector3(1.42f, 0.48f, 0.035f);
            backplate.GetComponent<Renderer>().sharedMaterial = EnsureQuestWorldMaterial("AMX Dark Metal",
                new Color(0.03f, 0.08f, 0.11f), 0.5f, 0.48f, Color.black);
            Object.DestroyImmediate(backplate.GetComponent<Collider>());

            var actions = new[]
            {
                ("PREV", AmxQuestControlAction.PreviousScenario, new Color(0.08f, 0.36f, 0.52f)),
                ("NEXT", AmxQuestControlAction.NextScenario, new Color(0.02f, 0.58f, 0.72f)),
                ("SKILL", AmxQuestControlAction.RunSkill, new Color(0.58f, 0.08f, 0.62f)),
                ("JAZ", AmxQuestControlAction.AskAgent, new Color(0.82f, 0.22f, 0.54f)),
                ("WORLD", AmxQuestControlAction.ToggleWorld, new Color(0.58f, 0.34f, 0.05f)),
                ("COMFORT", AmxQuestControlAction.CycleComfort, new Color(0.08f, 0.5f, 0.3f)),
                ("CENTER", AmxQuestControlAction.Recenter, new Color(0.34f, 0.38f, 0.46f))
            };

            for (var index = 0; index < actions.Length; index++)
            {
                var row = index < 4 ? 0 : 1;
                var column = row == 0 ? index : index - 4;
                var x = row == 0 ? -0.48f + column * 0.32f : -0.32f + column * 0.32f;
                var y = row == 0 ? 0.1f : -0.11f;
                CreateControllerActionButton(dock.transform, new Vector3(x, y, -0.055f), actions[index].Item1,
                    actions[index].Item2, actions[index].Item3, simulation, simulationInput, locomotion);
            }
        }

        private static void CreateControllerActionButton(Transform parent, Vector3 position, string label,
            AmxQuestControlAction action, Color color, AmxDataCenterSimulation simulation,
            AmxQuestSimulationInput simulationInput, AmxQuestLocomotion locomotion)
        {
            var button = GameObject.CreatePrimitive(PrimitiveType.Cube);
            button.name = $"Controller Action {label}";
            button.transform.SetParent(parent, false);
            button.transform.localPosition = position;
            button.transform.localScale = new Vector3(0.27f, 0.14f, 0.065f);
            var renderer = button.GetComponent<Renderer>();
            renderer.sharedMaterial = EnsureControllerActionMaterial();
            var target = button.AddComponent<AmxQuestControlTarget>();
            Assign(target, "action", action, "simulation", simulation, "simulationInput", simulationInput,
                "locomotion", locomotion, "targetRenderer", renderer, "idleColor", color,
                "hoverColor", Color.Lerp(color, Color.white, 0.55f));

            var textObject = new GameObject($"{label} Label");
            textObject.transform.SetParent(parent, false);
            textObject.transform.localPosition = position + new Vector3(0f, 0f, -0.04f);
            var text = textObject.AddComponent<TextMesh>();
            text.text = label;
            text.anchor = TextAnchor.MiddleCenter;
            text.alignment = TextAlignment.Center;
            text.characterSize = 0.008f;
            text.fontSize = 48;
            text.color = new Color(0.9f, 0.98f, 1f);
            text.richText = false;
        }

        private static void CreateGrabbableInspectionTools(Transform parent)
        {
            var tray = GameObject.CreatePrimitive(PrimitiveType.Cube);
            tray.name = "XR Inspection Tool Tray";
            tray.transform.position = new Vector3(-1.45f, 0.72f, 1.35f);
            tray.transform.localScale = new Vector3(1.05f, 0.12f, 0.48f);
            tray.transform.SetParent(parent, true);
            tray.GetComponent<Renderer>().sharedMaterial = EnsureQuestWorldMaterial("AMX Dark Metal",
                new Color(0.03f, 0.08f, 0.11f), 0.5f, 0.48f, Color.black);

            CreateGrabbableTool("XR Thermal Probe", PrimitiveType.Capsule, new Vector3(-1.75f, 1.02f, 1.35f),
                new Vector3(0.085f, 0.24f, 0.085f), EnsureQuestWorldMaterial("AMX Magenta",
                    new Color(0.42f, 0.03f, 0.48f), 0.3f, 0.6f, new Color(1f, 0.06f, 0.72f) * 1.4f), parent);
            CreateGrabbableTool("XR Operations Tablet", PrimitiveType.Cube, new Vector3(-1.43f, 1.02f, 1.35f),
                new Vector3(0.22f, 0.04f, 0.28f), EnsureQuestWorldMaterial("AMX Cyan",
                    new Color(0.02f, 0.48f, 0.72f), 0.3f, 0.62f, new Color(0.04f, 0.7f, 1f) * 1.7f), parent);
            CreateGrabbableTool("XR Access Token", PrimitiveType.Cylinder, new Vector3(-1.1f, 0.96f, 1.35f),
                new Vector3(0.12f, 0.035f, 0.12f), EnsureQuestWorldMaterial("AMX Gold",
                    new Color(0.55f, 0.32f, 0.04f), 0.48f, 0.56f, new Color(1f, 0.48f, 0.05f)), parent);
        }

        private static void CreateGrabbableTool(string name, PrimitiveType primitive, Vector3 position, Vector3 scale,
            Material material, Transform parent)
        {
            var tool = GameObject.CreatePrimitive(primitive);
            tool.name = name;
            tool.transform.position = position;
            tool.transform.localScale = scale;
            tool.transform.SetParent(parent, true);
            tool.GetComponent<Renderer>().sharedMaterial = material;
            var body = tool.AddComponent<Rigidbody>();
            body.mass = 0.32f;
            body.linearDamping = 1.8f;
            body.angularDamping = 0.85f;
            body.collisionDetectionMode = CollisionDetectionMode.ContinuousDynamic;
            var grabbable = tool.AddComponent<OVRGrabbable>();
            Assign(grabbable, "m_allowOffhandGrab", true, "m_snapPosition", false, "m_snapOrientation", false,
                "m_grabPoints", new Collider[] { tool.GetComponent<Collider>() });
        }

        private static void EnsureFolder(string parent, string child)
        {
            var path = $"{parent}/{child}";
            if (!AssetDatabase.IsValidFolder(path)) AssetDatabase.CreateFolder(parent, child);
        }

        private static Material EnsureVideoMaterial()
        {
            var material = AssetDatabase.LoadAssetAtPath<Material>(VideoMaterialPath);
            if (material) return material;

            var shader = Shader.Find("Unlit/Texture");
            if (!shader) throw new System.InvalidOperationException("Unity's Unlit/Texture shader is unavailable.");
            material = new Material(shader) { name = "LiveKit Display" };
            AssetDatabase.CreateAsset(material, VideoMaterialPath);
            return material;
        }

        private static Transform CreateStatusPanel(AmxEnvironment environment, AmxMissionRuntime missionRuntime,
            AmxLiveKitRoomBridge roomBridge)
        {
            var panel = GameObject.CreatePrimitive(PrimitiveType.Quad);
            panel.name = "AMX Quest Status";
            panel.transform.SetPositionAndRotation(new Vector3(0f, 1.55f, 1.75f), Quaternion.identity);
            panel.transform.localScale = new Vector3(0.86f, 0.38f, 1f);
            panel.GetComponent<Renderer>().sharedMaterial = EnsureStatusMaterial();
            Object.DestroyImmediate(panel.GetComponent<Collider>());

            var textObject = new GameObject("Status Text");
            textObject.transform.SetParent(panel.transform, false);
            textObject.transform.localPosition = new Vector3(-0.43f, 0.36f, -0.012f);
            textObject.transform.localScale = new Vector3(0.86f, 1.9f, 1f);
            var text = textObject.AddComponent<TextMesh>();
            text.anchor = TextAnchor.UpperLeft;
            text.alignment = TextAlignment.Left;
            text.characterSize = 0.0105f;
            text.fontSize = 48;
            text.color = new Color(0.78f, 0.95f, 1f);
            text.richText = false;

            var controller = panel.AddComponent<AmxQuestStatusPanel>();
            Assign(controller, "environment", environment, "missionRuntime", missionRuntime,
                "roomBridge", roomBridge, "statusText", text);
            return panel.transform;
        }

        private static GameObject InstantiateWorldModel(string assetPath, string instanceName, Vector3 scale,
            Vector3 target, bool centerOnTarget)
        {
            ConfigureQuestModelImporter(assetPath);
            var prefab = AssetDatabase.LoadAssetAtPath<GameObject>(assetPath);
            if (!prefab) throw new System.IO.FileNotFoundException($"The Blender world model is missing: {assetPath}", assetPath);
            var instance = (GameObject)PrefabUtility.InstantiatePrefab(prefab);
            instance.name = instanceName;
            instance.transform.localScale = scale;

            var renderers = instance.GetComponentsInChildren<Renderer>(true);
            if (renderers.Length == 0) throw new System.InvalidOperationException($"The Blender world has no renderers: {assetPath}");
            ApplyQuestWorldMaterials(renderers);
            var bounds = renderers[0].bounds;
            for (var index = 1; index < renderers.Length; index++) bounds.Encapsulate(renderers[index].bounds);
            var offset = centerOnTarget
                ? new Vector3(target.x - bounds.center.x, target.y - bounds.min.y, target.z - bounds.center.z)
                : new Vector3(target.x, target.y - bounds.min.y, target.z);
            instance.transform.position += offset;

            foreach (var renderer in renderers)
            {
                renderer.shadowCastingMode = ShadowCastingMode.On;
                renderer.receiveShadows = true;
                renderer.lightProbeUsage = LightProbeUsage.BlendProbes;
            }

            Debug.Log($"AMX Blender world: {instanceName}, renderers={renderers.Length}, bounds={bounds.size}");
            return instance;
        }

        private static void ApplyQuestWorldMaterials(Renderer[] renderers)
        {
            foreach (var renderer in renderers)
            {
                var materials = renderer.sharedMaterials;
                for (var index = 0; index < materials.Length; index++)
                {
                    if (!materials[index]) continue;
                    materials[index] = ResolveQuestWorldMaterial(materials[index].name);
                }
                renderer.sharedMaterials = materials;
            }
        }

        private static Material ResolveQuestWorldMaterial(string sourceName)
        {
            if (sourceName.StartsWith("AMX_DarkMetal")) return EnsureQuestWorldMaterial("AMX Dark Metal", new Color(0.06f, 0.14f, 0.18f), 0.58f, 0.52f, Color.black, "metal-basecolor.png", "metal-normal.png");
            if (sourceName.StartsWith("AMX_Panel")) return EnsureQuestWorldMaterial("AMX Panel Alloy", new Color(0.12f, 0.42f, 0.52f), 0.42f, 0.48f, Color.black, "metal-basecolor.png", "metal-normal.png");
            if (sourceName.StartsWith("AMX_ConcreteFloor")) return EnsureQuestWorldMaterial("AMX Concrete", new Color(0.55f, 0.62f, 0.66f), 0.05f, 0.22f, Color.black, "concrete-basecolor.png", "concrete-normal.png");
            if (sourceName.StartsWith("AMX_Cyan")) return EnsureQuestWorldMaterial("AMX Cyan", new Color(0.02f, 0.48f, 0.72f), 0.3f, 0.62f, new Color(0.04f, 0.7f, 1f) * 1.7f);
            if (sourceName.StartsWith("AMX_Magenta")) return EnsureQuestWorldMaterial("AMX Magenta", new Color(0.42f, 0.03f, 0.48f), 0.3f, 0.6f, new Color(1f, 0.06f, 0.72f) * 1.4f);
            if (sourceName.StartsWith("AMX_Green")) return EnsureQuestWorldMaterial("AMX Green", new Color(0.03f, 0.34f, 0.16f), 0.25f, 0.58f, new Color(0.08f, 1f, 0.4f) * 1.25f);
            if (sourceName.StartsWith("AMX_Gold")) return EnsureQuestWorldMaterial("AMX Gold", new Color(0.55f, 0.32f, 0.04f), 0.48f, 0.56f, new Color(1f, 0.48f, 0.05f));
            if (sourceName.StartsWith("AMX_Glass")) return EnsureQuestWorldMaterial("AMX Display Glass", new Color(0.04f, 0.22f, 0.3f), 0.08f, 0.72f, new Color(0.03f, 0.45f, 0.62f));
            if (sourceName.StartsWith("Nexus graphite")) return EnsureQuestWorldMaterial("Nexus Graphite", new Color(0.018f, 0.04f, 0.055f), 0.7f, 0.62f, Color.black);
            if (sourceName.StartsWith("Panel alloy")) return EnsureQuestWorldMaterial("Nexus Panel", new Color(0.035f, 0.14f, 0.18f), 0.56f, 0.65f, Color.black);
            if (sourceName.StartsWith("Cyan emitter")) return EnsureQuestWorldMaterial("Nexus Cyan", new Color(0.01f, 0.35f, 0.48f), 0.25f, 0.7f, new Color(0.04f, 0.75f, 1f) * 1.5f);
            if (sourceName.StartsWith("Magenta emitter")) return EnsureQuestWorldMaterial("Nexus Magenta", new Color(0.3f, 0.015f, 0.2f), 0.22f, 0.7f, new Color(1f, 0.04f, 0.62f) * 1.3f);
            if (sourceName.StartsWith("Gold emitter")) return EnsureQuestWorldMaterial("Nexus Gold", new Color(0.32f, 0.17f, 0.025f), 0.4f, 0.68f, new Color(1f, 0.42f, 0.04f));
            if (sourceName.StartsWith("Screen standby")) return EnsureQuestWorldMaterial("Nexus Screen", new Color(0.012f, 0.08f, 0.11f), 0.05f, 0.72f, new Color(0.02f, 0.32f, 0.42f));
            return EnsureQuestWorldMaterial("AMX Neutral", new Color(0.16f, 0.2f, 0.23f), 0.2f, 0.38f, Color.black);
        }

        private static Material EnsureQuestWorldMaterial(string name, Color color, float metallic, float smoothness,
            Color emission, string baseTextureName = null, string normalTextureName = null)
        {
            EnsureFolder("Assets/AMX/Worlds", "Materials");
            var assetPath = $"{WorldMaterialFolder}/{name}.mat";
            var material = AssetDatabase.LoadAssetAtPath<Material>(assetPath);
            if (!material)
            {
                var shader = Shader.Find("Standard");
                if (!shader) throw new System.InvalidOperationException("Unity's Standard shader is unavailable.");
                material = new Material(shader) { name = name };
                AssetDatabase.CreateAsset(material, assetPath);
            }

            material.color = color;
            material.SetFloat("_Metallic", metallic);
            material.SetFloat("_Glossiness", smoothness);
            if (!string.IsNullOrWhiteSpace(baseTextureName)) material.mainTexture = LoadWorldTexture(baseTextureName, false);
            if (!string.IsNullOrWhiteSpace(normalTextureName))
            {
                material.SetTexture("_BumpMap", LoadWorldTexture(normalTextureName, true));
                material.SetFloat("_BumpScale", 0.42f);
                material.EnableKeyword("_NORMALMAP");
            }
            if (emission.maxColorComponent > 0f)
            {
                material.SetColor("_EmissionColor", emission);
                material.EnableKeyword("_EMISSION");
            }
            else
            {
                material.SetColor("_EmissionColor", Color.black);
                material.DisableKeyword("_EMISSION");
            }
            EditorUtility.SetDirty(material);
            return material;
        }

        private static Texture2D LoadWorldTexture(string fileName, bool normalMap)
        {
            var assetPath = $"{WorldTextureFolder}/{fileName}";
            if (normalMap && AssetImporter.GetAtPath(assetPath) is TextureImporter importer && importer.textureType != TextureImporterType.NormalMap)
            {
                importer.textureType = TextureImporterType.NormalMap;
                importer.SaveAndReimport();
            }
            var texture = AssetDatabase.LoadAssetAtPath<Texture2D>(assetPath);
            if (!texture) throw new System.IO.FileNotFoundException($"World texture is missing: {assetPath}", assetPath);
            return texture;
        }

        private static void ConfigureQuestModelImporter(string assetPath)
        {
            if (AssetImporter.GetAtPath(assetPath) is not ModelImporter importer) return;
            var changed = importer.importAnimation || importer.importBlendShapes || importer.importCameras ||
                          importer.importLights || importer.meshCompression != ModelImporterMeshCompression.Medium || importer.isReadable;
            if (!changed) return;
            importer.importAnimation = false;
            importer.importBlendShapes = false;
            importer.importCameras = false;
            importer.importLights = false;
            importer.meshCompression = ModelImporterMeshCompression.Medium;
            importer.isReadable = false;
            importer.SaveAndReimport();
        }

        private static TextMesh CreateSimulationConsole()
        {
            var panel = GameObject.CreatePrimitive(PrimitiveType.Quad);
            panel.name = "Data Center Operations Console";
            var position = new Vector3(2.15f, 1.62f, 1.25f);
            var viewer = new Vector3(0f, 1.62f, 0f);
            panel.transform.SetPositionAndRotation(position, Quaternion.LookRotation((position - viewer).normalized, Vector3.up));
            panel.transform.localScale = new Vector3(1.65f, 1.05f, 1f);
            panel.GetComponent<Renderer>().sharedMaterial = EnsureStatusMaterial();
            Object.DestroyImmediate(panel.GetComponent<Collider>());

            var textObject = new GameObject("Telemetry Text");
            textObject.transform.SetParent(panel.transform, false);
            textObject.transform.localPosition = new Vector3(-0.45f, 0.42f, -0.012f);
            textObject.transform.localScale = new Vector3(0.82f, 1.28f, 1f);
            var text = textObject.AddComponent<TextMesh>();
            text.anchor = TextAnchor.UpperLeft;
            text.alignment = TextAlignment.Left;
            text.characterSize = 0.0095f;
            text.fontSize = 48;
            text.color = new Color(0.76f, 0.95f, 1f);
            text.richText = false;
            return text;
        }

        private static Transform CreatePointLight(string name, Vector3 position, Color color, float intensity, float range)
        {
            var lightObject = new GameObject(name);
            lightObject.transform.position = position;
            var light = lightObject.AddComponent<Light>();
            light.type = LightType.Point;
            light.color = color;
            light.intensity = intensity;
            light.range = range;
            light.shadows = LightShadows.None;
            return lightObject.transform;
        }

        private static Material EnsureUnlitMaterial(string assetPath, string name, Color color)
        {
            var material = AssetDatabase.LoadAssetAtPath<Material>(assetPath);
            if (!material)
            {
                var shader = Shader.Find("Sprites/Default");
                if (!shader) throw new System.InvalidOperationException("Unity's Sprites/Default shader is unavailable.");
                material = new Material(shader) { name = name };
                AssetDatabase.CreateAsset(material, assetPath);
            }
            material.color = color;
            material.renderQueue = 4000;
            EditorUtility.SetDirty(material);
            return material;
        }

        private static Material EnsureControllerActionMaterial()
        {
            var material = AssetDatabase.LoadAssetAtPath<Material>(ControllerActionMaterialPath);
            if (!material)
            {
                var shader = Shader.Find("Standard");
                if (!shader) throw new System.InvalidOperationException("Unity's Standard shader is unavailable.");
                material = new Material(shader) { name = "Controller Action" };
                AssetDatabase.CreateAsset(material, ControllerActionMaterialPath);
            }
            material.color = new Color(0.04f, 0.3f, 0.42f);
            material.SetFloat("_Metallic", 0.35f);
            material.SetFloat("_Glossiness", 0.7f);
            material.EnableKeyword("_EMISSION");
            material.SetColor("_EmissionColor", new Color(0.02f, 0.16f, 0.22f));
            EditorUtility.SetDirty(material);
            return material;
        }

        private static Material EnsureComfortVignetteMaterial()
        {
            var material = AssetDatabase.LoadAssetAtPath<Material>(ComfortVignetteMaterialPath);
            if (!material)
            {
                var shader = Shader.Find("AMX/XR Comfort Vignette");
                if (!shader) throw new System.InvalidOperationException("The AMX XR comfort vignette shader is unavailable.");
                material = new Material(shader) { name = "Comfort Vignette" };
                AssetDatabase.CreateAsset(material, ComfortVignetteMaterialPath);
            }
            material.SetColor("_Color", new Color(0f, 0f, 0f, 0f));
            material.SetFloat("_Radius", 0.27f);
            material.SetFloat("_Feather", 0.3f);
            material.renderQueue = 4000;
            EditorUtility.SetDirty(material);
            return material;
        }

        private static Material EnsureStatusMaterial()
        {
            var material = AssetDatabase.LoadAssetAtPath<Material>(StatusMaterialPath);
            if (material) return material;

            var shader = Shader.Find("Unlit/Color");
            if (!shader) throw new System.InvalidOperationException("Unity's Unlit/Color shader is unavailable.");
            material = new Material(shader) { name = "Quest Status Panel", color = new Color(0.015f, 0.025f, 0.045f) };
            AssetDatabase.CreateAsset(material, StatusMaterialPath);
            return material;
        }

        private static void Assign(Object target, params object[] nameValuePairs)
        {
            for (var index = 0; index < nameValuePairs.Length; index += 2)
            {
                var fieldName = (string)nameValuePairs[index];
                var field = target.GetType().GetField(fieldName,
                    System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.NonPublic);
                if (field == null) throw new System.InvalidOperationException($"Missing serialized field {fieldName} on {target.GetType().Name}.");
                field.SetValue(target, nameValuePairs[index + 1]);
            }
            EditorUtility.SetDirty(target);
        }
    }
}
