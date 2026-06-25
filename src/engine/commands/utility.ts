/**
 * 通用工具命令执行器 (rest, status, inventory)
 */

import { renderTemplate } from "../../core/template.ts";
import type { EntityId, WorldState } from "../../core/types.ts";
import { getEntity } from "../../core/world.ts";
import { buildDelta, commandMessages, fail, hasInventory } from "./helpers.ts";

export function executeRest(world: WorldState, entityId: EntityId): ReturnType<typeof fail> {
  const delta = buildDelta(world, entityId, "rest");
  return {
    events: [{ type: "rest", description: commandMessages(world).rest }],
    delta,
    ended: false,
  };
}

export function executeStatus(world: WorldState, entityId: EntityId): ReturnType<typeof fail> {
  const entity = getEntity(world, entityId);
  if (!entity) return fail("找不到自己");

  const needLabels = world.contentPool.needLabels;
  const traitLabels = world.contentPool.traitLabels;
  const needs =
    "needs" in entity
      ? entity.needs
          .map((need) => `${needLabels[need.type] ?? need.type}: ${Math.round(need.value)}%`)
          .join(", ")
      : "未知";
  const traits =
    "traits" in entity
      ? entity.traits
          .map((trait) => `${traitLabels[trait.name] ?? trait.name}: ${trait.value}`)
          .join(", ")
      : "";

  return {
    events: [
      {
        type: "status",
        description: traits
          ? renderTemplate(commandMessages(world).statusWithTraits, { needs, traits })
          : renderTemplate(commandMessages(world).status, { needs }),
      },
    ],
    delta: {},
    ended: false,
  };
}

export function executeInventory(world: WorldState, entityId: EntityId): ReturnType<typeof fail> {
  const entity = getEntity(world, entityId);
  if (!entity) return fail("找不到自己");
  if (!hasInventory(entity)) return fail("当前角色没有背包");

  const inv = entity.inventory ?? [];
  if (inv.length === 0)
    return {
      events: [{ type: "inventory", description: commandMessages(world).inventoryEmpty }],
      delta: {},
      ended: false,
    };

  return {
    events: [
      {
        type: "inventory",
        description: renderTemplate(commandMessages(world).inventoryList, {
          items: inv.map((item) => item.name).join(", "),
        }),
      },
    ],
    delta: {},
    ended: false,
  };
}
