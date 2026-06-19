import type {
  EntityId,
  PlayerEntity,
  QuestObjectiveCondition,
  QuestObjectiveEvent,
  SimulationDelta,
  WorldState,
} from "./types.ts";

export interface QuestObjectiveEventInput {
  world: WorldState;
  player: PlayerEntity;
  condition: QuestObjectiveCondition;
  delta: SimulationDelta;
}

export interface QuestObjectiveWorldInput {
  world: WorldState;
  player: PlayerEntity;
  condition: QuestObjectiveCondition;
}

export interface QuestObjectiveReachabilityInput {
  world: WorldState;
  condition: QuestObjectiveCondition;
}

export interface QuestObjectiveInteractionInput {
  condition: QuestObjectiveCondition;
}

export interface QuestObjectiveDefinition {
  type: string;
  evaluateFromEvent(input: QuestObjectiveEventInput): number;
  evaluateFromWorld(input: QuestObjectiveWorldInput): number;
  isReachable(input: QuestObjectiveReachabilityInput): boolean;
  getInteractionTarget?(input: QuestObjectiveInteractionInput): EntityId | null;
  llmSchemaHint: {
    description: string;
    targetKind: "npc" | "room" | "item" | "entity" | "none";
    params?: Record<string, string>;
  };
}

function targetId(condition: QuestObjectiveCondition): EntityId | null {
  return condition.target?.id ?? null;
}

function matchItemId(candidate: string | undefined, expected: string): boolean {
  return Boolean(candidate && (candidate === expected || candidate.startsWith(`${expected}_`)));
}

function countMatchingInventory(player: PlayerEntity, expected: string): number {
  return player.inventory.filter(
    (item) => matchItemId(item.id, expected) || matchItemId(item.templateId, expected),
  ).length;
}

function eventMatchesTarget(
  event: QuestObjectiveEvent,
  expectedType: string,
  expectedId: string,
): boolean {
  if (event.type !== expectedType) return false;
  const data = event.data as {
    npcId?: string;
    roomId?: string;
    itemId?: string;
    templateId?: string;
  };
  return (
    data.npcId === expectedId ||
    data.roomId === expectedId ||
    matchItemId(data.itemId, expectedId) ||
    matchItemId(data.templateId, expectedId)
  );
}

