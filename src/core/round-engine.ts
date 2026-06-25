import { executeCombatPulse, resolveCombatConsequences } from "../combat/pulse.ts";
import { executeEntityAction } from "../engine/act-loop.ts";
import {
  type CommandResult,
  checkFeasibility,
  executeCommand as engineExecute,
  resolveActionDuration,
} from "../engine/command-executor.ts";
import { deltaToEvents } from "../engine/delta-composer.ts";
import { checkQuestProgress, evaluateQuestImpacts } from "../engine/quest-tracker.ts";
import type { DialogueGenerator } from "../llm/dialogue-generator.ts";
import type { InteractionDispatcher } from "../llm/dispatcher.ts";
import { generateTravelogueEntry } from "../llm/travelogue-generator.ts";
import { logWrite } from "../shared/log.ts";
import { applyContentPoolMutation } from "../simulation/content-pool-materializer.ts";
import { materialize } from "../simulation/materializer.ts";
import { checkStageCompletion, checkTrigger } from "../simulation/storyline-engine.ts";
import type { EventBus } from "./event-bus.ts";
/**
 * Round Engine — 回合调度核心
 *
 * 玩家交互通过 act-loop:
 *   engineExecute → act-loop(ripple + compose + apply + 记忆) → 日志
 *
 * 此文件中的函数只读 ContentPool，不在代码中硬编码内容数据。
 *
 * ✅ ContentPool 应该包含的数据:
 *   - 行为标签/名称映射 (action → display label)
 *   - 性格/情绪标签 (trait/emotion → display name)
 *   - 阈值/乘数配置
 *   - 叙事模板字符串
 *
 * ✅ 代码中可以硬编码的内容:
 *   - 命令路由 (action === "talk")
 *   - 数学公式 (clamp, linear interpolation)
 *   - 逻辑常量 (Math.PI, 方向数组)
 */
import type {
  DailyReport,
  EntityId,
  NPCEntity,
  PlayerEntity,
  SimulationDelta,
  WorldState,
} from "./types.ts";
import {
  advanceDay,
  advanceTime,
  applyDelta,
  formatDate,
  getEntity,
  logEvent,
  refreshDailyEnvironment,
} from "./world.ts";

export interface SimulationEngine {
  runDay(world: WorldState, playerActions: unknown[]): SimulationDelta;
}

export interface RoundCallbacks {
  onReportReady: (reports: Map<EntityId, DailyReport>) => void;
  onRoundStart: (round: number) => void;
  onActionResult: (playerId: EntityId, event: { type: string; description: string }) => void;
  onSettlementStarted: () => void;
  getPlayerIds: () => EntityId[];
}

interface DateSnapshot {
  day: number;
  month: number;
  year: number;
}

function captureDate(world: WorldState): DateSnapshot {
  return {
    day: world.time.day,
    month: world.time.month,
    year: world.time.year,
  };
}

function dateChanged(world: WorldState, before: DateSnapshot): boolean {
  return (
    world.time.day !== before.day ||
    world.time.month !== before.month ||
    world.time.year !== before.year
  );
}

export class RoundEngine {
  private world: WorldState;
  private eventBus: EventBus;
  private dispatcher: InteractionDispatcher;
  private simulation: SimulationEngine;
  private dialogueGenerator?: DialogueGenerator;
  private actionBuffer: unknown[] = [];
  private endedPlayers = new Set<EntityId>();
  private running = false;
  private dateAdvancedByAction = false;

  constructor(
    world: WorldState,
    eventBus: EventBus,
    dispatcher: InteractionDispatcher,
    simulation: SimulationEngine,
  ) {
    this.world = world;
    this.eventBus = eventBus;
    this.dispatcher = dispatcher;
    this.simulation = simulation;
  }

  setDialogueGenerator(generator: DialogueGenerator): void {
    this.dialogueGenerator = generator;
  }

  // --- 即时命令执行 ---

