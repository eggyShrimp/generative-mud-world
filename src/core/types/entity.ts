import type { CombatState } from "../../combat/types.ts";
import type {
  ActiveQuest,
  DiscoverableCondition,
  KnownClue,
  StorylineState,
} from "./quest-storyline.ts";
import type { ScheduleEntry } from "./world-room.ts";

export type EntityId = string;
export type RoomId = string;
export type RegionId = string;
export type Tick = number;

export type EntityType = "npc" | "player" | "item" | "faction";

export type NeedType = "hunger" | "safety" | "social" | "achievement" | "rest";

export interface Need {
  type: NeedType;
  value: number;
  baseUrgency: number;
  decayRate: number;
}

export interface Trait {
  name: string;
  value: number;
}

export interface Relation {
  targetId: EntityId;
  level: number;
  label: string;
  lastInteractionTick: Tick;
}

export interface Memory {
  tick: Tick;
  content: string;
  importance: number;
  type: "observation" | "conversation" | "reflection" | "event";
  entityIds?: EntityId[];
}

export interface BaseEntity {
  id: EntityId;
  type: EntityType;
  name: string;
  roomId: RoomId | null;
  description: string;
}

export interface NPCEntity extends BaseEntity {
  type: "npc";
  personality: string;
  traits: Trait[];
  needs: Need[];
  relations: Relation[];
  memories: Memory[];
  schedule: ScheduleEntry[];
  npcTier: "core" | "regional" | "background";
  mood: number;
  availableActions: string[];
  inventory: ItemEntity[];
  combatState: CombatState;
  equipment: {
    weapon: ItemEntity | null;
    armor: ItemEntity | null;
    cloak: ItemEntity | null;
    accessory: ItemEntity | null;
  };
  tags?: string[];
}

export interface TravelogueEntry {
  day: number;
  month: number;
  year: number;
  date: string;
  title: string;
  location: RoomId | null;
  locations: RoomId[];
  locationNames: string[];
  narrative: string;
  keyEvents: string[];
  createdAt: Tick;
}

export interface PlayerEntity extends BaseEntity {
  type: "player";
  traits: Trait[];
  needs: Need[];
  relations: Relation[];
  memories: Memory[];
  inventory: ItemEntity[];
  knownRooms: RoomId[];
  combatState: CombatState;
  equipment: {
    weapon: ItemEntity | null;
    armor: ItemEntity | null;
    cloak: ItemEntity | null;
    accessory: ItemEntity | null;
  };
  activeQuests: ActiveQuest[];
  completedQuests: string[];
  failedQuests: Array<{ templateId: string; failedDay: number; reason?: string }>;
  activeStorylines: StorylineState[];
  questCooldowns: Record<string, number>;
  travelogue: TravelogueEntry[];
  knownClues: KnownClue[];
  discoveredEntities: EntityId[];
}

export interface ItemEntity extends BaseEntity {
  type: "item";
  ownerId: EntityId | null;
  containerId: RoomId | EntityId | null;
  templateId: string;
  properties: Record<string, unknown>;
  tags?: string[];
  discoverable?: DiscoverableCondition;
}

export interface FactionEntity extends BaseEntity {
  type: "faction";
  memberIds: EntityId[];
  leaderId: EntityId;
  governanceForm: string;
  identityLabel: string;
  economicBasis: string;
  traits: Trait[];
  needs: Need[];
  relations: Relation[];
  population: number;
  wealth: number;
  militaryPower: number;
  recognition: number;
  cohesion: number;
  influenceRadius: number;
  availableActions: string[];
}

export type Entity = NPCEntity | PlayerEntity | ItemEntity | FactionEntity;
