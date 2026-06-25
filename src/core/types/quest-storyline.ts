import type { EntityId, Tick } from "./entity.ts";

export interface QuestObjectiveCondition {
  type: string;
  target?: {
    kind: "npc" | "room" | "item" | "entity" | "none";
    id?: EntityId;
  };
  params?: Record<string, unknown>;
}

export interface QuestObjective {
  groupId: number;
  condition: QuestObjectiveCondition;
  count: number;
  description: string;
}

export interface QuestReward {
  narrative?: string;
  traitModifiers?: Array<{ trait: string; delta: number }>;
  needChanges?: Array<{ needType: string; delta: number }>;
  relationDelta?: { targetId: EntityId; delta: number };
  items?: Array<{ itemId: string; quantity: number; name?: string }>;
}

export interface QuestAbandonPenalty {
  relationDelta?: { targetId: EntityId; delta: number };
  traitModifiers?: Array<{ trait: string; delta: number }>;
  needChanges?: Array<{ needType: string; delta: number }>;
}

export interface MinRelationCondition {
  npcId: EntityId;
  minValue: number;
}

export interface QuestPrerequisite {
  conditions: (string | QuestPrerequisite)[];
  logic: "and" | "or";
}

export interface TriggerCondition {
  day?: number;
  period?: string;
  season?: string;
  trait?: string;
  value?: number;
  operator?: ">=" | "<=" | "==" | "!=";
  relationWith?: EntityId;
  eventType?: string;
  action?: string;
  targetId?: EntityId;
}

export interface QuestAutoDiscover {
  triggerRoomId?: string;
  triggerItemId?: string;
  triggerText?: string;
}

export interface QuestStage {
  id: string;
  title: string;
  questIds: string[];
  completionCondition: "all" | "any";
  narrativeGuide: string;
}

export interface QuestAutoTrigger {
  type: "time" | "trait" | "relation" | "world_event" | "player_action";
  conditions: TriggerCondition[];
}

export interface ClueDefinition {
  id: string;
  description: string;
  knownByNpcIds: string[];
  relatedRoomId?: string;
}

export interface KnownClue {
  clueId: string;
  sourceNpcId: string;
  learnedAt: Tick;
}

export interface KnownClueChange {
  playerId: EntityId;
  clueId: string;
  sourceNpcId: string;
}

export interface DiscoverableCondition {
  requiredClueId: string;
}

export interface DiscoverableChange {
  playerId: EntityId;
  entityId: EntityId;
  operation: "discover";
}

export interface QuestTemplate {
  id: string;
  title: string;
  description: string;
  giverNpcId: EntityId | null;
  objectives: QuestObjective[];
  rewards: QuestReward;
  repeatable: boolean;
  deadlineDays: number | null;
  prerequisites?: QuestPrerequisite;
  minRelation?: MinRelationCondition;
  autoDiscover?: QuestAutoDiscover;
  autoTrigger?: QuestAutoTrigger;
  stages?: QuestStage[];
  cooldownDays?: number;
  abandonPenalty?: QuestAbandonPenalty;
}

export interface ActiveQuest {
  templateId: string;
  status: "active" | "completed" | "failed";
  acceptedDay: number;
  deadlineDay: number | null;
  groupCompleted: boolean[];
  objectiveProgress: number[];
}

export interface StorylineState {
  storylineId: string;
  currentStage: number;
  activeQuestIdsOfCurrentStage: string[];
  startedAt: number;
}

export interface QuestChange {
  type: "accept" | "progress" | "complete" | "fail";
  playerId: EntityId;
  templateId: string;
  objectiveIndex?: number;
  count?: number;
  reason?: string;
}
