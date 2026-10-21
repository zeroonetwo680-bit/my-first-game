# NEON ESCAPE 🏃💨 — Facility Parkour Runner

**Break out of the Complex.** A neon silhouette parkour runner inspired by **Vector 2** — rebuilt to be
*better, newer, and commercially competitive*: skill-first level design, a complete story, permanent
gear, 8 skins, and a **fair** free-to-play model that turns Vector's loudest complaints into our
biggest selling points.

> 15 handcrafted levels · 3 zones · 5 unlockable moves · 4 gear sets (3 tiers each) · 8 skins ·
> **Swarm chase** · Endless + Daily runs · Training Room · complete story with a real ending · real sprite art · 192 smoke tests ×3 green

---

## 🎯 Why we can compete with Vector 2

Real 2024–2026 player complaints (App Store / Play Store / Reddit) mapped to our design:

| What Vector / Vector 2 players hate | NEON ESCAPE answer |
| --- | --- |
| "Guaranteed lose spots" — doors & keys RNG, luck > skill | **15 handcrafted levels** — every obstacle has a skill solution. Zero RNG gates. |
| "Painfully grindy", 3 currencies, pay-to-win feel | **One currency (coins)**, generous economy, no IAP shortcut to power |
| Story is "unfinished / to be continued" (Vector 2 abandoned) | **Complete story arc with a real ending** (3 zone cards + finale) |
| "No practice makes perfect" | **Training Room** — free, all traps, no pressure |
| Energy/wait timers | **None.** Play as much as you want |
| Swarm bots = cheap, unfair deaths | **Visible SWARM meter** — stumbles let it close in, clean play & dashes pull away. Skill, not luck. |
| Gear charges that break / run out | **Permanent gear** — upgrade once, keep forever |
| "No stats / no clothing" | **8 skins** with rarities + trails, plus full run stats |
| Forced ads every attempt | **Zero forced ads.** Revive is free once per run. |

## 🐝 SWARM CHASE

The Complex's hunter swarm wakes up in the Reactor and never stops:

- Active in the **last 3 REACTOR stages + all 5 ROOFTOP stages** + every Endless/Daily run.
- A **visible SWARM meter** shows the exact distance — no hidden timers, no surprises.
- **Stumbles** (clipping crates, beams, walls) let the swarm surge forward.
- **Clean running** slowly recovers the gap; **dashes** and **Precision Landings** burst it open.
- Getting caught ends the run — one free **Revive** restores a safe distance.
- The swarm pressure ramps up over distance in Endless (never past fair).

## 🕹️ Modes

- **CAMPAIGN** — 3 zones × 5 stages (LAB → REACTOR → ROOFTOP), story cards, ending.
- **ENDLESS** — seeded procedural run (same seed on retry = learn & master) + swarm chase.
- **DAILY RUN** — one shared seed per date, everyone plays the same track + swarm chase.
- **TRAINING** — playground with every trap type, no swarm.

## 🥋 Moves (unlock with coins — no real money)

| Move | Effect |
| --- | --- |
| **Double Jump** | Second jump mid-air (opens high coin arcs) |
| **Tic-Tac** | Bounce off wall panels (over long pits) |
| **Backflip** | Style trick on double jump — flow points |
| **Phantom Slide** | 0.18 s i-frames while sliding (slide *through* lasers) |
| **Precision Landing** | Clean landing = speed burst + points |

**FLOW combo** — tricks and near-misses raise the multiplier (x1 → x8). Score = distance × flow.

## ⚙️ Gear (permanent upgrades)

- **VISOR** — wider coin magnet · **SUIT** — shield charges (refilled each level)
- **GLOVES** — longer wall cling · **BOOTS** — higher jumps + speed

## 🎨 Skins

SUBJECT-01 (free) → EMBER → VOLT → MATRIX → ROYAL → ICE → SHADOW → **GOLD** (finish all 15 levels).

## 📱 Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Jump / vault | `W` / `↑` / `Space` | swipe ▲ |
| Slide / dive | `S` / `↓` | swipe ▼ |
| Dash (i-frames, smashes crates) | `D` / `→` / `Shift` | swipe ▶ or double-tap ◀▶ |
| Pause | `P` / `Esc` | — |
| Restart | `R` | — |

## 💰 Commercial plan (fair F2P)

Designed for high ratings → organic ASO, not short-term extraction:

1. **Never interrupt gameplay** — no interstitials, no energy, no paywalls on content.
2. **Rewarded-optional only**: coin doubler after a level, one extra revive — both skippable.
3. **Cosmetics**: skin bundles, trail effects, seasonal skins (no power sold).
4. **Starter Pack / Supporter Pack**: coins + exclusive skin at fair price.
5. **Season pass (cosmetic-only)** with daily runs as the retention engine.
6. **Content pipeline**: levels are structured "beat specs" (`js/levels.js`) — new stages ship fast.

