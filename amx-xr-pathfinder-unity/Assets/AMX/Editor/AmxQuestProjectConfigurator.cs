using System.Linq;
using UnityEditor;
using UnityEditor.Build;
using UnityEngine;
using UnityEngine.Rendering;

namespace AMX.XR.Editor
{
    public static class AmxQuestProjectConfigurator
    {
        private const string MenuPath = "AMX XR/Configure Quest Project";

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
    }
}
