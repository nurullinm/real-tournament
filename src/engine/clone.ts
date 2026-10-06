import { createRng } from './rng';
import type { Fighter, Match } from './types';

/** Match fields that never change during play and are shared between copies. */
export const SHARED_FIELDS = [
  'opts', 'map', 'assets', 'ai', 'gameMode', 'ntilesx', 'ntilesy', 'mapWidth', 'mapHeight', 'cell', 'reachLeft', 'reachRight',
  'numFighters', 'numSides', 'fragLimit', 'skill', 'aiReaction', 'aiJumpiness',
] as const;

/** Match fields that change during play and are copied one by one. */
export const COPIED_FIELDS = [
  'rng', 'tick', 'events', 'fighters', 'score', 'sideColors', 'lastDmStart', 'pobjs', 'thinkers', 'respawnQueue',
  'projectiles', 'rays', 'flagIsTaken', 'tram', 'cycle',
] as const;

function cloneFighter(f: Fighter): Fighter {
  // `starts` (the map's spawn list) and `busySequence` (a constant sequence) are read-only and shared
  return { ...f, ammo: [...f.ammo], weaponPresent: [...f.weaponPresent] };
}

/**
 * A full copy of the simulation state: stepping the copy never touches the original and, given the same inputs, both
 * evolve identically. Used to predict the local player's movement ahead of the server and to replay it after a correction.
 * A guard test makes sure every Match field is listed in SHARED_FIELDS or COPIED_FIELDS.
 */
export function cloneMatch(m: Match): Match {
  const rng = createRng(0);
  rng.setState(m.rng.getState());
  return {
    ...m,
    rng,
    events: [],
    fighters: m.fighters.map(cloneFighter),
    score: [...m.score],
    sideColors: [...m.sideColors],
    pobjs: m.pobjs.map((p) => ({ ...p })),
    thinkers: [...m.thinkers],
    respawnQueue: [...m.respawnQueue],
    projectiles: m.projectiles.map((p) => ({ ...p })),
    rays: m.rays.map((r) => ({ ...r })),
    flagIsTaken: [m.flagIsTaken[0], m.flagIsTaken[1]],
    tram: { ...m.tram },
    cycle: m.cycle ? { ...m.cycle, dockNodes: [...m.cycle.dockNodes], dockPobjs: [...m.cycle.dockPobjs], leftNodes: [...m.cycle.leftNodes], rightNodes: [...m.cycle.rightNodes] } : null,
  };
}
