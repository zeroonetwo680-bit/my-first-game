# BLOCK NOVA — Neon Block Puzzle+

A polished Block Blast–style puzzle with more power: 8×8 grid, drag neon
pieces, blast full rows **and** columns, chain streak multipliers, and
unleash bombs, hammers and free rotation. Zero dependencies — pure Canvas 2D.

## Play

Serve the repo root and open `/block-nova/`:

```bash
python3 -m http.server 8000
# → http://localhost:8000/block-nova/
```

## What's beyond the classic

- **Rotation** — double-tap a tray piece (or press `R` / the rotate button)
  to spin it. Costs rotate charges.
- **Power-ups** — 💥 Bomb clears a 3×3 area, 🔨 Hammer crushes any single
  cell. Earned automatically by scoring (progress bars on the buttons).
- **Streak multipliers** — consecutive clearing placements build x1.5, x2,
  x2.5… multipliers with escalating juice and sound pitch.
- **All Clear** — wipe the whole board for +500, confetti and a free bomb.
- **Fair refills** — the game rerolls the tray so at least one piece always
  fits before the mercy single appears.
- **Two modes** — Classic (endless) and Rush (2:00 countdown, +2s per line,
  up to 3:00).
- **Local top-5 tables per mode** + lifetime stats, all in localStorage.
- **Juice** — staggered cell-pop clears, screen shake scaled to blast size,
  floating combo text, particles, menu of drifting neon blocks.
- **Procedural audio** — every click, blast and fanfare synthesized in
  WebAudio; mute persisted.
- **Android niceties** — haptic feedback, wake-lock-free 60fps loop with a
  negative-dt guard, safe-area aware layout, touch drag with lift offset
  (your finger never covers the piece).

## Controls

| Action | Mouse/Touch | Keys |
|---|---|---|
| Place piece | drag from tray to grid | — |
| Rotate piece | double-tap it / rotate button | `R` |
| Bomb / Hammer | arm the button, tap the grid | `B` / `H` |
| Pause | pause button | `P` / `Esc` |
| Restart (game over) | buttons | `R` |
| Mute | speaker button | `M` |

## Testing

`node test/smoke.js` boots the real game headless (stubbed DOM + seeded RNG)
and drives 36 deterministic checks: placement, clears, streak multipliers,
rotation, bomb/hammer, charge earning, refill fairness, game over,
persistence, rush timer, pause and a 60-second stress run.
