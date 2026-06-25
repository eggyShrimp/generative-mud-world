/**
 * 战斗系统 — PULSE_COMBAT: tick 驱动全局战斗结算
 *
 * 每 N tick (pulseInterval) 结算一次所有 combatTarget 非空的 entity 的攻击。
 * 攻击结果通过 SimulationDelta → applyDelta 走标准管道。
 */

import { renderTemplate } from "../core/template.ts";
import type {
  CombatTemplates,
  NPCEntity,
  PlayerEntity,
  SimulationDelta,
  WorldState,
} from "../core/types.ts";
import type { CommandEvent } from "../shared/protocol.ts";
import { selectCombatTarget, shouldFlee } from "./ai.ts";
import { isExhausted } from "./energy.ts";
import {
  applyCombatExhaustion,
  applyIncapacitation,
  checkIncapacitation,
  handleNpcDeath,
} from "./incapacitation.ts";
import { resolveAttack } from "./resolver.ts";
import type { CombatConfig, CombatEvent } from "./types.ts";

type CombatEntity = NPCEntity | PlayerEntity;

function downDescription(entity: CombatEntity, templates: CombatTemplates): string {
  return renderTemplate(entity.type === "player" ? templates.playerDown : templates.npcDefeated, {
    target: entity.name,
  });
}

export interface CombatPulseResult {
  deltas: SimulationDelta[];
  events: CombatEvent[];
  deathIds: string[];
}

/**
 * 判断当前 tick 是否是战斗结算 tick
 */
export function shouldPulse(world: WorldState, config: CombatConfig): boolean {
  return world.tick % config.pulseInterval === 0 && world.tick > 0;
}

/**
 * 战斗后效检查 — applyDelta 之后调用
 *
 * 检查 combatHpChanges 和 needChanges 涉及的每个 entity:
 *   - HP ≤ 0 且未虚弱 → 标记虚弱
 *   - rest ≤ 0 且在战斗中 → 力竭虚弱
 *   - NPC 虚弱后 HP 仍 ≤ 0 → 永久死亡（从世界移除）
 *   - 清理所有指向已死 NPC 的 combatTarget
 */
export function resolveCombatConsequences(
  world: WorldState,
  combatHpChanges: Array<{ targetId: string; delta: number }>,
  needChanges: Array<{ targetId: string; needType: string; delta: number }>,
  config: CombatConfig,
): { events: CommandEvent[] } {
  const events: CommandEvent[] = [];
  const processed = new Set<string>();

  // 阶段 1: HP ≤ 0 → 虚弱
  for (const change of combatHpChanges) {
    const entity = world.entities.get(change.targetId);
    if (!entity || !("combatState" in entity)) continue;
    const e = entity as CombatEntity;

    if (!checkIncapacitation(e)) continue;
    processed.add(e.id);

    applyIncapacitation(world, change.targetId, config);
    events.push({
      type: e.type === "player" ? "combat_defeat" : "combat_victory",
      description: downDescription(e, world.contentPool.narrativeTemplates.combatTemplates),
    });

    if (e.type === "npc" && e.combatState.hp <= 0) {
      const npcName = e.name;
      const dead = handleNpcDeath(world, change.targetId);
      if (dead) {
        for (const [, other] of world.entities) {
          if ("combatState" in other && other.combatState.combatTarget === change.targetId) {
            other.combatState.combatTarget = null;
          }
        }
        events.push({
          type: "combat_victory",
          description: renderTemplate(
            world.contentPool.narrativeTemplates.combatTemplates.npcDeath,
            {
              target: npcName,
            },
          ),
        });
      }
    }
  }

  // 阶段 2: rest ≤ 0 且在战斗中 → 力竭虚弱
  for (const change of needChanges) {
    if (change.needType !== "rest") continue;
    const entity = world.entities.get(change.targetId);
    if (!entity || !("combatState" in entity)) continue;
    const e = entity as CombatEntity;
    if (processed.has(e.id)) continue;
    if (e.combatState.isIncapacitated) continue;
    if (!isExhausted(e)) continue;
    if (!e.combatState.combatTarget) continue;

    processed.add(e.id);
    applyCombatExhaustion(e, world, config);
    events.push({
      type: e.type === "player" ? "combat_defeat" : "combat_victory",
      description: `${e.name} 已筋疲力尽，在战斗中倒下了……`,
    });
  }

  return { events };
}

