# My First Games

Three polished browser games, zero dependencies:

| Game | Path | Kind |
|---|---|---|
| 🏎️ **NEON WRECKAGE** | `/` (this root) | Combat racing arena — waves, boss, garage, PWA, Android APK |
| 🧊 **BLOCK NOVA** | [`/block-nova`](block-nova/) | Neon block puzzle+ — streaks, power-ups, two modes |
| ⚡ **NEON FIST** | [`/neon-fist`](neon-fist/) | 1v1 neon fighting — combos, block, dash, NOVA special |

---

## NEON WRECKAGE — Combat Racing Arena

A polished, top-down **car combat racing game** for desktop and mobile browsers.
Drift through a neon arena, machine-gun rival cars, lock rockets onto brutes,
chain kill-combos, and survive endless escalating waves. Canvas 2D + WebAudio,
with an optional **three.js 3D presentation layer** on top.

### 3D view (`js/render3d.js`)

The arena can be rendered in real 3D without touching a single line of
gameplay. The 2D canvas keeps the HUD, FX, bullets, tracers and health bars; a
WebGL canvas *behind* it draws the deck, the walls, the pillars and the cars as
lit meshes with shadows and neon underglow.

| Bit | File |
| --- | --- |
| Renderer / scene / world / cars | `js/render3d.js` (~23 KB) |
| Library | `vendor/three.min.js` (three r160, MIT, vendored — no CDN, works offline) |
| Toggle | the **3D** button in the HUD, choice persisted in `localStorage` |

**Why it can't desync.** The camera is a perspective camera pointed *straight
down*, so every point on the ground plane is the same distance away and
projects with a perfectly uniform scale — mathematically identical to the 2D
canvas transform. Raised geometry still gets real perspective, which is what
makes it read as 3D. `tools/render3d-test.js` asserts the equivalence:

```
worst error between the three.js projection and the 2D transform: < 0.01 px
```

It also proves the fallback: no WebGL, no three.js, or the player turning it
off all fall back to the original 2D renderer, and the adaptive quality
governor still owns the device pixel ratio.

```bash
node tools/render3d-test.js      # 49 checks + /tmp/3d-proof.png
node tools/render3d-preview.js   # software render of the real scene -> /tmp/3d-scene.png
node tools/render3d-pipeline.js  # boots the real game on a fake renderer
node test/smoke.js               # 104 checks, includes the degradation path
```

`render3d-pipeline.js` is the one that answers "is the 3D actually drawing?" It
boots the real game with an instrumented stand-in for `WebGLRenderer` and prints
the submitted geometry:

```
active: true | #gl display: block | #game background: transparent | body.has3d: true
world: 16 arena meshes | scene: 47 meshes, all visible
camera (1280, 1307, 1280) near/far 26/4182
triangles submitted: 2434 | player NDC 0.000 0.000 0.972 -> screen (640, 360)
```

If that says 2434 triangles while the screen is black, the bug is layering, not
graphics. The HUD badge shows the same number live (`3D · 2434t`).

### One canvas, by construction

The 3D view used to be a second canvas stacked behind the game canvas. Three
separate bugs in a row (CSS background, metals with no env map, fog distances)
and then a silent three.js early-return all produced the same black screen, and
none of them could be reproduced without a GPU.

So the architecture changed instead of the bug being chased again:

```
three.js ──render()──> its own offscreen canvas ──drawImage()──> the game canvas
```

There is **one** canvas in the DOM. No z-index, no CSS background, no stacking
order, nothing that can hide the image. The 3D frame is copied into the game
canvas at the top of `Game.render()` and everything else (FX, tracers, health
bars, HUD) draws on top of that image exactly as before.

`preserveDrawingBuffer: true` keeps the GL buffer readable for the copy.

