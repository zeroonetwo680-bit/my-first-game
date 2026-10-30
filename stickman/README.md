# STICKMAN — What If

A twin-stick arena survival game drawn as ink on a sheet of paper. Every upgrade
is a "what if" premise with the real-world number printed on the card: the power
is fiction, the baseline beside it is not.

Play: `stickman/index.html` (served from the repo root, so
`python3 -m http.server 8000 --bind 0.0.0.0` then `/stickman/`).

---

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
| Pause / sound | `P` / `M` | — |

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
node test/smoke.js        # 40 checks: rig geometry, combat, powers, 2 minutes of play
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