/**
 * 执行战斗脉搏: 结算所有正在进行的战斗
 *
 * 调用方负责将返回的 deltas 通过 applyDelta 应用到 WorldState
 */
export function executeCombatPulse(world: WorldState, config: CombatConfig): CombatPulseResult {
  if (!shouldPulse(world, config)) {
    return { deltas: [], events: [], deathIds: [] };
  }

  const deltas: SimulationDelta[] = [];
  const allEvents: CombatEvent[] = [];
  const deathIds: string[] = [];
  const processed = new Set<string>();

  for (const [entityId, entity] of world.entities) {
    if (!("combatState" in entity)) continue;
    if (entity.combatState.isIncapacitated) continue;
    // 精力耗尽 → 力竭虚弱
    if (isExhausted(entity as CombatEntity)) {
      applyCombatExhaustion(entity as CombatEntity, world, config);
      continue;
    }
    if (entity.combatState.combatTarget === null) continue;

    // 避免同一对攻击者重复结算
    const pairKey = [entityId, entity.combatState.combatTarget].sort().join(":");
    if (processed.has(pairKey)) continue;
    processed.add(pairKey);

    const attacker = entity as CombatEntity;
    const targetId = entity.combatState.combatTarget;
    const target = world.entities.get(targetId) as CombatEntity | undefined;

    if (!target || !("combatState" in target)) {
      attacker.combatState.combatTarget = null;
      continue;
    }

    // 跳过攻击虚弱目标
    if (target.combatState.isIncapacitated) {
      attacker.combatState.combatTarget = null;
      continue;
    }

    // 检查是否同房间
    if (attacker.roomId !== target.roomId) {
      attacker.combatState.combatTarget = null;
      continue;
    }

    // 攻击者是 NPC 时，检查是否应该逃跑
    if (attacker.type === "npc" && shouldFlee(attacker as NPCEntity, config)) {
      attacker.combatState.combatTarget = null;
      allEvents.push({
        type: "combat_flee_success",
        attackerId: attacker.id,
        defenderId: targetId,
        description: renderTemplate(world.contentPool.narrativeTemplates.combatTemplates.npcFlee, {
          actor: attacker.name,
        }),
      });
      continue;
    }

    // 攻击者不是 NPC 时，自动选目标（NPC 的 combatTarget 由 threatTable 驱动）
    if (attacker.type === "npc") {
      const autoTarget = selectCombatTarget(attacker as NPCEntity, world);
      if (autoTarget) {
        attacker.combatState.combatTarget = autoTarget;
      }
    }

    // 执行攻击
    const periodDef = world.contentPool.dayNightConfig.periods.find(
      (p) => p.id === world.time.period,
    );
    const periodMod = periodDef?.visibilityModifier ?? 1.0;
    const regionId = world.rooms.get(attacker.roomId ?? "")?.regionId;
    const weatherState = regionId ? world.weatherByRegion.get(regionId) : undefined;
    const weatherMod = weatherState?.visibilityMultiplier ?? 1.0;

    const result = resolveAttack(
      attacker,
      target,
      config,
      world.contentPool.narrativeTemplates.combatTemplates,
      periodMod,
      weatherMod,
    );
    attacker.combatState.lastAttackTick = world.tick;

    deltas.push({
      combatHpChanges: [result.hpChange],
      needChanges: [result.needChange],
    });
    allEvents.push(result.event);
  }

  // 虚弱恢复检查
  for (const [, entity] of world.entities) {
    if (!("combatState" in entity)) continue;
    const e = entity as CombatEntity;
    if (e.combatState.isIncapacitated && world.tick >= e.combatState.incapacitatedUntil) {
      e.combatState.isIncapacitated = false;
      e.combatState.incapacitatedUntil = 0;
      e.combatState.hp =
        e.combatState.maxHp > 0 ? Math.max(1, Math.round(e.combatState.maxHp * 0.3)) : 0;
      e.combatState.combatTarget = null;
      e.combatState.threatTable = {};
    }
  }

  return { deltas, events: allEvents, deathIds };
}
