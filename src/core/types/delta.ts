import type { CombatHpChange } from "../../combat/types.ts";
import type { EntityId, NeedType, RegionId, RoomId, Tick } from "./entity.ts";
import type { DiscoverableChange, KnownClueChange, QuestChange } from "./quest-storyline.ts";

export interface SimulationDelta {
  traitModifiers?: TraitModifier[];
  needChanges?: NeedChange[];
  relationChanges?: RelationChange[];
  combatHpChanges?: CombatHpChange[];
  questChanges?: QuestChange[];
  itemChanges?: ItemChange[];
  revealRooms?: RevealRoom[];
  knownClueChanges?: KnownClueChange[];
  discoverableChanges?: DiscoverableChange[];
  worldEvents?: import("./world-room.ts").WorldEvent[];
  dialogues?: DialogueLine[];
  questObjectiveEvents?: QuestObjectiveEvent[];
}

export interface TraitModifier {
  targetId: EntityId;
  trait: string;
  delta: number;
}

export interface NeedChange {
  targetId: EntityId;
  needType: NeedType;
  delta: number;
}

export interface RelationChange {
  fromId: EntityId;
  toId: EntityId;
  delta: number;
  newLabel?: string;
}

export interface DialogueLine {
  speakerId: EntityId;
  content: string;
  roomId: RoomId;
  tick: Tick;
}

export interface CulturalTag {
  name: string;
  description: string;
  regionId: RegionId;
}

export interface RevealRoom {
  entityId: EntityId;
  roomId: RoomId;
}

export interface ItemChange {
  targetId: EntityId;
  templateId: string;
  operation: "add" | "remove";
  qty: number;
  itemId?: EntityId;
  name?: string;
}

export interface QuestObjectiveEvent {
  type: string;
  tick: Tick;
  actorId: EntityId;
  data: Record<string, unknown>;
}
