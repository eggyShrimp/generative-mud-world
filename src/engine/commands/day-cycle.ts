/**
 * 日周期命令执行器 (end_day, endDayRoomAction)
 */

import { renderTemplate } from "../../core/template.ts";
import type { EntityId, NeedType, WorldState } from "../../core/types.ts";
import { getEntity } from "../../core/world.ts";
import { commandMessages, fail, hasInventory } from "./helpers.ts";

export function executeEndDay(
  world: WorldState,
  entityId: EntityId,
  params: Record<string, unknown> = {},
): ReturnType<typeof fail> {
  const entity = getEntity(world, entityId);
  if (!entity) return fail("找不到自己");
  const name = entity.name;
  const context = params.context as string | undefined;
  const itemId = params.itemId as string | undefined;

  // context: "item" → 使用背包中的休息物品
  if (context === "item" && itemId && hasInventory(entity)) {
    const item = entity.inventory.find((i) => i.id === itemId);
    if (!item) return fail("背包里没有这个物品");
    if (!item.properties.restItem) return fail("这不是休息物品");

    const restRecovery = Number(item.properties.restRecovery ?? 0);
    const durability = Number(item.properties.durability ?? -1);

    // 递减耐久度
    if (durability > 0) {
      item.properties.durability = durability - 1;
    }

    // 耐久归零 → 移除物品
    if (durability === 1) {
      const idx = entity.inventory.indexOf(item);
      if (idx >= 0) entity.inventory.splice(idx, 1);
      world.entities.delete(item.id);
    }

    return {
      events: [
        {
          type: "end_day",
          description: renderTemplate(commandMessages(world).endDayRestItem, {
            item: item.name,
            recovery: String(restRecovery),
          }),
        },
      ],
      delta: {
        needChanges: [
          { targetId: entityId, needType: "rest" as unknown as NeedType, delta: restRecovery },
        ],
      },
      ended: true,
    };
  }

  // 默认：原地休息（从 ContentPool end_day actionEffect 读取恢复值）
  const groundEffect = world.contentPool.actionEffects.find((a) => a.action === "end_day");
  const groundRest = Number(groundEffect?.needDeltas.rest ?? 20);
  const t = world.contentPool.narrativeTemplates;
  const endCmd = t.endingCommands[0] ?? "end_day";

  return {
    events: [
      {
        type: "end_day",
        description: renderTemplate(commandMessages(world).endDay, {
          actor: name,
          command: endCmd,
        }),
      },
    ],
    delta: {
      needChanges: [
        { targetId: entityId, needType: "rest" as unknown as NeedType, delta: groundRest },
      ],
    },
    ended: true,
  };
}

/**
 * 数据驱动的结束当天房间操作（如 sleep_at_inn, rest_at_camp）
 * 任何 actionEffect 中 endsDay: true 的房间操作都会走这里。
 */
export function executeEndDayRoomAction(
  world: WorldState,
  entityId: EntityId,
  action: string,
): ReturnType<typeof fail> {
  const entity = getEntity(world, entityId);
  if (!entity) return fail("找不到自己");

  const room = entity.roomId ? world.rooms.get(entity.roomId) : null;
  if (!room?.tags) return fail("位置不支持此操作");

  // 校验：当前房间的 tag 是否提供此操作
  const tagForAction = room.tags.find((tag) => {
    const actions = world.contentPool.entityActionsByTag[tag] ?? [];
    return actions.includes(action);
  });
  if (!tagForAction) return fail(`此处无法执行：${action}`);

  const effect = world.contentPool.actionEffects.find((a) => a.action === action);
  if (!effect) return fail(`未知操作：${action}`);

  const restDelta = Number(effect.needDeltas.rest ?? 0);
  const label = world.contentPool.entityActionLabels[action] ?? action;

  return {
    events: [
      {
        type: "end_day",
        description: renderTemplate(commandMessages(world).endDayRestGround, {
          label,
          recovery: String(restDelta),
        }),
      },
    ],
    delta: {
      needChanges: [
        { targetId: entityId, needType: "rest" as unknown as NeedType, delta: restDelta },
      ],
    },
    ended: true,
  };
}
