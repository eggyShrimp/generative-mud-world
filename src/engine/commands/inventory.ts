/**
 * 物品相关命令执行器 (take, drop, use, operate, eat, read)
 */

import { renderTemplate } from "../../core/template.ts";
import type {
  EntityId,
  ItemEntity,
  NeedType,
  PlayerEntity,
  SimulationDelta,
  WorldState,
} from "../../core/types.ts";
import { getEntity, getRoomEntities } from "../../core/world.ts";
import {
  checkItemCostFeasibility,
  commandMessages,
  fail,
  findReadableCandidate,
  formatNeedDeltas,
  getItemNeedDeltas,
  getItemTraitModifiers,
  hasInventory,
  resolveActionEffect,
} from "./helpers.ts";

export function executeTake(
  world: WorldState,
  entityId: EntityId,
  params: Record<string, unknown>,
): ReturnType<typeof fail> {
  const entity = getEntity(world, entityId);
  if (!entity) return fail("找不到自己");

  const room = entity.roomId ? world.rooms.get(entity.roomId) : null;
  if (!room) return fail("不在任何房间内");

  const itemId = params.itemId as string;
  if (!itemId) return fail("不知道要捡什么");

  const item = world.entities.get(itemId);
  if (item?.type !== "item") return fail("没有找到这个物品");
  if (!room.entities.has(itemId)) return fail(`${item.name} 不在这里`);
  if (!hasInventory(entity)) return fail("当前角色不能携带物品");

  room.entities.delete(itemId);

  return {
    events: [
      {
        type: "take",
        description: renderTemplate(commandMessages(world).take, { item: item.name }),
      },
    ],
    delta: {
      itemChanges: [
        {
          targetId: entityId,
          templateId: itemId,
          operation: "add",
          qty: 1,
          itemId,
          name: item.name,
        },
      ],
      questObjectiveEvents: [
        {
          type: "player_acquired_item",
          tick: world.tick,
          actorId: entityId,
          data: { itemId, templateId: item.templateId, qty: 1 },
        },
      ],
    },
    ended: false,
  };
}

export function executeDrop(
  world: WorldState,
  entityId: EntityId,
  params: Record<string, unknown>,
): ReturnType<typeof fail> {
  const entity = getEntity(world, entityId);
  if (!entity) return fail("找不到自己");
  if (!entity.roomId) return fail("不在任何房间内");

  const itemId = params.itemId as string;
  if (!itemId) return fail("不知道要放下什么");

  if (!hasInventory(entity)) return fail("当前角色没有背包");
  const itemIndex = entity.inventory.findIndex((item) => item.id === itemId);
  if (itemIndex < 0) return fail("背包里没有这个物品");

  const item = entity.inventory[itemIndex];
  item.ownerId = null;
  item.containerId = entity.roomId;
  item.roomId = entity.roomId;
  world.rooms.get(entity.roomId)?.entities.add(item.id);

  return {
    events: [
      {
        type: "drop",
        description: renderTemplate(commandMessages(world).drop, { item: item.name }),
      },
    ],
    delta: {
      itemChanges: [
        { targetId: entityId, templateId: itemId, operation: "remove", qty: 1, itemId },
      ],
    },
    ended: false,
  };
}

export function executeUse(
  world: WorldState,
  entityId: EntityId,
  params: Record<string, unknown>,
): ReturnType<typeof fail> {
  const entity = getEntity(world, entityId);
  if (!entity) return fail("找不到自己");

  const itemId = params.itemId as string;
  if (!itemId) return fail("不知道要使用什么");

  if (!hasInventory(entity)) return fail("当前角色没有背包");
  const item = entity.inventory.find((candidate) => candidate.id === itemId);
  if (!item) return fail("背包里没有这个物品");

  const needDeltas = getItemNeedDeltas(item.properties ?? {});
  const consumed = Boolean(item.properties?.consumable ?? item.properties?.edible);
  if (consumed) {
    const index = entity.inventory.findIndex((candidate) => candidate.id === itemId);
    if (index >= 0) entity.inventory.splice(index, 1);
    world.entities.delete(itemId);
  }

  const delta: SimulationDelta =
    Object.keys(needDeltas).length > 0
      ? {
          needChanges: Object.entries(needDeltas).map(([needType, delta]) => ({
            targetId: entityId,
            needType: needType as unknown as NeedType,
            delta,
          })),
        }
      : {};

  const effectText = formatNeedDeltas(needDeltas, world.contentPool.needLabels);
  return {
    events: [
      {
        type: "use",
        description: effectText
          ? renderTemplate(commandMessages(world).useWithEffect, {
              item: item.name,
              effect: effectText,
            })
          : renderTemplate(commandMessages(world).useNoEffect, { item: item.name }),
      },
    ],
    delta,
    ended: false,
  };
}

