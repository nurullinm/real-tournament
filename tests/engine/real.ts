import { loadAllMapsFromDisk, loadCharsFromDisk, loadPassabilityFromDisk } from '../../src/assets/disk';
import { computeMuzzle } from '../../src/engine/muzzle';
import type { EngineAssets, MatchOptions } from '../../src/engine/types';

const DIR = 'public/original';
export const REAL_MAPS = loadAllMapsFromDisk(DIR);
export const REAL_ASSETS: EngineAssets = { passable: loadPassabilityFromDisk(DIR), ...computeMuzzle(loadCharsFromDisk(DIR)) };

export const DM_OPTS: MatchOptions = {
  mapId: 0, mode: 'dm', skill: 2, bots: 3, fragLimit: 5, noMedikits: false, violence: true, team: false, playerColor: 0,
};
export const CTF_OPTS: MatchOptions = { ...DM_OPTS, mapId: 7, mode: 'ctf', team: true, fragLimit: 3 };
