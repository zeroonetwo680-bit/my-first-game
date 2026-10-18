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
| Pause | `P` / `Esc` | pause button (auto-pauses on tab switch) |
| Mute | `M` | speaker button |
| Instant restart | `Enter` / `R` (game over) | big buttons |

## Features

- **Tight arcade car physics** — forward/lateral grip model with drifty skids,
  boost, wall bounces, and mass-based car-to-car collisions.
- **Four enemy types** — rammers, orbiting gunners, tank brutes, and dash
  interceptors, mixed into escalating waves with spawn telegraphs.
- **Boss every 5 waves** — WARLORD, a massive armored car with telegraphed
  volley spreads, charge dashes, minion summons, an enrage phase below 50% HP,
  a dedicated boss health bar, chained detonation death, and big loot.
- **Roguelite upgrades** — after every cleared wave, pick 1 of 3 upgrades
  (damage, fire rate, rockets, armor, engine, grip, nitro, magnet, bounty,
  repair). Keys 1/2/3 or tap.
- **Juice everywhere** — screen shake, hit-stop, additive particle bursts,
  persistent skid marks and scorch decals, muzzle flashes, floating score text,
  dynamic camera (look-ahead + speed zoom), CRT scanlines, hit vignette.
- **Score system** — kill values × combo multiplier (up to x8), wave-clear
  bonuses, pickups (repair, coin, triple gun, shield, nitro).
- **Full game loop** — start screen with attract mode, pause, game-over
  breakdown, and a persistent **local top-8 high-score table** (localStorage).
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
game with stubbed browser APIs, simulates minutes of play (waves, rockets,
pickups, death, restart, pause, touch input) and asserts on game state.
