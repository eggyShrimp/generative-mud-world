/**
 * Dialogue Generator — 生成交互菜单和 NPC 回复
 *
 * 菜单生成: 系统入口确定性，闲聊入口由 LLM 基于 ContentPool.conversationDirections 包装。
 * 对话回复: LLM 只做定性分类 (tool_calls)，数值映射从 ContentPool.dialogueEffectMapping 查表。
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

import type { SaveManager } from "../core/save-manager.ts";
import type {
  Entity,
  EntityId,
  NPCEntity,
  PlayerEntity,
  SimulationDelta,
  WorldState,
} from "../core/types.ts";
import { logWrite } from "../shared/log.ts";
import type { DialogueOption, DialogueOptionType, TradeOption } from "../shared/protocol.ts";
import type { LLMAdapter } from "./adapter.ts";
import { buildContext, type DialogueContext } from "./dialogue/context-builders.ts";
import { scheduleConversationSummary as scheduleConvSummaryFn } from "./dialogue/conversation-history.ts";
import { generateConversationDirectionOptions } from "./dialogue/conversation-menu.ts";
import { generateFixedChatMenu } from "./dialogue/fixed-menu.ts";
import {
  buildFollowUpOptions as buildFollowUpOptionsFn,
  getPostSelectOptions,
} from "./dialogue/follow-up.ts";
import { executeFunctional, getFunctionalSubOptions } from "./dialogue/functional-dialogue.ts";
import { type ConversationEntry, isNpc, type PendingQuestMenu } from "./dialogue/helpers.ts";
import { generateIdleChatReply } from "./dialogue/idle-chat.ts";
import {
  getFallbackDelta,
  getQuestTemplate,
  getTradeSubOptions,
} from "./dialogue/internal-helpers.ts";
import { generateMenuTransitionDelta } from "./dialogue/menu-transition.ts";
import { buildFollowUpOptionsPrompt, parseFollowUpOptions } from "./dialogue/prompt-builders.ts";
import {
  clearPendingQuestMenu,
  executeQuestDeliver,
  executeQuestTrigger,
  getEligibleQuestTriggers,
  getQuestDeliverSubOptions,
  handleQuestDefer,
  handleQuestTalkMenu,
  handleQuestTriggerMenu,
  injectQuestOptions,
  limitTaskSceneOptions,
} from "./dialogue/quest-dialogue.ts";
import { executeSellTrade, executeTrade } from "./dialogue/trade.ts";

export type { DialogueOption, DialogueOptionType, TradeOption };

/**
 * 对话生成器 — 固定菜单 + type-based 路由
 *
 * generateMenu(): 生成系统入口 + 沉浸式闲聊入口
 * handleOption(): 根据选项类型路由到对应 handler
 *
 * 对话回复通过 tool calling 描述副作用（关系/需求/信息/情绪），
 * 数值由 ContentPool.dialogueEffectMapping 决定，LLM 只做定性分类。
 */
export class DialogueGenerator {
  private adapter: LLMAdapter;
  private saveManager: SaveManager;
  private conversationHistories: Map<string, ConversationEntry[]> = new Map();
  private pendingQuestMenu: Map<string, PendingQuestMenu> = new Map();

  constructor(adapter: LLMAdapter, saveManager: SaveManager) {
    this.adapter = adapter;
    this.saveManager = saveManager;
  }

  /**
   * 生成对话菜单（对话Tab用）：系统入口确定性，闲聊方向由 LLM 包装，quest 叙事注入。
   */
  async generateChatMenu(
    world: WorldState,
    playerId: EntityId,
    npcId: EntityId,
  ): Promise<DialogueOption[]> {
    const baseOptions = this.generateFixedChatMenu(world, playerId, npcId);
    const player = world.entities.get(playerId);
    const npc = world.entities.get(npcId);
    if (!player || !isNpc(npc)) return baseOptions;

    // 构建 quest 方向：注入 LLM 对话方向中，生成叙事包装
    const questDirections: Array<{ key: string; instruction: string }> = [];
    const eligibleQuestTriggers = this.getEligibleQuestTriggers(world, player as PlayerEntity, npc);
    for (const t of eligibleQuestTriggers) {
      questDirections.push({
        key: `quest_trigger__${t.id}`,
        instruction: `提及关于"${t.title}"的委托`,
      });
    }
    const completableQuests = (player as PlayerEntity).activeQuests.filter((q) => {
      if (q.status !== "active") return false;
      const template = this.getQuestTemplate(world, q.templateId);
      return template?.giverNpcId === npcId && q.groupCompleted.every(Boolean);
    });
    for (const q of completableQuests) {
      const template = this.getQuestTemplate(world, q.templateId);
      questDirections.push({
        key: `quest_deliver__${q.templateId}`,
        instruction: `告知关于"${template?.title ?? q.templateId}"的任务完成情况`,
      });
    }

    const chatOptions = await this.generateConversationDirectionOptions(
      world,
      player as PlayerEntity,
      npc,
      questDirections.length > 0 ? questDirections : undefined,
    );
    if (questDirections.length > 0) {
      return this.limitTaskSceneOptions(baseOptions, chatOptions);
    }
    return [...baseOptions, ...chatOptions];
  }

