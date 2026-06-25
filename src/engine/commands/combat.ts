/**
 * 战斗命令执行器 (attack, flee, defend)
 */

import { checkFlee, resolveAttack } from "../../combat/index.ts";
import type { CombatHpChange } from "../../combat/types.ts";
import { renderTemplate } from "../../core/template.ts";
import type {
  EntityId,
  NeedChange,
  NPCEntity,
  PlayerEntity,
  WorldState,
} from "../../core/types.ts";
import { getEntity } from "../../core/world.ts";
import type { CommandEvent } from "../../shared/protocol.ts";
import { combatTemplates, fail } from "./helpers.ts";

export function executeAttack(
  world: WorldState,
  entityId: EntityId,
  params: Record<string, unknown>,
): ReturnType<typeof fail> {
  const entity = getEntity(world, entityId) as PlayerEntity | NPCEntity | undefined;
  if (!entity || !("combatState" in entity)) return fail("找不到自己");

  if (entity.combatState.isIncapacitated) {
    return fail(`${entity.name} 已经倒下了，无法攻击。`);
  }

  const targetId = params.targetId as string | undefined;
  if (!targetId) return fail("不知道要攻击谁");

  const target = world.entities.get(targetId) as PlayerEntity | NPCEntity | undefined;
  if (!target || !("combatState" in target)) return fail("目标不存在");

  if (target.combatState.isIncapacitated) {
    return fail(`${target.name} 已经倒下了。`);
  }

  // Set combat targets (state flag, direct write)
  entity.combatState.combatTarget = targetId;
  const config = world.contentPool.combatConfig;
  const templates = combatTemplates(world);

  // Collect HP/need changes as delta (instead of direct mutation)
  const combatHpChanges: CombatHpChange[] = [];
  const needChanges: NeedChange[] = [];

  // Player attacks target
  const attackerResult = resolveAttack(entity, target, config, templates);

  // HP damage → delta
  combatHpChanges.push({
    targetId,
    delta: attackerResult.hpChange.delta,
  });

  // Rest cost → delta
  needChanges.push({
    targetId: entityId,
    needType: attackerResult.needChange.needType,
    delta: attackerResult.needChange.delta,
  });

  // Update threat table (state flag, direct write)
  target.combatState.threatTable[entityId] = (target.combatState.threatTable[entityId] ?? 0) + 10;

  const events: CommandEvent[] = [
    {
      type: "combat_attack",
      description: renderTemplate(templates.attackStart, {
        attacker: entity.name,
        defender: target.name,
      }),
    },
    {
      type: attackerResult.event.type,
      description: attackerResult.event.description,
    },
  ];

  // Counter-attack if target has combatTarget set to attacker
  if (target.combatState.combatTarget === entityId && !target.combatState.isIncapacitated) {
    const counterResult = resolveAttack(target, entity, config, templates);

    // HP damage to attacker → delta
    combatHpChanges.push({
      targetId: entityId,
      delta: counterResult.hpChange.delta,
    });

    // Rest cost to counter-attacker → delta
    needChanges.push({
      targetId: targetId,
      needType: counterResult.needChange.needType,
      delta: counterResult.needChange.delta,
    });

    events.push({
      type: counterResult.event.type,
      description: counterResult.event.description,
    });
  }

  return {
    events,
    delta: {
      combatHpChanges,
      needChanges,
    },
    ended: false,
  };
}

export function executeFlee(world: WorldState, entityId: EntityId): ReturnType<typeof fail> {
  const entity = getEntity(world, entityId) as PlayerEntity | NPCEntity | undefined;
  if (!entity || !("combatState" in entity)) return fail("找不到自己");

  if (!entity.combatState.combatTarget) {
    return fail("你没有在战斗中，不需要逃跑。");
  }

  const targetId = entity.combatState.combatTarget;
  const target = world.entities.get(targetId) as PlayerEntity | NPCEntity | undefined;
  if (!target || !("combatState" in target)) {
    // Target gone, clear combat state
    entity.combatState.combatTarget = null;
    return fail("对手已经不在了。");
  }

  const config = world.contentPool.combatConfig;
  const templates = combatTemplates(world);
  const success = checkFlee(entity, target, config);

  const needChange = {
    targetId: entityId,
    needType: "rest" as const,
    delta: -config.restCostPerAttack,
  };

  if (success) {
    entity.combatState.combatTarget = null;
    entity.combatState.isDefending = false;
    // Clear target's combat target if it was pointing at us
    if (target.combatState.combatTarget === entityId) {
      target.combatState.combatTarget = null;
    }
    return {
      events: [
        {
          type: "combat_flee_success",
          description: renderTemplate(templates.fleeSuccess, { actor: entity.name }),
        },
      ],
      delta: { needChanges: [needChange] },
      ended: false,
    };
  }

  return {
    events: [
      {
        type: "combat_flee_fail",
        description: renderTemplate(templates.fleeFail, { actor: entity.name }),
      },
    ],
    delta: { needChanges: [needChange] },
    ended: false,
  };
}

export function executeDefend(world: WorldState, entityId: EntityId): ReturnType<typeof fail> {
  const entity = getEntity(world, entityId) as PlayerEntity | NPCEntity | undefined;
  if (!entity || !("combatState" in entity)) return fail("找不到自己");

  if (!entity.combatState.combatTarget) {
    return fail("你没有在战斗中，不需要防御。");
  }

  entity.combatState.isDefending = true;
  const config = world.contentPool.combatConfig;
  return {
    events: [
      {
        type: "defend",
        description: renderTemplate(combatTemplates(world).defend, { actor: entity.name }),
      },
    ],
    delta: {
      needChanges: [{ targetId: entityId, needType: "rest", delta: -config.restCostPerAttack }],
    },
    ended: false,
  };
}