Because a triangle count proved to be a useless signal (with culling off it counts
geometry that never reaches a pixel), visibility is now measured, not assumed:
`_probe()` reads the framebuffer back with `readPixels` from five patches and asks
"is anything not the clear colour?". If four probes half a second apart all come
back blank, the layer switches itself off and the 2D renderer takes over — the
player always ends up with a playable game. The HUD badge reports the verdict:
`3D 2434t · px ok` or `3D 0t · BLANK`.

### Why the scene submitted 0 triangles

The build was verified to populate 47 meshes and, with real frustum culling,
submit 2434 triangles per frame. A player still saw `3D · 0t`. The cause is a
silent early return inside three.js:

```js
// WebGLRenderer.render()
if ( _isContextLost === true ) return;
```

A lost WebGL context (weak GPU, too many live contexts, a sandboxed iframe)
makes `render()` do nothing at all — no exception, no draw calls — while the
game still believed the 3D layer was active and had already cleared the 2D
canvas. Result: a black screen with only the FX drawn on top.

Fixed by treating a dead context as a first-class state:

* the `webglcontextlost` listener is attached **before** the renderer is created,
* the context is probed immediately after creation (`gl.isContextLost()`),
* it is probed again on every frame, which is the cheapest liveness test there is,
* `frustumCulled` is disabled for the arena (a few dozen meshes — culling can
  only ever lose the whole scene),
* `render()` no longer bails out silently when the scene is missing,
* every one of those paths switches to the 2D renderer within ~0.3 s.

### Cache, the bug that hides bugs

The service worker used to be **cache-first for everything**, which meant a fixed
`style.css` or `render3d.js` never reached the page — a real fix looked exactly
like a broken one. Now:

* the app shell (HTML/CSS/JS) is **network-first**, cache is only the offline fallback
* asset URLs carry `?v=9` so a stale HTTP cache cannot answer either
* the 3D layering is applied **inline from JS**, so a stale stylesheet cannot
  put the opaque canvas back over the WebGL one
* `/?fresh=1` unregisters the worker, deletes every cache and reloads
* if the 3D layer submits zero geometry for ~0.75 s it disables itself and the
  2D renderer takes over instead of leaving a black screen

#### Black-screen lessons (all regression-tested now)

Three independent bugs produced the same symptom — "everything is black, the
cars are gone". Each one is now pinned by a test so it cannot come back:

1. **The 2D canvas was painting over the 3D one.** `canvas#game` carries
   `background: var(--ink)`. A CSS background on a canvas paints in front of
   anything behind it in the stacking order, so the opaque fill hid the WebGL
   canvas completely — while the 2D car pass was skipped because the 3D layer
   was "active". Fixed with `body.has3d canvas#game { background: transparent }`
   plus a body class toggled by `Render3D.setEnabled`.
2. **Metals with nothing to reflect render black.** `MeshStandardMaterial` with
   `metalness` 0.7–0.95 and no environment map has no light to reflect. Fixed by
   generating a procedural equirect environment (`scene.environment`) and
   dropping metalness to 0.05–0.55.
3. **Fog was measured from a camera 1.4× the screen height away.** Fixed
   distances near 1100 put the entire deck inside the fog. Fog now scales with
   the camera height, so the ground is never fogged.

Bonus finding from the software preview: from a straight-down camera the dark
glass cabin covered most of the car, so cars read as black rectangles. The cabin
is now smaller and topped with a neon roof plate, and pillar caps became glowing
rings instead of solid discs.

## Play

Serve the folder with any static server and open it:

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

## Aiming on touch

Touch aiming used to be passive: the turret followed the car's heading and a
forward-only auto-aim cone did the rest, so with anything beside or behind you
the gun simply pointed forward. That is what made it feel stuck on Android.

Now it is a twin-stick layout:

* **Left half** — drag to drive (unchanged).
* **Right half** — the aim pad. Drag from wherever your thumb lands and the
  turret follows the drag direction; the gun **fires while you hold it**, so two
  thumbs are enough. A resting dashed ring shows the pad is there until you use
  it, and the stick artwork follows your thumb.
