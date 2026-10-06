# Real Tournament Telegram Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Native TypeScript/Canvas port of the J2ME game Real Tournament as a landscape Telegram Mini App, vs bots only.

**Architecture:** A headless, deterministic `engine/` (fixed-step, seeded RNG, no DOM) ported by hand from CFR-decompiled original code. `bots/` drives fighters through the same `InputState` as the player. `render/`, `input/`, `audio/`, `ui/`, `platform/` are thin browser layers over the engine.

**Tech Stack:** TypeScript, Vite, Vitest, Canvas 2D, WebAudio, Telegram WebApp JS API, CFR (decompiler, tools only).

**Spec:** `docs/superpowers/specs/2026-10-06-real-tournament-telegram-port-design.md`

## Global Constraints

- Source JAR: `~/Downloads/Real-Tournament_J2ME_EN_v110/Real Tournament (2012)(RMG)(v1.1.0).jar`; native resolution 176×208; tiles in `tiles.png` 128×112.
- 12 maps (files `0`–`11`), modes Deathmatch and Capture the flag (2×2), 5 skill levels (Very easy … Very hard), bots only, no multiplayer or server.
- Landscape only: `Telegram.WebApp.requestFullscreen()` + `lockOrientation()`; canvas physical size = CSS size × `devicePixelRatio`; integer pixel scale, `imageSmoothingEnabled = false`; target ~14 tiles of view height.
- Engine has no DOM/canvas dependency; fixed timestep; seeded RNG; same seed + same inputs ⇒ identical state.
- Controls: left/right, jump, fire, weapon prev/next, action (lifts/cycles); multitouch.
- Sound: MIDI pre-rendered to audio files, unlocked by first user gesture; Sound and Violence toggles kept.
- Downloading CFR needs explicit user confirmation first.
- Commit after each task (`git init` happens in Task 1).

## Review Focus

- Map smaller than the camera view: centered with background fill, no crash, no negative camera.
- Touch: two fingers on Fire + Right simultaneously, finger sliding off a button, and a 3rd finger tap must not stick or drop inputs.
- Screen not yet landscape / lockOrientation unsupported: shows "rotate your phone" overlay and pauses the match.
- App backgrounded or Telegram closes/reopens mid-match: game pauses, audio suspends, no catch-up burst of ticks.
- Match limits: frag limit reached exactly on a suicide/tie, and CTF flag carrier dying: matches the original help text.

---

