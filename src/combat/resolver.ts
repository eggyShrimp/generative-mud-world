/**
 * 战斗系统 — 单次攻击结算（纯函数）
 *
 * 输入: 攻击者、防御者、CombatConfig
 * 输出: AttackResult（伤害、暴击、HP变化、need变化、事件）
 *
 * 不修改 WorldState，只产出 delta 数据。
 */

import { renderTemplate } from "../core/template.ts";
import type { CombatTemplates, NPCEntity, PlayerEntity } from "../core/types.ts";
import { computeDamage, deriveAtk, deriveDef, getArmorBonus, getWeaponBonus } from "./formulas.ts";
import type { AttackResult, CombatConfig, CombatEvent } from "./types.ts";

type CombatEntity = NPCEntity | PlayerEntity;

export function resolveAttack(
  attacker: CombatEntity,
  defender: CombatEntity,
  config: CombatConfig,
  templates: CombatTemplates,
): AttackResult {
  const weaponBonus = getWeaponBonus(attacker);
  const armorBonus = getArmorBonus(defender);

  const atk = deriveAtk(attacker, config, weaponBonus);
  const def = deriveDef(defender, config, armorBonus);
  const damageResult = computeDamage(atk, def, config);

  const isDefending = defender.combatState.isDefending;
  const finalDamage = isDefending
    ? Math.round(damageResult.final * config.defenseDamageMultiplier)
    : damageResult.final;

  const event: CombatEvent = {
    type: damageResult.isCrit ? "combat_crit" : "combat_hit",
    attackerId: attacker.id,
    defenderId: defender.id,
    damage: finalDamage,
    description: damageResult.isCrit
      ? renderTemplate(templates.crit, {
          attacker: attacker.name,
          defender: defender.name,
          damage: finalDamage,
        })
      : renderTemplate(templates.hit, {
          attacker: attacker.name,
          defender: defender.name,
          damage: finalDamage,
        }),
  };

  return {
    damage: finalDamage,
    isCrit: damageResult.isCrit,
    hpChange: { targetId: defender.id, delta: -finalDamage },
    needChange: { targetId: attacker.id, needType: "rest", delta: -config.restCostPerAttack },
    event,
  };
}
