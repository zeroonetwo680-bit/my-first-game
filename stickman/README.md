# STICKMAN — What If

An ink-on-paper action game with a house adventure and a separate sword duel against the CPU.
Every upgrade is a "what if" premise with a real-world baseline on the card.

Play: `stickman/index.html` (served from the repo root, so
`python3 -m http.server 8000 --bind 0.0.0.0` then `/stickman/`).

---

## Sword duel — vs CPU

Choose **SWORD DUEL / VS CPU** on the main menu, or press **2**. One opponent,
one 90-second round: reduce their health to zero, or have more health when time
runs out. The AI approaches, attacks with varied cuts, sometimes jumps and blocks.

| Action | Keyboard / mouse | Touch |
| --- | --- | --- |
| Move | `A` / `D` or left / right arrows | ◀ / ▶ |
| Light sword combo | `F`, `J` or left click | SLASH |
| Heavy overhead cut | `E` | HEAVY |
| Jump | `Space`, `W` or up arrow | JUMP |
| Block | hold `S`, down arrow or right mouse button | hold BLOCK |
| Dodge | `Shift` (with a direction, or away by default) | DODGE |
| Pause / return to menu | `P` / `Escape` | tap the paused arena to resume |

Tap SLASH repeatedly for a downward cut, rising cut and longer-reaching thrust.
Quick taps are buffered. HEAVY is slower but deals more damage and removes more
guard. Attack in the air for an aerial cut. Jumping at the right moment can evade
a ground strike, but you cannot block or dodge in the air.

The thinner **GUARD** bar drops on blocked hits; when empty, the fighter is
briefly vulnerable. Dodge has a short cooldown. The result screen lets you retry
or return to the menu. House progress is unaffected.

## House adventure

Open the map from the menu, then select **The First House**. Clear each room to
unlock its door on the right; walk through to reach the next room. The first two
rooms have different enemy groups, and the third contains the Ink Guardian, who
telegraphs a charge with a red dashed line. At half health the guardian gets
faster and fires a radial volley after each charge. Between the second room and
the boss, choose a what-if power. Health recovers a little on entering each room;
your score, equipped weapon, ammunition and powers carry between rooms. Each
cleared room drops a guaranteed tool on the path to the exit. The training hall
introduces a swordsman: its red dashed warning shows the coming lunge, and a
hit during the wind-up interrupts it.

Defeat the guardian to complete the house. Completion is saved locally in the
browser and marked on the map. Houses 02 and 03 are placeholders, not playable
levels yet. Dying restarts the first house; there is no mid-house save.

## The idea

Most arena games sell you "+15% damage". This one sells you a question.

*What if your reflexes were three times faster?* The world actually slows down
when something comes close. *What if you had six arms?* You actually fire three
bullets per shot. Every offer also states the human baseline: most people react
in about a quarter of a second; two arms is the human default. The upgrade is the
science fiction, the line under it is the science.

## What makes it look like a drawing

* One articulated rig, drawn as continuous ink strokes with a per-frame wobble
  that is quantised in time. It breathes; it does not shimmer.
* Two-pass strokes: a wider soft pass under a crisp one, so the line reads over
  the ruled paper without a halo.
* Smudged ground shadows, ink splatter that stays on the page as stains, and
  dust puffs instead of magic particles.
* The player is the only coloured thing on the page: a red neckerchief.
* The whole HUD is drawn on the canvas, in the same ink, on the same paper.

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Move | `W A S D` or arrows | drag the left half |
| Aim and fire | mouse, hold left button | drag the right half |
| Dash | `Shift` or right click | (see roadmap) |
| Kung fu | `E` (press twice for punch → kick) | KUNG FU button |
| Sword | `F` | SWORD button |
| Ink blast | `Q` when charged | INK BLAST button |
| Pick up | walk over the tool | walk over the tool |
| Pause / sound | `P` / `M` | — |

## Breakable supplies

Shoot or slash the marked boxes in the first two rooms. Red-cross boxes contain
first aid (up to 25 health); the others contain a weapon. Walk over the dropped
supply to collect it. A full-health player leaves first aid on the ground until
it is needed or expires. Ink Blast can break boxes too.

## Close combat

Aim toward an enemy and press **E** for a punch; press it again for a kick.
Fast second presses are buffered until the first strike finishes. Press **F**
for a sweeping sword slash that can hit multiple enemies in front. Each strike
has a wind-up, a single damage frame and recovery. The sword is always available
and the equipped ranged weapon returns after the attack. On touch devices, use
the on-screen KUNG FU and SWORD buttons.

## Ink blast

Hitting and defeating enemies fills the ink meter under the health bar. When it
is full, press **Q** for an expanding shockwave: it damages enemies as it reaches
them, clears hostile projectiles and grants a short invulnerability window.
The meter resets after use and blast damage cannot charge itself. Touch players
can use the INK BLAST button.

## Weapons — the page's own stationery

You start with the pen: one clean line, never runs out. Everything else is
found on the page, dropped by whatever just died. Each weapon is a different
*verb*, not a bigger number.

| Weapon | What it does | Clip |
| --- | --- | --- |
| **Pen** | one precise line, no spread, never dry | ∞ |
| **Ruler** | three heavy slugs in a cone, big knockback | 24 |
| **Compass** | a needle that passes through up to three bodies | 12 |
| **Stapler** | a fast, short-range hose of staples | 80 |
| **Eraser** | a wrecking ball that ricochets off the margin twice | 8 |

Shots are born at the **tip of the tool**, not at the character's chest: the fire
code reads the same pose the figure is drawn in that frame, walks out to the end
of the barrel and spawns the bullet there, so the muzzle flash, the weapon and
the bullet start at the same point. Aim is calculated from the shoulder so the
shot follows the crosshair rather than passing over it. Bullet streaks are limited to the distance
they have travelled, so they never extend back through the player on the first
frame.

Walk over a dropped tool to take it. The clip counts down in the bottom-right
panel, each tool has its own shot sound and its own bullet art, and when a clip
empties you are handed back the pen rather than left defenceless.

## The six powers

| What if… | Baseline on the card | In play |
| --- | --- | --- |
| your reflexes were three times faster | most people react in about a quarter of a second | time dilates near danger |
| you had six arms | two is the human default | every shot becomes three |
| you could move at the speed of sound | sound crosses 343 meters in a second | dash blinks, and cuts what it passes |
| you had a second heart | an octopus runs on three | more health, slow regeneration |
| your eyes could track anything | your eyes jump about three times a second | bullets lean toward the nearest enemy |
| you never felt pain | pain is a signal, not a weakness | no knockback, faster fire |

## Tests

```bash
node test/smoke.js        # 125 checks: duel, house, supplies, swordsman, aim, melee and boss
node tools/render.js      # writes real frames to /tmp/stickman for eyeballing
```

The smoke test loads the **real** `js/` files into a stubbed browser, so the rig
geometry ("the head is above the hips", "a hanging arm is not inside the torso")
is asserted numerically instead of trusted.

`tools/render.js` needs `@napi-rs/canvas`; it exists because "the tests pass" has
never once proved that a game *looks* right.

## Roadmap

* Touch dash gesture (double-tap the move side).
* A fourth enemy type that punishes standing still.
* Named runs: the game remembers which powers cleared which wave.
