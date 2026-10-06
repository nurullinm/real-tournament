# Parity checklist and verification status

Reference for "parity" is the decompiled original (`tools/out/a10/C.java`, regenerate with `tools/decompile.sh`). The engine is a near-literal port, so parity is established against that source by tests; behaviour that only shows up while playing still needs a hands-on pass (see "Not verified").

## Verified by automated tests (against the decompiled source)

| Behaviour | Original value | Test |
|---|---|---|
| Tick length | 60 ms (16.67 Hz) | `tests/game/loop.test.ts` |
| Walk speed | 3 px/tick | `physics.test.ts` "walks 3 px per tick" |
| Jump height (button held) | 45 px (impulse −2560, gravity 256/tick² in fixed point) | `physics.test.ts` |
| Wall collision / tile edges | snap to tile edge, speed ∓1 | `physics.test.ts` |
| Saw | reload 8, hits on tick 3, 20–50 dmg, ≤24 px | `combat.test.ts` |
| Laser | reload 5, hits on tick 2, 10–20 dmg, range 96, 1 battery | `combat.test.ts` |
| Bazooka | reload 15, rocket 5 px/tick, 60–100 splash, scaled beyond 6 px | `combat.test.ts` |
| Weapon fallback when dry | laser→bazooka→saw (`3 − w`, else saw) | `combat.test.ts` |
| Armor absorption | `rnd(d/4, d − d/4)` capped by armor | `combat.test.ts` |
| Frags | kill +1, suicide −1 (DM only) | `combat.test.ts`, `match.test.ts` |
| Respawn kit | 100 hp, 0 armor, saw+laser, 25 battery, laser selected | `combat.test.ts` |
| Pickups | medikit/armor +25 (cap 100), battery +30, rocket +2, 250-tick respawn | `combat.test.ts` |
| Lifts | call button, ride, release, up to 14 px/tick | `vehicles.test.ts` |
| Cycles | 256/tick accel, cap 1792, dock/dismount | `vehicles.test.ts` |
| Tram | wait→move→squish grounded fighters within 39 px | `vehicles.test.ts` |
| CTF scoring | carry to own base = 1 point, none while own flag is taken, carrier death returns flag | `match.test.ts` |
| Map format | all 12 maps parse exactly to EOF; sizes match | `assets/maps.test.ts` |
| Bots roam on all 12 maps, never negative ammo | – | `bots.test.ts` |
| Bot skill ordering | very hard beats very easy in ≥ 8/10 seeds | `bots.test.ts` |
| Navigation incl. lifts/tram/cycles | 50/50 flag deliveries on maps 7–11 within 300–810 ticks | `bots.test.ts` |
| Determinism | same seed + inputs ⇒ identical state after 5000 ticks | `match.test.ts` |
| Full pipeline | every map simulates and renders at 956×440@3x and 667×375@2x | `tests/e2e/session.test.ts` |

Checked visually in the browser pane (956×440): main menu, DM/CTF setup (fits without scrolling), pause with ally orders, map 5 centred (20 tiles wide in a ~30-tile view), portrait ⇒ "Rotate your phone" and the game pauses. Canvas physical size = CSS size × devicePixelRatio. A 60 fps frame costs ~1.2 ms, 300 simulation ticks ~15 ms.

## Deliberate differences from the original

- Landscape view shows ~30×14 tiles instead of 11×12; camera look-ahead and 5–6 px/tick follow speed are kept proportionally.
- Rendering interpolates fighters and rockets between 60 ms ticks (60 fps); simulation is unchanged.
- RNG is a seeded mulberry32 with the same call shapes, not `java.util.Random`.
- Sound: original AMR effects (from the a10 build) decoded to WAV, mixed polyphonically with distance-based volume instead of the original single-channel priority system; pickup is a synthesised blip; item respawn is silent (as in a10).
- UI is DOM instead of canvas menus; no "Exit", no RMS save/"Continue" of an interrupted game; options persist in localStorage.
- Controls are touch buttons (+ keyboard for desktop); weapons are changed with ‹ › buttons.
- Ally orders are "Defend the base / Take their flag! / Freelance!" (the spec's "Wait" was a loading string).

## Not verified (needs a real device or the original running)

- Real Telegram on iPhone 17 Pro Max: `requestFullscreen`/`lockOrientation` behaviour, safe-area values, multitouch feel, audio unlock on first tap, sustained 60 fps, background/foreground pause.
- Side-by-side play against the original in an emulator: bot aggressiveness and weapon balance "feel". The code paths are literal ports and tested, but nobody has compared the two by playing.
- Visual check of the other 10 maps and of CTF/lift/tram/cycle scenes beyond the automated render smoke tests.
- Hosting: the game is static (`npm run build` → `dist/`); it needs an HTTPS URL and a bot/Mini App registration to open inside Telegram (spec §12, separate task).

## How to run

```bash
npm install
npm run dev        # http://localhost:5173 (add ?autostart=dm&map=5 or ?autostart=ctf to skip the menu)
npm test           # 150+ tests
npm run build      # static bundle in dist/
```
