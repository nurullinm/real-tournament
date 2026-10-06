# Map format (verified on all 12 maps)

Source: `tools/out/a10/C.java` `G_LoadMap()` (decompiled from the `(a10)` JAR; run `tools/decompile.sh`). Files `public/original/0`…`11`. All integers **big-endian** (Java `DataInputStream`). Verified: every map parses exactly to EOF.

Maps 0–6 are Deathmatch, **7–11 are CTF** (`g_mapnumber = opt[27]` for DM, `opt[30] + 7` for CTF).

## Layout

| Field | Type | Notes |
|---|---|---|
| `ntilesx`, `ntilesy` | int16, int16 | width × height in tiles |
| tiles | `ntilesx*ntilesy` × int8, row-major (y outer) | negative → 0; tile id indexes `public/original/pass` |
| `npobjs` | int16 | max 60 |
| per pobj ×npobjs | int8 `type`, int16 `x`, int16 `y`, int16 `data1` | x,y in **pixels** (16 px/tile). For `type ≥ 2`, `data1` is overwritten by `y >> 4` at load |
| `nnodes` | int16 | AI graph |
| per node ×nnodes | int8 `type`, int16 `x`, int16 `y`, int16 `left`, int16 `right`, int16 `top`, int8 `flags` | `left/right/top` are node indices or negative |
| `ndmBlue`, then `ndmBlue` × int16 | spawn node indices | DM uses this list; CTF blue team uses it |
| `ndmRed`, then `ndmRed` × int16 | spawn node indices | CTF red team; 0 on DM maps |
| tram | int16 `x1`, `x2`, `y` | `y == 0` ⇒ no tram |
| cycle area | int16 `x1`, `y1`, `x2`, `y2` | `x1==0` ⇒ no cycles. Loader adds `y1 += 32` |
| `nLeftDocks`, `nRightDocks` | int16, int16 | then left docks: (int16 node, int16 pobj) × n, then right docks the same |

`pass` file: 64 bytes; `passable[tile] = (byte == 0)`. Tile image index = tile id; tile sheet is `tiles.png` 128×112 = 8×7 tiles of 16×16.

## Per-tile cell flags (computed at load)

`cell[y][x]`: bit0 (1) = standable surface (passable tile with solid tile above... see code), bit1 (2) = solid; bits 4/8 = jump-across-gap possible left/right, 0x10/0x20 = wide-gap variants. Map left/right edge columns get bit 2. Also precomputed `reachleft[y][x]` / `reachright[y][x]`: nearest standable-blocking column in each direction (used for line-of-fire and bot "can shoot" tests). Port these computations literally from `G_LoadMap`.

## Pobj types

| type | meaning |
|---|---|
| 1 | lift shaft anchor (3 consecutive pobjs: anchor, upper stop, lower stop) |
| 2, 3 | cycle docks (left/right) |
| 4 | bazooka pickup (+2 rockets, grants weapon 2) |
| 5 | medikit (+25 HP, max 100); removed when option "No medikits" is on |
| 6 | rocket ammo (+2) |
| 7 | armor (+25, max 100) |
| 8 | battery (+30 laser ammo) |
| 9 | lift call button |
| 10 / 11 | blue / red flag base (CTF) |
| 16, 17, 12–15, 18, 19 | lift internal states (see `original-logic.md`) |
| 20 / 21 | flag taken markers |
| 22, 23 | decoration (blinking lights) |
| 40 | tram stop |

Pickup respawn: consumed pobj gets `type |= 0x40` and `data3 = tick + 250`; queue size 50.

## Per-map facts (tiles)

| map | size | tram | cycles | docks L/R | dmBlue/Red |
|---|---|---|---|---|---|
| 0 | 40×16 | – | – | – | 6/0 |
| 1 | 50×29 | – | – | – | 6/0 |
| 2 | 50×23 | x208–640,y352 | – | – | 8/0 |
| 3 | 60×29 | x480–672,y304 | – | – | 8/0 |
| 4 | 50×29 | – | x256–624, y416 | 3/2 | 5/0 |
| 5 | **20×38** | – | – | – | 4/0 |
| 6 | 32×20 | – | – | – | 6/0 |
| 7 | 44×23 | – | – | – | 3/3 |
| 8 | 45×29 | – | – | – | 3/3 |
| 9 | 66×20 | x320–736,y64 | – | – | 3/3 |
| 10 | 50×29 | – | x224–576, y448 | 2/2 | 2/2 |
| 11 | 40×29 | – | – | – | 3/3 |

Consequence for the view (spec §4): map 5 is 20 tiles wide, narrower than the ~30-tile landscape view; maps 0 and 6 are 16 and 20 tiles tall. Centering with background fill is required, not an edge case.