  // TODO: 移除此方法 — 旧文本协议入口，已被 executeStructuredCommand 替代
  // 仅测试使用，ws-server 已改用 executeStructuredCommand
  async executeCommand(playerId: EntityId, rawText: string): Promise<CommandResult> {
    // Check if this is the "end day" command
    const endingCmds = this.world.contentPool.narrativeTemplates.endingCommands;
    if (endingCmds.some((cmd) => rawText.includes(cmd))) {
      this.endedPlayers.add(playerId);
      return {
        events: [{ type: "end_day", description: "你决定结束这一天。" }],
        delta: {},
        ended: true,
      };
    }

    // Parse raw text to structured command (legacy support)
    const parsed = this.parseRawText(playerId, rawText);
    return this.executeStructuredCommand(playerId, parsed.action, parsed.params);
  }

  // 结构化命令执行 (新协议入口)
  // Act Loop: 预览 → 产生交互 → act-loop（ripple + compose + apply + 记忆）→ 日志
  async executeStructuredCommand(
    playerId: EntityId,
    action: string,
    params: Record<string, unknown>,
  ): Promise<CommandResult> {
    // 已结束的玩家不能再行动
    if (this.endedPlayers.has(playerId)) {
      return {
        events: [{ type: "system", description: "今天已经结束，等待结算。" }],
        ended: true,
        delta: {},
      };
    }

    // === Step 0: 可行性检查（无副作用，仅预览）===
    const feasibility = checkFeasibility(this.world, playerId, action, params);
    if (!feasibility.feasible) {
      const reasons = feasibility.blockers.map((b) => b.reason).join("；");
      return {
        events: [{ type: "error", description: reasons }],
        delta: {},
        ended: false,
      };
    }

    // === Step 1: 产生交互 ===
    const entity = getEntity(this.world, playerId);
    const roomId = entity?.roomId ?? undefined;
    const actionDurationMinutes = resolveActionDuration(this.world, playerId, action, params);
    const dateBeforeAction = captureDate(this.world);
    const result = engineExecute(this.world, playerId, action, params);

    // 手动结束当天
    if (result.ended) {
      this.endedPlayers.add(playerId);
      return result;
    }

    // === Step 1.5: LLM 效果 (对话回复) ===
    let llmDelta: SimulationDelta | undefined;
    let chatSubOptions: import("../shared/protocol.ts").DialogueOption[] | undefined;
    let tradeSubOptions: import("../shared/protocol.ts").TradeOption[] | undefined;
    if (action === "talk" && params.optionId && this.dialogueGenerator) {
      const optionType = String(
        params.optionType ?? "idle_chat",
      ) as import("../shared/protocol.ts").DialogueOptionType;
      const npcId = String(params.npcId);
      logWrite(
        "srv",
        "dbg",
        `[round-engine] talk optionType=${optionType} optionId=${String(params.optionId)} npcId=${npcId}`,
      );
      const result = await this.dialogueGenerator.handleChatOption(
        this.world,
        playerId,
        npcId,
        optionType,
        String(params.optionId),
        params.optionLabel ? String(params.optionLabel) : undefined,
      );
      llmDelta = result.delta;
      chatSubOptions = result.subOptions;
    } else if (action === "trade" && params.npcId && this.dialogueGenerator) {
      const npcId = String(params.npcId);
      const tradeAction = String(params.action) as "buy" | "sell";
      const itemId = String(params.itemId);
      logWrite(
        "srv",
        "dbg",
        `[round-engine] trade action=${tradeAction} itemId=${itemId} npcId=${npcId}`,
      );
      const result = await this.dialogueGenerator.handleTradeAction(
        this.world,
        playerId,
        npcId,
        tradeAction,
        itemId,
      );
      llmDelta = result.delta;
      tradeSubOptions = result.tradeSubOptions;
    }

    // === Step 2-5: Act Loop (ripple + compose + apply + 记忆) ===
    const loopResult = executeEntityAction({
      world: this.world,
      actorId: playerId,
      action,
      actionDelta: result.delta,
      actionEvents: result.events,
      options: {
        targetId: extractTargetId(params),
        roomId,
        llmDelta,
      },
    });

    // 用 loop 结果替换 result 的 events（包含原始 events + delta events）
    result.events = loopResult.events;

    // 战斗后效检查（HP 虚弱 + 精精力耗尽）
    const consResult = resolveCombatConsequences(
      this.world,
      loopResult.delta.combatHpChanges ?? [],
      loopResult.delta.needChanges ?? [],
      this.world.contentPool.combatConfig,
    );
    result.events.push(...consResult.events);

    // 记录事件到世界日志
    const scope = roomId ?? "global";
    for (const event of result.events) {
      logEvent(this.world, {
        id: `${event.type}_${playerId}_${this.world.tick}`,
        type: event.type,
        title: event.type,
        description: event.description,
        scope,
        tick: this.world.tick,
        source: "player",
        data: { actorId: playerId },
      });
    }

    // 任务进度评估
    const questDelta = evaluateQuestImpacts(this.world, playerId, loopResult.delta);
    if (questDelta) {
      applyDelta(this.world, questDelta);
      const needLabel = (nt: string) => this.world.contentPool.needLabels[nt] ?? nt;
      const questEvents = deltaToEvents(
        questDelta,
        (id: EntityId) => this.world.entities.get(id)?.name ?? id,
        playerId,
        needLabel,
        this.world.contentPool.narrativeTemplates.settlementMessages,
      );
      result.events.push(...questEvents);
    }

    // 剧情阶段推进检查
    const storylineDelta = checkStageCompletion(this.world, playerId);
    if (storylineDelta) {
      applyDelta(this.world, storylineDelta);
    }

    // 检查自动结束 (虚弱/体力耗尽)
    if (entity && "needs" in entity) {
      const npcEntity = entity as NPCEntity;
      const restNeed = npcEntity.needs.find((n) => n.type === "rest");

      // 虚弱者（含精力耗尽导致的虚弱）→ 立即结束
      if ("combatState" in npcEntity && npcEntity.combatState.isIncapacitated) {
        this.endedPlayers.add(playerId);
        result.ended = true;
      }

      if (restNeed && restNeed.value <= 10) {
        // 兜底清理战斗状态
        if ("combatState" in npcEntity) {
          npcEntity.combatState.combatTarget = null;
          npcEntity.combatState.isDefending = false;
        }
        this.endedPlayers.add(playerId);
        result.events.push({
          type: "end_day",
          description: "你已筋疲力尽，无法继续行动。一天结束了。",
        });
        result.ended = true;
      }
    }

    // 对话子菜单：_menu 类型返回时，将子选项直接附在 result 中
    if (chatSubOptions && chatSubOptions.length > 0) {
      result.chatSubOptions = chatSubOptions;
      result.needsChatOptions = { npcId: String(params.npcId), npcName: "" };
    }

    // 交易子选项
    if (tradeSubOptions && tradeSubOptions.length > 0) {
      result.tradeSubOptions = tradeSubOptions;
      result.needsTradeOptions = { npcId: String(params.npcId), npcName: "" };
    }

    this.advanceTimeForAction(playerId, result, actionDurationMinutes, dateBeforeAction);

    return result;
  }

