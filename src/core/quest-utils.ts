import { logWrite } from "../shared/log.ts";
import {
  getQuestObjectiveDefinition,
  validateQuestObjectiveCondition,
} from "./quest-objective-registry.ts";
import type {
  EntityId,
  PlayerEntity,
  QuestObjective,
  QuestPrerequisite,
  SimulationDelta,
  WorldState,
} from "./types.ts";
import { getEntity } from "./world.ts";

export interface QuestEntityInteraction {
  questId: string;
  questTitle: string;
  objectiveIndex: number;
  objectiveDescription: string;
  groupId: number;
  isPending: boolean;
  optionId: string;
  optionType: "quest_talk_menu";
}

export function checkPrerequisites(
  completedQuests: string[],
  prerequisites: string | QuestPrerequisite,
): boolean {
  if (typeof prerequisites === "string") {
    return completedQuests.includes(prerequisites);
  }
  const results = prerequisites.conditions.map((c) => checkPrerequisites(completedQuests, c));
  return prerequisites.logic === "and" ? results.every(Boolean) : results.some(Boolean);
}

export function collectSubQuestIds(pool: WorldState["contentPool"]): Set<string> {
  const ids = new Set<string>();
  for (const template of pool.questTemplates) {
    if (!template.stages) continue;
    for (const stage of template.stages) {
      for (const questId of stage.questIds) {
        ids.add(questId);
      }
    }
  }
  return ids;
}

export function isQuestObjectiveReachable(world: WorldState, objective: QuestObjective): boolean {
  if (validateQuestObjectiveCondition(objective.condition).length > 0) return false;
  const definition = getQuestObjectiveDefinition(objective.condition.type);
  return definition?.isReachable({ world, condition: objective.condition }) ?? false;
}

export function resolveQuestAccept(
  world: WorldState,
  playerId: EntityId,
  templateId: string,
): { success: boolean; delta: SimulationDelta | null; warnings: string[] } {
  const player = getEntity<PlayerEntity>(world, playerId);
  if (!player) return { success: false, delta: null, warnings: ["player not found"] };

  const pool = world.contentPool;
  const template = pool.questTemplates.find((t) => t.id === templateId);
  if (!template)
    return { success: false, delta: null, warnings: [`template ${templateId} not found`] };

  if (!template.repeatable) {
    if (
      world.completedStorylines.includes(templateId) ||
      player.completedQuests.includes(templateId)
    ) {
      return { success: true, delta: null, warnings: [] };
    }
    if (player.activeStorylines.some((s) => s.storylineId === templateId)) {
      return { success: true, delta: null, warnings: [] };
    }
  }

  const warnings: string[] = [];
  const invalidatedQuestIds = new Set<string>();

  if (template.stages) {
    for (const stage of template.stages) {
      for (const questId of stage.questIds) {
        if (invalidatedQuestIds.has(questId)) continue;

        const subQuest = pool.questTemplates.find((t) => t.id === questId);
        if (!subQuest) {
          invalidatedQuestIds.add(questId);
          warnings.push(`子任务 ${questId} 模板不存在`);
          continue;
        }

        const allObjectivesInvalid = subQuest.objectives.every(
          (objective) => !isQuestObjectiveReachable(world, objective),
        );
        if (allObjectivesInvalid && subQuest.objectives.length > 0) {
          invalidatedQuestIds.add(questId);
          warnings.push(`子任务 ${questId} 的所有目标已不可达`);
        }
      }
    }
  } else {
    const allInvalid = template.objectives.every(
      (objective) => !isQuestObjectiveReachable(world, objective),
    );
    if (allInvalid && template.objectives.length > 0) {
      return {
        success: false,
        delta: null,
        warnings: [`任务 ${templateId} 的所有目标已不可达`],
      };
    }
  }

  const delta: SimulationDelta = { questChanges: [] };

  if (template.stages) {
    const stage0 = template.stages[0];
    const validStage0QuestIds = stage0.questIds.filter(
      (questId) => !invalidatedQuestIds.has(questId),
    );

    player.activeStorylines.push({
      storylineId: templateId,
      currentStage: 0,
      activeQuestIdsOfCurrentStage: validStage0QuestIds,
      startedAt: world.time.tick,
    });

    for (const questId of validStage0QuestIds) {
      delta.questChanges?.push({ type: "accept", playerId, templateId: questId });
    }

    if ((delta.questChanges?.length ?? 0) > 0) {
      delta.worldEvents = [
        {
          id: `storyline_${playerId}_${templateId}_${world.tick}`,
          type: "storyline_triggered",
          title: template.title,
          description: template.description,
          scope: "global",
          tick: world.tick,
          source: "simulation",
          data: { storylineId: templateId, playerId },
        },
      ];
      logWrite("srv", "info", `[QuestTracker] 激活剧情: ${templateId}`);
    }
  } else {
    delta.questChanges?.push({ type: "accept", playerId, templateId: template.id });
  }

  return {
    success: true,
    delta: (delta.questChanges?.length ?? 0) > 0 ? delta : null,
    warnings,
  };
}

export function getQuestInteractionsForEntity(
  world: WorldState,
  player: PlayerEntity,
  entityId: EntityId,
): QuestEntityInteraction[] {
  const result: QuestEntityInteraction[] = [];

  for (const quest of player.activeQuests) {
    if (quest.status !== "active") continue;
    const template = world.contentPool.questTemplates.find((t) => t.id === quest.templateId);
    if (!template) continue;

    for (let i = 0; i < template.objectives.length; i++) {
      const objective = template.objectives[i];
      if (quest.groupCompleted[objective.groupId]) continue;
      const definition = getQuestObjectiveDefinition(objective.condition.type);
      const target = definition?.getInteractionTarget?.({ condition: objective.condition });
      if (target !== entityId) continue;

      const priorGroupsComplete = template.objectives
        .filter((candidate) => candidate.groupId < objective.groupId)
        .every((candidate) => quest.groupCompleted[candidate.groupId]);

      result.push({
        questId: quest.templateId,
        questTitle: template.title,
        objectiveIndex: i,
        objectiveDescription: objective.description,
        groupId: objective.groupId,
        isPending: priorGroupsComplete,
        optionId: `quest_talk:${quest.templateId}:${i}`,
        optionType: "quest_talk_menu",
      });
    }
  }

  return result;
}