const definitions: Record<string, QuestObjectiveDefinition> = {
  player_talked_to_npc: {
    type: "player_talked_to_npc",
    evaluateFromEvent({ player, condition, delta }) {
      const id = targetId(condition);
      if (!id) return 0;
      return (delta.questObjectiveEvents ?? []).filter(
        (event) =>
          event.actorId === player.id && eventMatchesTarget(event, "player_talked_to_npc", id),
      ).length;
    },
    evaluateFromWorld({ world, player, condition }) {
      const id = targetId(condition);
      if (!id) return 0;
      const hasTalked = player.memories.some(
        (memory) =>
          memory.type === "conversation" &&
          memory.entityIds?.includes(id) &&
          memory.tick > world.tick - 100,
      );
      return hasTalked ? 1 : 0;
    },
    isReachable({ world, condition }) {
      const id = targetId(condition);
      const entity = id ? world.entities.get(id) : null;
      return entity?.type === "npc";
    },
    getInteractionTarget({ condition }) {
      return targetId(condition);
    },
    llmSchemaHint: {
      description: "玩家与指定 NPC 完成任务相关对话",
      targetKind: "npc",
    },
  },
  player_reached_room: {
    type: "player_reached_room",
    evaluateFromEvent({ player, condition, delta }) {
      const id = targetId(condition);
      if (!id) return 0;
      return (delta.questObjectiveEvents ?? []).some(
        (event) =>
          event.actorId === player.id && eventMatchesTarget(event, "player_reached_room", id),
      )
        ? 1
        : 0;
    },
    evaluateFromWorld({ player, condition }) {
      const id = targetId(condition);
      return id && (player.roomId === id || player.knownRooms.includes(id)) ? 1 : 0;
    },
    isReachable({ world, condition }) {
      const id = targetId(condition);
      return Boolean(id && world.rooms.has(id));
    },
    llmSchemaHint: {
      description: "玩家到达或已发现指定房间",
      targetKind: "room",
    },
  },
  player_has_item: {
    type: "player_has_item",
    evaluateFromEvent({ player, condition, delta }) {
      const id = targetId(condition);
      if (!id) return 0;
      const inventoryCount = countMatchingInventory(player, id);
      if (inventoryCount > 0) return inventoryCount;
      return (delta.questObjectiveEvents ?? []).filter(
        (event) =>
          event.actorId === player.id &&
          (eventMatchesTarget(event, "player_acquired_item", id) ||
            eventMatchesTarget(event, "player_delivered_item", id)),
      ).length;
    },
    evaluateFromWorld({ player, condition }) {
      const id = targetId(condition);
      return id ? countMatchingInventory(player, id) : 0;
    },
    isReachable() {
      return true;
    },
    llmSchemaHint: {
      description: "玩家持有、获得或交付指定物品",
      targetKind: "item",
    },
  },
  player_met_npc: {
    type: "player_met_npc",
    evaluateFromEvent({ world, player, condition, delta }) {
      const id = targetId(condition);
      if (!id) return 0;
      const npc = world.entities.get(id);
      if (npc?.type !== "npc") return 0;
      if (player.roomId === npc.roomId) return 1;
      return (delta.questObjectiveEvents ?? []).some(
        (event) =>
          event.actorId === player.id && eventMatchesTarget(event, "player_talked_to_npc", id),
      )
        ? 1
        : 0;
    },
    evaluateFromWorld({ world, player, condition }) {
      const id = targetId(condition);
      const npc = id ? world.entities.get(id) : null;
      return npc?.type === "npc" && player.roomId === npc.roomId ? 1 : 0;
    },
    isReachable({ world, condition }) {
      const id = targetId(condition);
      const entity = id ? world.entities.get(id) : null;
      return entity?.type === "npc";
    },
    getInteractionTarget({ condition }) {
      return targetId(condition);
    },
    llmSchemaHint: {
      description: "玩家到达指定 NPC 所在位置或与其会面",
      targetKind: "npc",
    },
  },
  player_defeated_entity: {
    type: "player_defeated_entity",
    evaluateFromEvent({ player, condition, delta }) {
      const id = targetId(condition);
      if (!id) return 0;
      return (delta.questObjectiveEvents ?? []).filter(
        (event) =>
          event.actorId === player.id && eventMatchesTarget(event, "player_defeated_entity", id),
      ).length;
    },
    evaluateFromWorld() {
      return 0;
    },
    isReachable({ world, condition }) {
      const id = targetId(condition);
      return Boolean(id && world.entities.has(id));
    },
    llmSchemaHint: {
      description: "玩家击败指定实体",
      targetKind: "entity",
    },
  },
};

export function getQuestObjectiveDefinition(type: string): QuestObjectiveDefinition | undefined {
  return definitions[type];
}

export function listQuestObjectiveDefinitions(): QuestObjectiveDefinition[] {
  return Object.values(definitions);
}

export function validateQuestObjectiveCondition(condition: QuestObjectiveCondition): string[] {
  const definition = getQuestObjectiveDefinition(condition.type);
  if (!definition) return [`unknown quest objective condition type: ${condition.type}`];
  const expectedKind = definition.llmSchemaHint.targetKind;
  const actualKind = condition.target?.kind ?? "none";
  if (actualKind !== expectedKind) {
    return [`condition ${condition.type} expects target kind ${expectedKind}, got ${actualKind}`];
  }
  if (expectedKind !== "none" && !condition.target?.id) {
    return [`condition ${condition.type} requires target.id`];
  }
  return [];
}
