// BuildScript — entry points for local/CI batch-mode builds.
// Usage (called by scripts/unity-local-build.*):
//   Unity -batchmode -nographics -projectPath unity -executeMethod BuildScript.BuildAndroid -logFile -
//   Unity -batchmode -nographics -projectPath unity -executeMethod BuildScript.BuildWebGL  -logFile -
// NOTE: do NOT pass -quit here — BuildScript calls EditorApplication.Exit with a proper
// exit code (0 = success) so CI can trust it.
// Env switches: UNITY_IL2CPP=1 -> IL2CPP backend (release builds, slower to compile).
using System;
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Build.Reporting;
using UnityEngine;

public static class BuildScript
{
    const string AndroidOut = "Builds/Android/NEON-UNITY.apk";
    const string WebGLOut = "Builds/WebGL";

    static string[] GetScenes()
    {
        var enabled = EditorBuildSettings.scenes
            .Where(s => s.enabled && !string.IsNullOrEmpty(s.path))
            .Select(s => s.path)
            .ToArray();
        if (enabled.Length > 0) return enabled;
        if (Directory.Exists("Assets/Scenes"))
        {
            var found = Directory.GetFiles("Assets/Scenes", "*.unity", SearchOption.AllDirectories);
            if (found.Length > 0) return found;
        }
        throw new Exception("No scenes found. File > Build Settings > add your scene first.");
    }

    static void CommonSettings()
    {
#pragma warning disable 0618 // NamedBuildTarget is newer; keep 2021/2022 LTS compatible
        PlayerSettings.companyName = "NEON";
        PlayerSettings.SetApplicationIdentifier(BuildTargetGroup.Android, "com.neon.games");
        var il2cpp = Environment.GetEnvironmentVariable("UNITY_IL2CPP") == "1";
        PlayerSettings.SetScriptingBackend(BuildTargetGroup.Android,
            il2cpp ? ScriptingImplementation.IL2CPP : ScriptingImplementation.Mono2x);
#pragma warning restore 0618
        Debug.Log("[BuildScript] scenes=" + string.Join(", ", GetScenes()) + " il2cpp=" + il2cpp);
    }

    public static void BuildAndroid()
    {
        CommonSettings();
        Directory.CreateDirectory(Path.GetDirectoryName(AndroidOut));
        var opts = new BuildPlayerOptions
        {
            scenes = GetScenes(),
            locationPathName = AndroidOut,
            target = BuildTarget.Android,
            options = BuildOptions.None
        };
        Finish(BuildPipeline.BuildPlayer(opts), AndroidOut);
    }

    public static void BuildWebGL()
    {
        CommonSettings();
        Directory.CreateDirectory(WebGLOut);
        var opts = new BuildPlayerOptions
        {
            scenes = GetScenes(),
            locationPathName = WebGLOut,
            target = BuildTarget.WebGL,
            options = BuildOptions.None
        };
        Finish(BuildPipeline.BuildPlayer(opts), WebGLOut);
    }

    static void Finish(BuildReport report, string outPath)
    {
        var s = report.summary;
        Debug.Log(string.Format("[BuildScript] {0} -> {1} ({2} MB in {3})",
            s.result, outPath, s.totalSize / (1024 * 1024), s.totalTime));
        EditorApplication.Exit(s.result == BuildResult.Succeeded ? 0 : 1);
    }
}
