/**
 * 战斗系统 — NPC 战斗 AI（不调 LLM）
 *
 * 基于 threatTable + trait 决策:
 *  - 选目标: threatTable 最高仇恨
 *  - 选动作: aggression trait 决定是否使用技能
 *  - 逃跑: courage trait + hp 比例
 */

import type { NPCEntity, PlayerEntity, WorldState } from "../core/types.ts";
import type { CombatConfig } from "./types.ts";

type CombatEntity = NPCEntity | PlayerEntity;

/**
 * 从 threatTable 中选择最高仇恨的目标
 * 优先攻击房间内的、非虚弱的目标
 */
export function selectCombatTarget(npc: NPCEntity, world: WorldState): string | null {
  const threatTable = npc.combatState.threatTable;
  const entries = Object.entries(threatTable);
  if (entries.length === 0) return null;

  // 按仇恨值降序排序
  entries.sort((a, b) => b[1] - a[1]);

  for (const [targetId] of entries) {
    const target = world.entities.get(targetId) as CombatEntity | undefined;
    if (!target) continue;
    if (!("combatState" in target)) continue;
    if (target.combatState.isIncapacitated) continue;
    if (target.roomId !== npc.roomId) continue;
    return targetId;
  }

  return null;
}

/**
 * NPC 选择战斗动作
 * 默认: attack（后续可扩展技能选择）
 */
export function selectCombatAction(): string {
  return "attack";
}

/**
 * NPC 是否应该逃跑
 * 条件: hp < 30% 且 courage trait < 0
 */
export function shouldFlee(npc: NPCEntity, config: CombatConfig): boolean {
  if (npc.combatState.maxHp <= 0) return false;
  const hpRatio = npc.combatState.hp / npc.combatState.maxHp;
  if (hpRatio > config.fleeHpThreshold) return false;

  const courage = npc.traits.find((t) => t.name === "courage");
  const courageValue = courage?.value ?? config.defaultCourageValue;

  return courageValue < config.fleeCourageThreshold && Math.random() < config.fleeBaseAttemptChance;
}
