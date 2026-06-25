/**
 * 通用房间动作执行器 (eat_at_tavern, work_at_smithy, etc.)
 * 非内置玩家命令的 action 都走这里。
 */

import { renderTemplate } from "../../core/template.ts";
import type {
  EntityId,
  FactionEntity,
  NPCEntity,
  PlayerEntity,
  WorldState,
} from "../../core/types.ts";
import { getEntity } from "../../core/world.ts";
import {
  checkItemCostFeasibility,
  commandMessages,
  fail,
  formatNeedDeltas,
  hasInventory,
  removeItems,
  resolveActionEffect,
} from "./helpers.ts";

export function executeRoomAction(
  world: WorldState,
  entityId: EntityId,
  action: string,
): ReturnType<typeof fail> {
  const entity = getEntity(world, entityId);
  if (!entity) return fail("找不到自己");

  // 检查房间是否支持此动作 (通过 tag 路由)
  const room = entity.roomId ? world.rooms.get(entity.roomId) : null;
  const tags = room?.tags ?? [];
  const actionAllowed = tags.some((tag) => {
    const actions = world.contentPool.entityActionsByTag[tag] ?? [];
    return actions.includes(action);
  });
  if (!actionAllowed) return fail(`未知操作: ${action}`);

  const effect = world.contentPool.actionEffects.find((candidate) => candidate.action === action);
  if (!effect) return fail(`未知操作: ${action}`);

  const entityWithNeeds = entity as PlayerEntity | NPCEntity | FactionEntity;

  // 检查物品消耗是否足够
  if (effect.itemCosts && hasInventory(entity)) {
    const blockers = checkItemCostFeasibility(entityWithNeeds, effect.itemCosts);
    if (blockers.length > 0) {
      return fail(blockers[0]);
    }
    // 执行物品消耗
    for (const [templateId, qty] of Object.entries(effect.itemCosts)) {
      removeItems(entityWithNeeds as PlayerEntity, templateId, qty);
    }
  }

  const delta = resolveActionEffect(entityId, world.contentPool, action);

  if (entity.type === "player" && room) {
    const player = entity as PlayerEntity;
    for (const eid of room.entities) {
      const roomEntity = world.entities.get(eid);
      if (roomEntity?.type !== "item") continue;
      const item = roomEntity as import("../../core/types.ts").ItemEntity;
      if (!item.discoverable) continue;
      if (player.discoveredEntities.includes(item.id)) continue;
      const clueId = (item.discoverable as import("../../core/types.ts").DiscoverableCondition)
        .requiredClueId;
      const hasClue = player.knownClues.some((c) => c.clueId === clueId);
      if (!hasClue) continue;
      delta.discoverableChanges = delta.discoverableChanges ?? [];
      delta.discoverableChanges.push({
        playerId: entityId,
        entityId: item.id,
        operation: "discover",
      });
    }
  }

  const label = world.contentPool.entityActionLabels[action] ?? action;
  const effectText = formatNeedDeltas(effect.needDeltas, world.contentPool.needLabels);
  return {
    events: [
      {
        type: "room_action",
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
