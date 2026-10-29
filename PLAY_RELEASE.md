# NEON WRECKAGE — Play release runbook

Everything in this file is either automated by `.github/workflows/android-apk.yml`
or needs to be done once, by hand, in the Play Console. Read the "Blockers"
section first: without those four secrets the build produces a bundle Play will
reject, no matter how green the workflow is.

---

## 1. Facts the Console will ask for

| Field | Value |
| --- | --- |
| Package name | `com.neonwreckage.game` |
| App name | NEON WRECKAGE |
| Version code | repo variable `VERSION_CODE` (integer, must increase on every upload) |
| Version name | repo variable `VERSION_NAME` (default `1.0.0`) |
| `compileSdk` / `targetSdk` | 36 / 36 — **mandatory**: Play rejects submissions below API 36 since 2026-08-31 |
| `minSdk` | 24 (Android 7.0) |
| Java toolchain | 21 |
| Orientation | fullscreen, no forced orientation |
| Price | Free |
| Ads | None |
| In-app purchases | None |
| Internet permission | **Not needed** — the whole game is bundled and runs offline |

The workflow asserts `targetSdk >= 36` and fails before building if that ever
slips, so a stale SDK cannot reach the Console. It also strips Capacitor's
default `INTERNET` permission from the manifest and then proves — with
`aapt dump permissions` on the packaged APK — that the app requests **zero**
permissions, so the privacy-policy claim stays true release after release.

## 2. Blockers (do these once)

### 2.1 The upload key

Play signs your app with a key you control. If this key is ever replaced, you
cannot update the app again under the same listing.

```bash
keytool -genkeypair -v \
  -keystore upload.jks -alias upload \
  -keyalg RSA -keysize 4096 -validity 10000
```

Write the two passwords down somewhere permanent. Then publish the key to
GitHub — Settings → Secrets and variables → Actions:

| Kind | Name | Value |
| --- | --- | --- |
| Secret | `KEYSTORE_BASE64` | `base64 -w0 upload.jks` |
| Secret | `KEYSTORE_PASSWORD` | store password |
| Secret | `KEY_ALIAS` | `upload` |
| Secret | `KEY_PASSWORD` | key password |

### 2.2 Version variables (optional but recommended)

Settings → Secrets and variables → Actions → **Variables**:

| Name | Value |
| --- | --- |
| `VERSION_CODE` | `1` (bump by at least 1 for every upload; never reuse) |
| `VERSION_NAME` | `1.0.0` |

### 2.3 What the workflow gives you

Run *Android build (APK + Play bundle)*. On success:

* **Artifact** `neon-wreckage-aab` → `app-release.aab`, the signed bundle you
  upload to Play. (Without `KEYSTORE_BASE64` you get
  `NEON-WRECKAGE-unsigned-preview.aab`, which is for smoke-testing only and is
  deliberately **not** attached to the public release.)
* **Artifact** `neon-wreckage-apk` + release asset `NEON-WRECKAGE.apk` for
  sideloading on a phone.

## 3. Store listing

Assets live in `store/`:

* `feature-graphic-1024x500.png` — upload as the **Feature graphic**.
* Screenshots must be captured from the device (screen recorder or
  `adb exec-out screencap -p > shot.png`), because the HUD is DOM, not canvas.
  Required: at least **2** phone screenshots, 16:9 or 9:16, min 320px, max 3840px.
  Good frames: the menu, a mid-run with a combo running, the game-over stats.

### App name (30 chars max)

```
NEON WRECKAGE
```

### Short description (80 chars max)

```
Twin-stick neon survival. Shoot, chain combos, and outlive the grid.
```

### Full description (4000 chars max)

```
The grid is awake and it wants you gone.

NEON WRECKAGE is a fast twin-stick arcade shooter built around one idea:
staying alive long enough that the score stops being a number and starts being
a claim.

■ HOW IT PLAYS
Drive with the left side of the screen, aim with the right. Your weapon fires
itself the moment you aim, so your whole attention is on positioning and target
choice. Clear a wave without taking a hit and the combo multiplier climbs —
x2, x4, x8 — and every pickup and kill pays more. Take one hit and it resets.
Everything in the game is built to make you want one more run.

■ THE SYSTEM
· Rammer, turret and splitter hosts, each with its own movement logic
· Gold lock-on when your aim ray crosses a hostile — you never guess
· Layered neon rendering with bloom, screen shake and hit-stop
· Local high-score table, so the person to beat is usually you

■ BUILT TO BE PLAYED OFFLINE
No account. No ads. No in-app purchases. No network permission at all. The
entire game is a few megabytes inside the app, and it starts instantly.

■ WHO MADE IT
A solo build from the ground up: hand-written renderer, hand-tuned physics,
hand-tuned audio. Support is a person, not a ticket queue.
```

## 4. Data safety form

The app collects **nothing**. Answers:

* Does your app collect or share any required user data types? **No**
* Is all of the user data encrypted in transit? **N/A** (no data leaves the device)
* Do you provide a way for users to request data deletion? **N/A**
* Data collected: none. The high-score table is written to local storage on the
  device and is never transmitted.

## 5. Content rating (IARC questionnaire)

Category **Game**. Violence: animated, stylised neon shapes dissolving — answer
"no realistic violence, no blood, no gore". No user-generated content, no chat,
no location sharing, no purchases, no ads. Expect **Everyone / 3+**.

## 6. Privacy policy

`docs/privacy.html` is the policy page. Publish it (GitHub Pages: Settings →
Pages → Branch `main`, folder `/docs`) and paste the resulting URL into the
Console. It must be a public, reachable URL that is not a PDF and does not
require login.

## 7. Testing requirement for new personal developer accounts

Personal accounts created after 2023 must run a **closed test with at least 12
testers for 14 continuous days** before they can apply for production. Create
the closed track, upload the first `.aab`, add the testers, and start the clock
early — it is wall-clock time you cannot compress.

## 8. Upload checklist

1. `VERSION_CODE` bumped in repo variables.
2. Workflow run green; `neon-wreckage-aab` downloaded.
3. Play Console → Testing → Internal testing → Create release → upload `.aab`.
4. Confirm the Console reports **target SDK 36**, version code as expected,
   and no permission it should not have.
5. Store listing complete (icon, feature graphic, ≥2 screenshots, descriptions).
6. Data safety + content rating + privacy policy URL done.
7. Roll out to internal testing, install from the Play link on a real phone,
   play one full run.
8. Promote to closed testing (start the 14-day clock), then production.
