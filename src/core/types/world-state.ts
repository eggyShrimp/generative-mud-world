import type { ContentPool } from "./content-pool.ts";
import type { Entity, EntityId, RegionId, RoomId, Tick } from "./entity.ts";
import type { DayPeriod, Season, WeatherState } from "./environment.ts";
import type { Region, Room, RoomGraph, WorldEvent } from "./world-room.ts";

export interface WorldState {
  tick: Tick;
  entities: Map<EntityId, Entity>;
  rooms: Map<RoomId, Room>;
  regions: Map<RegionId, Region>;
  eventLog: WorldEvent[];
  time: GameTime;
  round: number;
  contentPool: ContentPool;
  poolDir?: string;
  graph?: RoomGraph;
  completedStorylines: string[];
  weatherByRegion: Map<RegionId, WeatherState>;
}

export interface GameTime {
  tick: Tick;
  minute: number;
  hour: number;
  day: number;
  month: number;
  year: number;
  period: DayPeriod;
  season: Season;
}
