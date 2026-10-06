import { cmdToInput } from '../engine/match';
import type { AiHooks, Fighter, InputState, Match } from '../engine/types';
import { controlCyclist, controlFighter, setCycleDestination } from './control';
import { catchGround, findNearestNode, makeDecision } from './nav';
import { makeStrategicalDecision, setAllyOrder, type AllyOrder } from './orders';

export type { AllyOrder };
export { setAllyOrder };

/** Pass to createMatch so spawning and the main step ask the bots module for routes and controls. */
export const botHooks: AiHooks = {
  catchGround, findNearestNode, makeDecision, makeStrategicalDecision, setCycleDestination, controlFighter, controlCyclist,
};

/** Input a bot would give this tick (for tests and tools). */
export function botInput(m: Match, f: Fighter): InputState {
  return cmdToInput(f.isCycling ? controlCyclist(m, f) : controlFighter(m, f));
}