  /**
   * 生成交易菜单（交易Tab用）：NPC 商品 + 卖出入口。
   */
  generateTradeMenu(world: WorldState, playerId: EntityId, npcId: EntityId): TradeOption[] {
    const player = world.entities.get(playerId);
    const npc = world.entities.get(npcId);
    if (!player || !isNpc(npc)) return [];
    return this.getTradeSubOptions(npc, world, player as PlayerEntity);
  }

  /**
   * 根据玩家选中的对话文本生成追问选项。
   * 返回 3-5 个 idle_chat 类型的 DialogueOption，解析失败时返回空列表。
   */
  async generateFollowUpOptions(
    world: WorldState,
    playerId: EntityId,
    npcId: EntityId,
    context: string,
  ): Promise<DialogueOption[]> {
    const player = world.entities.get(playerId);
    const npc = world.entities.get(npcId);
    if (!player || !isNpc(npc)) return [];

    const trimmed = context.trim();
    if (!trimmed) return [];

    const ctx = this.buildContext(world, player, npc);
    const convRel = ctx.relationshipLevel;

    const prompt = this.buildFollowUpOptionsPrompt(ctx, trimmed, convRel);

    try {
      const response = await this.adapter.chat(
        prompt.system,
        prompt.user,
        undefined,
        undefined,
        "dialogue-follow-up-options",
        false,
      );
      const options = this.parseFollowUpOptions(response.text);
      return options;
    } catch {
      return [];
    }
  }

  /**
   * 确定性生成系统入口（不调用 LLM）
   *
   * 每项有可用性条件：
   * - quest_trigger: 存在该 NPC 的 player_action storyline 且玩家未完成（叙事包装，tag: quest）
   * - quest_deliver: 玩家有来自此 NPC 的 activeQuest 且 objectives 全部完成（叙事包装，tag: quest）
   * - functional: NPC tags 匹配 entityActionsByTag
   */
  generateFixedChatMenu(world: WorldState, playerId: EntityId, npcId: EntityId): DialogueOption[] {
    return generateFixedChatMenu(world, playerId, npcId);
  }

  private async generateConversationDirectionOptions(
    world: WorldState,
    player: PlayerEntity,
    npc: NPCEntity,
    extraDirections?: Array<{ key: string; instruction: string }>,
  ): Promise<DialogueOption[]> {
    return generateConversationDirectionOptions(this.adapter, world, player, npc, extraDirections);
  }

