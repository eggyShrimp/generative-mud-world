/**
 * 任务追踪器
 *
 * 检查活跃任务的目标进度，处理自动发现任务，判定完成/失败。
 * 纯规则层，不调 LLM。
 */

import { renderTemplate } from "../core/template.ts";
import type {
  EntityId,
  PlayerEntity,
  QuestObjective,
  QuestPrerequisite,
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
  action?: string,
  targetId?: EntityId,
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
      const current = evaluateObjectiveFromDelta(world, player, obj, delta, action, targetId);
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

/**
 * 检查前置条件是否满足
 */
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

/**
 * 收集所有被 storyline（有 stages 的 quest）引用的子 quest ID。
 * 用于 availableQuests 构建时排除子 quest（它们只能通过 storyline stage 激活）。
 */
export function collectSubQuestIds(pool: WorldState["contentPool"]): Set<string> {
  const ids = new Set<string>();
  for (const t of pool.questTemplates) {
    if (!t.stages) continue;
    for (const stage of t.stages) {
      for (const qid of stage.questIds) {
        ids.add(qid);
      }
    }
  }
  return ids;
}

/**
 * 预解析阶段：验证 template 引用实体的有效性，按模板形态展开 delta。
 *
 * - 有 stages 的模板（剧情）：创建 StorylineState，展开 stage 0 的子 quest
 * - 无 stages 的模板（普通任务）：直接发 QuestChange:accept
 *
 * 调用方负责将返回的 delta 传给 applyDelta。
 */
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

  // 去重检查
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

  // Stale reference 验证
  const warnings: string[] = [];
  const invalidatedQuestIds = new Set<string>();

  if (template.stages) {
    for (const stage of template.stages) {
      for (const qid of stage.questIds) {
        if (invalidatedQuestIds.has(qid)) continue;

        const subQuest = pool.questTemplates.find((t) => t.id === qid);
        if (!subQuest) {
          invalidatedQuestIds.add(qid);
          warnings.push(`子任务 ${qid} 模板不存在`);
          continue;
        }

        const allObjectivesInvalid = subQuest.objectives.every(
          (obj) => !isObjectiveReachable(world, obj),
        );
        if (allObjectivesInvalid && subQuest.objectives.length > 0) {
          invalidatedQuestIds.add(qid);
          warnings.push(`子任务 ${qid} 的所有目标已不可达`);
        }
      }
    }
  } else {
    const allInvalid = template.objectives.every((obj) => !isObjectiveReachable(world, obj));
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
    const validStage0QuestIds = stage0.questIds.filter((qid) => !invalidatedQuestIds.has(qid));

    player.activeStorylines.push({
      storylineId: templateId,
      currentStage: 0,
      activeQuestIdsOfCurrentStage: validStage0QuestIds,
      startedAt: world.time.tick,
    });

    for (const qid of validStage0QuestIds) {
      delta.questChanges?.push({ type: "accept", playerId, templateId: qid });
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

// ─── 内部函数 ─────────────────────────────────────────

function checkObjective(
  world: WorldState,
  player: PlayerEntity,
  obj: QuestObjective,
  _previousCount: number,
): number {
  switch (obj.type) {
    case "explore":
      return player.knownRooms.includes(obj.targetId) || player.roomId === obj.targetId ? 1 : 0;
    case "collect": {
      const count = player.inventory.filter(
        (i) => i.id === obj.targetId || i.id.startsWith(`${obj.targetId}_`),
      ).length;
      return count;
    }
    case "talk": {
      const hasTalked = player.memories.some(
        (m) =>
          m.type === "conversation" &&
          m.entityIds?.includes(obj.targetId) &&
          m.tick > world.tick - 100,
      );
      return hasTalked ? 1 : 0;
    }
    case "deliver": {
      const npc = world.entities.get(obj.targetId);
      if (npc?.type !== "npc") return 0;
      return player.roomId === npc.roomId ? 1 : 0;
    }
    case "fetch": {
      const count = player.inventory.filter(
        (i) => i.id === obj.targetId || i.id.startsWith(`${obj.targetId}_`),
      ).length;
      return count;
    }
    default:
      return 0;
  }
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
  action?: string,
  targetId?: EntityId,
): number {
  switch (obj.type) {
    case "collect":
    case "fetch": {
      // 1. 直接查背包（exchange_item give 方向已直接写入 inventory）
      const inInventory = player.inventory.filter(
        (i) => i.id === obj.targetId || i.id.startsWith(`${obj.targetId}_`),
      ).length;
      if (inInventory > 0) return inInventory;

      // 2. 检查 delta 中的 item_exchange 事件（receive 方向：玩家把物品给了 NPC）
      //    物品已离开背包，但事件记录了这次交付
      for (const event of delta.worldEvents ?? []) {
        if (event.type !== "item_exchange") continue;
        const data = event.data as {
          direction?: string;
          item?: string;
          itemId?: string;
          transferred?: boolean;
        };
        if (data.direction !== "receive" || !data.transferred) continue;
        // 优先用 itemId 精确匹配，兜底用 display name 匹配
        if (
          data.itemId &&
          (data.itemId === obj.targetId || data.itemId.startsWith(`${obj.targetId}_`))
        ) {
          return 1;
        }
        if (
          !data.itemId &&
          data.item &&
          (obj.description.includes(data.item) ||
            data.item.includes(obj.description.replace(/^(获得|持有|收集)/, "")))
        ) {
          return 1;
        }
      }
      return 0;
    }

    case "talk": {
      // 当前行为就是 talk 到目标 NPC
      if (action === "talk" && targetId === obj.targetId) return 1;
      return 0;
    }

    case "explore": {
      if (player.roomId === obj.targetId || player.knownRooms.includes(obj.targetId)) {
        return 1;
      }
      if (delta.revealRooms?.some((r) => r.roomId === obj.targetId)) {
        return 1;
      }
      return 0;
    }

    case "deliver": {
      const npc = world.entities.get(obj.targetId);
      if (npc?.type !== "npc") return 0;
      return player.roomId === npc.roomId ? 1 : 0;
    }

    default:
      return 0;
  }
}

function isObjectiveReachable(world: WorldState, obj: QuestObjective): boolean {
  switch (obj.type) {
    case "talk":
    case "deliver": {
      const entity = world.entities.get(obj.targetId);
      return entity?.type === "npc";
    }
    case "explore": {
      return world.rooms.has(obj.targetId);
    }
    case "collect":
    case "fetch":
      return true;
    default:
      return true;
  }
}