### Task 1: Scaffold project and extract original resources

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.ts`, `tools/extract-jar.sh`, `tests/smoke.test.ts`
- Create: `public/original/*` (extracted from JAR)

**Interfaces:**
- Produces: `npm test` (Vitest), `npm run dev`, `npm run build`; `public/original/{tiles.png,bg.png,menu.png,...,0..11,chars,help.str,real.str,*.mid}`.

- [ ] **Step 1: Write failing test** `tests/smoke.test.ts`: `expect(existsSync('public/original/tiles.png')).toBe(true)` and the 12 map files `0`–`11` exist.
- [ ] **Step 2: Run** `npx vitest run tests/smoke.test.ts` — expect FAIL (files missing).
- [ ] **Step 3: Implement** `tools/extract-jar.sh` (unzip the base JAR into `public/original/`, skip `.class` and `META-INF`); scaffold Vite+TS+Vitest; run `git init`.
- [ ] **Step 4: Run** the smoke test — expect PASS.
- [ ] **Step 5: Commit** `chore: scaffold project and extract original resources`.

### Task 2: Decompile original and write logic notes

**Files:**
- Create: `tools/cfr.jar` (gitignored), `tools/decompile.sh`, `docs/notes/original-logic.md`, `docs/notes/map-format.md`

**Interfaces:**
- Produces: the notes are the contract for Tasks 3–9. They must list verbatim constants: gravity, jump impulse, run speed, fighter hitbox, tile size, per-weapon damage/speed/reload/ammo/splash, pickup amounts (+25 health, +25 armor), respawn delay, lift/cycle behaviour, bot skill parameters per level, map byte layout (tile ids, spawn/flag/item markers, dimensions of each of the 12 maps).

- [ ] **Step 1: Ask the user to confirm** downloading CFR (name, GitHub source, size); wait for yes.
- [ ] **Step 2: Implement** `tools/decompile.sh`: run CFR over `M`, `a`, `b`, `c` of the base JAR and over `C`, `Fighter` of the `(a10)` JAR into `tools/out/` (gitignored).
- [ ] **Step 3: Write `map-format.md`** from the decompiled map loader; verify by hand-decoding map `0` (dimensions, spawn count) against the file bytes.
- [ ] **Step 4: Write `original-logic.md`** with the constants and state machines above, each with the decompiled class/method it came from.
- [ ] **Step 5: Verify** every item in the Produces list is present (checklist at top of the doc, all ticked). Commit `docs: original logic and map format notes`.

### Task 3: Assets — map, strings, sprite loaders

**Files:**
- Create: `src/assets/types.ts`, `src/assets/maps.ts`, `src/assets/strings.ts`, `src/assets/sprites.ts`
- Test: `tests/assets/maps.test.ts`

**Interfaces:**
- Produces:
  - `type Point = {x:number; y:number}`
  - `interface GameMap { id:number; width:number; height:number; tiles:Uint8Array; spawns:Point[]; flags:{a:Point; b:Point}|null; items:{kind:ItemKind; at:Point}[]; lifts:Lift[] }` (exact fields per `map-format.md`)
  - `parseMap(id:number, bytes:Uint8Array): GameMap`
  - `loadAllMaps(): Promise<GameMap[]>` (browser fetch) and `loadAllMapsFromDisk(dir:string): GameMap[]` (Node, for tests)
  - `parseStrings(bytes:Uint8Array): string[]`
  - `loadSprites(): Promise<{tiles:ImageBitmap; ...}>`

- [ ] **Step 1: Write failing tests:** `parses all 12 maps` (length 12, every `width*height === tiles.length`); `every map has ≥2 spawns`; `CTF-capable maps have both flags`; `parseStrings(help.str)` contains "Medikit".
- [ ] **Step 2: Run** `npx vitest run tests/assets` — FAIL.
- [ ] **Step 3: Implement** the parsers per `map-format.md` (including the original's `.str` encoding).
- [ ] **Step 4: Run** — PASS. **Step 5: Commit** `feat(assets): map and string parsers`.

### Task 4: Engine core — world, fighter, tile physics

**Files:**
- Create: `src/engine/rng.ts`, `src/engine/types.ts`, `src/engine/world.ts`, `src/engine/physics.ts`
- Test: `tests/engine/physics.test.ts`

**Interfaces:**
- Consumes: `GameMap` (Task 3).
- Produces:
  - `interface InputState { left:boolean; right:boolean; jump:boolean; fire:boolean; action:boolean; weaponDelta:-1|0|1 }`
  - `interface Fighter { id:number; team:number; pos:Point; vel:Point; facing:-1|1; health:number; armor:number; weapon:WeaponKind; ammo:Record<WeaponKind,number>; alive:boolean; respawnIn:number; frags:number; isBot:boolean }`
  - `interface Match { map:GameMap; fighters:Fighter[]; projectiles:Projectile[]; items:ItemState[]; tick:number; rng:Rng; mode:Mode; events:GameEvent[] }`
  - `createRng(seed:number): Rng` with `next():number` in [0,1) and `int(n:number):number`
  - `stepFighterPhysics(m:Match, f:Fighter, input:InputState): void`

- [ ] **Step 1: Write failing tests** with constants from the notes: fighter falls under gravity and lands on a floor tile; jump reaches the original's peak height (±0 tiles of the notes value); cannot walk through a wall tile; same seed gives same `rng.next()` sequence.
- [ ] **Step 2: Run** — FAIL. **Step 3: Implement** with the notes' constants (no hardcoded guesses). **Step 4: Run** — PASS. **Step 5: Commit** `feat(engine): world and tile physics`.

### Task 5: Engine — weapons, projectiles, damage, pickups, respawn

**Files:**
- Create: `src/engine/weapons.ts`, `src/engine/combat.ts`, `src/engine/items.ts`
- Test: `tests/engine/combat.test.ts`

**Interfaces:**
- Consumes: Task 4 types.
- Produces: `fire(m:Match, f:Fighter): void`, `stepProjectiles(m:Match): void`, `applyDamage(m:Match, victim:Fighter, amount:number, attacker:Fighter|null): void` (armor absorbs per notes; emits `GameEvent` kill/suicide), `stepItems(m:Match): void`, `respawn(m:Match, f:Fighter): void` (random spawn via `m.rng`).

- [ ] **Step 1: Write failing tests:** each weapon's damage/ammo/reload per notes (bazooka, laser, saw); rocket splash hits a neighbour; medikit gives +25 health capped at max; armor +25; kill gives attacker +1 frag; suicide gives −1 frag; "No medikits" option removes medikits; respawn picks a spawn point deterministically per seed.
- [ ] **Step 2–5:** run FAIL → implement → PASS → commit `feat(engine): combat and items`.

### Task 6: Engine — lifts and cycles

**Files:**
- Create: `src/engine/vehicles.ts`
- Test: `tests/engine/vehicles.test.ts`

**Interfaces:**
- Produces: `stepLifts(m:Match, inputs:Map<number,InputState>): void`; `action` (DOWN/8) calls a lift when standing at its stop and mounts a cycle when overlapping it; cycle movement per notes.

- [ ] **Step 1: Write failing tests:** pressing `action` at a lift stop moves the lift to that floor and carries the fighter; fighter on a cycle moves at the notes' speed and dismounts on `action`/death.
- [ ] **Step 2–5:** FAIL → implement → PASS → commit `feat(engine): lifts and cycles`.

### Task 7: Engine — match flow, Deathmatch and CTF

**Files:**
- Create: `src/engine/match.ts`, `src/engine/modes/deathmatch.ts`, `src/engine/modes/ctf.ts`
- Test: `tests/engine/match.test.ts`, `tests/engine/modes.test.ts`

**Interfaces:**
- Produces:
  - `interface MatchOptions { mapId:number; mode:'dm'|'ctf'; skill:0|1|2|3|4; bots:number; fragLimit:number; noMedikits:boolean; playerColor:number }`
  - `createMatch(opts:MatchOptions, map:GameMap, seed:number): Match`
  - `step(m:Match, inputs:Map<number,InputState>): void` — one fixed tick, in order: input → physics → vehicles → combat → items → mode rules
  - `matchResult(m:Match): {over:boolean; winner:number|'draw'|null}`

- [ ] **Step 1: Write failing tests:** DM ends when a fighter reaches `fragLimit`; tie on the same tick yields `'draw'`; CTF: carrying enemy flag home scores 1 point only if own flag is at base; carrier death returns flag to its base; own flag captured blocks scoring (per help text); 2v2 teams assigned; **determinism:** two matches, same seed + scripted inputs for 5000 ticks ⇒ deep-equal state.
- [ ] **Step 2–5:** FAIL → implement → PASS → commit `feat(engine): match flow, DM and CTF`.

### Task 8: Bots

**Files:**
- Create: `src/bots/brain.ts`, `src/bots/navigation.ts`, `src/bots/skill.ts`, `src/bots/orders.ts`
- Test: `tests/bots/bots.test.ts`

**Interfaces:**
- Consumes: `Match`, `InputState`.
- Produces: `createBrain(skill:0|1|2|3|4, seed:number): Brain`; `botInput(m:Match, id:number, brain:Brain): InputState`; `type AllyOrder = 'wait'|'follow'|'attack'` (exact set per original help; names fixed by notes); `setAllyOrder(brain:Brain, o:AllyOrder): void`.

- [ ] **Step 1: Write failing tests:** a bot reaches a pickup on each of the 12 maps within N ticks (no stuck in a wall); bot never emits `fire` with 0 ammo; hard bot beats very-easy bot in ≥8 of 10 seeded 3-minute DM sims; in CTF a bot carrying the flag heads to its base; `wait` order holds position.
- [ ] **Step 2–5:** FAIL → implement from notes' skill parameters (aim error, reaction time, aggression) → PASS → commit `feat(bots): ai and ally orders`.

### Task 9: Platform and render core (scale, camera, world)

**Files:**
- Create: `src/platform/telegram.ts`, `src/render/scale.ts`, `src/render/camera.ts`, `src/render/world.ts`
- Test: `tests/render/scale.test.ts`, `tests/render/camera.test.ts`

**Interfaces:**
- Produces:
  - `computeScale(cssW:number, cssH:number, dpr:number, tileSize:number, targetTilesH:number): {scale:number; viewTilesW:number; viewTilesH:number}` (integer `scale`)
  - `computeCamera(player:Point, view:{w:number;h:number}, map:{w:number;h:number}): Point` (clamped; centered when the map is smaller than the view)
  - `initPlatform(): Promise<{isTelegram:boolean; lockLandscape():Promise<boolean>; onVisibility(cb:(visible:boolean)=>void):void; haptic(kind:'light'|'medium'):void}>` with a browser stub
  - `drawWorld(ctx:CanvasRenderingContext2D, m:Match, cam:Point, scale:number, sprites:Sprites): void`

- [ ] **Step 1: Write failing tests:** iPhone 17 Pro Max (CSS 956×440, dpr 3, tile 16, target 14) returns an integer scale and ≈30×14 view tiles; camera clamps at map edges; map narrower than view ⇒ camera centers it (no negative offset); `lockLandscape()` resolves `false` when API is missing.
- [ ] **Step 2–5:** FAIL → implement → PASS → commit `feat(render): scale, camera, world drawing`. Add the rotate-phone overlay + pause on `lockLandscape()===false` or portrait.

### Task 10: Touch input

**Files:**
- Create: `src/input/touch.ts`, `src/input/layout.ts`
- Test: `tests/input/touch.test.ts`

**Interfaces:**
- Produces: `createTouchInput(el:HTMLElement, layout:ButtonLayout): {state():InputState; dispose():void}`; `computeLayout(w:number,h:number,safeArea:{l:number;r:number;t:number;b:number}): ButtonLayout`. Buttons: left, right, fire, jump, action, weapon prev/next, ally-order panel (CTF).

- [ ] **Step 1: Write failing tests** (simulated pointer events): Fire+Right held together both report true; sliding a finger from Right to Left switches; releasing one finger leaves the other held; `pointercancel` clears all; `weaponDelta` is a one-tick pulse.
- [ ] **Step 2–5:** FAIL → implement with Pointer Events and per-pointer tracking → PASS → commit `feat(input): multitouch controls`.

### Task 11: HUD and sprites

**Files:**
- Create: `src/render/hud.ts`, `src/render/fighters.ts`, `src/render/font.ts`
- Test: `tests/render/hud.test.ts`

**Interfaces:**
- Produces: `drawHud(ctx, m:Match, playerId:number, viewport:{w:number;h:number}, safeArea): void` — health, armor, ammo, weapon, frags/limit (DM) or flag score (CTF). `drawFighters(ctx, m, cam, scale, sprites): void` using `chars`/`tiles` frames per notes.

- [ ] **Step 1: Write failing tests** against a mock 2D context: HUD draws health and ammo text for a known match; HUD stays inside the safe area.
- [ ] **Step 2–5:** FAIL → implement → PASS → commit `feat(render): hud and fighters`.

### Task 12: Audio

**Files:**
- Create: `tools/render-midi.sh`, `public/audio/*.ogg`, `src/audio/audio.ts`
- Test: `tests/audio/audio.test.ts`

**Interfaces:**
- Produces: `createAudio(): {unlock():void; play(name:SoundName):void; music(on:boolean):void; setEnabled(on:boolean):void; suspend():void; resume():void}`; `SoundName` = alarm | bazooka | capture | die | explosion | intro | laser | pickup | respawn | saw.

- [ ] **Step 1: Write failing tests** with a mocked `AudioContext`: no sound before `unlock()`; `setEnabled(false)` suppresses `play`; `suspend()` calls `ctx.suspend()`.
- [ ] **Step 2–3:** FAIL → render the 10 MIDI files to OGG (FluidSynth + a free SoundFont; confirm any download with the user) and implement. **Step 4:** PASS. **Step 5:** Commit `feat(audio): prerendered sounds`.

### Task 13: UI, game loop and integration

**Files:**
- Create: `src/ui/menu.ts`, `src/ui/settings.ts`, `src/ui/pause.ts`, `src/ui/help.ts`, `src/game/loop.ts`, update `src/main.ts`
- Test: `tests/game/loop.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces: `createLoop(step:()=>void, render:()=>void, hz:number): {start():void; pause():void; resume():void}` — accumulator-based fixed step, drops accumulated time after pause/visibility change (no catch-up burst), caps ticks per frame.

- [ ] **Step 1: Write failing tests** (fake clock): 60 ms frame yields the right number of ticks; after `pause()`/`resume()` with 10 s gap runs ≤1 tick; cap holds on a 2 s frame.
- [ ] **Step 2–4:** FAIL → implement loop and wire menu → settings (map, skill, bots, frag limit, color, no medikits, sound, violence) → game → pause/end screen → PASS.
- [ ] **Step 5: Commit** `feat: ui, loop, integration`.

### Task 14: Verification on device and parity pass

**Files:**
- Create: `tests/e2e/screens.spec.ts` (Playwright or browser MCP script), `docs/notes/parity-checklist.md`

- [ ] **Step 1: Script** loads the built game at 956×440 DPR 3 and 667×375 DPR 2, starts a bot match, and captures screenshots; assert canvas physical size = CSS × DPR and no console errors.
- [ ] **Step 2: Parity checklist** vs original in an emulator (reference only): jump height, run speed, bazooka splash, laser rate, lift timing, bot behaviour per skill; record differences and fix constants in the engine.
- [ ] **Step 3: Device pass** in Telegram on iPhone: landscape lock, safe-area, multitouch, audio after first tap, 60 fps, background/foreground pause.
- [ ] **Step 4: Run** `npm test && npm run build` — all green. **Step 5: Commit** `test: e2e and parity pass`.

Hosting and bot binding are out of scope here (spec §12) and get their own task after this plan is complete.
