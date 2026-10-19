# ⚡ NEON FIST

**1v1 neon fighting arena** — the third game in the NEON collection. Pure vanilla Canvas + WebAudio, zero dependencies, zero image assets (every fighter is drawn procedurally from a joint rig every frame).

Play: open `index.html` (or serve the folder with any static server).

## The roster

| Fighter | HP | Speed | Style |
| --- | --- | --- | --- |
| **BLAZE** (cyan `#35f0ff`) | 100 | 330 | Fast striker — short cooldowns, rapid pressure |
| **TITAN** (amber `#ffb84d`) | 118 | 240 | Power tank — slower, hits like a truck |
| **VOLT** (pink `#ff3d81`) | 105 | 290 | Technical duelist — **parry**: a block started within 0.22 s of impact negates the hit, stuns the attacker 0.55 s and pays +18 meter |

In 2P / CPU matches the opponent cycles through the roster (BLAZE → TITAN → VOLT).

## Modes

- **VS CPU** — three difficulties (Easy / Normal / Hard) that change the AI's reaction time, block rate, aggression, dash use and NOVA discipline.
- **2 PLAYERS** — both on one keyboard.
- **Best of 3 rounds**, 60 seconds per round. Higher HP wins on time-up; a perfect tie is a DRAW and the round is replayed.

## Controls

| Action | P1 | P2 (2P mode) | Touch |
| --- | --- | --- | --- |
| Move | `A` / `D` | `←` / `→` | ◀ ▶ buttons |
| Block | `S` | `↓` | 🔒 |
| Punch | `F` | `K` | 👊 |
| Kick | `G` | `L` | 🦵 |
| NOVA special | `H` | `O` | ⚡ |
| Dash | `Shift` (P1) | — | — |
| Pause | `Esc` / `P` | `Esc` / `P` | ⏸ |
| Mute / Rematch | `M` / `R` | `M` / `R` | — |

Fighters **auto-face** the opponent. There is no jumping — it's a grounded footsies game.

## The systems

- **Combos & cancel** — a victim hit again within 1.2 s increments the combo counter; each extra hit deals up to **+50%** damage (10 % per hit, capped). A connected punch can be cancelled straight into a kick for deeper strings. ≥2-hit combos pop a big "N HITS!" callout (both sides in 2P).
- **Block & parry** — hold to guard: only **18 % chip damage** gets through, no hitstun, and blocking earns meter. VOLT's **parry** rewards fresh blocks timed to the impact: zero damage + attacker stun + meter. Getting hit builds meter for *both* fighters, so defense always feeds a comeback.
- **Dash** — P1 `Shift` (or **double-tap ◀/▶** on touch), a fast gap-closer that leaves **neon afterimages** of the full pose rig. Cooldown 0.7 s.
- **Dynamic camera** — micro-zoom punches on K.O. and NOVA impacts, easing back to frame the arena.
- **NOVA special** — at a full 100 meter, unleash a cinematic dash-strike: time freeze on cast, screen flash, launch, slow motion on contact. P1 punches into a kick instantly if the kick lands mid-combo (cancel).
- **KO cinematic** — hitstop, flash, shake, slow motion; the loser crumples via the same rig, the winner poses.

## Tech

- Logical arena **900×540**, scaled + letterboxed to any screen, DPR-aware.
- Fighters are **stick-figure neon rigs** (hips/knees/shoulders/elbows/head) posed per state, drawn twice: wide additive glow pass + bright core pass. No sprites, no sheets.
- **Pooled FX** (~600 particles, floating damage text, shock rings, screen shake, hitstop, slow motion) — zero per-frame allocation, ~0.04 ms/frame logic in the smoke test.
- Procedural WebAudio: whooshes, punch/kick impacts, guard clanks, NOVA charge/hit, KO boom, win/lose jingles.
- **Touch controls** appear automatically on touch devices (move + block/punch/kick/NOVA).
- Persists prefs & records: `nff.diff`, `nff.p1`, `nff.muted`, `nff.record`, `nff.streak`, `nff.beststreak`.
- The NOVA dash also spawns afterimages; blocked hits keep their own guard-spark identity; parries flash gold.

## Tests

```
node test/smoke.js
```

113 headless checks boot the real game in a VM sandbox (stubbed DOM/Canvas/Audio): match flow, damage formulas, chip block, combo scaling, dash physics, NOVA meter rules, KO/round/match flow, time-up & draws, pause, AI behaviors per difficulty, FX pools, pose rig, persistence, a 60 s stress run and a frame-time budget — all green ×3 runs, seeded RNG.

---
Part of the NEON collection: **NEON WRECKAGE** (root) · **BLOCK NOVA** (`block-nova/`) · **NEON FIST** (`neon-fist/`)