export function executeOperate(
  world: WorldState,
  entityId: EntityId,
  params: Record<string, unknown>,
): ReturnType<typeof fail> {
  const entity = getEntity(world, entityId);
  if (!entity) return fail("找不到自己");

  const itemId = params.itemId as string | undefined;
  const actionId = params.actionId as string | undefined;

  if (!itemId) {
    return fail("请指定要操作的物品");
  }

  // Find the item in player inventory or room
  const player = entity as PlayerEntity;
  const item =
    player.inventory.find((i) => i.id === itemId) ??
    (entity.roomId
      ? (getRoomEntities(world, entity.roomId).find((e) => e.id === itemId && e.type === "item") as
          | ItemEntity
          | undefined)
      : undefined);

  if (!item) return fail("找不到该物品");

  const tags = item.tags ?? [];

  // Get available actions from item tags
  const availableActions: Array<{ actionId: string; label: string }> = [];
  const seen = new Set<string>();
  for (const tag of tags) {
    const actions = world.contentPool.entityActionsByTag[tag] ?? [];
    for (const aid of actions) {
      if (seen.has(aid)) continue;
      seen.add(aid);
      availableActions.push({
        actionId: aid,
        label: world.contentPool.entityActionLabels[aid] ?? aid,
      });
    }
  }

  if (availableActions.length === 0) {
    return fail("此物品不可操作");
  }

  // If no actionId specified, return available actions (sub-menu)
  if (!actionId) {
    return {
      events: [
        {
          type: "operate_options",
          description: `可对${item.name}执行的操作: ${availableActions.map((a) => a.label).join("、")}`,
        },
      ],
      delta: {},
      ended: false,
      operateOptions: availableActions,
    };
  }

  // Validate actionId is allowed by item tags
  if (!availableActions.some((a) => a.actionId === actionId)) {
    return fail("此物品不支持该操作");
  }

  // Find ActionEffect
  const effect = world.contentPool.actionEffects.find((a) => a.action === actionId);
  if (!effect) return fail("未知操作");

  // Check item costs
  if (effect.itemCosts) {
    const blockers = checkItemCostFeasibility(player, effect.itemCosts);
    if (blockers.length > 0) return fail(blockers[0]);
  }

  // Build delta
  const delta = resolveActionEffect(entityId, world.contentPool, actionId);
  const label = world.contentPool.entityActionLabels[actionId] ?? actionId;
  const effectText = formatNeedDeltas(effect.needDeltas, world.contentPool.needLabels);

  return {
    events: [
      {
        type: "operate",
        description: effectText
          ? renderTemplate(commandMessages(world).roomActionWithEffect, {
              label,
              effect: effectText,
            })
          : renderTemplate(commandMessages(world).roomAction, { label }),
      },
    ],
    delta,
    ended: false,
  };
}

export function executeEat(
  world: WorldState,
  entityId: EntityId,
  params: Record<string, unknown>,
): ReturnType<typeof fail> {
  const entity = getEntity(world, entityId);
  if (!entity) return fail("找不到自己");
  if (!hasInventory(entity)) return fail("当前角色没有背包");

  const itemId = params.itemId as string | undefined;
  let item: ItemEntity | undefined;

  if (itemId) {
    item = entity.inventory.find((i) => i.id === itemId) as ItemEntity | undefined;
    if (!item) return fail("背包里没有这个物品");
  } else {
    item = entity.inventory.find((i) => i.properties?.edible) as ItemEntity | undefined;
    if (!item) return fail("背包里没有可食用的物品");
  }

  if (!item.properties?.edible) return fail(`${item.name} 不可食用`);

  const needDeltas = getItemNeedDeltas(item.properties);
  const index = entity.inventory.findIndex((i) => i.id === item?.id);
  if (index >= 0) entity.inventory.splice(index, 1);
  world.entities.delete(item.id);

  const delta: SimulationDelta =
    Object.keys(needDeltas).length > 0
      ? {
          needChanges: Object.entries(needDeltas).map(([needType, d]) => ({
            targetId: entityId,
            needType: needType as unknown as NeedType,
            delta: d,
          })),
        }
      : {};

  const effectText = formatNeedDeltas(needDeltas, world.contentPool.needLabels);
  return {
    events: [
      {
        type: "eat",
        description: effectText
          ? renderTemplate(commandMessages(world).eatWithEffect, {
              item: item.name,
              effect: effectText,
            })
          : renderTemplate(commandMessages(world).eatNoEffect, { item: item.name }),
      },
    ],
    delta,
    ended: false,
  };
}

export function executeRead(
  world: WorldState,
  entityId: EntityId,
  params: Record<string, unknown>,
): ReturnType<typeof fail> {
  const entity = getEntity(world, entityId);
  if (!entity) return fail("找不到自己");

  const itemId = params.itemId as string | undefined;
  if (!itemId) return fail(commandMessages(world).readSpecifyItem);

  const item = findReadableCandidate(world, entity, itemId);
  if (!item) return fail(commandMessages(world).readItemNotFound);
  if (item.properties.readable !== true) {
    return fail(renderTemplate(commandMessages(world).readNotReadable, { item: item.name }));
  }

  const bookContent = world.contentPool.bookContents.find(
    (candidate) => candidate.itemTemplateId === item.templateId,
  );
  if (!bookContent) {
    return fail(renderTemplate(commandMessages(world).readMissingContent, { item: item.name }));
  }

  const needDeltas = getItemNeedDeltas(item.properties);
  const traitModifiers = getItemTraitModifiers(item.properties);
  const delta: SimulationDelta = {};
  if (Object.keys(needDeltas).length > 0) {
    delta.needChanges = Object.entries(needDeltas).map(([needType, d]) => ({
      targetId: entityId,
      needType: needType as unknown as NeedType,
      delta: d,
    }));
  }
  if (traitModifiers.length > 0) {
    delta.traitModifiers = traitModifiers.map((modifier) => ({
      targetId: entityId,
      trait: modifier.trait,
      delta: modifier.delta,
    }));
  }

  const effectText = formatNeedDeltas(needDeltas, world.contentPool.needLabels);
  return {
    events: [
      {
        type: "book_read",
        description: effectText
          ? renderTemplate(commandMessages(world).readWithEffect, {
              item: item.name,
              effect: effectText,
            })
          : renderTemplate(commandMessages(world).readNoEffect, { item: item.name }),
      },
    ],
    delta,
    ended: false,
    bookDisplay: {
      title: bookContent.title,
      pages: bookContent.pages,
    },
  };
}