  // --- 回合结算 ---

  async settleDay(callbacks: RoundCallbacks): Promise<void> {
    callbacks.onSettlementStarted();

    // Run NPC simulation
    const simDelta = this.simulation.runDay(this.world, this.actionBuffer);
    applyDelta(this.world, simDelta);

    // Combat pulse (NPC vs NPC 互击，shouldPulse 自守卫)
    try {
      const combatResult = executeCombatPulse(this.world, this.world.contentPool.combatConfig);
      for (const delta of combatResult.deltas) {
        applyDelta(this.world, delta);
      }
      // 战斗后效检查（HP 虚弱 + 精力耗尽）
      const allHpChanges = combatResult.deltas.flatMap((d) => d.combatHpChanges ?? []);
      const allNeedChanges = combatResult.deltas.flatMap((d) => d.needChanges ?? []);
      resolveCombatConsequences(
        this.world,
        allHpChanges,
        allNeedChanges,
        this.world.contentPool.combatConfig,
      );
    } catch (err) {
      console.error("[RoundEngine] settleDay combat pulse failed:", err);
    }

    // LLM batch processing
    try {
      const batchResult = await this.dispatcher.runSettlementBatch(this.world, simDelta);
      for (const delta of batchResult.deltas) {
        applyDelta(this.world, delta);
      }
      for (const mutation of batchResult.worldMutations) {
        materialize(this.world, mutation);
      }
      for (const cpMutation of batchResult.contentPoolMutations) {
        applyContentPoolMutation(this.world.contentPool, cpMutation, this.world.poolDir);
      }
    } catch (err) {
      console.error("[RoundEngine] settleDay LLM batch failed:", err);
    }

    // 任务进度检查（全玩家扫描）
    const questDelta = checkQuestProgress(this.world);
    if (questDelta) {
      applyDelta(this.world, questDelta);
    }

    // 剧情触发 + 阶段推进（全玩家）
    for (const [, entity] of this.world.entities) {
      if (entity.type !== "player") continue;
      const playerId = entity.id;
      const triggerDelta = checkTrigger(this.world, playerId);
      if (triggerDelta) applyDelta(this.world, triggerDelta);
      const stageDelta = checkStageCompletion(this.world, playerId);
      if (stageDelta) applyDelta(this.world, stageDelta);
    }

    // 生成游记 (在 advanceDay 之前，因为游记记录的是刚结束的这一天)
    const playerIds = callbacks.getPlayerIds();
    for (const playerId of playerIds) {
      try {
        const player = getEntity(this.world, playerId);
        if (player?.type !== "player") continue;
        const entry = await generateTravelogueEntry(
          this.world,
          playerId,
          this.dispatcher.getSettlementAdapter() ?? this.dispatcher.getAdapter(),
        );
        if (entry) {
          (player as PlayerEntity).travelogue.push(entry);
        }
      } catch (err) {
        console.error(`[RoundEngine] travelogue generation failed for ${playerId}:`, err);
      }
    }

    // Advance to next day, unless player-driven time already crossed into it.
    if (this.dateAdvancedByAction) {
      refreshDailyEnvironment(this.world);
    } else {
      advanceDay(this.world);
    }
    this.world.round++;

    // Generate reports for all players
    const reports = await this.generateReports(playerIds);
    callbacks.onReportReady(reports);

    // Reset for next day
    this.actionBuffer = [];
    this.endedPlayers.clear();
    this.dateAdvancedByAction = false;
  }

