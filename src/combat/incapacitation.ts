/**
 * 战斗系统 — 虚弱状态 / NPC 死亡
 */

import type { NPCEntity, PlayerEntity, WorldState } from "../core/types.ts";
import type { CombatConfig } from "./types.ts";

type CombatEntity = NPCEntity | PlayerEntity;

export function calculateRecoveryHp(entity: CombatEntity): number {
  return entity.combatState.maxHp > 0 ? Math.max(1, Math.round(entity.combatState.maxHp * 0.3)) : 0;
}

/**
 * 检查 entity 是否 hp ≤ 0 且未处于虚弱状态
 */
export function checkIncapacitation(entity: CombatEntity): boolean {
  return entity.combatState.hp <= 0 && !entity.combatState.isIncapacitated;
}

/**
 * 应用虚弱状态: combatTarget 清空, isIncapacitated = true
 */
export function applyIncapacitation(
  world: WorldState,
  entityId: string,
  config: CombatConfig,
): void {
  const entity = world.entities.get(entityId) as CombatEntity | undefined;
  if (!entity || !("combatState" in entity)) return;

  entity.combatState.isIncapacitated = true;
  entity.combatState.incapacitatedUntil = world.tick + config.incapacitatedDuration;
  entity.combatState.combatTarget = null;
  entity.combatState.isDefending = false;
}

/**
 * 检查虚弱是否到期，可以恢复
 */
export function checkRecovery(entity: CombatEntity, currentTick: number): boolean {
  return entity.combatState.isIncapacitated && currentTick >= entity.combatState.incapacitatedUntil;
}

/**
 * 恢复虚弱: hp 恢复到 maxHp × 30%, 重置状态
 */
export function applyRecovery(entity: CombatEntity): void {
  entity.combatState.isIncapacitated = false;
  entity.combatState.incapacitatedUntil = 0;
  entity.combatState.hp = calculateRecoveryHp(entity);
  entity.combatState.combatTarget = null;
  entity.combatState.threatTable = {};
}

/**
 * NPC 永久死亡处理:
 *  - 在虚弱期间再次 hp ≤ 0
 *  - 从世界中移除 NPC
 *  - 创建 corpse 物品（暂不实现物品掉落，留接口）
 *
 * 返回: 是否已死亡
 */
export function handleNpcDeath(world: WorldState, npcId: string): boolean {
  const entity = world.entities.get(npcId) as NPCEntity | undefined;
  if (entity?.type !== "npc") return false;
  if (!entity.combatState.isIncapacitated) return false;
  if (entity.combatState.hp > 0) return false;

  // 移除 NPC
  if (entity.roomId) {
    world.rooms.get(entity.roomId)?.entities.delete(npcId);
  }
  world.entities.delete(npcId);
  return true;
}

/**
 * 玩家不会永久死亡，只会虚弱
 */
export function handlePlayerIncapacitation(
  world: WorldState,
  playerId: string,
  config: CombatConfig,
): void {
  const entity = world.entities.get(playerId) as PlayerEntity | undefined;
  if (entity?.type !== "player") return;
  if (entity.combatState.hp > 0) return;

  applyIncapacitation(world, playerId, config);
}

/**
 * 精力耗尽 → hp=0 + 虚弱
 *
 * 等效于一次"力竭"：hp 归零，进入虚弱状态，战斗目标和防御姿态清除。
 */
export function applyCombatExhaustion(
  entity: CombatEntity,
  world: WorldState,
  config: CombatConfig,
): void {
  entity.combatState.hp = 0;
  applyIncapacitation(world, entity.id, config);
}