  /**
   * 根据选项类型路由到对应 handler
   *
   * _menu 类型 → 返回子菜单
   * _select 类型 → 执行确定性逻辑 + LLM 生成对话文本
   * idle_chat → LLM 生成自由对话 + 连续对话选项
   */
  async handleChatOption(
    world: WorldState,
    playerId: EntityId,
    npcId: EntityId,
    optionType: DialogueOptionType,
    optionId: string,
    playerMessage?: string,
  ): Promise<{ delta: SimulationDelta; subOptions?: DialogueOption[] }> {
    const player = world.entities.get(playerId);
    const npc = world.entities.get(npcId);
    if (!player || !isNpc(npc)) {
      logWrite(
        "srv",
        "dbg",
        `[handleChatOption] player or npc not found playerId=${playerId} npcId=${npcId}`,
      );
      return { delta: {} };
    }

    logWrite("srv", "dbg", `[handleChatOption] type=${optionType} id=${optionId} npc=${npc.name}`);

    switch (optionType) {
      case "quest_trigger_menu":
        return this.handleQuestTriggerMenu(world, player as PlayerEntity, npc, optionId);

      case "quest_trigger_select":
        this.clearPendingQuestMenu(playerId, npcId);
        return {
          delta: await this.executeQuestTrigger(world, playerId, npc, optionId),
          subOptions: this.getPostSelectOptions(world),
        };

      case "quest_defer":
        return this.handleQuestDefer(world, player as PlayerEntity, npc, optionId);

      case "quest_deliver_menu":
        return {
          delta: await this.generateMenuTransitionDelta(world, npc, playerMessage, "quest_deliver"),
          subOptions: this.getQuestDeliverSubOptions(world, player as PlayerEntity, npc),
        };

      case "quest_deliver_select":
        return {
          delta: await this.executeQuestDeliver(world, playerId, npc, optionId),
          subOptions: this.getPostSelectOptions(world),
        };

      case "quest_talk_menu":
        return this.handleQuestTalkMenu(world, player as PlayerEntity, npc, optionId);

      case "functional_menu":
        return {
          delta: await this.generateMenuTransitionDelta(world, npc, playerMessage, "functional"),
          subOptions: this.getFunctionalSubOptions(world, npc),
        };

      case "functional_select":
        return {
          delta: await this.executeFunctional(world, player as PlayerEntity, npc, optionId),
          subOptions: this.getPostSelectOptions(world),
        };

      case "idle_chat": {
        const { delta, followUpTopics } = await this.generateIdleChatReply(
          world,
          player as PlayerEntity,
          npc,
          playerMessage,
        );
        if (optionId !== "chat:goodbye") {
          return {
            delta,
            subOptions: this.injectQuestOptions(
              playerId,
              npcId,
              this.buildFollowUpOptions(followUpTopics, world, player as PlayerEntity, npc),
            ),
          };
        }
        this.clearPendingQuestMenu(playerId, npcId);
        this.scheduleConversationSummary(world, playerId, npcId);
        return { delta };
      }

      case "close":
        this.clearPendingQuestMenu(playerId, npcId);
        this.scheduleConversationSummary(world, playerId, npcId);
        return {
          delta: {
            dialogues: [
              {
                speakerId: npcId,
                content:
                  world.contentPool.narrativeTemplates.questMessages.goodbyeNarrative.replace(
                    "{npcName}",
                    npc.name,
                  ),
                roomId: player.roomId ?? "",
                tick: world.tick,
              },
            ],
          },
        };

      default:
        return { delta: this.getFallbackDelta(playerId, npcId, player.roomId ?? undefined) };
    }
  }

  /**
   * 处理交易动作（交易Tab用）
   */
  async handleTradeAction(
    world: WorldState,
    playerId: EntityId,
    npcId: EntityId,
    action: "buy" | "sell",
    itemId: string,
  ): Promise<{ delta: SimulationDelta; tradeSubOptions?: TradeOption[] }> {
    const player = world.entities.get(playerId);
    const npc = world.entities.get(npcId);
    if (!player || !isNpc(npc)) {
      logWrite(
        "srv",
        "dbg",
        `[handleTradeAction] player or npc not found playerId=${playerId} npcId=${npcId}`,
      );
      return { delta: {} };
    }

    logWrite("srv", "dbg", `[handleTradeAction] action=${action} itemId=${itemId} npc=${npc.name}`);

    if (action === "buy") {
      return { delta: await this.executeTrade(world, player as PlayerEntity, npc, itemId) };
    }
    if (action === "sell") {
      return { delta: await this.executeSellTrade(world, player as PlayerEntity, npc, itemId) };
    }

    return { delta: {} };
  }

  private getEligibleQuestTriggers(world: WorldState, player: PlayerEntity, npc: NPCEntity) {
    return getEligibleQuestTriggers(world, player, npc);
  }

  // --- Sub-option builders ---

  private getTradeSubOptions(
    npc: NPCEntity,
    world: WorldState,
    player: PlayerEntity,
  ): TradeOption[] {
    return getTradeSubOptions(npc, world, player);
  }

  private getQuestDeliverSubOptions(
    world: WorldState,
    player: PlayerEntity,
    npc: NPCEntity,
  ): DialogueOption[] {
    return getQuestDeliverSubOptions(world, player, npc);
  }

  private getFunctionalSubOptions(world: WorldState, npc: NPCEntity): DialogueOption[] {
    return getFunctionalSubOptions(world, npc);
  }

  private limitTaskSceneOptions(
    baseOptions: DialogueOption[],
    chatOptions: DialogueOption[],
  ): DialogueOption[] {
    return limitTaskSceneOptions(baseOptions, chatOptions);
  }

  private async handleQuestTriggerMenu(
    world: WorldState,
    player: PlayerEntity,
    npc: NPCEntity,
    optionId: string,
  ): Promise<{ delta: SimulationDelta; subOptions?: DialogueOption[] }> {
    const result = await handleQuestTriggerMenu(
      this.adapter,
      world,
      player,
      npc,
      optionId,
      this.pendingQuestMenu,
    );
    this.pendingQuestMenu = result.pending;
    return { delta: result.delta, subOptions: result.subOptions };
  }

  private async handleQuestDefer(
    world: WorldState,
    player: PlayerEntity,
    npc: NPCEntity,
    _optionId: string,
  ): Promise<{ delta: SimulationDelta; subOptions?: DialogueOption[] }> {
    const result = await handleQuestDefer(world, player, npc, _optionId, this.pendingQuestMenu);
    this.pendingQuestMenu = result.pending;
    return { delta: result.delta, subOptions: result.subOptions };
  }

