/**
 * 战斗系统 — ContentPool 战斗配置
 *
 * 默认值构造 + zod schema (供 content-pool-loader 引用)
 */

import { z } from "zod";

// ============================================================
// zod schema — CombatConfig
// ============================================================

export const CombatConfigSchema = z.object({
  baseHp: z.number().min(1),
  enduranceToHp: z.number().min(0),
  baseAtk: z.number().min(0),
  skillToAtk: z.number().min(0),
  strengthToAtk: z.number().min(0),
  baseDef: z.number().min(0),
  skillToDef: z.number().min(0),
  enduranceToDef: z.number().min(0),
  baseSpd: z.number().min(0),
  skillToSpd: z.number().min(0),
  agilityToSpd: z.number().min(0),

  damageMultiplier: z.number().min(0),
  defenseReductionPerPoint: z.number().min(0),
  minDamage: z.number().min(0),
  damageVariance: z.number().min(0).max(1),

  critBaseChance: z.number().min(0).max(1),
  critSpdBonus: z.number().min(0),
  critMultiplier: z.number().min(1),

  pulseInterval: z.number().int().min(1),
  restCostPerAttack: z.number(),

  fleeBaseChance: z.number().min(0).max(1),
  fleeSpdBonus: z.number().min(0),

  incapacitatedDuration: z.number().int().min(1),

  defendingBonus: z.number().min(0),
  defenseDamageMultiplier: z.number().min(0).max(1),

  npcHostilityThreshold: z.number().max(0),
  npcAttackCooldown: z.number().int().min(1),

  fleeHpThreshold: z.number().min(0).max(1),
  fleeCourageThreshold: z.number(),
  fleeBaseAttemptChance: z.number().min(0).max(1),
  defaultCourageValue: z.number(),
});

// ============================================================
// zod schema — CombatSkill
// ============================================================

export const CombatSkillSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  atkMultiplier: z.number().min(0).optional(),
  defMultiplier: z.number().min(0).optional(),
  hpRestore: z.number().min(0).optional(),
  needDeltas: z.record(z.string(), z.number()).optional(),
  restCost: z.number(),
  targetMode: z.enum(["single_enemy", "select_ally", "self", "all_enemies"]),
});