  private advanceTimeForAction(
    playerId: EntityId,
    result: CommandResult,
    durationMinutes: number,
    dateBeforeAction: DateSnapshot,
  ): void {
    if (durationMinutes <= 0) return;
    if (result.events.some((event) => event.type === "error")) return;
    advanceTime(this.world, durationMinutes);
    if (dateChanged(this.world, dateBeforeAction)) {
      this.dateAdvancedByAction = true;
      this.endedPlayers.add(playerId);
      result.ended = true;
    }
  }

  // --- 游戏主循环 ---

  async startLoop(callbacks: RoundCallbacks): Promise<void> {
    this.running = true;

    while (this.running) {
      const playerIds = callbacks.getPlayerIds();
      if (playerIds.length === 0) {
        await sleep(1000);
        continue;
      }

      callbacks.onRoundStart(this.world.round + 1);

      // Wait for all players to end (no timeout — player controls the pace)
      this.endedPlayers.clear();
      while (this.running && !this.allPlayersEnded(playerIds)) {
        await sleep(500);
      }

      // Settle the day
      await this.settleDay(callbacks);
    }
  }

  private allPlayersEnded(playerIds: EntityId[]): boolean {
    return playerIds.length > 0 && playerIds.every((id) => this.endedPlayers.has(id));
  }

  stop(): void {
    this.running = false;
  }

  // --- 命令解析 (关键词降级，临时兼容旧协议) ---

