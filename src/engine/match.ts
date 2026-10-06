import type { GameMap } from '../assets/types';
import { BOT_SKIN } from '../assets/skins';
import { canShoot } from './fighter';
import { moveFighter } from './fighterStep';
import { stepProjectiles } from './combat';
import { stepRespawns } from './items';
import { setupCtf } from './modes/ctf';
import { setupDeathmatch } from './modes/deathmatch';
import type { AiHooks, EngineAssets, InputState, Match, MatchOptions } from './types';
import { CMD_ACTION, CMD_FIRE, CMD_JUMP, CMD_LEFT, CMD_RIGHT } from './types';
import { moveCyclist, stepLifts, stepTram } from './vehicles';
import { buildBaseMatch } from './world';

/** G_StartMap: world + fighters for the chosen mode. `ai` (see bots/) must be supplied here because spawning asks it for routes. */
export function createMatch(opts: MatchOptions, map: GameMap, seed: number, assets: EngineAssets, ai?: AiHooks): Match {
  const m = buildBaseMatch(opts, map, seed, assets);
  if (ai) m.ai = ai;
  const humans = Math.max(1, opts.humans ?? 1);
  m.fighters.forEach((f, i) => { f.human = opts.humanSlots ? opts.humanSlots.includes(i) : i < humans; });
  if (opts.mode === 'dm') setupDeathmatch(m);
  else setupCtf(m);
  m.fighters.forEach((f) => { f.skin = skinFor(m, f); });
  return m;
}

/** Deathmatch: people wear their own colour and bots are dark grey; CTF: everybody wears the team colour. */
export function skinFor(m: Match, f: { human: boolean; color: number }): number {
  return m.gameMode === 1 || f.human ? f.color : BOT_SKIN;
}

export function inputToCmd(i: InputState): number {
  return (i.jump ? CMD_JUMP : 0) | (i.left ? CMD_LEFT : 0) | (i.right ? CMD_RIGHT : 0) | (i.action ? CMD_ACTION : 0) | (i.fire ? CMD_FIRE : 0);
}

export function cmdToInput(cmd: number): InputState {
  return {
    jump: (cmd & CMD_JUMP) !== 0, left: (cmd & CMD_LEFT) !== 0, right: (cmd & CMD_RIGHT) !== 0,
    action: (cmd & CMD_ACTION) !== 0, fire: (cmd & CMD_FIRE) !== 0, weaponSelect: -1, weaponDelta: 0,
  };
}

/** Weapon pick pulses become the original's `pendingweapon`. */
function applyWeaponInput(m: Match, num: number, i: InputState): void {
  const f = m.fighters[num]!;
  if (i.weaponSelect >= 0) {
    f.pendingWeapon = i.weaponSelect;
  } else if (i.weaponDelta !== 0) {
    for (let k = 1; k <= 3; k++) {
      const w = (((f.currentWeapon + i.weaponDelta * k) % 3) + 3) % 3;
      if (canShoot(f, w)) {
        f.pendingWeapon = w;
        break;
      }
    }
  }
}

/**
 * Advances the match by one 60 ms tick (G_AdvanceGame).
 * `inputs` carries human/scripted input by fighter number; fighters without an entry (number >= 1) are driven by the AI.
 */
export function step(m: Match, inputs: Map<number, InputState>): void {
  m.tick++;
  m.events.length = 0;
  if ((m.tick & 0x100) === 0) m.ai.makeStrategicalDecision(m);
  stepLifts(m);
  stepTram(m);
  for (let n = 0; n < m.numFighters; n++) {
    const f = m.fighters[n]!;
    const given = inputs.get(n);
    if (given) applyWeaponInput(m, n, given);
    if (f.isCycling) moveCyclist(m, f, given ? inputToCmd(given) : m.ai.controlCyclist(m, f));
    else moveFighter(m, f, given ? inputToCmd(given) : f.human ? 0 : m.ai.controlFighter(m, f));
  }
  m.rays = m.rays.filter((r) => r.tick + 4 >= m.tick);
  stepProjectiles(m);
  stepRespawns(m);
}

export type MatchResult = { over: boolean; winner: number | 'draw' | null };

/** Frag/capture limit check from the main loop. Several sides at the top ⇒ 'draw'. */
export function matchResult(m: Match): MatchResult {
  if (m.fragLimit <= 0) return { over: false, winner: null };
  const top = Math.max(...m.score.slice(0, m.numSides));
  if (top < m.fragLimit) return { over: false, winner: null };
  const leaders: number[] = [];
  for (let i = 0; i < m.numSides; i++) if (m.score[i] === top) leaders.push(i);
  return { over: true, winner: leaders.length === 1 ? leaders[0]! : 'draw' };
}

/** Plain-data view of the simulation state for determinism checks and debugging. */
export function snapshot(m: Match): unknown {
  return {
    tick: m.tick, score: m.score, flags: m.flagIsTaken, tram: m.tram,
    fighters: m.fighters.slice(0, m.numFighters),
    pobjs: m.pobjs, projectiles: m.projectiles, rays: m.rays, respawnQueue: m.respawnQueue,
  };
}
