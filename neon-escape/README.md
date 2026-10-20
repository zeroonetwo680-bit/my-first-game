# NEON ESCAPE 🏃💨 — Facility Parkour Runner

**Break out of the Complex.** A neon silhouette parkour runner inspired by **Vector 2** — rebuilt to be
*better, newer, and commercially competitive*: skill-first level design, a complete story, permanent
gear, 8 skins, and a **fair** free-to-play model that turns Vector's loudest complaints into our
biggest selling points.

> 15 handcrafted levels · 3 zones · 5 unlockable moves · 4 gear sets (3 tiers each) · 8 skins ·
> Endless + Daily runs · Training Room · complete story with a real ending · 134 smoke tests ×3 green

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
| Gear charges that break / run out | **Permanent gear** — upgrade once, keep forever |
| "No stats / no clothing" | **8 skins** with rarities + trails, plus full run stats |
| Forced ads every attempt | **Zero forced ads.** Revive is free once per run. |

## 🕹️ Modes

- **CAMPAIGN** — 3 zones × 5 stages (LAB → REACTOR → ROOFTOP), story cards, ending.
- **ENDLESS** — seeded procedural run (same seed on retry = learn & master).
- **DAILY RUN** — one shared seed per date, everyone plays the same track.
- **TRAINING** — playground with every trap type.

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

## 🧪 Tech

Vanilla HTML5 canvas (900×540), zero runtime deps, WebAudio synth music + SFX, deterministic seeded
generation (mulberry32), localStorage persistence (`nesc.*`). Runs anywhere — browser, PWA, or the
**Capacitor APK** (`.github/workflows/neon-escape-apk.yml` builds `NEON-ESCAPE.apk` on every push).

```bash
node neon-escape/test/smoke.js   # 134 checks — logic, physics, levels, economy, render, perf
```

## 📖 Story

You wake up in a facility that measures everything you do. A voice on the broken intercom says:
*"Run. I will open the doors."* They want a specimen. Give them a ghost.