## 🦴 Hero animation: skeletal rig (Vector-style)

The runner is **not** a sprite flipbook any more. `js/rig.js` evaluates a
skeleton every frame (60 fps) with two-bone IK on both legs:

| Why a rig | Sprite sheet | Rig |
| --- | --- | --- |
| Frame rate | 12 poses ≈ 20 fps, reads steppy | continuous, evaluates every frame |
| Foot contact | contact foot slides with the body | stance foot **locked to the ground** |
| States | needs art per state | run/dash/jump/fall/slide/wall/vault from one skeleton |
| Reacts to speed | fixed | lean, stride and cadence scale with speed |

**Foot-planting math.** The body advances `v` px/s and `runPhase` advances at
`v·K`, so the stride period is `T = 2π/(v·K)` — independent of speed. During
stance a planted foot travels `2·stride` backwards in body space while the body
advances `v·duty·T = duty·2π/K`. Matching them gives

```
K = duty · π / stride
```

which is why `Rig.gaitK()` is derived from the pose constants instead of being
hand-tuned, and why `Runner.step` advances `runPhase` by `speed · Rig.gaitK()`.
Test `rig: stance foot is locked to the ground` measures the residual slip and
fails above 0.35 px per step.

Rendering is a tapered torso polygon, IK legs with a solved knee that always
bulges forward, counter-swinging arms with a fixed elbow bend, swept hair and a
rim glow; the far-side limbs are drawn first in a darker shade of the skin colour
for depth. It shares the sprite pivot (feet) and the skin palette, so all eight
skins work unchanged.

## 🎬 Art pipeline (sprites + external animations)

The hero and the hunter drones are **real illustrated sprites**, not hand-coded shapes:

| Asset | Frames | Source | On screen |
| --- | --- | --- | --- |
| `hero-run.png` | 12-frame sprint cycle | AI-generated silhouette sheet → auto-sliced | 72 px tall, bottom-centre pivot |
| `hero-poses.png` | tuck · fall · slide · wall · vault · dive | same | per-pose target height |
| `bot-hunter.png` | swarm hunter drone | AI concept art → chroma-keyed from green | 34–37 px |
| `bot-wasp.png` | small wasp drone | same | 26 px |

Everything is produced by two committed tools, so the art is reproducible and re-cuttable:

```bash
node tools/slice.js        # assets/art/*.png  -> assets/sprites/*.png + per-frame JSON
node tools/preview.js      # contact sheet at true in-game scale
node tools/render-test.js  # boots the REAL game files and writes PNG frames
node tools/test-pack.js    # 22 checks for the animation import pipeline
```

### Bringing in an animation from an external tool

Any tool that exports a **numbered PNG sequence** (StykAnimate's `png-sequence`,
Aseprite, ezgif, a Blender render…) drops straight into the game:

```bash
# 1. export frame-000001.png ... into a folder
node tools/pack-frames.js ./my-export backflip --height 72 --register
# 2. play it
Art.drawAnim(ctx, 'backflip', frameIndex, x, y, 72, '#35f0ff', alpha)
```

`--register` inserts the atlas into the `EXTRA-ANIM` block of `js/art.js`
(idempotent — re-running updates the entry instead of duplicating it), and the
loader picks every atlas in `SPRITES` up automatically. Frames are trimmed to
their ink, aligned on a bottom-centre pivot, and flattened to a white silhouette
so the skin tint applies; pass `--keep` for art that must keep its own colours
(drones, props, VFX).

> **Why no code from StykAnimate:** that project is GPL‑3.0, so copying its code
> would force this whole game to GPL. We only use its **output** — exported PNGs
> that an artist owns — which is exactly what the GPL does not restrict.

- **Hero sprites are white silhouettes on transparency**, tinted at runtime through a cached
  `source-in` canvas per skin colour — one atlas drives all 8 skins (zero extra downloads).
- **Pivots and heights live in the JSON**, so reslicing never needs a code change.
- **Graceful fallback:** if the atlas is missing or still loading, `Runner.draw` falls back to the
  original vector silhouette, so the game can never break on a failed image request.

## 🧪 Tech

Vanilla HTML5 canvas (900×540), zero runtime deps, WebAudio synth music + SFX, deterministic seeded
generation (mulberry32), localStorage persistence (`nesc.*`). Runs anywhere — browser, PWA, or the
**Capacitor APK** (`.github/workflows/neon-escape-apk.yml` builds `NEON-ESCAPE.apk` on every push).

```bash
node neon-escape/test/smoke.js   # 192 checks — logic, physics, levels, economy, swarm, rig, art, render, perf
```

## 📖 Story

You wake up in a facility that measures everything you do. A voice on the broken intercom says:
*"Run. I will open the doors."* They want a specimen. Give them a ghost.
