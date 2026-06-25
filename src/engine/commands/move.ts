/**
 * 移动和观察命令执行器
 */

import { renderTemplate } from "../../core/template.ts";
import type {
  Entity,
  EntityId,
  ItemEntity,
  NPCEntity,
  PlayerEntity,
  RoomId,
  SimulationDelta,
  WorldState,
} from "../../core/types.ts";
import { getEntity, moveEntity } from "../../core/world.ts";
import { formatItemProperties } from "../../shared/item-format.ts";
import { logWrite } from "../../shared/log.ts";
import { calcMoveRestCost } from "./feasibility.ts";
import { buildDelta, commandMessages, fail } from "./helpers.ts";

export function executeMove(
  world: WorldState,
  entityId: EntityId,
  params: Record<string, unknown>,
): ReturnType<typeof fail> {
  const entity = getEntity(world, entityId);
  if (!entity) return fail("找不到自己");

  const room = entity.roomId ? world.rooms.get(entity.roomId) : null;
  if (!room) return fail("不在任何房间内");

  const direction = params.direction as string;
  const exit = room.exits.get(direction);
  if (!exit) return fail(`${direction} 方向没有出口`);

  if (exit.hidden) {
    let clueAccess = false;
    if (exit.conditions && entity.type === "player") {
      const player = entity as PlayerEntity;
      clueAccess = exit.conditions.some(
        (cond) => cond.type === "clue" && player.knownClues.some((c) => c.clueId === cond.value),
      );
    }
    if (!clueAccess) return fail(`${direction} 方向没有出口`);
  }

  // 检查通行条件
  if (exit.conditions && exit.conditions.length > 0) {
    for (const cond of exit.conditions) {
      if (cond.type === "time" && world.time.period !== cond.value) {
        return fail(`此路仅在${cond.value}时开放`);
      }
      if (cond.type === "season" && world.time.season !== cond.value) {
        return fail(`此路仅在${cond.value}季开放`);
      }
      if (cond.type !== "time" && cond.type !== "season") {
        logWrite(
          "srv",
          "info",
          `[CommandExecutor] 出口条件: ${cond.type}=${cond.value} (未实现检查)`,
        );
      }
    }
  }

  const restCost = calcMoveRestCost(world, entity, direction);

  moveEntity(world, entityId, exit.to as RoomId);
  const targetRoom = world.rooms.get(exit.to as RoomId);
  const t = world.contentPool.narrativeTemplates;

  const delta: SimulationDelta = {
    needChanges: [
      {
        targetId: entityId,
        needType: "rest",
        delta: restCost,
      },
    ],
    questObjectiveEvents: [
      {
        type: "player_reached_room",
        tick: world.tick,
        actorId: entityId,
        data: { roomId: exit.to },
      },
    ],
  };

  // 移动叙事 (使用边的 description 或默认模板)
  const narrative =
    exit.description ??
    t.moveNarrative
      .replace(/\{actor\}/g, entity.name)
      .replace(/\{room\}/g, targetRoom?.name ?? exit.to);

  return {
    events: [
      {
        type: "move",
        description: narrative,
      },
    ],
    delta,
    ended: false,
  };
}

export function executeLook(
  world: WorldState,
  entityId: EntityId,
  params: Record<string, unknown>,
): ReturnType<typeof fail> {
  const entity = getEntity(world, entityId);
  if (!entity) return fail("找不到自己");

  const room = entity.roomId ? world.rooms.get(entity.roomId) : null;
  if (!room) return fail("不在任何房间内");

  const target = params.target as string | undefined;
  const messages = commandMessages(world);
  const isRoomLook = !target || target === room.name || target === messages.lookRoomTarget;
  const found = target
    ? Array.from(room.entities)
        .map((eid) => world.entities.get(eid))
        .find((e): e is Entity => Boolean(e && e.name === target))
    : undefined;

  if (target && !isRoomLook && !found) {
    return fail(renderTemplate(messages.lookTargetNotFound, { target }));
  }

  if (isRoomLook) {
    const npcs = Array.from(room.entities)
      .map((eid) => world.entities.get(eid))
      .filter((e): e is NPCEntity => Boolean(e && e.type === "npc" && e.id !== entityId))
      .map((e) => e.name);
    const items = Array.from(room.entities)
      .map((eid) => world.entities.get(eid))
      .filter((e): e is ItemEntity => Boolean(e && e.type === "item"))
      .map((e) => e.name);
    const exits = Array.from(room.exits.keys());

    return {
      events: [
        {
          type: "look",
          description: renderTemplate(messages.lookRoom, {
            room: room.name,
            description: room.description,
            npcs: npcs.join(", "),
            items: items.join(", "),
            exits: exits.join(", "),
          }),
        },
      ],
      delta: buildDelta(world, entityId, "look"),
      ended: false,
    };
  }

  if (!found) {
    return fail(renderTemplate(messages.lookTargetNotFound, { target: target ?? "" }));
  }

  const details = [`观察 ${found.name}`];
  if (found.type === "npc") {
    details.push(`性格: ${found.personality}`);
    if (found.description) details.push(`描述: ${found.description}`);
  }
  if (found.type === "item") {
    if (found.description) details.push(`描述: ${found.description}`);
    const propertyText = formatItemProperties(
      found.properties,
      world.contentPool.itemPropertyLabels,
    );
    if (propertyText) details.push(`属性: ${propertyText}`);
  }
  return {
    events: [
      {
        type: "look",
        description: renderTemplate(messages.lookEntity, {
          target: found.name,
          details: details.slice(1).join("。"),
        }),
      },
    ],
    delta: buildDelta(world, entityId, "look"),
    ended: false,
  };
}