* **Let go** — auto-aim takes over. The assist now scores every hostile in range
  by distance *and* by how far the turret has to swing, so it no longer ignores
  whatever is beside or behind the car. A generous range (760 px) replaces the
  old narrow forward cone.

The turret is always readable, and the indicator now reports three states
instead of two:

| Colour | Meaning |
| --- | --- |
| **Cyan** | the assist is steering, nothing in the way |
| **Pink** | you are steering, ray into empty space |
| **Gold** | the ray crosses a hostile — the shot will land |

Gold is a real test, not a decoration: `armRayHit()` casts the turret ray against
every body and shortens the line to the actual impact distance, so the reticle
sits where the bullet will meet the car. The line is 250 px long, drawn over a
dark outline pass so it cannot dissolve into a bright neon body, carries a
white marching highlight for direction, and ends in a spinning reticle with
corner ticks. A confirmed target gets gold lock brackets plus a slow sweep ring.

The thumb pad mirrors it: a needle inside the pad points where the gun faces, a
dashed inner ring marks the deadzone, and the whole pad flashes gold on lock-on
— so the feedback arrives where the player is looking, under their finger,
not only in the middle of the screen.

## Android APK

A debug APK is rebuilt and published automatically on every push to a branch
(the workflow runs on `index.html`, `css/**`, `js/**`, `vendor/**` and
`.github/workflows/android-apk.yml` changes):

**Releases → `android-latest` → `NEON-WRECKAGE.apk`**

The start screen shows a **build stamp** (`build <sha>`). The APK is stamped with
the commit it was built from, so "am I running the new version?" is answered on
screen instead of inferred from behaviour. `build local` means you are on the
web version.

Two silent failures made the mobile build unusable for a while, and both are now
checked by the pipeline rather than trusted:

1. **The release had stopped updating.** The publish step deleted the release and
   re-created it; once a release existed for the tag, `gh release create`
   refused it, the step failed, and the APK in Releases stayed put — eleven days
   old at one point, while the tag pointed at the newest commit. Publishing is
   now idempotent (`upload --clobber`), and a final step asserts the asset was
   written in the last 30 minutes.
2. **three.js was never bundled.** `prepare-web.sh` copied `css/`, `js/` and
   `assets/` but not `vendor/`. Inside the APK the script 404'd, `THREE` was
   undefined, the 3D layer reported itself unavailable and the game quietly ran
   in 2D with nothing looking broken. `vendor/` is now copied, and before
   publishing the job unzips the APK and asserts that it contains the build
   stamp, `three.min.js` and the touch-aiming code.

## Controls

| Action | Keyboard / Mouse | Touch |
|---|---|---|
| Drive | `WASD` / Arrow keys | Drag on the **left** half |
| Aim | mouse position | Drag on the **right** half (gun follows the drag and fires) |
| Fire | `Space` or hold **left mouse** (mouse aims the gun) | `FIRE` button (auto-aim assist) |
| Nitro boost | `Shift` | `NOS` button |
| Homing rocket | `E` | `RKT` button |
| Swap weapon | `Q` or **right-click** (after unlocking the shotgun) | `SWP` button |
| Pause | `P` / `Esc` | pause button (auto-pauses on tab switch) |
| Mute | `M` | speaker button |
| Instant restart | `Enter` / `R` (game over) | big buttons |

**Gamepad supported** (standard mapping): left stick drives, A/RT fires,
LB/LT/B nitro, RB/X rocket, Y swaps weapons, Start pauses, right stick aims.

## Features

- **Garage with unlockable cars** — earn salvage coins (coin pickups, wave
  clears, boss kills) and buy TITAN (tank), VORTEX (glass-cannon racer) or
  WARDEN (shotgun onboard). Selection persists between sessions.
- **Three difficulty levels** — EASY / NORMAL / INFERNO change enemy stats,
  wave sizes and score multipliers (0.75x / 1x / 1.5x), each with its own
  high-score table.
- **Tight arcade car physics** — forward/lateral grip model with drifty skids,
  boost, wall bounces, and mass-based car-to-car collisions.
