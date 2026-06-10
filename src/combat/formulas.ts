/**
 * 战斗系统 — 战斗公式（纯函数）
 *
 * 所有参数从 CombatConfig 读取，不硬编码。
 * 从 traits 实时计算 atk/def/spd，不缓存。
 */

import type { FactionEntity, NPCEntity, PlayerEntity } from "../core/types.ts";
import type { CombatConfig } from "./types.ts";

type CombatEntity = NPCEntity | PlayerEntity;

// ============================================================
// Trait 读取
// ============================================================

function getTraitValue(entity: CombatEntity | FactionEntity, name: string): number {
  const trait = entity.traits.find((t) => t.name === name);
  return trait?.value ?? 0;
}

// ============================================================
// 实时推导属性（不存储，每回合计算）
// ============================================================

export function deriveAtk(entity: CombatEntity, config: CombatConfig, weaponBonus = 0): number {
  const skill = getTraitValue(entity, "combat_skill");
  const strength = getTraitValue(entity, "strength");
  return config.baseAtk + skill * config.skillToAtk + strength * config.strengthToAtk + weaponBonus;
}

export function deriveDef(entity: CombatEntity, config: CombatConfig, armorBonus = 0): number {
  const skill = getTraitValue(entity, "combat_skill");
  const endurance = getTraitValue(entity, "endurance");
  const defendingBonus = entity.combatState.isDefending ? config.defendingBonus : 0;
  return (
    config.baseDef +
    skill * config.skillToDef +
    endurance * config.enduranceToDef +
    armorBonus +
    defendingBonus
  );
}

export function deriveSpd(entity: CombatEntity, config: CombatConfig): number {
  const skill = getTraitValue(entity, "combat_skill");
  const agility = getTraitValue(entity, "agility");
  return config.baseSpd + skill * config.skillToSpd + agility * config.agilityToSpd;
}

// ============================================================
// 伤害计算
// ============================================================

export interface DamageResult {
  raw: number;
  final: number;
  isCrit: boolean;
}

export function computeDamage(atk: number, def: number, config: CombatConfig): DamageResult {
  const defReduction = def * config.defenseReductionPerPoint;
  let raw = atk * config.damageMultiplier - defReduction;
  raw = Math.max(config.minDamage, raw);

  // 随机浮动: ±damageVariance
  const variance = config.damageVariance;
  const factor = 1 + (Math.random() * 2 - 1) * variance;
  raw = raw * factor;

  const isCrit = Math.random() < config.critBaseChance;
  const final = Math.round(isCrit ? raw * config.critMultiplier : raw);

  return { raw: Math.round(raw), final: Math.max(config.minDamage, final), isCrit };
}

// ============================================================
// 逃跑判定
// ============================================================

export function checkFlee(
  fleer: CombatEntity,
  opponent: CombatEntity,
  config: CombatConfig,
): boolean {
  const fleerSpd = deriveSpd(fleer, config);
  const opponentSpd = deriveSpd(opponent, config);
  const chance = config.fleeBaseChance + (fleerSpd - opponentSpd) * config.fleeSpdBonus;
  return Math.random() < Math.max(0.05, Math.min(0.95, chance));
}

// ============================================================
// 武器/装备 bonus 读取
// ============================================================

export function getWeaponBonus(entity: CombatEntity): number {
  if ("equipment" in entity && entity.equipment?.weapon) {
    return (entity.equipment.weapon.properties.atkBonus as number) ?? 0;
  }
  return 0;
}

export function getArmorBonus(entity: CombatEntity): number {
  if ("equipment" in entity && entity.equipment?.armor) {
    return (entity.equipment.armor.properties.defBonus as number) ?? 0;
  }
  return 0;
}
