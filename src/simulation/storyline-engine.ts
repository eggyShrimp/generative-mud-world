import type {
  EntityId,
  PlayerEntity,
  QuestChange,
  QuestTemplate,
  SimulationDelta,
  TriggerCondition,
  WorldState,
} from "../core/types.ts";
import { getEntity, logEvent } from "../core/world.ts";
import { resolveQuestAccept } from "../engine/quest-tracker.ts";

/**
 * 检查是否有新剧情触发（自动触发类型：time/trait/relation/world_event）。
 * player_action 类型的触发已移至 dialogue 系统（activate_quest tool）。
 */
export function checkTrigger(world: WorldState, playerId: EntityId): SimulationDelta | null {
  const player = getEntity<PlayerEntity>(world, playerId);
  if (!player) return null;

  const pool = world.contentPool;
  const allChanges: QuestChange[] = [];

  for (const template of pool.questTemplates) {
    if (!template.autoTrigger || !template.stages) continue;

    // player_action 类型由 dialogue 系统处理，checkTrigger 跳过
    if (template.autoTrigger.type === "player_action") continue;

    const activeState = player.activeStorylines.find((s) => s.storylineId === template.id);
    if (activeState) continue;

    if (!template.repeatable && world.completedStorylines.includes(template.id)) continue;
    if (!template.repeatable && player.completedQuests.includes(template.id)) continue;

    if (!matchTrigger(player, template, world)) continue;

    // 委托 resolveQuestAccept 处理 stale reference 验证 + StorylineState 创建
    const result = resolveQuestAccept(world, playerId, template.id);
    if (result.success && result.delta?.questChanges) {
      allChanges.push(...result.delta.questChanges);
    }
  }

  return allChanges.length > 0 ? { questChanges: allChanges } : null;
}

/**
 * 检查活跃剧情的当前阶段是否完成（引用 quest 是否在 completedQuests 中）。
 */
export function checkStageCompletion(
  world: WorldState,
  playerId: EntityId,
): SimulationDelta | null {
  const player = getEntity<PlayerEntity>(world, playerId);
  if (!player) return null;

  const pool = world.contentPool;
  const questChanges: QuestChange[] = [];

  const toRemove: string[] = [];

  for (const state of player.activeStorylines) {
    const template = pool.questTemplates.find((t) => t.id === state.storylineId);
    if (!template?.stages) continue;

    const currentStage = template.stages[state.currentStage];
    if (!currentStage) continue;

    const completed = evaluateCompletion(
      currentStage.questIds,
      currentStage.completionCondition,
      player,
    );
    if (!completed) continue;

    const isLastStage = state.currentStage >= template.stages.length - 1;

    if (isLastStage) {
      toRemove.push(state.storylineId);

      world.completedStorylines.push(state.storylineId);

      if (template.rewards.narrative) {
        logEvent(world, {
          id: `storyline_complete_${playerId}_${template.id}_${world.tick}`,
          type: "storyline_complete",
          title: template.title,
          description: template.rewards.narrative,
          scope: "global",
          tick: world.tick,
          source: "simulation",
          data: { storylineId: template.id, playerId },
        });
      }

      questChanges.push({ type: "complete", playerId, templateId: template.id });
    } else {
      const nextStage = template.stages[state.currentStage + 1];
      state.currentStage++;
      state.activeQuestIdsOfCurrentStage = [...nextStage.questIds];

      for (const questId of nextStage.questIds) {
        questChanges.push({ type: "accept", playerId, templateId: questId });
      }

      logEvent(world, {
        id: `storyline_stage_${playerId}_${template.id}_${state.currentStage}_${world.tick}`,
        type: "storyline_stage_complete",
        title: currentStage.title,
        description: currentStage.narrativeGuide,
        scope: "global",
        tick: world.tick,
        source: "simulation",
        data: { storylineId: template.id, stageId: currentStage.id, playerId },
      });
    }
  }

  if (toRemove.length > 0) {
    player.activeStorylines = player.activeStorylines.filter(
      (s) => !toRemove.includes(s.storylineId),
    );
  }

  return questChanges.length > 0 ? { questChanges } : null;
}

// ─── 私有工具函数 ─────────────────────────────────────────

function evaluateCompletion(
  questIds: string[],
  condition: "all" | "any",
  player: PlayerEntity,
): boolean {
  if (questIds.length === 0) return true;
  const completedSet = new Set(player.completedQuests);
  return condition === "all"
    ? questIds.every((id) => completedSet.has(id))
    : questIds.some((id) => completedSet.has(id));
}

function matchTrigger(player: PlayerEntity, template: QuestTemplate, world: WorldState): boolean {
  const trigger = template.autoTrigger;
  if (!trigger) return false;

  for (const cond of trigger.conditions) {
    switch (trigger.type) {
      case "time":
        if (!matchTime(world, cond)) return false;
        break;
      case "trait":
        if (!matchTrait(player, cond)) return false;
        break;
      case "relation":
        if (!matchRelation(player, cond)) return false;
        break;
      case "world_event":
        if (!matchWorldEvent(world, cond)) return false;
        break;
      // player_action 由 dialogue 系统处理，不在此匹配
    }
  }
  return true;
}

function cmp(a: number, b: number, op: ">=" | "<=" | "==" | "!="): boolean {
  if (op === ">=") return a >= b;
  if (op === "<=") return a <= b;
  if (op === "==") return a === b;
  if (op === "!=") return a !== b;
  return false;
}

function matchTime(world: WorldState, cond: TriggerCondition): boolean {
  if (cond.day == null) return false;
  return cmp(world.time.day, cond.day as number, cond.operator as ">=" | "<=" | "==" | "!=");
}

function matchTrait(player: PlayerEntity, cond: TriggerCondition): boolean {
  if (!cond.trait) return false;
  const trait = player.traits.find((t) => t.name === cond.trait);
  if (!trait) return false;
  return cmp(trait.value, cond.value as number, cond.operator as ">=" | "<=" | "==" | "!=");
}

function matchRelation(player: PlayerEntity, cond: TriggerCondition): boolean {
  if (!cond.relationWith) return false;
  const rel = player.relations.find((r) => r.targetId === cond.relationWith);
  if (!rel) return false;
  return cmp(rel.level, cond.value as number, cond.operator as ">=" | "<=" | "==" | "!=");
}

function matchWorldEvent(world: WorldState, cond: TriggerCondition): boolean {
  if (!cond.eventType) return false;
  const window = world.contentPool.storylineConfig.eventLookbackWindow;
  const recent = world.eventLog.slice(-window);
  return recent.some((e) => e.type === cond.eventType);
}