  private parseRawText(
    playerId: EntityId,
    rawText: string,
  ): { action: string; params: Record<string, unknown> } {
    const text = rawText;
    const t = this.world.contentPool.narrativeTemplates;

    // NPC interaction: use pattern from ContentPool
    const chatRegex = new RegExp(t.chatPattern);
    const chatMatch = text.match(chatRegex);
    if (chatMatch) {
      const npcName = chatMatch[2];
      const entity = getEntity(this.world, playerId);
      const currentRoom = entity?.roomId ? this.world.rooms.get(entity.roomId) : null;
      const npcs = currentRoom
        ? Array.from(currentRoom.entities)
            .map((eid) => this.world.entities.get(eid))
            .filter((e): e is NonNullable<typeof e> => !!e)
        : [];
      const npc = npcs.find((n) => n.name.includes(npcName));

      if (npc) {
        return { action: "talk", params: { npcId: npc.id, topic: text } };
      }
      return { action: "wait", params: { raw: t.npcNotFound.replace("{npcName}", npcName) } };
    }

    // Movement by direction (from ContentPool)
    const dirNames = t.directionNames;
    const entity = getEntity(this.world, playerId);
    const currentRoom = entity?.roomId ? this.world.rooms.get(entity.roomId) : null;

    for (const [dir] of Object.entries(dirNames)) {
      if (text.includes(dir)) {
        const direction = dirNames[dir];
        const exit = currentRoom?.exits.get(dir);
        if (exit && !exit.hidden) {
          return { action: "move", params: { direction } };
        }
        return { action: "wait", params: { raw: `${dir}方向没有出口` } };
      }
    }

    // Movement by room keywords
    for (const [roomId, room] of this.world.rooms) {
      if ([room.name].some((kw) => text.includes(kw))) {
        if (roomId !== entity?.roomId) {
          return { action: "move", params: { direction: room.name } };
        }
      }
    }

    // Default wait
    return { action: "wait", params: { raw: text } };
  }

  // --- 日报生成 ---

  private async generateReports(playerIds: EntityId[]): Promise<Map<EntityId, DailyReport>> {
    const reports = new Map<EntityId, DailyReport>();
    const t = this.world.contentPool.narrativeTemplates;

    for (const playerId of playerIds) {
      const entity = getEntity(this.world, playerId);
      if (!entity) continue;

      const visibleEvents = this.world.eventLog
        .filter(
          (e) => e.scope === "global" || e.scope === entity.roomId || e.data?.actorId === playerId,
        )
        .slice(-15);

      // Generate summary via LLM, fall back to simple join
      let summary = t.emptyDaySummary;
      if (visibleEvents.length > 0) {
        try {
          const eventTexts = visibleEvents.map((e) => e.description);
          const result = await (
            this.dispatcher.getSettlementAdapter() ?? this.dispatcher.getAdapter()
          ).chat(
            "你是日报汇总引擎。将以下事件列表总结为一段简洁的日报。用第三人称，3-5句话，概括当天的主要事件。直接输出文本。",
            `${entity.name}今天经历了以下事件:\n${eventTexts.map((t, i) => `${i + 1}. ${t}`).join("\n")}`,
            undefined,
            undefined,
            "day-summary",
          );
          summary = result.text.trim() || visibleEvents.map((e) => e.description).join("\n\n");
        } catch {
          summary = visibleEvents.map((e) => e.description).join("\n\n");
        }
      }

      reports.set(playerId, {
        playerId,
        round: this.world.round,
        date: formatDate(this.world.time, { calendar: this.world.contentPool.calendar }),
        summary,
        statusChanges: [],
        encounters: [],
        worldNews: visibleEvents.map((e) => `[${e.scope}] ${e.title}`),
        availableLocations: [],
        notableNPCs: [],
        travelogue:
          entity.type === "player" ? (entity as PlayerEntity).travelogue.at(-1) : undefined,
      });
    }

    return reports;
  }

  getWorld(): WorldState {
    return this.world;
  }
  getEventBus(): EventBus {
    return this.eventBus;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractTargetId(params: Record<string, unknown>): string | undefined {
  return (params.npcId as string) ?? (params.targetId as string) ?? undefined;
}
