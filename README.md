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
node tools/render3d-test.js   # 27 checks + /tmp/3d-proof.png
node test/smoke.js            # 104 checks, includes the degradation path
```

## Play

Serve the folder with any static server and open it:

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

## Controls

| Action | Keyboard / Mouse | Touch |
|---|---|---|
| Drive | `WASD` / Arrow keys | Drag anywhere on the left half |
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