  private async handleQuestTalkMenu(
    world: WorldState,
    player: PlayerEntity,
    npc: NPCEntity,
    optionId: string,
  ): Promise<{ delta: SimulationDelta; subOptions?: DialogueOption[] }> {
    return handleQuestTalkMenu(this.adapter, world, player, npc, optionId);
  }

  private injectQuestOptions(
    playerId: EntityId,
    npcId: EntityId,
    baseOptions: DialogueOption[],
  ): DialogueOption[] {
    return injectQuestOptions(playerId, npcId, baseOptions, this.pendingQuestMenu);
  }

  private clearPendingQuestMenu(playerId: EntityId, npcId: EntityId): void {
    this.pendingQuestMenu = clearPendingQuestMenu(playerId, npcId, this.pendingQuestMenu);
  }

  // --- Action executors ---

  private async executeTrade(
    world: WorldState,
    player: PlayerEntity,
    npc: NPCEntity,
    itemId: string,
  ): Promise<SimulationDelta> {
    return executeTrade(this.adapter, world, player, npc, itemId);
  }

  private async executeSellTrade(
    world: WorldState,
    player: PlayerEntity,
    npc: NPCEntity,
    itemId: string,
  ): Promise<SimulationDelta> {
    return executeSellTrade(this.adapter, world, player, npc, itemId);
  }

  private async executeQuestTrigger(
    world: WorldState,
    playerId: EntityId,
    npc: NPCEntity,
    optionId: string,
  ): Promise<SimulationDelta> {
    return executeQuestTrigger(this.adapter, world, playerId, npc, optionId);
  }

  private async executeQuestDeliver(
    world: WorldState,
    playerId: EntityId,
    npc: NPCEntity,
    optionId: string,
  ): Promise<SimulationDelta> {
    return executeQuestDeliver(this.adapter, world, playerId, npc, optionId);
  }

  private async executeFunctional(
    world: WorldState,
    player: PlayerEntity,
    npc: NPCEntity,
    optionId: string,
  ): Promise<SimulationDelta> {
    return executeFunctional(this.adapter, world, player, npc, optionId);
  }

  private async generateIdleChatReply(
    world: WorldState,
    player: PlayerEntity,
    npc: NPCEntity,
    playerMessage?: string,
  ): Promise<{ delta: SimulationDelta; followUpTopics: string[] }> {
    const summary = this.saveManager.conversations.getSummary(player.id, npc.id);
    const result = await generateIdleChatReply(
      this.adapter,
      world,
      player,
      npc,
      playerMessage,
      this.conversationHistories,
      summary,
    );
    this.conversationHistories = result.histories;
    return { delta: result.delta, followUpTopics: result.followUpTopics };
  }

  private buildContext(world: WorldState, player: Entity, npc: NPCEntity) {
    return buildContext(world, player, npc);
  }

  private buildFollowUpOptionsPrompt(
    context: DialogueContext,
    selectedText: string,
    relationshipLevel: number,
  ) {
    return buildFollowUpOptionsPrompt(context, selectedText, relationshipLevel);
  }

  private parseFollowUpOptions(text: string): DialogueOption[] {
    return parseFollowUpOptions(text);
  }

  private scheduleConversationSummary(
    world: WorldState,
    playerId: EntityId,
    npcId: EntityId,
  ): void {
    this.conversationHistories = scheduleConvSummaryFn(
      world,
      playerId,
      npcId,
      this.conversationHistories,
      this.adapter,
      this.saveManager,
    );
  }

  private buildFollowUpOptions(
    topics: string[],
    _world: WorldState,
    _player: PlayerEntity,
    _npc: NPCEntity,
  ): DialogueOption[] {
    return buildFollowUpOptionsFn(topics, _world);
  }

  private getPostSelectOptions(world: WorldState): DialogueOption[] {
    return getPostSelectOptions(world);
  }

  private async generateMenuTransitionDelta(
    world: WorldState,
    npc: NPCEntity,
    playerMessage: string | undefined,
    transitionType: "quest_trigger" | "quest_deliver" | "functional",
  ): Promise<SimulationDelta> {
    return generateMenuTransitionDelta(this.adapter, world, npc, playerMessage, transitionType);
  }

  // --- Private utilities ---

  private getQuestTemplate(world: WorldState, templateId: string) {
    return getQuestTemplate(world, templateId);
  }

  private getFallbackDelta(_playerId: EntityId, npcId: EntityId, roomId?: string): SimulationDelta {
    return getFallbackDelta(_playerId, npcId, roomId);
  }
}