- **Boss every 5 waves** — WARLORD, a massive armored car with telegraphed
  volley spreads, charge dashes, minion summons, an enrage phase below 50% HP,
  a dedicated boss health bar, chained detonation death, and big loot.
- **Second weapon: the Scatter Gun** — a shotgun upgrade card unlocks 6-pellet
  spread shots with heavy knockback; swap anytime with `Q` / right-click.
- **Roguelite upgrades** — after every cleared wave, pick 1 of 3 upgrades
  (damage, fire rate, rockets, armor, engine, grip, nitro, magnet, bounty,
  repair, shotgun unlock). Keys 1/2/3 or tap.
- **Six enemy types** — rammers, orbiting gunners, tank brutes, dash
  interceptors, kamikaze **bombers** (beeping fuse + chain-reaction area
  explosions) and **snipers** (laser-sight telegraph, high-speed heavy shot).
- **Juice everywhere** — screen shake, hit-stop, additive particle bursts,
  persistent skid marks and scorch decals, muzzle flashes, floating score text,
  dynamic camera (look-ahead + speed zoom), CRT scanlines, hit vignette.
- **Score system** — kill values × combo multiplier (up to x8), wave-clear
  bonuses, pickups (repair, coin, triple gun, shield, nitro).
- **Full game loop** — start screen with attract mode, pause, game-over
  breakdown, and a persistent **local top-8 high-score table** (localStorage).
- **Extra polish** — glowing nitro light trail, explosions that light up the
  arena floor, boss minion waves.
- **16 achievements** — unlock by wrecking rivals, chaining combos, clearing
  waves, slaying bosses, flawless streaks, rocket multi-kills and more, with
  toast notifications and a progress grid on the start screen.
- **Installable PWA** — service-worker app shell, fullscreen display, maskable
  icon; plays fully offline after the first visit (bump `VERSION` in `sw.js`
  on deploy), with an in-game offline badge and a "new version ready"
  refresh banner when a deploy lands.
- **First-class Android support** — haptic feedback on hits/kills/explosions,
  screen wake-lock while racing, fullscreen toggle, adaptive quality governor
  that drops DPR/particles/scanlines on slow devices and restores them when
  frames are fast, and back-gesture handling that pauses instead of exiting.
- **Robust frame loop** — negative-deltaTime guard (rAF timestamps can jump
  backward after mobile sleep/resume) and a 100ms spike clamp.
- **Procedural audio** — engine pitch tied to speed, gunfire, explosions,
  skids, and a minimal synthwave loop, all synthesized in WebAudio.
- **60 fps engineering** — pooled particles/bullets, pre-rendered glow sprites
  (no per-frame `shadowBlur`), capped DPR, fixed-clamped timestep, decal layer
  at half resolution.

## Project layout

```
index.html              markup: canvas, HUD, screens, touch controls
manifest.webmanifest    PWA manifest (installable, fullscreen)
sw.js                   service worker — offline app shell
css/style.css           neon theme, HUD, menus, animations
js/core.js              math helpers, object pool, storage wrapper
js/audio.js             procedural WebAudio SFX + music
js/fx.js                particles, screen shake, floating text, decals
js/achievements.js      16 achievements + toast notifications
js/input.js             keyboard, mouse, touch, gamepad
js/platform.js          haptics, wake lock, fullscreen, offline, SW updates
js/game.js              entities, AI, waves, collisions, rendering, states
assets/                 PWA icons (192/512/maskable)
test/smoke.js           headless smoke test (node test/smoke.js)
```

## Testing

The game logic is fully runnable headless — `node test/smoke.js` boots the
game with stubbed browser APIs and a seeded RNG, simulates minutes of play
(waves, boss fights, upgrades, shotgun/bomber/sniper, pickups, death,
restart, pause, touch input, garage, achievements, haptics, back-button,
offline badge and the adaptive quality governor) and asserts on game
state (91 checks).
