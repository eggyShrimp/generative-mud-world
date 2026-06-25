import type {
  ContentPool,
  NeedType,
  NPCEntity,
  PlayerEntity,
  ScheduleEntry,
  SimulationDelta,
  WorldState,
} from "../core/types.ts";

// ============================================================
// 规则引擎：所有逻辑读取 ContentPool，无硬编码内容
// ============================================================

// Schedule 执行
export function executeSchedule(
  world: WorldState,
  npc: { id: string; schedule?: ScheduleEntry[]; roomId: string | null },
  currentHour: number,
): SimulationDelta {
  const delta: SimulationDelta = { needChanges: [] };
  const pool = world.contentPool;
  const schedule = npc.schedule ?? [];

  for (const entry of schedule) {
    let matches = false;
    if (entry.startHour <= entry.endHour) {
      // Normal range: startHour <= currentHour < endHour
      matches = currentHour >= entry.startHour && currentHour < entry.endHour;
    } else {
      // Overnight range: currentHour >= startHour OR currentHour < endHour
      matches = currentHour >= entry.startHour || currentHour < entry.endHour;
    }
    if (matches) {
      const effect = pool.actionEffects.find((e) => e.action === entry.action);
      if (effect) {
        for (const [needType, d] of Object.entries(effect.needDeltas)) {
          delta.needChanges?.push({
            targetId: npc.id,
            needType: needType as unknown as NeedType,
            delta: d,
          });
        }
      }
    }
  }

  return delta;
}

// Need 衰减
export function decayNeeds(
  world: WorldState,
  npcId: string,
  npc: {
    needs: Array<{ type: string; value: number; decayRate: number }>;
    equipment?: NPCEntity["equipment"];
  },
): SimulationDelta {
  const pool = world.contentPool;
  const seasonDef = pool.seasonConfig.seasons.find((s) => s.id === world.time.season);
  const baseMultiplier = seasonDef?.needDecayMultiplier ?? 1.0;

  // Warmth penalty
  const warmthConfig = pool.warmthComfortConfig;
  const comfortTemp = seasonDef?.comfortTemp ?? 20;
  const idealWarmth = Math.max(
    warmthConfig.minIdealWarmth,
    Math.min(warmthConfig.maxIdealWarmth, warmthConfig.baselineTemp - comfortTemp),
  );
  const eq = npc.equipment;
  const effectiveWarmth = eq
    ? ((eq.weapon?.properties.warmth as number) ?? 0) +
      ((eq.armor?.properties.warmth as number) ?? 0) +
      ((eq.cloak?.properties.warmth as number) ?? 0) +
      ((eq.accessory?.properties.warmth as number) ?? 0)
    : 0;
  const discomfort = Math.abs(idealWarmth - effectiveWarmth);
  const warmthMultiplier = 1 + discomfort * warmthConfig.penaltyPerWarmthPoint;

  return {
    needChanges: npc.needs.map((n) => ({
      targetId: npcId,
      needType: n.type as unknown as NeedType,
      delta: -n.decayRate * baseMultiplier * warmthMultiplier,
    })),
  };
}

// Action 权重计算
export function computeActionWeights(
  npc: {
    traits: Array<{ name: string; value: number }>;
    needs: Array<{ type: string; value: number }>;
  },
  actions: Array<{ type: string; weight: number }>,
  pool: ContentPool,
): Array<{ type: string; weight: number; finalWeight: number }> {
  const results = [];

  for (const action of actions) {
    let weight = action.weight;

    for (const trait of npc.traits) {
      weight += trait.value * 0.05;
    }

    for (const need of npc.needs) {
      const mapping = pool.needActionMap.find((m) => m.needType === need.type);
      if (mapping?.actionNames.includes(action.type)) {
        const urgency = 1 - need.value / 100;
        weight += urgency * 20;
      }
    }

    results.push({ type: action.type, weight: action.weight, finalWeight: Math.max(0, weight) });
  }

  return results;
}

// ContentPool 查询工具
export function getScheduleForRole(pool: ContentPool, role: string): ScheduleEntry[] {
  return pool.scheduleTemplates.find((t) => t.role === role)?.schedule ?? [];
}

export function getNeedDefinition(pool: ContentPool, type: string) {
  return pool.needDefinitions.find((n) => n.type === type);
}

export function defaultNeedValues(pool: ContentPool): Record<string, number> {
  const defaults: Record<string, number> = {};
  for (const def of pool.needDefinitions) {
    defaults[def.type] = 70;
  }
  return defaults;
}

export function checkNpcAggression(
  world: WorldState,
): Array<{ attackerId: string; targetId: string }> {
  const results: Array<{ attackerId: string; targetId: string }> = [];
  const config = world.contentPool.combatConfig;

  const playersByRoom = new Map<string, string>();
  for (const [id, entity] of world.entities) {
    if (entity.type === "player" && entity.roomId) {
      playersByRoom.set(entity.roomId, id);
    }
  }

  for (const [npcId, entity] of world.entities) {
    if (entity.type !== "npc") continue;
    const npc = entity as NPCEntity;
    if (!npc.roomId) continue;
    if (npc.combatState.isIncapacitated) continue;
    if (npc.combatState.combatTarget) continue;

    if (npc.combatState.lastAttackTick != null) {
      if (world.tick - npc.combatState.lastAttackTick < config.npcAttackCooldown) continue;
    }

    const playerId = playersByRoom.get(npc.roomId);
    if (!playerId) continue;

    const player = world.entities.get(playerId) as PlayerEntity | undefined;
    if (!player) continue;
    if (player.combatState.isIncapacitated) continue;

    const relation = npc.relations.find((r) => r.targetId === playerId);
    const relationLevel = relation?.level ?? 0;
    if (relationLevel < config.npcHostilityThreshold) {
      results.push({ attackerId: npcId, targetId: playerId });
    }
  }

  return results;
}
