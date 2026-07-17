using System.Linq;
using AMX.XR.Configuration;
using AMX.XR.Integrations;
using AMX.XR.Missions;
using AMX.XR.Proof;
using AMX.XR.Realtime;
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
        private const string MissionPath = "Assets/StreamingAssets/amx/missions/xrt-green-mode.json";
        private const string MissionAssetPath = "Assets/AMX/Configuration/XRT Green Mode Mission.asset";
        private const string ScenePath = "Assets/AMX/Scenes/QuestStarter.unity";
        private const string XrSettingsPath = "Assets/XR/XRGeneralSettingsPerBuildTarget.asset";
        private const string MetaCameraRigPath = "Packages/com.meta.xr.sdk.core/Prefabs/OVRCameraRig.prefab";
        private const string DevelopmentApkPath = "Builds/Quest/AMX-XR-Path-Finder-development.apk";
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
            PlayerSettings.Android.targetArchitectures = AndroidArchitecture.ARM64;
            PlayerSettings.Android.minSdkVersion = AndroidSdkVersions.AndroidApiLevel32;
            PlayerSettings.Android.targetSdkVersion = AndroidSdkVersions.AndroidApiLevelAuto;
            PlayerSettings.Android.applicationEntry = AndroidApplicationEntry.GameActivity;
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
            Debug.Log("AMX Quest settings applied with Android OpenXR and Meta Quest support.");
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

            var mission = AssetDatabase.LoadAssetAtPath<TextAsset>(MissionAssetPath);
            if (!mission)
            {
                var sourcePath = System.IO.Path.Combine(Application.dataPath, "StreamingAssets/amx/missions/xrt-green-mode.json");
                if (!System.IO.File.Exists(sourcePath)) throw new System.IO.FileNotFoundException("AMX starter mission is missing.", sourcePath);
                mission = new TextAsset(System.IO.File.ReadAllText(sourcePath));
                AssetDatabase.CreateAsset(mission, MissionAssetPath);
            }

            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            var runtime = new GameObject("AMX Runtime");
            Assign(runtime.AddComponent<AmxMissionRuntime>(), "environment", environment, "missionJson", mission);
            Assign(runtime.AddComponent<AmxProofSyncService>(), "environment", environment);

            var station = GameObject.CreatePrimitive(PrimitiveType.Cube);
            station.name = "Learning Station Anchor";
            station.transform.SetPositionAndRotation(new Vector3(0f, 1.1f, 2.5f), Quaternion.identity);
            station.transform.localScale = new Vector3(1.8f, 1.2f, 0.12f);
            var anchorProvider = station.AddComponent<AmxMetaSpatialAnchorProvider>();
            Assign(station.AddComponent<AmxSpatialAnchorBridge>(), "environment", environment, "anchorTarget", station.transform,
                "providerComponent", anchorProvider);

            var liveKitConnector = runtime.AddComponent<AmxLiveKitConnector>();
            Assign(liveKitConnector, "videoSurface", station.GetComponent<Renderer>());
            Assign(runtime.AddComponent<AmxLiveKitRoomBridge>(), "environment", environment,
                "connectorComponent", liveKitConnector);

            var roomUnderstanding = new GameObject("MRUK Room Understanding");
            var mruk = roomUnderstanding.AddComponent<MRUK>();
            mruk.SceneSettings = new MRUK.MRUKSettings
            {
                DataSource = MRUK.SceneDataSource.Device,
                LoadSceneOnStartup = true
            };

            CreateMetaCameraRig();

            var floor = GameObject.CreatePrimitive(PrimitiveType.Plane);
            floor.name = "Room Preview Floor";
            floor.transform.localScale = new Vector3(0.6f, 1f, 0.6f);

            var lightObject = new GameObject("Key Light");
            var light = lightObject.AddComponent<Light>();
            light.type = LightType.Directional;
            light.intensity = 1.4f;
            light.color = new Color(0.96f, 0.98f, 1f);
            lightObject.transform.rotation = Quaternion.Euler(42f, -32f, 0f);

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
            if (!System.IO.File.Exists(ScenePath)) CreateStarterScene();

            var outputPath = System.IO.Path.GetFullPath(DevelopmentApkPath);
            System.IO.Directory.CreateDirectory(System.IO.Path.GetDirectoryName(outputPath));
            var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions
            {
                scenes = new[] { ScenePath },
                locationPathName = outputPath,
                target = BuildTarget.Android,
                targetGroup = BuildTargetGroup.Android,
                options = BuildOptions.Development | BuildOptions.AllowDebugging
            });

            if (report.summary.result != BuildResult.Succeeded)
            {
                throw new BuildFailedException($"Quest APK build failed with {report.summary.totalErrors} errors.");
            }

            Debug.Log($"AMX Quest development APK created at {outputPath} ({report.summary.totalSize} bytes).");
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

        private static void CreateMetaCameraRig()
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
            if (!cameraRig.GetComponent<OVRPassthroughLayer>()) cameraRig.AddComponent<OVRPassthroughLayer>();

            foreach (var camera in cameraRig.GetComponentsInChildren<Camera>(true))
            {
                camera.clearFlags = CameraClearFlags.SolidColor;
                camera.backgroundColor = Color.clear;
            }
        }

        private static void EnsureFolder(string parent, string child)
        {
            var path = $"{parent}/{child}";
            if (!AssetDatabase.IsValidFolder(path)) AssetDatabase.CreateFolder(parent, child);
        }

        private static void Assign(Object target, params object[] nameValuePairs)
        {
            var serialized = new SerializedObject(target);
            for (var index = 0; index < nameValuePairs.Length; index += 2)
            {
                var fieldName = (string)nameValuePairs[index];
                var property = serialized.FindProperty(fieldName);
                if (property == null) throw new System.InvalidOperationException($"Missing serialized field {fieldName} on {target.GetType().Name}.");
                property.objectReferenceValue = (Object)nameValuePairs[index + 1];
            }
            serialized.ApplyModifiedPropertiesWithoutUndo();
        }
    }
}
