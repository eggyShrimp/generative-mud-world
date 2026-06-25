/**
 * @module 命令执行器 | 分发玩家命令到领域 executor，检查可行性和冷却时间
 */

import type { EntityId, WorldState } from "../core/types.ts";

export type { CommandResult } from "./commands/helpers.ts";

import {
  buildDelta,
  checkItemCostFeasibility,
  combatTemplates,
  commandMessages,
  countItemsByTemplate,
  fail,
  findReadableCandidate,
  formatNeedDeltas,
  getItemNeedDeltas,
  getItemTraitModifiers,
  hasInventory,
  removeItems,
  resolveActionEffect,
} from "./commands/helpers.ts";

export type { FeasibilityBlocker, FeasibilityResult } from "./commands/feasibility.ts";
export {
  buildDelta,
  checkItemCostFeasibility,
  combatTemplates,
  commandMessages,
  countItemsByTemplate,
  fail,
  findReadableCandidate,
  formatNeedDeltas,
  getItemNeedDeltas,
  getItemTraitModifiers,
  hasInventory,
  removeItems,
  resolveActionEffect,
};

import {
  calcMoveRestCost,
  checkFeasibility,
  resolveActionDuration,
} from "./commands/feasibility.ts";

export { calcMoveRestCost, checkFeasibility, resolveActionDuration };

import { executeLook, executeMove } from "./commands/move.ts";

export { executeLook, executeMove };

import { executeSay, executeTalk, executeWait } from "./commands/social.ts";

export { executeSay, executeTalk, executeWait };

import {
  executeDrop,
  executeEat,
  executeOperate,
  executeRead,
  executeTake,
  executeUse,
} from "./commands/inventory.ts";

export { executeDrop, executeEat, executeOperate, executeRead, executeTake, executeUse };

import { executeAttack, executeDefend, executeFlee } from "./commands/combat.ts";

export { executeAttack, executeDefend, executeFlee };

import { executeEquip, executeUnequip } from "./commands/equipment.ts";

export { executeEquip, executeUnequip };

import { executeEndDay, executeEndDayRoomAction } from "./commands/day-cycle.ts";

export { executeEndDay, executeEndDayRoomAction };

import { executeRoomAction } from "./commands/room-actions.ts";

export { executeRoomAction };

import { executeInventory, executeRest, executeStatus } from "./commands/utility.ts";

export { executeInventory, executeRest, executeStatus };

export function executeCommand(
  world: WorldState,
  entityId: EntityId,
  action: string,
  params: Record<string, unknown>,
): ReturnType<typeof fail> {
  switch (action) {
    case "move":
      return executeMove(world, entityId, params);
    case "look":
      return executeLook(world, entityId, params);
    case "talk":
      return executeTalk(world, entityId, params);
    case "take":
      return executeTake(world, entityId, params);
    case "drop":
      return executeDrop(world, entityId, params);
    case "use":
      return executeUse(world, entityId, params);
    case "rest":
      return executeRest(world, entityId);
    case "wait":
      return executeWait(world, entityId, params);
    case "status":
      return executeStatus(world, entityId);
    case "inventory":
      return executeInventory(world, entityId);
    case "eat":
      return executeEat(world, entityId, params);
    case "read":
      return executeRead(world, entityId, params);
    case "say":
      return executeSay(world, entityId, params);
    case "end_day":
      return executeEndDay(world, entityId, params);
    case "attack":
      return executeAttack(world, entityId, params);
    case "flee":
      return executeFlee(world, entityId);
    case "defend":
      return executeDefend(world, entityId);
    case "equip":
      return executeEquip(world, entityId, params);
    case "unequip":
      return executeUnequip(world, entityId, params);
    case "operate":
      return executeOperate(world, entityId, params);
  }

  // 数据驱动：检查是否为结束当天的房间操作（endsDay: true in actionEffects）
  const effect = world.contentPool.actionEffects.find((a) => a.action === action);
  if (effect?.endsDay) {
    return executeEndDayRoomAction(world, entityId, action);
  }

  // Room actions (eat_at_tavern, work_at_smithy, etc.) — not built-in player actions
  return executeRoomAction(world, entityId, action);
}
