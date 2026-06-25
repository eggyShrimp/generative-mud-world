import type { Exit, TerrainType } from "../schemas/index.ts";
import type { EntityId, RegionId, RoomId, Tick } from "./entity.ts";

export interface Room {
  id: RoomId;
  name: string;
  description: string;
  regionId: RegionId;
  terrain: TerrainType;
  exits: Map<string, Exit>;
  entities: Set<EntityId>;
  tags?: string[];
}

export interface RoomNode {
  roomId: RoomId;
  x: number;
  y: number;
  regionId: RegionId;
}

export interface RegionLinkInfo {
  fromRegion: RegionId;
  toRegion: RegionId;
  direction: string;
  distance: number;
  terrain: string;
}

export interface RoomGraph {
  nodes: Map<RoomId, RoomNode>;
  regionBounds: Map<RegionId, { minX: number; maxX: number; minY: number; maxY: number }>;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  regionLinks: RegionLinkInfo[];
}

export interface Region {
  id: RegionId;
  name: string;
  dominantCulture: string;
  prosperity: number;
  threatLevel: number;
}

export interface ScheduleEntry {
  startHour: number;
  endHour: number;
  action: string;
  targetRoomId: RoomId | null;
  priority: number;
  deviationAllowed: boolean;
}

export interface Action {
  id: string;
  type: string;
  actorId: EntityId;
  targetId?: EntityId;
  targetRoomId?: RoomId;
  payload: Record<string, unknown>;
  tick: Tick;
}

export interface WorldEvent {
  id: string;
  type: string;
  title: string;
  description: string;
  scope: RoomId | RegionId | "global";
  tick: Tick;
  source: "simulation" | "llm" | "player";
  data: Record<string, unknown>;
}
