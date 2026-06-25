/**
 * @module World 状态管理 | 实体 CRUD、时间推进、delta 应用、工厂函数
 */

import type { WorldState } from "./types.ts";
import { createDefaultContentPool } from "./world/defaults.ts";

export function createWorld(): WorldState {
  return {
    tick: 0,
    entities: new Map(),
    rooms: new Map(),
    regions: new Map(),
    eventLog: [],
    time: {
      tick: 0,
      minute: 0,
      hour: 6,
      day: 1,
      month: 1,
      year: 1,
      period: "morning" as const,
      season: "spring" as const,
    },
    round: 0,
    contentPool: createDefaultContentPool(),
    completedStorylines: [],
    weatherByRegion: new Map(),
  };
}

export { createDefaultContentPool } from "./world/defaults.ts";
export { applyDelta } from "./world/delta-application.ts";
export {
  addEntity,
  createDefaultCombatState,
  discoverRoom,
  getEntity,
  initializePlayer,
  moveEntity,
  removeEntity,
} from "./world/entity-ops.ts";
export { getRecentEvents, logEvent } from "./world/event-log.ts";
export {
  createItem,
  createNPC,
  createPlayer,
  createRoom,
} from "./world/factories.ts";
export {
  addRegion,
  addRoom,
  getRegionEntities,
  getRoomEntities,
} from "./world/room-region.ts";
export {
  advanceDay,
  advanceTime,
  computeDayPeriod,
  computeSeason,
  computeWeatherByRegion,
  formatDate,
  refreshDailyEnvironment,
  selectWeather,
} from "./world/time-weather.ts";
