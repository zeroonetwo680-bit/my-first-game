# NEON WRECKAGE — Combat Racing Arena

A polished, top-down **car combat racing game** for desktop and mobile browsers.
Drift through a neon arena, machine-gun rival cars, lock rockets onto brutes,
chain kill-combos, and survive endless escalating waves. Zero dependencies —
pure Canvas 2D + WebAudio.

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
- **Procedural audio** — engine pitch tied to speed, gunfire, explosions,
  skids, and a minimal synthwave loop, all synthesized in WebAudio.
- **60 fps engineering** — pooled particles/bullets, pre-rendered glow sprites
  (no per-frame `shadowBlur`), capped DPR, fixed-clamped timestep, decal layer
  at half resolution.

## Project layout

```
index.html        markup: canvas, HUD, screens, touch controls
css/style.css     neon theme, HUD, menus, animations
js/core.js        math helpers, object pool, storage wrapper
js/audio.js       procedural WebAudio SFX + music
js/fx.js          particles, screen shake, floating text, decals
js/input.js       keyboard, mouse aim, virtual joystick, buttons
js/game.js        entities, AI, waves, collisions, rendering, states
test/smoke.js     headless smoke test (node test/smoke.js)
```

## Testing

The game logic is fully runnable headless — `node test/smoke.js` boots the
game with stubbed browser APIs and a seeded RNG, simulates minutes of play
(waves, boss fights, upgrades, shotgun/bomber/sniper, pickups, death,
restart, pause, touch input) and asserts on game state (53 checks).
