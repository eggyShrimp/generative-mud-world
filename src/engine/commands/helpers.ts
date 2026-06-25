/**
 * 命令执行器 — 共享辅助函数
 *
 * 提供所有命令执行器共用的工具函数和类型定义。
 */

import type {
  CombatTemplates,
  CommandMessages,
  ContentPool,
  Entity,
  EntityId,
  FactionEntity,
  ItemChange,
  ItemEntity,
  NeedType,
  NPCEntity,
  PlayerEntity,
  SimulationDelta,
  WorldState,
} from "../../core/types.ts";
import { getRoomEntities } from "../../core/world.ts";
import type { CommandEvent, DialogueOption, TradeOption } from "../../shared/protocol.ts";

export interface CommandResult {
  events: CommandEvent[];
  delta: SimulationDelta;
  ended: boolean;
  needsDialogueOptions?: { npcId: string; npcName: string };
  dialogueOptions?: DialogueOption[];
  needsChatOptions?: { npcId: string; npcName: string };
  chatSubOptions?: DialogueOption[];
  needsTradeOptions?: { npcId: string; npcName: string };
  tradeSubOptions?: TradeOption[];
  operateOptions?: Array<{ actionId: string; label: string }>;
  bookDisplay?: { title: string; pages: string[] };
}

export function commandMessages(world: WorldState): CommandMessages {
  return world.contentPool.narrativeTemplates.commandMessages;
}

export function combatTemplates(world: WorldState): CombatTemplates {
  return world.contentPool.narrativeTemplates.combatTemplates;
}

export function fail(message: string): CommandResult {
  return {
    events: [{ type: "error", description: message }],
    delta: {},
    ended: false,
  };
}

export function buildDelta(world: WorldState, entityId: EntityId, action: string): SimulationDelta {
  const delta = resolveActionEffect(entityId, world.contentPool, action);
  if (delta.questObjectiveEvents?.length) {
    delta.questObjectiveEvents = delta.questObjectiveEvents.map((event) => ({
      ...event,
      tick: world.tick,
    }));
  }
  return delta;
}

/**
 * 解析 action 效果 → SimulationDelta (needChanges + itemChanges + itemCosts)
 * 玩家路径和 NPC 路径共享此函数，避免逻辑重复。
 */
export function resolveActionEffect(
  entityId: EntityId,
  pool: ContentPool,
  action: string,
): SimulationDelta {
  const effect = pool.actionEffects.find((candidate) => candidate.action === action);
  if (!effect) return {};

  // needChanges
  const needChanges = Object.entries(effect.needDeltas).map(([needType, delta]) => ({
    targetId: entityId,
    needType: needType as unknown as NeedType,
    delta: delta as number,
  }));

  // itemChanges: itemCosts (remove) + itemDeltas (add)
  const itemChanges: ItemChange[] = [];
  if (effect.itemCosts) {
    for (const [templateId, qty] of Object.entries(effect.itemCosts)) {
      itemChanges.push({ targetId: entityId, templateId, operation: "remove", qty });
    }
  }
  if (effect.itemDeltas) {
    for (const [templateId, qty] of Object.entries(effect.itemDeltas)) {
      itemChanges.push({ targetId: entityId, templateId, operation: "add", qty });
    }
  }

  const delta: SimulationDelta = {};
  if (needChanges.length > 0) delta.needChanges = needChanges;
  if (itemChanges.length > 0) delta.itemChanges = itemChanges;
  const acquiredItems = itemChanges.filter((change) => change.operation === "add");
  if (acquiredItems.length > 0) {
    delta.questObjectiveEvents = acquiredItems.map((change) => ({
      type: "player_acquired_item",
      tick: 0,
      actorId: entityId,
      data: { itemId: change.itemId, templateId: change.templateId, qty: change.qty },
    }));
  }
  return delta;
}

/**
 * 检查玩家是否有足够物品支付 itemCosts
 * 返回 blocker 消息列表，空数组表示可行
 */
export function checkItemCostFeasibility(
  entity: PlayerEntity | NPCEntity | FactionEntity,
  itemCosts: Record<string, number>,
): string[] {
  if (!("inventory" in entity)) return [];
  const blockers: string[] = [];
  for (const [templateId, qty] of Object.entries(itemCosts)) {
    const held = countItemsByTemplate(entity as PlayerEntity, templateId);
    if (held < qty) {
      blockers.push(`需要 ${qty} 个 ${templateId}，只有 ${held} 个`);
    }
  }
  return blockers;
}

function _hasEnoughItems(entity: PlayerEntity, templateId: string, qty: number): boolean {
  return countItemsByTemplate(entity, templateId) >= qty;
}

export function countItemsByTemplate(entity: PlayerEntity, templateId: string): number {
  return entity.inventory.filter((item) => item.templateId === templateId).length;
}

export function removeItems(entity: PlayerEntity, templateId: string, qty: number): void {
  let remaining = qty;
  for (let i = entity.inventory.length - 1; i >= 0 && remaining > 0; i--) {
    if (entity.inventory[i].templateId === templateId) {
      entity.inventory.splice(i, 1);
      remaining--;
    }
  }
}

export function hasInventory(entity: Entity): entity is PlayerEntity {
  return entity.type === "player";
}

export function findReadableCandidate(
  world: WorldState,
  entity: Entity,
  itemId: string,
): ItemEntity | undefined {
  if (hasInventory(entity)) {
    const inventoryItem = entity.inventory.find((item) => item.id === itemId);
    if (inventoryItem) return inventoryItem;
  }

  if (!entity.roomId) return undefined;
  return getRoomEntities(world, entity.roomId).find(
    (candidate): candidate is ItemEntity => candidate.type === "item" && candidate.id === itemId,
  );
}

export function getItemNeedDeltas(properties: Record<string, unknown>): Record<string, number> {
  if (properties.needDeltas && typeof properties.needDeltas === "object") {
    return Object.fromEntries(
      Object.entries(properties.needDeltas as Record<string, unknown>)
        .map(([needType, delta]) => [needType, Number(delta)] as const)
        .filter(([, delta]) => Number.isFinite(delta)),
    );
  }

  const deltas: Record<string, number> = {};
  if (typeof properties.hungerRestore === "number") deltas.hunger = properties.hungerRestore;
  if (typeof properties.restRestore === "number") deltas.rest = properties.restRestore;
  if (typeof properties.socialRestore === "number") deltas.social = properties.socialRestore;
  if (typeof properties.safetyRestore === "number") deltas.safety = properties.safetyRestore;
  return deltas;
}

export function getItemTraitModifiers(properties: Record<string, unknown>): Array<{
  trait: string;
  delta: number;
}> {
  if (!Array.isArray(properties.traitModifiers)) return [];
  return properties.traitModifiers
    .map((modifier) => {
      if (!modifier || typeof modifier !== "object") return null;
      const record = modifier as Record<string, unknown>;
      const delta = Number(record.delta);
      if (typeof record.trait !== "string" || !Number.isFinite(delta)) return null;
      return { trait: record.trait, delta };
    })
    .filter((modifier): modifier is { trait: string; delta: number } => modifier !== null);
}

export function formatNeedDeltas(
  deltas: Record<string, number>,
  labels: Record<string, string>,
): string {
  return Object.entries(deltas)
    .map(([needType, delta]) => `${labels[needType] ?? needType} ${delta > 0 ? "+" : ""}${delta}`)
    .join("，");
}
