/**
 * 战斗系统 — 统一导出
 *
 * 外部模块只 import from "combat"
 */

// AI
export { selectCombatAction, selectCombatTarget, shouldFlee } from "./ai.ts";
// zod schema
export {
  CombatConfigSchema,
  CombatSkillSchema,
} from "./config.ts";
// 精力管理
export { getCombatRestCost, isExhausted } from "./energy.ts";

// 公式
export {
  checkFlee,
  computeDamage,
  deriveAtk,
  deriveDef,
  deriveSpd,
  getArmorBonus,
  getWeaponBonus,
} from "./formulas.ts";
// 虚弱/死亡
export {
  applyCombatExhaustion,
  applyIncapacitation,
  applyRecovery,
  checkIncapacitation,
  checkRecovery,
  handleNpcDeath,
  handlePlayerIncapacitation,
} from "./incapacitation.ts";
export type { CombatPulseResult } from "./pulse.ts";
// 脉搏 + 后效
export { executeCombatPulse, resolveCombatConsequences, shouldPulse } from "./pulse.ts";
// 结算
export { resolveAttack } from "./resolver.ts";
// 类型
export type {
  AttackResult,
  CombatConfig,
  CombatEntitySnapshot,
  CombatEvent,
  CombatEventType,
  CombatHpChange,
  CombatSkill,
  CombatState,
} from "./types.ts";
