/** Node-only loaders for tests and tools; never imported by the browser bundle. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseChars } from './chars';
import { MAP_COUNT, parseMap, parsePassability } from './maps';
import { parseStrings } from './strings';

const read = (dir: string, name: string): Uint8Array => new Uint8Array(readFileSync(join(dir, name)));

export const loadAllMapsFromDisk = (dir: string) =>
  Array.from({ length: MAP_COUNT }, (_, i) => parseMap(i, read(dir, String(i))));
export const loadPassabilityFromDisk = (dir: string) => parsePassability(read(dir, 'pass'));
export const loadStringsFromDisk = (dir: string, name: string) => parseStrings(read(dir, name));
export const loadCharsFromDisk = (dir: string) => parseChars(read(dir, 'chars'));
