/**
 * 任务追踪器
 *
 * 检查活跃任务的目标进度，处理自动发现任务，判定完成/失败。
 * 纯规则层，不调 LLM。
 */

import { getQuestObjectiveDefinition } from "../core/quest-objective-registry.ts";
import { checkPrerequisites } from "../core/quest-utils.ts";
import { renderTemplate } from "../core/template.ts";
import type {
  EntityId,
  PlayerEntity,
  QuestObjective,
  SimulationDelta,
  WorldState,
} from "../core/types.ts";
import { getEntity } from "../core/world.ts";
import { logWrite } from "../shared/log.ts";

/**
 * 事件驱动的任务进度评估 — 在 act-loop 中调用
 *
 * 从当前行为的 delta 中提取变更，匹配活跃 quest 的 objective，
 * 产出 questDelta 进 composeDeltas。
 *
 * 与 checkQuestProgress（sweep 模式）互补：
 * - 此函数：delta 驱动，覆盖对话触发的 collect/talk
 * - checkQuestProgress：全量扫描，覆盖跨天/非对话路径
 */
export function evaluateQuestImpacts(
  world: WorldState,
  actorId: EntityId,
  delta: SimulationDelta,
): SimulationDelta | null {
  const player = getEntity<PlayerEntity>(world, actorId);
  if (player?.type !== "player") return null;

  const result: SimulationDelta = {};

  for (const quest of player.activeQuests) {
    if (quest.status !== "active") continue;

    const template = world.contentPool.questTemplates.find((t) => t.id === quest.templateId);
    if (!template) continue;

    // 本地追踪本轮新完成的组（不写世界状态）
    const wouldBeGroupCompleted = [...quest.groupCompleted];

    for (let i = 0; i < template.objectives.length; i++) {
      const obj = template.objectives[i];
      if (wouldBeGroupCompleted[obj.groupId]) continue;

      const previous = quest.objectiveProgress[i] ?? 0;
      const current = evaluateObjectiveFromDelta(world, player, obj, delta);
      if (current <= previous) continue;

      result.questChanges = result.questChanges ?? [];
      result.questChanges.push({
        type: "progress",
        playerId: player.id,
        templateId: quest.templateId,
        objectiveIndex: i,
        count: current,
      });

      if (current >= obj.count) {
        wouldBeGroupCompleted[obj.groupId] = true;
      }
    }

    // AND 逻辑：所有组都完成才算任务完成
    if (
      wouldBeGroupCompleted.every((done) => done) &&
      !quest.groupCompleted.every((done) => done)
    ) {
      result.questChanges = result.questChanges ?? [];
      result.questChanges.push({
        type: "complete",
        playerId: player.id,
        templateId: quest.templateId,
      });
      result.worldEvents = result.worldEvents ?? [];
      result.worldEvents.push({
        id: `quest_complete_${player.id}_${quest.templateId}_${world.tick}`,
        type: "quest_complete",
        title: renderTemplate(world.contentPool.narrativeTemplates.questMessages.completeTitle, {
          title: template.title,
        }),
        description:
          template.rewards.narrative ??
          renderTemplate(world.contentPool.narrativeTemplates.questMessages.completeDescription, {
            title: template.title,
          }),
        scope: "global",
        tick: world.tick,
        source: "simulation",
        data: { templateId: quest.templateId },
      });
    }
  }

  return result.questChanges ? result : null;
}

/**
 * 检查指定玩家（或所有玩家）的任务进度
 * @param playerId 为 undefined 时检查所有在线玩家
 */
export function checkQuestProgress(world: WorldState, playerId?: EntityId): SimulationDelta | null {
  const players: PlayerEntity[] = [];

  if (playerId) {
    const entity = getEntity<PlayerEntity>(world, playerId);
    if (entity?.type === "player") players.push(entity);
  } else {
    for (const entity of world.entities.values()) {
      if (entity.type === "player") players.push(entity as PlayerEntity);
    }
  }

  if (players.length === 0) return null;

  const delta: SimulationDelta = {};

  for (const player of players) {
    for (const quest of player.activeQuests) {
      if (quest.status !== "active") continue;

      const template = world.contentPool.questTemplates.find((t) => t.id === quest.templateId);
      if (!template) continue;

      // 检查截止日期（仅结算阶段，有 deadline 且当前天数已超过）
      if (quest.deadlineDay !== null && world.time.day > quest.deadlineDay) {
        delta.questChanges = delta.questChanges ?? [];
        delta.questChanges.push({
          type: "fail",
          playerId: player.id,
          templateId: quest.templateId,
          reason: "deadline",
        });
        delta.worldEvents = delta.worldEvents ?? [];
        delta.worldEvents.push({
          id: `quest_fail_${player.id}_${quest.templateId}_${world.tick}`,
          type: "quest_fail",
          title: renderTemplate(world.contentPool.narrativeTemplates.questMessages.failTitle, {
            title: template.title,
          }),
          description: renderTemplate(
            world.contentPool.narrativeTemplates.questMessages.failDescription,
            {
              title: template.title,
            },
          ),
          scope: "global",
          tick: world.tick,
          source: "simulation",
          data: { templateId: quest.templateId },
        });
        continue;
      }

      // 本地追踪本轮新完成的组（不写世界状态）
      const wouldBeGroupCompleted = [...quest.groupCompleted];

      // 检查每个目标
      for (let i = 0; i < template.objectives.length; i++) {
        const obj = template.objectives[i];
        if (wouldBeGroupCompleted[obj.groupId]) continue;

        const current = checkObjective(world, player, obj, quest.objectiveProgress[i] ?? 0);
        if (current !== (quest.objectiveProgress[i] ?? 0)) {
          delta.questChanges = delta.questChanges ?? [];
          delta.questChanges.push({
            type: "progress",
            playerId: player.id,
            templateId: quest.templateId,
            objectiveIndex: i,
            count: current,
          });
        }

        if (current >= obj.count) {
          wouldBeGroupCompleted[obj.groupId] = true;
        }
      }

      // AND 逻辑：所有组都完成才算任务完成
      if (
        wouldBeGroupCompleted.every((done) => done) &&
        !quest.groupCompleted.every((done) => done)
      ) {
        delta.questChanges = delta.questChanges ?? [];
        delta.questChanges.push({
          type: "complete",
          playerId: player.id,
          templateId: quest.templateId,
        });
        delta.worldEvents = delta.worldEvents ?? [];
        delta.worldEvents.push({
          id: `quest_complete_${player.id}_${quest.templateId}_${world.tick}`,
          type: "quest_complete",
          title: renderTemplate(world.contentPool.narrativeTemplates.questMessages.completeTitle, {
            title: template.title,
          }),
          description:
            template.rewards.narrative ??
            renderTemplate(world.contentPool.narrativeTemplates.questMessages.completeDescription, {
              title: template.title,
            }),
          scope: "global",
          tick: world.tick,
          source: "simulation",
          data: { templateId: quest.templateId },
        });
      }
    }

    // 自动发现任务：检查 autoDiscover 触发条件
    checkAutoDiscover(world, player, delta);
  }

  return delta.questChanges ? delta : null;
}

