/** Verbatim tables from the original (tools/out/a10/C.java static initializer). */
export const FIRE_SEQ: readonly (readonly number[])[] = [
  [7, 7, 7, 10, 10, 10, 9, 9],
  [1, 3, 3, 2, 2],
  [4, 4, 4, 4, 11, 11, 11, 11, 6, 6, 6, 6, 5, 5, 5],
];
export const FIRE_MOMENT = [5, 3, 12] as const;

export const SEQ_DIE = [48, 48, 48, 48, 48, 48, 48, 48, 48, 37, 37, 37] as const;
export const SEQ_DIE_HARD = [49, 49, 49, 49, 49, 49, 49, 49, 49, 41, 41, 40, 40, 39, 39, 38, 38] as const;
export const SEQ_DIE_REALLY_HARD = [47, 47, 47, 47, 47, 47, 46, 46, 45, 45, 44, 44, 43, 43, 42, 42] as const;
export const SEQ_DIE_SQUISHED = [52, 52, 52, 52, 52, 52, 52, 51, 51, 51, 50, 50, 50] as const;

export const COLOR_BLUE = 0;
export const COLOR_RED = 1;

/** AI skill tables (index = skill 0..4). */
export const AI_REACTION_PERCENT = [8, 40, 110, 178, 230] as const;
export const AI_JUMPINESS = [10, 25, 50, 85, 110] as const;

export const JUMP_IMPULSE_FIX = -2560;
export const PLAYER_XSPEED_ADJ_THRESHOLD_FIX = 2560;
