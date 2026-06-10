/**
 * 战斗系统 — 领域类型
 *
 * 所有战斗相关类型定义。其他模块只通过 index.ts 导入。
 */

import type { EntityId, NeedChange, Tick } from "../core/types.ts";

// ============================================================
// 战斗属性 (挂在 Entity 上，可变状态)
// ============================================================

export interface CombatState {
  hp: number;
  maxHp: number;
  combatTarget: EntityId | null;
  threatTable: Record<EntityId, number>;
  lastAttackTick: Tick;
  isDefending: boolean;
  isIncapacitated: boolean;
  incapacitatedUntil: Tick;
}

// ============================================================
// 战斗配置 (ContentPool 字段，LLM 可演化)
// ============================================================

export interface CombatConfig {
  // 推导公式参数
  baseHp: number;
  enduranceToHp: number;
  baseAtk: number;
  skillToAtk: number;
  strengthToAtk: number;
  baseDef: number;
  skillToDef: number;
  enduranceToDef: number;
  baseSpd: number;
  skillToSpd: number;
  agilityToSpd: number;

  // 伤害
  damageMultiplier: number;
  defenseReductionPerPoint: number;
  minDamage: number;
  damageVariance: number;

  // 暴击
  critBaseChance: number;
  critSpdBonus: number;
  critMultiplier: number;

  // 节奏
  pulseInterval: number;
  restCostPerAttack: number;

  // 逃跑
  fleeBaseChance: number;
  fleeSpdBonus: number;

  // 虚弱
  incapacitatedDuration: number;

  // 防御姿态
  defendingBonus: number;
  defenseDamageMultiplier: number;

  // NPC 主动攻击
  npcHostilityThreshold: number;
  npcAttackCooldown: number;

  // AI 逃跑决策
  fleeHpThreshold: number;
  fleeCourageThreshold: number;
  fleeBaseAttemptChance: number;
  defaultCourageValue: number;
}

// ============================================================
// 战斗技能 (ContentPool 字段)
// ============================================================

export interface CombatSkill {
  id: string;
  name: string;
  atkMultiplier?: number;
  defMultiplier?: number;
  hpRestore?: number;
  needDeltas?: Record<string, number>;
  restCost: number;
  targetMode: "single_enemy" | "select_ally" | "self" | "all_enemies";
}

// ============================================================
// SimulationDelta 子字段 (HP 变化)
// ============================================================

export interface CombatHpChange {
  targetId: EntityId;
  delta: number; // 负=伤害，正=治疗
}

// ============================================================
// 战斗事件 (用于 CombatEvent 渲染)
// ============================================================

export type CombatEventType =
  | "combat_hit"
  | "combat_crit"
  | "combat_miss"
  | "combat_flee_success"
  | "combat_flee_fail"
  | "combat_victory"
  | "combat_defeat"
  | "combat_target_changed";

export interface CombatEvent {
  type: CombatEventType;
  attackerId: EntityId;
  defenderId: EntityId;
  damage?: number;
  description: string;
}

// ============================================================
// 单次攻击结算结果
// ============================================================

export interface AttackResult {
  damage: number;
  isCrit: boolean;
  hpChange: CombatHpChange;
  needChange: NeedChange;
  event: CombatEvent;
}

// ============================================================
// 客户端视图用的快照
// ============================================================

export interface CombatEntitySnapshot {
  id: EntityId;
  name: string;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  spd: number;
  isIncapacitated: boolean;
  isDefending: boolean;
}
