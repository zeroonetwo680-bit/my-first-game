#!/usr/bin/env bash
# Local Unity pipeline (Linux/macOS/WSL): tests -> build APK/WebGL -> optional adb install.
# Usage:
#   bash scripts/unity-local-build.sh
#   bash scripts/unity-local-build.sh --skip-tests --install-device
#   bash scripts/unity-local-build.sh --build-target webgl --il2cpp
#   bash scripts/unity-local-build.sh --unity-exe /path/to/Unity
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_PATH="$REPO_ROOT/unity"
BUILD_TARGET="android"
UNITY_EXE="${UNITY_EXE:-}"
ADB_EXE="${ADB_EXE:-}"
SKIP_TESTS=0
INSTALL_DEVICE=0
IL2CPP=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --build-target) BUILD_TARGET="$2"; shift 2 ;;
    --project) PROJECT_PATH="$2"; shift 2 ;;
    --unity-exe) UNITY_EXE="$2"; shift 2 ;;
    --adb-exe) ADB_EXE="$2"; shift 2 ;;
    --skip-tests) SKIP_TESTS=1; shift ;;
    --install-device) INSTALL_DEVICE=1; shift ;;
    --il2cpp) IL2CPP=1; shift ;;
    -h|--help) grep '^#' "$0" | head -8; exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

[[ -d "$PROJECT_PATH/Assets" ]] || { echo "No Assets/ under $PROJECT_PATH — see unity/README.md" >&2; exit 1; }

# ---- find Unity ------------------------------------------------------------
if [[ -z "$UNITY_EXE" ]]; then
  for base in "$HOME/Unity/Hub/Editor" "/Applications/Unity/Hub/Editor"; do
    [[ -d "$base" ]] || continue
    for ver in $(ls -r "$base" 2>/dev/null); do
      for cand in "$base/$ver/Editor/Unity" "$base/$ver/Unity.app/Contents/MacOS/Unity"; do
        [[ -x "$cand" ]] && UNITY_EXE="$cand" && break 2
      done
    done
  done
fi
[[ -n "$UNITY_EXE" && -x "$UNITY_EXE" ]] || { echo "Unity not found. Install via Unity Hub or pass --unity-exe" >&2; exit 1; }
echo "Unity : $UNITY_EXE"
echo "Proj  : $PROJECT_PATH"

run_unity() {
  local what="$1"; shift
  echo -e "\n==> $what"
  "$UNITY_EXE" -batchmode -nographics -projectPath "$PROJECT_PATH" "$@"
  echo "==> $what OK"
}

# ---- 1) tests --------------------------------------------------------------
if [[ $SKIP_TESTS -eq 0 ]]; then
  mkdir -p "$PROJECT_PATH/TestResults"
  run_unity "EditMode tests" -runTests -testPlatform EditMode \
    -testResults "$PROJECT_PATH/TestResults/EditMode.xml" -logFile -
  run_unity "PlayMode tests" -runTests -testPlatform PlayMode \
    -testResults "$PROJECT_PATH/TestResults/PlayMode.xml" -logFile -
fi

# ---- 2) build --------------------------------------------------------------
export UNITY_IL2CPP=$([[ $IL2CPP -eq 1 ]] && echo 1 || echo 0)
if [[ "$BUILD_TARGET" == "webgl" ]]; then
  run_unity "Build WebGL" -executeMethod BuildScript.BuildWebGL -logFile -
else
  run_unity "Build Android" -executeMethod BuildScript.BuildAndroid -logFile -
fi

# ---- 3) install to device --------------------------------------------------
if [[ $INSTALL_DEVICE -eq 1 ]]; then
  [[ "$BUILD_TARGET" == "android" ]] || { echo "--install-device needs --build-target android" >&2; exit 1; }
  APK="$PROJECT_PATH/Builds/Android/NEON-UNITY.apk"
  [[ -f "$APK" ]] || { echo "APK not found: $APK" >&2; exit 1; }
  if [[ -z "$ADB_EXE" ]]; then
    for cand in "$HOME/Android/Sdk/platform-tools/adb" "${ANDROID_HOME:-}/platform-tools/adb" "$(command -v adb || true)"; do
      [[ -n "$cand" && -x "$cand" ]] && ADB_EXE="$cand" && break
    done
  fi
  [[ -n "$ADB_EXE" ]] || { echo "adb not found — install platform-tools or pass --adb-exe" >&2; exit 1; }
  echo -e "\n==> adb install -r (phone connected + USB debugging on)"
  "$ADB_EXE" install -r "$APK"
  echo "==> Installed on device"
fi

echo -e "\nALL DONE"