// ─── 内部函数 ─────────────────────────────────────────

function checkObjective(
  world: WorldState,
  player: PlayerEntity,
  obj: QuestObjective,
  _previousCount: number,
): number {
  const definition = getQuestObjectiveDefinition(obj.condition.type);
  if (!definition) {
    logWrite("srv", "warn", `[QuestTracker] 未知任务目标类型: ${obj.condition.type}`);
    return 0;
  }
  return definition.evaluateFromWorld({ world, player, condition: obj.condition });
}

function checkAutoDiscover(world: WorldState, player: PlayerEntity, delta: SimulationDelta): void {
  for (const template of world.contentPool.questTemplates) {
    if (!template.autoDiscover) continue;
    if (template.giverNpcId !== null) continue;
    if (player.activeQuests.some((q) => q.templateId === template.id)) continue;
    if (player.completedQuests.includes(template.id) && !template.repeatable) continue;
    if (
      template.repeatable &&
      template.cooldownDays &&
      player.completedQuests.includes(template.id)
    ) {
      const lastDay = player.questCooldowns[template.id];
      if (lastDay !== undefined && world.time.day - lastDay < template.cooldownDays) continue;
    }

    const ad = template.autoDiscover;
    let triggered = false;

    if (ad.triggerRoomId && player.roomId === ad.triggerRoomId) {
      triggered = true;
    }
    if (ad.triggerItemId && player.inventory.some((i) => i.id === ad.triggerItemId)) {
      triggered = true;
    }

    if (triggered) {
      if (template.prerequisites) {
        if (!checkPrerequisites(player.completedQuests, template.prerequisites)) continue;
      }

      if (template.minRelation) {
        const rel = player.relations.find((r) => r.targetId === template.minRelation?.npcId);
        const relValue = rel?.level ?? 0;
        if (relValue < template.minRelation.minValue) continue;
      }

      delta.questChanges = delta.questChanges ?? [];
      delta.questChanges.push({ type: "accept", playerId: player.id, templateId: template.id });
      delta.worldEvents = delta.worldEvents ?? [];
      delta.worldEvents.push({
        id: `quest_discover_${player.id}_${template.id}_${world.tick}`,
        type: "quest_accept",
        title: renderTemplate(world.contentPool.narrativeTemplates.questMessages.discoverTitle, {
          title: template.title,
        }),
        description:
          ad.triggerText ??
          renderTemplate(world.contentPool.narrativeTemplates.questMessages.discoverDescription, {
            title: template.title,
          }),
        scope: "global",
        tick: world.tick,
        source: "simulation",
        data: { templateId: template.id },
      });
      logWrite("srv", "info", `[QuestTracker] ${player.name} 自动发现任务: ${template.id}`);
    }
  }
}

/**
 * 从 delta 事件中评估目标进度（事件驱动，不查世界状态）
 *
 * 覆盖场景：
 * - collect/fetch: 物品已在背包（exchange_item give 已直接写入）或 delta 中有交付记录
 * - talk: 当前 action 就是 talk 到目标 NPC
 * - explore: 玩家已在目标房间或 delta 揭示了目标房间
 * - deliver: 玩家在 NPC 房间
 */
function evaluateObjectiveFromDelta(
  world: WorldState,
  player: PlayerEntity,
  obj: QuestObjective,
  delta: SimulationDelta,
): number {
  const definition = getQuestObjectiveDefinition(obj.condition.type);
  if (!definition) {
    logWrite("srv", "warn", `[QuestTracker] 未知任务目标类型: ${obj.condition.type}`);
    return 0;
  }
  const fromEvent = definition.evaluateFromEvent({
    world,
    player,
    condition: obj.condition,
    delta,
  });
  if (fromEvent > 0) return fromEvent;
  return definition.evaluateFromWorld({ world, player, condition: obj.condition });
}
