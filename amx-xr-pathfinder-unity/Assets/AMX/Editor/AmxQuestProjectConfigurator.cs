using System.Linq;
using AMX.XR.Configuration;
using AMX.XR.Missions;
using AMX.XR.Proof;
using AMX.XR.Realtime;
using AMX.XR.Spatial;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.SceneManagement;

namespace AMX.XR.Editor
{
    public static class AmxQuestProjectConfigurator
    {
        private const string MenuPath = "AMX XR/Configure Quest Project";
        private const string EnvironmentPath = "Assets/AMX/Configuration/AMX Environment.asset";
        private const string MissionPath = "Assets/StreamingAssets/amx/missions/xrt-green-mode.json";
        private const string MissionAssetPath = "Assets/AMX/Configuration/XRT Green Mode Mission.asset";
        private const string ScenePath = "Assets/AMX/Scenes/QuestStarter.unity";

        [MenuItem(MenuPath)]
        public static void Configure()
        {
            PlayerSettings.companyName = "AMX AIR Hubs";
            PlayerSettings.productName = "AMX XR Path Finder";
            PlayerSettings.SetApplicationIdentifier(NamedBuildTarget.Android, "cc.amxairhubs.pathfinder");
            PlayerSettings.SetScriptingBackend(NamedBuildTarget.Android, ScriptingImplementation.IL2CPP);
            PlayerSettings.Android.targetArchitectures = AndroidArchitecture.ARM64;
            PlayerSettings.Android.minSdkVersion = AndroidSdkVersions.AndroidApiLevel29;
            PlayerSettings.Android.targetSdkVersion = AndroidSdkVersions.AndroidApiLevelAuto;
            PlayerSettings.colorSpace = ColorSpace.Linear;
            PlayerSettings.MTRendering = true;
            PlayerSettings.stereoRenderingPath = StereoRenderingPath.Instancing;
            PlayerSettings.SetGraphicsAPIs(BuildTarget.Android, new[] { GraphicsDeviceType.Vulkan });
            PlayerSettings.Android.forceInternetPermission = true;
            PlayerSettings.Android.forceSDCardPermission = false;

            var symbols = PlayerSettings.GetScriptingDefineSymbols(NamedBuildTarget.Android).Split(';').Where(value => !string.IsNullOrWhiteSpace(value)).ToHashSet();
            symbols.Add("AMX_QUEST");
            PlayerSettings.SetScriptingDefineSymbols(NamedBuildTarget.Android, string.Join(";", symbols));

            EditorUserBuildSettings.SwitchActiveBuildTarget(BuildTargetGroup.Android, BuildTarget.Android);
            AssetDatabase.SaveAssets();
            Debug.Log("AMX Quest settings applied. Finish OpenXR validation and install Meta XR All-in-One before building.");
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
            Assign(runtime.AddComponent<AmxLiveKitRoomBridge>(), "environment", environment);

            var station = GameObject.CreatePrimitive(PrimitiveType.Cube);
            station.name = "Learning Station Anchor";
            station.transform.SetPositionAndRotation(new Vector3(0f, 1.1f, 2.5f), Quaternion.identity);
            station.transform.localScale = new Vector3(1.8f, 1.2f, 0.12f);
            Assign(station.AddComponent<AmxSpatialAnchorBridge>(), "environment", environment, "anchorTarget", station.transform);

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
            cameraObject.tag = "MainCamera";
            var camera = cameraObject.AddComponent<Camera>();
            camera.clearFlags = CameraClearFlags.SolidColor;
            camera.backgroundColor = new Color(0.025f, 0.04f, 0.075f);
            cameraObject.AddComponent<AudioListener>();
            cameraObject.transform.SetPositionAndRotation(new Vector3(0f, 1.6f, -2.5f), Quaternion.Euler(4f, 0f, 0f));

            EditorSceneManager.SaveScene(scene, ScenePath);
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };
            AssetDatabase.SaveAssets();
            Selection.activeGameObject = runtime;
            Debug.Log($"AMX Quest starter scene created at {ScenePath}. Replace Preview Camera with the Meta Interaction SDK rig after importing Meta XR.");
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
