/**
 * 战斗系统 — 精力管理
 *
 * 精力（rest）作为通用 MP：所有战斗动作消耗，耗尽则虚弱。
 * 本文件只包含纯判定函数，写入逻辑在 incapacitation.ts。
 */

import type { NPCEntity, PlayerEntity } from "../core/types.ts";
import type { CombatConfig } from "./types.ts";

type CombatEntity = NPCEntity | PlayerEntity;

/**
 * 精力是否耗尽
 */
export function isExhausted(entity: CombatEntity): boolean {
  const rest = entity.needs.find((n) => n.type === "rest");
  return rest ? rest.value <= 0 : false;
}

/**
 * 单次战斗动作的精力消耗
 */
export function getCombatRestCost(config: CombatConfig): number {
  return config.restCostPerAttack;
}
