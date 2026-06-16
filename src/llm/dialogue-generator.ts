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
  DialogueEffectMapping,
  Entity,
  EntityId,
  ItemEntity,
  NeedType,
  NPCEntity,
  PlayerEntity,
  SimulationDelta,
  WorldState,
} from "../core/types.ts";
import { getRoomEntities } from "../core/world.ts";
import { resolveQuestAccept } from "../engine/quest-tracker.ts";
import { formatItemProperties } from "../shared/item-format.ts";
import { logWrite } from "../shared/log.ts";
import type { DialogueOption, DialogueOptionType, TradeOption } from "../shared/protocol.ts";
import type { LLMAdapter, ToolCallResult } from "./adapter.ts";
import {
  buildAffectNeedArgs,
  buildDialogueTools,
  buildExpressEmotionArgs,
  ShareInformationSchema,
  ShiftRelationSchema,
  SuggestFollowupTopicsSchema,
} from "./dialogue-tools.ts";

export type { DialogueOption, DialogueOptionType, TradeOption };

interface ConversationEntry {
  speaker: "player" | "npc";
  content: string;
  tick: number;
}

const MAX_HISTORY_ROUNDS = 10;

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
    const eligibleStorylines = this.getEligibleStorylines(world, player as PlayerEntity, npc);
    for (const t of eligibleStorylines) {
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
    const player = world.entities.get(playerId);
    const npc = world.entities.get(npcId);
    if (!player || !isNpc(npc)) return [];

    const options: DialogueOption[] = [];

    // 1. Functional: NPC tags 匹配 entityActionsByTag
    const functionalActions = this.getFunctionalActions(world, npc);
    if (functionalActions.length > 0) {
      options.push({
        id: "menu:functional",
        label: this.getFunctionalLabel(world, npc),
        type: "functional_menu",
      });
    }

    return options;
  }

  private async generateConversationDirectionOptions(
    world: WorldState,
    player: PlayerEntity,
    npc: NPCEntity,
    extraDirections?: Array<{ key: string; instruction: string }>,
  ): Promise<DialogueOption[]> {
    const baseDirections = world.contentPool.conversationDirections;
    const directions = extraDirections ? [...baseDirections, ...extraDirections] : baseDirections;
    if (directions.length === 0) return [];

    const fallback = this.buildConversationDirectionOptions(directions);
    const context = this.buildContext(world, player, npc);
    const prompt = this.buildConversationMenuPrompt(context, directions);

    try {
      const response = await this.adapter.chat(
        prompt.system,
        prompt.user,
        undefined,
        undefined,
        "dialogue-menu-options",
        false,
      );
      const generated = this.parseConversationMenuOptions(response.text, directions);
      return generated.length > 0 ? generated : fallback;
    } catch {
      return fallback;
    }
  }

  private buildConversationDirectionOptions(
    directions: WorldState["contentPool"]["conversationDirections"],
  ): DialogueOption[] {
    return directions.map((direction) => {
      if (direction.key.startsWith("quest_trigger__")) {
        const storylineId = direction.key.replace("quest_trigger__", "");
        return {
          id: `menu:quest_trigger__${storylineId}`,
          label: direction.instruction,
          type: "quest_trigger_menu" as DialogueOptionType,
          tag: "quest",
          meta: { directionKey: direction.key },
        };
      }
      if (direction.key.startsWith("quest_deliver__")) {
        const templateId = direction.key.replace("quest_deliver__", "");
        return {
          id: `menu:quest_deliver__${templateId}`,
          label: direction.instruction,
          type: "quest_deliver_menu" as DialogueOptionType,
          tag: "quest",
          meta: { directionKey: direction.key },
        };
      }
      return {
        id: `chat:${direction.key}`,
        label: direction.instruction,
        type: "idle_chat" as DialogueOptionType,
        meta: { directionKey: direction.key },
      };
    });
  }

  private buildConversationMenuPrompt(
    context: ReturnType<typeof this.buildContext>,
    directions: WorldState["contentPool"]["conversationDirections"],
  ) {
    const directionLines = directions
      .map((direction) => `- ${direction.key}: ${direction.instruction}`)
      .join("\n");

    return {
      system: `你是 MUD 游戏的对话选项生成器。根据 NPC、地点和对话方向，生成玩家可以选择的自然中文对话选项。

NPC: ${context.npcName}
身份: ${context.npcRole}
性格: ${context.npcPersonality}
心情: ${context.npcMood}
关系: ${context.relationshipLabel} (${context.relationshipLevel})
地点: ${context.roomName}
地点描述: ${context.roomDescription}
附近地点: ${context.connectedRooms.join("，") || "无"}
房间物品: ${context.roomItems.join("、") || "无"}
其他人物: ${context.roomNpcs.join("、") || "无"}

对话方向:
${directionLines}

要求:
- 为每个对话方向生成 1 个玩家视角的自然话术，不要照抄方向说明
- 额外生成 1 个 key 为 freeform 的自由发挥话术，结合 NPC 和当前地点
- 选项要短，适合作为菜单项
- 只输出 JSON，不要解释`,
      user: `输出格式:
{"options":[{"key":"方向key或freeform","label":"玩家可选择的话术"}]}`,
    };
  }

  private parseConversationMenuOptions(
    text: string,
    directions: WorldState["contentPool"]["conversationDirections"],
  ): DialogueOption[] {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      return [];
    }
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !Array.isArray((parsed as { options?: unknown }).options)
    ) {
      return [];
    }

    const directionKeys = new Set(directions.map((direction) => direction.key));
    const directionOrder = new Map(directions.map((direction, index) => [direction.key, index]));
    const seen = new Set<string>();
    const options: DialogueOption[] = [];

    for (const item of (parsed as { options: unknown[] }).options) {
      if (typeof item !== "object" || item === null) continue;
      const key = (item as { key?: unknown }).key;
      const label = (item as { label?: unknown }).label;
      if (typeof key !== "string" || typeof label !== "string" || label.trim().length === 0) {
        continue;
      }
      if (key !== "freeform" && !directionKeys.has(key)) continue;
      if (seen.has(key)) continue;
      seen.add(key);

      // Quest 方向映射：quest_trigger__${id} / quest_deliver__${id} → 对应类型 + tag: "quest"
      if (key.startsWith("quest_trigger__")) {
        const storylineId = key.replace("quest_trigger__", "");
        options.push({
          id: `menu:quest_trigger__${storylineId}`,
          label: label.trim(),
          type: "quest_trigger_menu",
          tag: "quest",
          meta: { directionKey: key },
        });
      } else if (key.startsWith("quest_deliver__")) {
        const templateId = key.replace("quest_deliver__", "");
        options.push({
          id: `menu:quest_deliver__${templateId}`,
          label: label.trim(),
          type: "quest_deliver_menu",
          tag: "quest",
          meta: { directionKey: key },
        });
      } else {
        options.push({
          id: key === "freeform" ? "chat:freeform" : `chat:${key}`,
          label: label.trim(),
          type: "idle_chat",
          meta: key === "freeform" ? { freeform: true } : { directionKey: key },
        });
      }
    }

    return options.sort((a, b) => {
      const aKey = (a.meta?.directionKey as string | undefined) ?? "freeform";
      const bKey = (b.meta?.directionKey as string | undefined) ?? "freeform";
      const aIndex = aKey === "freeform" ? directions.length : (directionOrder.get(aKey) ?? 0);
      const bIndex = bKey === "freeform" ? directions.length : (directionOrder.get(bKey) ?? 0);
      return aIndex - bIndex;
    });
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
        return {
          delta: {},
          subOptions: this.getQuestTriggerSubOptions(world, player as PlayerEntity, npc),
        };

      case "quest_trigger_select":
        return { delta: await this.executeQuestTrigger(world, playerId, npc, optionId) };

      case "quest_deliver_menu":
        return {
          delta: {},
          subOptions: this.getQuestDeliverSubOptions(world, player as PlayerEntity, npc),
        };

      case "quest_deliver_select":
        return { delta: await this.executeQuestDeliver(world, playerId, npc, optionId) };

      case "functional_menu":
        return { delta: {}, subOptions: this.getFunctionalSubOptions(world, npc) };

      case "functional_select":
        return {
          delta: await this.executeFunctional(world, player as PlayerEntity, npc, optionId),
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
            subOptions: this.buildFollowUpOptions(
              followUpTopics,
              world,
              player as PlayerEntity,
              npc,
            ),
          };
        }
        this.scheduleConversationSummary(world, playerId, npcId);
        return { delta };
      }

      case "close":
        this.scheduleConversationSummary(world, playerId, npcId);
        return {
          delta: {
            dialogues: [
              {
                speakerId: npcId,
                content: `${npc.name}向你点头告别。`,
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

  // --- Menu helpers: 可用性检查 ---

  private getEligibleStorylines(world: WorldState, player: PlayerEntity, npc: NPCEntity) {
    return world.contentPool.questTemplates.filter((t) => {
      if (t.autoTrigger?.type !== "player_action") return false;
      if (!t.stages) return false;
      const npcMatches = t.autoTrigger.conditions.some(
        (c) => c.action === "talk" && c.targetId === npc.id,
      );
      if (!npcMatches) return false;
      if (!t.repeatable) {
        if (player.completedQuests.includes(t.id)) return false;
        if (player.activeStorylines.some((s) => s.storylineId === t.id)) return false;
      }
      if (t.prerequisites) {
        if (typeof t.prerequisites === "string") {
          if (!player.completedQuests.includes(t.prerequisites)) return false;
        }
      }
      if (t.minRelation) {
        const rel = player.relations.find((r) => r.targetId === t.minRelation?.npcId);
        if ((rel?.level ?? 0) < (t.minRelation?.minValue ?? 0)) return false;
      }
      return true;
    });
  }

  private getFunctionalActions(
    world: WorldState,
    npc: NPCEntity,
  ): Array<{ actionId: string; label: string }> {
    const tags = npc.tags ?? [];
    const seen = new Set<string>();
    const result: Array<{ actionId: string; label: string }> = [];
    for (const tag of tags) {
      const actions = world.contentPool.entityActionsByTag[tag] ?? [];
      for (const actionId of actions) {
        if (seen.has(actionId)) continue;
        seen.add(actionId);
        result.push({
          actionId,
          label: world.contentPool.entityActionLabels[actionId] ?? actionId,
        });
      }
    }
    return result;
  }

  private getFunctionalLabel(world: WorldState, npc: NPCEntity): string {
    const tags = npc.tags ?? [];
    for (const tag of tags) {
      const label = world.contentPool.entityTagLabels[tag];
      if (label) return label;
    }
    return "功能";
  }

  // --- Sub-option builders ---

  private getTradeSubOptions(
    npc: NPCEntity,
    world: WorldState,
    player: PlayerEntity,
  ): TradeOption[] {
    const multiplier = this.tradePriceMultiplier(npc, player);
    const currencyName = this.getCurrencyName(world);
    const buyOptions: TradeOption[] = npc.inventory
      .filter((item) => this.isTradeable(world, item))
      .map((item) => {
        const value = this.getItemValue(world, item);
        const price = this.computeBuyPrice(value, multiplier);
        return {
          id: `trade:${item.id}`,
          label: `${item.name} — ${price} ${currencyName}`,
          action: "buy",
          meta: {
            itemId: item.id,
            itemName: item.name,
            itemDescription: item.description,
            itemPropertiesText: formatItemProperties(
              item.properties,
              world.contentPool.itemPropertyLabels,
            ),
            price,
            currencyName,
          },
        };
      });

    buyOptions.push({
      id: "menu:sell",
      label: "卖出物品",
      action: "sell_menu",
    });

    return buyOptions;
  }

  private getQuestTriggerSubOptions(
    world: WorldState,
    player: PlayerEntity,
    npc: NPCEntity,
  ): DialogueOption[] {
    return this.getEligibleStorylines(world, player, npc).map((t) => ({
      id: `quest_trigger:${t.id}`,
      label: t.title,
      type: "quest_trigger_select" as DialogueOptionType,
      meta: { templateId: t.id, title: t.title },
    }));
  }

  private getQuestDeliverSubOptions(
    world: WorldState,
    player: PlayerEntity,
    npc: NPCEntity,
  ): DialogueOption[] {
    return player.activeQuests
      .filter((q) => {
        if (q.status !== "active") return false;
        const template = this.getQuestTemplate(world, q.templateId);
        return template?.giverNpcId === npc.id && q.groupCompleted.every(Boolean);
      })
      .map((q) => ({
        id: `quest_deliver:${q.templateId}`,
        label: q.templateId,
        type: "quest_deliver_select" as DialogueOptionType,
        meta: { templateId: q.templateId },
      }));
  }

  private getFunctionalSubOptions(world: WorldState, npc: NPCEntity): DialogueOption[] {
    return this.getFunctionalActions(world, npc).map((a) => ({
      id: `functional:${a.actionId}`,
      label: a.label,
      type: "functional_select" as DialogueOptionType,
      meta: { actionId: a.actionId, label: a.label },
    }));
  }

  // --- Action executors ---

  private async executeTrade(
    world: WorldState,
    player: PlayerEntity,
    npc: NPCEntity,
    itemId: string,
  ): Promise<SimulationDelta> {
    const item = npc.inventory.find((i) => i.id === itemId);
    if (!item) return {};

    if (!this.isTradeable(world, item)) return {};

    const value = this.getItemValue(world, item);
    if (value === 0) return {};

    const multiplier = this.tradePriceMultiplier(npc, player);
    const buyPrice = this.computeBuyPrice(value, multiplier);
    const playerCoins = this.countCurrency(player);
    const rel = this.getRelation(npc, player);
    const relLevel = rel?.level ?? 0;
    const shortfall = buyPrice - playerCoins;
    const currencyName = this.getCurrencyName(world);

    logWrite(
      "srv",
      "dbg",
      `[trade] executeTrade buyer=${player.name} npc=${npc.name} item=${item.name} value=${value} multiplier=${multiplier.toFixed(2)} buyPrice=${buyPrice} playerCoins=${playerCoins} relLevel=${relLevel}`,
    );

    let outcome: "buy_success" | "buy_discount" | "buy_gift" | "buy_poor";
    let actualPrice: number;

    if (shortfall <= 0) {
      outcome = "buy_success";
      actualPrice = buyPrice;
    } else if (this.npcHasTrait(npc, "generous") && relLevel >= 90 && shortfall <= 3) {
      outcome = "buy_gift";
      actualPrice = 0;
    } else if (
      this.npcHasTrait(npc, "generous") &&
      relLevel >= 70 &&
      shortfall <= Math.ceil(buyPrice * 0.3)
    ) {
      outcome = "buy_discount";
      actualPrice = playerCoins;
    } else {
      outcome = "buy_poor";
      actualPrice = 0;
    }

    logWrite("srv", "dbg", `[trade] outcome=${outcome} actualPrice=${actualPrice}`);

    const replyText = await this.generateTradeReply(world, npc, player, outcome, {
      itemName: item.name,
      buyPrice,
      playerCoins,
      actualPrice,
      currencyName,
    });

    logWrite("srv", "dbg", `[trade] buy replyText="${replyText.slice(0, 60)}"`);

    const delta: SimulationDelta = {
      dialogues: [
        {
          speakerId: npc.id,
          content: replyText,
          roomId: player.roomId ?? "",
          tick: world.tick,
        },
      ],
    };

    if (outcome !== "buy_poor") {
      const itemChanges: SimulationDelta["itemChanges"] = [];
      const tradeItemTemplateId = item.templateId;

      if (actualPrice > 0) {
        const playerCoinItems = this.findCurrencyItems(player);
        for (let i = 0; i < actualPrice; i++) {
          itemChanges.push({
            targetId: player.id,
            templateId: "copper_coin",
            operation: "remove",
            qty: 1,
            itemId: playerCoinItems[i]?.id,
          });
        }
      }

      itemChanges.push(
        { targetId: npc.id, templateId: tradeItemTemplateId, operation: "remove", qty: 1, itemId },
        {
          targetId: player.id,
          templateId: tradeItemTemplateId,
          operation: "add",
          qty: 1,
          itemId,
          name: item.name,
        },
      );

      delta.itemChanges = itemChanges;

      if (actualPrice > 0) {
        for (let i = 0; i < actualPrice; i++) {
          itemChanges.push({
            targetId: npc.id,
            templateId: "copper_coin",
            operation: "add",
            qty: 1,
          });
        }
      }

      delta.worldEvents = [
        {
          id: `trade_${npc.id}_${player.id}_${Date.now()}`,
          type: "item_exchange",
          title: `交易: ${item.name}`,
          description:
            outcome === "buy_gift"
              ? `${npc.name} 把 ${item.name} 送给了你`
              : `${npc.name} 把 ${item.name} 以 ${actualPrice} ${currencyName} 卖给了你`,
          scope: player.roomId ?? "global",
          tick: 0,
          source: "simulation",
          data: { direction: "give", item: item.name, price: actualPrice, outcome },
        },
      ];
    }

    return delta;
  }

  private async executeSellTrade(
    world: WorldState,
    player: PlayerEntity,
    npc: NPCEntity,
    itemId: string,
  ): Promise<SimulationDelta> {
    const item = player.inventory.find((i) => i.id === itemId);
    if (!item) return {};

    if (!this.isTradeable(world, item)) return {};

    const value = this.getItemValue(world, item);
    if (value === 0) return {};

    const multiplier = this.tradePriceMultiplier(npc, player);
    const sellPrice = this.computeSellPrice(value, multiplier);
    const npcCoins = this.countCurrency(npc);
    const rel = this.getRelation(npc, player);
    const relLevel = rel?.level ?? 0;
    const shortfall = sellPrice - npcCoins;
    const currencyName = this.getCurrencyName(world);

    logWrite(
      "srv",
      "dbg",
      `[trade] executeSellTrade seller=${player.name} npc=${npc.name} item=${item.name} value=${value} multiplier=${multiplier.toFixed(2)} sellPrice=${sellPrice} npcCoins=${npcCoins} relLevel=${relLevel}`,
    );

    let outcome: "sell_success" | "sell_discount" | "sell_poor";
    let actualPrice: number;

    if (shortfall <= 0) {
      outcome = "sell_success";
      actualPrice = sellPrice;
    } else if (relLevel >= 70 && shortfall <= Math.ceil(sellPrice * 0.3)) {
      outcome = "sell_discount";
      actualPrice = npcCoins;
    } else {
      outcome = "sell_poor";
      actualPrice = 0;
    }

    logWrite("srv", "dbg", `[trade] sell outcome=${outcome} actualPrice=${actualPrice}`);

    const replyText = await this.generateTradeReply(world, npc, player, outcome, {
      itemName: item.name,
      buyPrice: sellPrice,
      playerCoins: npcCoins,
      actualPrice,
      currencyName,
    });

    logWrite("srv", "dbg", `[trade] sell replyText="${replyText.slice(0, 60)}"`);

    const delta: SimulationDelta = {
      dialogues: [
        {
          speakerId: npc.id,
          content: replyText,
          roomId: player.roomId ?? "",
          tick: world.tick,
        },
      ],
    };

    if (outcome !== "sell_poor") {
      const tradeItemTemplateId = item.templateId;

      const itemChanges: SimulationDelta["itemChanges"] = [
        {
          targetId: player.id,
          templateId: tradeItemTemplateId,
          operation: "remove",
          qty: 1,
          itemId,
        },
        {
          targetId: npc.id,
          templateId: tradeItemTemplateId,
          operation: "add",
          qty: 1,
          itemId,
          name: item.name,
        },
      ];

      if (actualPrice > 0) {
        for (let i = 0; i < actualPrice; i++) {
          itemChanges.push({
            targetId: player.id,
            templateId: "copper_coin",
            operation: "add",
            qty: 1,
          });
        }
        const npcCoinItems = this.findCurrencyItems(npc);
        for (let i = 0; i < actualPrice; i++) {
          itemChanges.push({
            targetId: npc.id,
            templateId: "copper_coin",
            operation: "remove",
            qty: 1,
            itemId: npcCoinItems[i]?.id,
          });
        }
      }

      delta.itemChanges = itemChanges;

      delta.worldEvents = [
        {
          id: `trade_sell_${npc.id}_${player.id}_${Date.now()}`,
          type: "item_exchange",
          title: `卖出: ${item.name}`,
          description:
            outcome === "sell_discount"
              ? `${player.name} 把 ${item.name} 以 ${actualPrice} ${currencyName} 卖给了 ${npc.name}（含人情折扣）`
              : `${player.name} 把 ${item.name} 以 ${actualPrice} ${currencyName} 卖给了 ${npc.name}`,
          scope: player.roomId ?? "global",
          tick: 0,
          source: "simulation",
          data: { direction: "sell", item: item.name, price: actualPrice, outcome },
        },
      ];
    }

    return delta;
  }

  // --- Trade utility methods ---

  private getItemValue(world: WorldState, item: Entity): number {
    const templateId = (item as ItemEntity).templateId;
    if (!templateId) return 0;
    const template = world.contentPool.itemTemplates.find((t) => t.id === templateId);
    return (template?.properties.value as number) ?? 0;
  }

  private isTradeable(world: WorldState, item: Entity): boolean {
    const templateId = (item as ItemEntity).templateId;
    if (!templateId) return false;
    const template = world.contentPool.itemTemplates.find((t) => t.id === templateId);
    if (!template) return false;
    return template.tradeable !== false;
  }

  private countCurrency(entity: Entity): number {
    const inventory =
      "inventory" in entity ? (entity as unknown as { inventory: Entity[] }).inventory : [];
    return inventory.filter((i) => {
      const props = (i as unknown as Record<string, unknown>).properties as
        | Record<string, unknown>
        | undefined;
      return props?.currency === true && (i as ItemEntity).templateId === "copper_coin";
    }).length;
  }

  private findCurrencyItems(entity: Entity): Entity[] {
    const inventory =
      "inventory" in entity ? (entity as unknown as { inventory: Entity[] }).inventory : [];
    const coins: Entity[] = [];
    for (const item of inventory) {
      const props = (item as unknown as Record<string, unknown>).properties as
        | Record<string, unknown>
        | undefined;
      if (props?.currency === true && (item as ItemEntity).templateId === "copper_coin") {
        coins.push(item);
      }
    }
    return coins;
  }

  private getRelation(npc: NPCEntity, player: Entity) {
    if ("relations" in player) {
      return (
        (
          player as unknown as Record<
            string,
            Array<{ targetId: string; level: number; label: string }>
          >
        ).relations.find((r) => r.targetId === npc.id) ?? null
      );
    }
    return null;
  }

  private tradePriceMultiplier(npc: NPCEntity, player: Entity): number {
    const rel = this.getRelation(npc, player);
    const level = rel?.level ?? 0;
    return 1 - Math.max(-0.2, Math.min(0.2, level / 500));
  }

  private computeBuyPrice(value: number, multiplier: number): number {
    return Math.max(1, Math.round(value * multiplier));
  }

  private computeSellPrice(value: number, multiplier: number): number {
    return Math.max(1, Math.round(value * 0.6 * (2 - multiplier)));
  }

  private npcHasTrait(npc: NPCEntity, traitName: string): boolean {
    return npc.traits.some((t) => t.name === traitName && t.value > 0);
  }

  private getCurrencyName(world: WorldState): string {
    const template = world.contentPool.itemTemplates.find((t) => t.properties.currency === true);
    return template?.name ?? "铜币";
  }

  private async generateTradeReply(
    world: WorldState,
    npc: NPCEntity,
    player: PlayerEntity,
    scenario: string,
    context: {
      itemName: string;
      buyPrice: number;
      playerCoins: number;
      actualPrice: number;
      currencyName: string;
    },
  ): Promise<string> {
    const npcCtx = this.buildMinimalContext(world, npc);
    const rel = this.getRelation(npc, player);
    const relLabel = rel?.label ?? "陌生人";
    const relLevel = rel?.level ?? 0;
    const npcTraits =
      npc.traits
        .filter((t) => t.value > 0)
        .map((t) => t.name)
        .join("、") || "无";
    const { itemName, buyPrice, playerCoins, actualPrice, currencyName } = context;

    const prompts: Record<string, { instruction: string; user: string }> = {
      buy_success: {
        instruction: `NPC 正在卖东西。价格 ${buyPrice} ${currencyName}，玩家已付清。生成 1-2 句自然的交易对话。语气要符合 NPC 性格。`,
        user: `玩家以 ${buyPrice} ${currencyName} 买下了 ${itemName}。请生成 NPC 的对话。`,
      },
      buy_discount: {
        instruction: `NPC 豪爽打折。物品标价 ${buyPrice} ${currencyName}，但玩家只有 ${playerCoins} ${currencyName}。NPC 收了 ${actualPrice} ${currencyName} 就成交了，不足部分免了。生成 1-2 句体现慷慨的对话。`,
        user: `物品标价 ${buyPrice} ${currencyName}，玩家只有 ${playerCoins} ${currencyName}，NPC 打折收了 ${actualPrice} 成交。生成 NPC 对话。`,
      },
      buy_gift: {
        instruction: `NPC 免费把 ${itemName} 送给了玩家。物品价值 ${buyPrice} ${currencyName}，但 NPC 因为友好关系决定白送。生成 1-2 句温暖的对话。`,
        user: `NPC 把价值 ${buyPrice} ${currencyName} 的 ${itemName} 免费送给了玩家。生成 NPC 对话。`,
      },
      buy_poor: {
        instruction: `玩家钱不够，买不起。物品价格 ${buyPrice} ${currencyName}，玩家只有 ${playerCoins} ${currencyName}。NPC 拒绝交易。生成 1-2 句对话，语气取决于 NPC 性格。`,
        user: `玩家只有 ${playerCoins} ${currencyName}，不够买 ${buyPrice} ${currencyName} 的 ${itemName}。生成 NPC 拒绝对话。`,
      },
      sell_success: {
        instruction: `NPC 收了玩家的 ${itemName}，付了 ${buyPrice} ${currencyName}。生成 1-2 句自然的收货对话。`,
        user: `玩家把 ${itemName} 以 ${buyPrice} ${currencyName} 卖给了 NPC。生成 NPC 收货对话。`,
      },
      sell_discount: {
        instruction: `NPC 钱不够但关系好。收货价 ${buyPrice} ${currencyName}，NPC 只有 ${playerCoins} ${currencyName}，付了 ${actualPrice} 成交，差的部分算人情。生成 1-2 句对话。`,
        user: `收货价 ${buyPrice} ${currencyName}，NPC 只有 ${playerCoins} ${currencyName}，但关系好，付了 ${actualPrice} 成交。生成 NPC 对话。`,
      },
      sell_poor: {
        instruction: `NPC 钱不够，买不起。价格 ${buyPrice} ${currencyName}，NPC 只有 ${playerCoins} ${currencyName}。生成 1-2 句拒绝对话。`,
        user: `NPC 只有 ${playerCoins} ${currencyName}，收不起价格 ${buyPrice} ${currencyName} 的 ${itemName}。生成 NPC 拒绝对话。`,
      },
    };

    const p = prompts[scenario] ?? prompts.buy_success;

    const system = `你是 MUD 游戏的 NPC 对话系统。\nNPC: ${npc.name}（${npcCtx.npcRole}）\n性格: ${npc.personality}\n特质: ${npcTraits}\n与玩家关系: ${relLabel}（${relLevel}）\n\n当前场景: NPC 与玩家正在交易。\n${p.instruction}\n要求: 用中文，1-2 句话，自然可信，符合角色性格和关系。`;

    logWrite(
      "srv",
      "dbg",
      `[trade] generateTradeReply scenario=${scenario} npc=${npc.name} item=${itemName} price=${buyPrice} actualPrice=${actualPrice} playerCoins=${playerCoins}`,
    );

    try {
      logWrite("srv", "dbg", `[trade] calling LLM dialogue-trade for ${npc.name}`);
      const response = await this.adapter.chat(
        system,
        p.user,
        undefined,
        undefined,
        "dialogue-trade",
        false,
      );
      logWrite("srv", "dbg", `[trade] LLM response text="${response.text.slice(0, 80)}"`);
      return this.extractReplyText(response.text, npc.name);
    } catch (err) {
      logWrite("srv", "warn", `[trade] LLM call failed for ${npc.name}: ${String(err)}`);
      if (scenario === "buy_poor" || scenario === "sell_poor") {
        return `（${npc.name}摇了摇头，这桩买卖做不成）`;
      }
      return `（${npc.name}完成了交易）`;
    }
  }

  private async executeQuestTrigger(
    world: WorldState,
    playerId: EntityId,
    npc: NPCEntity,
    optionId: string,
  ): Promise<SimulationDelta> {
    const templateId = optionId.replace("quest_trigger:", "");
    const result = resolveQuestAccept(world, playerId, templateId);

    let delta: SimulationDelta = {};
    if (result.success && result.delta) {
      delta = { ...result.delta };
    } else {
      logWrite(
        "srv",
        "dbg",
        `[dialogue] quest_trigger ${templateId} rejected: ${result.warnings.join(", ")}`,
      );
    }

    // LLM 生成任务发布对话
    const npcContext = this.buildMinimalContext(world, npc);
    const prompt = {
      system: `你是 MUD 游戏的 NPC。${npc.name}（${npcContext.npcRole}）正在向玩家发布一个任务。生成 2-3 句任务发布对话，用中文，不要调用任何工具。`,
      user: `请为任务"${templateId}"生成发布对话。`,
    };
    try {
      const response = await this.adapter.chat(
        prompt.system,
        prompt.user,
        undefined,
        undefined,
        "dialogue-quest-trigger",
        false,
      );
      const replyText = this.extractReplyText(response.text, npc.name);
      if (replyText) {
        delta.dialogues = [
          {
            speakerId: npc.id,
            content: replyText,
            roomId: npc.roomId ?? "",
            tick: world.tick,
          },
        ];
      }
    } catch {
      delta.dialogues = [
        {
          speakerId: npc.id,
          content: `${npc.name}认真地看着你："我有个任务交给你。"`,
          roomId: npc.roomId ?? "",
          tick: world.tick,
        },
      ];
    }
    return delta;
  }

  private async executeQuestDeliver(
    world: WorldState,
    playerId: EntityId,
    npc: NPCEntity,
    optionId: string,
  ): Promise<SimulationDelta> {
    const templateId = optionId.replace("quest_deliver:", "");
    const player = world.entities.get(playerId) as PlayerEntity;
    const quest = player.activeQuests.find((q) => q.templateId === templateId);
    if (!quest) return {};

    const delta: SimulationDelta = {
      questChanges: [{ templateId, type: "complete", playerId }],
      worldEvents: [
        {
          id: `quest_complete_${templateId}_${Date.now()}`,
          type: "quest_complete",
          title: `任务完成: ${templateId}`,
          description: `你完成了来自${npc.name}的任务`,
          scope: player.roomId ?? "global",
          tick: 0,
          source: "simulation",
          data: { templateId },
        },
      ],
    };

    // LLM 生成交付对话
    const npcContext = this.buildMinimalContext(world, npc);
    const prompt = {
      system: `你是 MUD 游戏的 NPC。${npc.name}（${npcContext.npcRole}）正在接收玩家完成的任务。生成 2-3 句奖励/感谢对话，用中文，不要调用任何工具。`,
      user: `玩家完成了任务"${templateId}"，请生成交付对话。`,
    };
    try {
      const response = await this.adapter.chat(
        prompt.system,
        prompt.user,
        undefined,
        undefined,
        "dialogue-quest-deliver",
        false,
      );
      const replyText = this.extractReplyText(response.text, npc.name);
      if (replyText) {
        delta.dialogues = [
          {
            speakerId: npc.id,
            content: replyText,
            roomId: npc.roomId ?? "",
            tick: world.tick,
          },
        ];
      }
    } catch {
      delta.dialogues = [
        {
          speakerId: npc.id,
          content: `${npc.name}满意地点了点头："干得好。"`,
          roomId: npc.roomId ?? "",
          tick: world.tick,
        },
      ];
    }
    return delta;
  }

  private async executeFunctional(
    world: WorldState,
    player: PlayerEntity,
    npc: NPCEntity,
    optionId: string,
  ): Promise<SimulationDelta> {
    const actionId = optionId.replace("functional:", "");

    // 查找 ActionEffect
    const effect = world.contentPool.actionEffects.find((a) => a.action === actionId);
    if (!effect) return {};

    // 构建 delta（复用 resolveActionEffect 逻辑）
    const needChanges = Object.entries(effect.needDeltas).map(([needType, delta]) => ({
      targetId: player.id,
      needType: needType as NeedType,
      delta: delta as number,
    }));

    const itemChanges: Array<{
      targetId: string;
      templateId: string;
      operation: "add" | "remove";
      qty: number;
      itemId?: string;
      name?: string;
    }> = [];
    if (effect.itemDeltas) {
      for (const [templateId, qty] of Object.entries(effect.itemDeltas)) {
        itemChanges.push({ targetId: player.id, templateId, operation: "add", qty: qty as number });
      }
    }

    const delta: SimulationDelta = {
      needChanges: needChanges.length > 0 ? needChanges : undefined,
      itemChanges: itemChanges.length > 0 ? itemChanges : undefined,
    };

    // LLM 生成服务对话
    const label = world.contentPool.entityActionLabels[actionId] ?? actionId;
    const npcContext = this.buildMinimalContext(world, npc);
    const prompt = {
      system: `你是 MUD 游戏的 NPC。${npc.name}（${npcContext.npcRole}）正在为玩家提供"${label}"服务。生成 1-2 句服务对话，用中文，不要调用任何工具。`,
      user: `请为"${label}"服务生成对话。`,
    };
    try {
      const response = await this.adapter.chat(
        prompt.system,
        prompt.user,
        undefined,
        undefined,
        "dialogue-functional",
        false,
      );
      const replyText = this.extractReplyText(response.text, npc.name);
      if (replyText) {
        delta.dialogues = [
          {
            speakerId: npc.id,
            content: replyText,
            roomId: npc.roomId ?? "",
            tick: world.tick,
          },
        ];
      }
    } catch {
      delta.dialogues = [
        {
          speakerId: npc.id,
          content: `（${npc.name}为你提供了${label}服务）`,
          roomId: npc.roomId ?? "",
          tick: world.tick,
        },
      ];
    }
    return delta;
  }

  /**
   * 闲聊：LLM 生成自由对话 + 轻量 tool（shift_relation/affect_need/share_information/express_emotion）
   * + suggest_followup_topics 生成连续对话话题
   * 不使用 exchange_item/activate_quest（已移除）
   */
  private async generateIdleChatReply(
    world: WorldState,
    player: PlayerEntity,
    npc: NPCEntity,
    playerMessage?: string,
  ): Promise<{ delta: SimulationDelta; followUpTopics: string[] }> {
    const context = this.buildContext(world, player, npc);
    const historyKey = this.getHistoryKey(player.id, npc.id);
    const history = this.conversationHistories.get(historyKey) ?? [];
    const summary = this.saveManager.conversations.getSummary(player.id, npc.id);
    const prompt = this.buildIdleChatPrompt(context, history, playerMessage, world, summary);

    try {
      const response = await this.adapter.chat(
        prompt.system,
        prompt.user,
        buildDialogueTools(world.contentPool),
        undefined,
        "dialogue-idle-chat",
        true,
      );
      const replyText = this.extractReplyText(response.text, npc.name);
      const followUpTopics = this.extractFollowUpTopics(response.toolCalls ?? []);
      const filteredToolCalls = (response.toolCalls ?? []).filter(
        (tc) => tc.function.name !== "suggest_followup_topics",
      );
      const toolDelta = this.processToolCalls(
        filteredToolCalls,
        player.id,
        npc.id,
        npc.name,
        player.roomId ?? undefined,
        world.contentPool.dialogueEffectMapping,
        world.contentPool.emotionLabels,
        world.contentPool.needDefinitions.map((n) => n.type),
        Object.keys(world.contentPool.emotionLabels),
        world.contentPool.clueDefinitions,
      );

      const delta: SimulationDelta = { ...toolDelta };
      if (replyText) {
        delta.dialogues = [
          {
            speakerId: npc.id,
            content: replyText,
            roomId: player.roomId ?? "",
            tick: world.tick,
          },
        ];
      }

      this.recordConversationHistory(historyKey, playerMessage ?? "", replyText ?? "", world.tick);

      return { delta, followUpTopics };
    } catch {
      return {
        delta: this.getFallbackDelta(player.id, npc.id, player.roomId ?? undefined),
        followUpTopics: [],
      };
    }
  }

  // --- Context builders ---

  private buildMinimalContext(world: WorldState, npc: NPCEntity) {
    return {
      npcRole: (npc.tags?.[0] && world.contentPool.entityTagLabels[npc.tags[0]]) ?? "居民",
    };
  }

  private buildContext(world: WorldState, player: Entity, npc: NPCEntity) {
    const room = player.roomId ? world.rooms.get(player.roomId) : null;
    const rel =
      "relations" in player
        ? (
            player as unknown as Record<
              string,
              Array<{ targetId: string; level: number; label: string }>
            >
          ).relations.find((r) => r.targetId === npc.id)
        : null;

    const roomId = player.roomId;
    const roomEntities = roomId ? getRoomEntities(world, roomId) : [];
    const roomItems = roomEntities.filter((e) => e.type === "item").map((e) => e.name);
    const roomNpcs = roomEntities
      .filter((e) => e.type === "npc" && e.id !== npc.id)
      .map((e) => e.name);

    const npcItems = npc.inventory.map((item) => ({ id: item.id, name: item.name }));
    const playerInventory = "inventory" in player ? (player as PlayerEntity).inventory : [];
    const playerItems = playerInventory.map((item) => ({ id: item.id, name: item.name }));

    const connectedRooms = room
      ? Array.from(room.exits.entries()).map(([dir, exit]) => {
          const targetRoom = world.rooms.get(exit.to);
          return `${dir}→${targetRoom?.name ?? exit.to}`;
        })
      : [];

    const npcMemories = npc.memories.slice(-5).map((m) => m.content);

    const npcKnownClues = world.contentPool.clueDefinitions
      .filter((c) => c.knownByNpcIds.includes(npc.id))
      .map((c) => ({ id: c.id, description: c.description }));

    return {
      playerName: player.name,
      npcName: npc.name,
      npcPersonality: npc.personality ?? "普通",
      npcMood: moodLabel(npc.mood ?? 50, world.contentPool.narrativeTemplates.moodLabels),
      npcRole: this.buildMinimalContext(world, npc).npcRole,
      roomName: room?.name ?? "未知地点",
      roomDescription: room?.description ?? "",
      npcNeeds: npc.needs
        .map(
          (need) =>
            `${world.contentPool.needLabels[need.type] ?? need.type}: ${Math.round(need.value)}`,
        )
        .join(", "),
      relationshipLevel: rel?.level ?? 0,
      relationshipLabel: rel?.label ?? "陌生人",
      roomItems,
      roomNpcs,
      npcItems,
      playerItems,
      connectedRooms,
      npcMemories,
      npcKnownClues,
    };
  }

  private buildIdleChatPrompt(
    context: ReturnType<typeof this.buildContext>,
    conversationHistory: ConversationEntry[],
    playerMessage: string | undefined,
    world: WorldState,
    conversationSummary: string | null,
  ) {
    const memorySection =
      context.npcMemories.length > 0
        ? `\nNPC 近期经历:\n${context.npcMemories.map((m, i) => `  ${i + 1}. ${m}`).join("\n")}`
        : "";

    const directions = world.contentPool.conversationDirections ?? [];
    const directionSection =
      directions.length > 0
        ? `\n对话方向参考:\n${directions.map((d) => `  - ${d.instruction}`).join("\n")}`
        : "";

    const clueSection =
      context.npcKnownClues.length > 0
        ? `\nNPC 已知线索（可在对话中分享, share_information 的 clue_id 必须来自此列表）:\n${context.npcKnownClues.map((c) => `  - [${c.id}] ${c.description}`).join("\n")}`
        : "";

    const summaryLabel =
      world.contentPool.narrativeTemplates.conversationSummaryLabel || "此前对话概要";
    const summarySection = conversationSummary
      ? `\n${summaryLabel}:\n  ${conversationSummary}`
      : "";

    const historySection = this.formatConversationHistory(conversationHistory, context.npcName);

    const userLine = playerMessage
      ? `玩家刚才说: ${playerMessage}`
      : `玩家向 ${context.npcName} 打了个招呼。`;

    return {
      system: `你正在扮演 ${context.npcName}（${context.npcRole}，${context.npcPersonality}性格）。

心情: ${context.npcMood}
需求: ${context.npcNeeds}
关系: ${context.relationshipLabel} (${context.relationshipLevel})
场景: ${context.roomName}${memorySection}${directionSection}${clueSection}${summarySection}
${historySection}
---
${userLine}

请生成 NPC 的回复和追问话题。
要求:
- 回复 2-3 句话，自然可信，用中文
- 普通关系时正常回答问题
- 关系好时更愿意补充细节、解释背景、给出已知线索
- 关系差时语气可以冷淡，但仍应提供基础回答；不要因为关系差而默认拒答
- 调用 suggest_followup_topics 生成 3-4 个玩家可追问的话题
- 话题为自然中文句子，与 NPC 回复内容形成追问关系
- 结合 NPC 的性格和身份自然延伸对话，避免重复已聊内容
- 根据对话效果调用 shift_relation/affect_need/share_information/express_emotion
- 只在有明确的副作用时才调用工具，不必每次对话都调用
- 不要调用 exchange_item 或 activate_quest
- 若分享已知线索，在 share_information 中使用 clue_id 参数`,
      user: userLine,
    };
  }

  private buildFollowUpOptionsPrompt(
    context: ReturnType<typeof this.buildContext>,
    selectedText: string,
    relationshipLevel: number,
  ) {
    const relGuidance =
      relationshipLevel >= 70
        ? "因为关系好，可以生成更深入、追问细节的问题。"
        : relationshipLevel <= 30
          ? "关系一般，生成的追问问题应保持友好实用，不要生成拒绝类标签。"
          : "生成正常、实用的追问问题。";

    return {
      system: `你是 MUD 游戏的对话追问选项生成器。根据 NPC 的某句话，生成玩家可以追问的问题选项。

NPC: ${context.npcName}
身份: ${context.npcRole}
性格: ${context.npcPersonality}
心情: ${context.npcMood}
关系: ${context.relationshipLabel} (${relationshipLevel})
地点: ${context.roomName}

NPC 说的原文: "${selectedText}"

要求:
- 生成 3-5 个玩家视角的追问问题，作为对话选项
- 问题必须基于选中的原文内容，帮助玩家追问澄清、方向、原因、后果或后续
- ${relGuidance}
- 如果选中的文本似乎是玩家自己说的话，仍应基于周围对话上下文生成可用的追问问题，不要把玩家的句子当作 NPC 的知识
- 选项要短，适合作为菜单项
- 只输出 JSON，不要解释`,
      user: `输出格式:
{"options":[{"label":"玩家可选择的追问问题"}]}`,
    };
  }

  private parseFollowUpOptions(text: string): DialogueOption[] {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return [];

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      return [];
    }
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !Array.isArray((parsed as { options?: unknown }).options)
    ) {
      return [];
    }

    const seen = new Set<string>();
    const options: DialogueOption[] = [];
    let index = 0;

    for (const item of (parsed as { options: unknown[] }).options) {
      if (typeof item !== "object" || item === null) continue;
      const label = (item as { label?: unknown }).label;
      if (typeof label !== "string" || label.trim().length === 0) continue;
      const trimmed = label.trim();
      const dedupKey = trimmed.toLowerCase();
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);

      options.push({
        id: `followup:${index}`,
        label: trimmed,
        type: "idle_chat",
      });
      index++;

      if (options.length >= 5) break;
    }

    if (options.length > 0 && options.length < 3) {
      return options;
    }

    return options;
  }

  // --- Conversation history helpers ---

  private getHistoryKey(playerId: EntityId, npcId: EntityId): string {
    return `${playerId}:${npcId}`;
  }

  private scheduleConversationSummary(
    world: WorldState,
    playerId: EntityId,
    npcId: EntityId,
  ): void {
    const key = this.getHistoryKey(playerId, npcId);
    const history = this.conversationHistories.get(key);
    if (!history || history.length === 0) return;

    this.conversationHistories.delete(key);
    const historySnapshot = history.map((entry) => ({ ...entry }));
    void this.generateAndSaveConversationSummary(world, playerId, npcId, historySnapshot);
  }

  private async generateAndSaveConversationSummary(
    world: WorldState,
    playerId: EntityId,
    npcId: EntityId,
    history: ConversationEntry[],
  ): Promise<void> {
    const npc = world.entities.get(npcId);
    const npcName = npc?.name ?? "NPC";

    const summaryPrompt =
      world.contentPool.narrativeTemplates.conversationSummaryPrompt ||
      "请概括以下对话的内容，生成一句中文总结（不超过40字）：\n{history}";

    const historyText = history
      .map((e) => `${e.speaker === "player" ? "玩家" : npcName}: ${e.content}`)
      .join("\n");

    const prompt = summaryPrompt.replace("{history}", historyText);

    try {
      const response = await this.adapter.chat(
        prompt,
        "",
        [],
        undefined,
        "dialogue-summary",
        false,
      );
      const summary = response.text?.trim() || "";
      if (summary) {
        this.saveManager.conversations.setSummary(playerId, npcId, summary, world.tick);
        this.saveManager.capture(world);
        this.saveManager.save();
      }
    } catch (err) {
      logWrite(
        "srv",
        "warn",
        `DialogueGenerator: summary generation failed for ${playerId}/${npcId}: ${String(err)}`,
      );
    }
  }

  private recordConversationHistory(
    key: string,
    playerMessage: string,
    npcReply: string,
    tick: number,
  ): void {
    if (!playerMessage && !npcReply) return;
    const entries = this.conversationHistories.get(key) ?? [];
    if (playerMessage) {
      entries.push({ speaker: "player", content: playerMessage, tick });
    }
    if (npcReply) {
      entries.push({ speaker: "npc", content: npcReply, tick });
    }
    // 只保留最近 N 轮
    if (entries.length > MAX_HISTORY_ROUNDS * 2) {
      this.conversationHistories.set(key, entries.slice(-MAX_HISTORY_ROUNDS * 2));
      return;
    }
    this.conversationHistories.set(key, entries);
  }

  private formatConversationHistory(history: ConversationEntry[], npcName: string): string {
    if (history.length === 0) return "";
    const lines = history.map((entry) => {
      const speaker = entry.speaker === "player" ? "玩家" : npcName;
      return `${speaker}: ${entry.content}`;
    });
    return `对话历史:\n${lines.join("\n")}`;
  }

  // --- Follow-up topics helpers ---

  private extractFollowUpTopics(toolCalls: ToolCallResult[]): string[] {
    const call = toolCalls.find((tc) => tc.function.name === "suggest_followup_topics");
    if (!call) return [];
    let args: unknown;
    try {
      args =
        typeof call.function.arguments === "string"
          ? JSON.parse(call.function.arguments)
          : call.function.arguments;
    } catch {
      return [];
    }
    const parsed = SuggestFollowupTopicsSchema.safeParse(args);
    return parsed.success ? parsed.data.topics : [];
  }

  private buildFollowUpOptions(
    topics: string[],
    _world: WorldState,
    _player: PlayerEntity,
    _npc: NPCEntity,
  ): DialogueOption[] {
    const seen = new Set<string>();
    const options: DialogueOption[] = [];

    const add = (opt: DialogueOption) => {
      if (!seen.has(opt.id)) {
        seen.add(opt.id);
        options.push(opt);
      }
    };

    // 1. LLM 话题
    for (let i = 0; i < topics.length; i++) {
      add({ id: `chat:followup_${i}`, label: topics[i], type: "idle_chat" });
    }

    // 2. 告别
    add({ id: "chat:goodbye", label: "告别", type: "close" });

    return options;
  }

  // --- Tool call processing ---

  /**
   * 将 tool_calls 映射为 SimulationDelta
   * 核心逻辑: LLM 返回定性分类 → 查 ContentPool.dialogueEffectMapping → 数值
   */
  private processToolCalls(
    toolCalls: ToolCallResult[],
    playerId: EntityId,
    npcId: EntityId,
    npcDisplayName: string,
    roomId: string | undefined,
    mapping: DialogueEffectMapping,
    emotionLabels: Record<string, string>,
    needTypes: string[],
    emotions: string[],
    clueDefinitions: import("../core/types.ts").ClueDefinition[],
  ): SimulationDelta {
    const delta: SimulationDelta = {};
    const affectNeedSchema = buildAffectNeedArgs(needTypes);
    const expressEmotionSchema = buildExpressEmotionArgs(emotions);

    for (const call of toolCalls) {
      switch (call.function.name) {
        case "shift_relation": {
          const parsed = ShiftRelationSchema.safeParse(JSON.parse(call.function.arguments));
          if (!parsed.success) continue;
          const args = parsed.data;
          const key = `${args.magnitude}_${args.direction}`;
          const effect = mapping.relation[key];
          if (effect) {
            delta.relationChanges = delta.relationChanges ?? [];
            delta.relationChanges.push({
              fromId: playerId,
              toId: npcId,
              delta: effect.delta,
            });
          }
          break;
        }

        case "affect_need": {
          const parsed = affectNeedSchema.safeParse(JSON.parse(call.function.arguments));
          if (!parsed.success) continue;
          const args = parsed.data;
          const key = `${args.magnitude}_${args.direction}`;
          const effect = mapping.needImpact[key];
          if (effect) {
            const targetId = args.target === "speaker" ? npcId : playerId;
            delta.needChanges = delta.needChanges ?? [];
            delta.needChanges.push({
              targetId,
              needType: args.need as unknown as NeedType,
              delta: effect.delta,
            });
          }
          break;
        }

        case "share_information": {
          const parsed = ShareInformationSchema.safeParse(JSON.parse(call.function.arguments));
          if (!parsed.success) continue;
          const args = parsed.data;
          const infoConfig = mapping.information[args.info_type];
          if (infoConfig) {
            delta.worldEvents = delta.worldEvents ?? [];
            delta.worldEvents.push({
              id: `info_${playerId}_${npcId}_${Date.now()}`,
              type: "information",
              title: `信息: ${args.summary}`,
              description: args.summary,
              scope: roomId ?? "global",
              tick: 0,
              source: "llm",
              data: {
                infoType: args.info_type,
                importance: infoConfig.memoryImportance,
                spreadChance: infoConfig.spreadChance,
              },
            });
          }
          if (args.clue_id) {
            const clueDef = clueDefinitions.find((c) => c.id === args.clue_id);
            if (clueDef?.knownByNpcIds.includes(npcId)) {
              delta.knownClueChanges = delta.knownClueChanges ?? [];
              delta.knownClueChanges.push({
                playerId,
                clueId: args.clue_id,
                sourceNpcId: npcId,
              });
            }
          }
          break;
        }

        case "express_emotion": {
          const parsed = expressEmotionSchema.safeParse(JSON.parse(call.function.arguments));
          if (!parsed.success) continue;
          const args = parsed.data;
          delta.worldEvents = delta.worldEvents ?? [];
          delta.worldEvents.push({
            id: `emotion_${npcId}_${Date.now()}`,
            type: "emotion",
            title: `情绪: ${args.emotion}`,
            description: `${npcDisplayName} 感到 ${emotionTranslate(args.emotion, emotionLabels)}`,
            scope: roomId ?? "global",
            tick: 0,
            source: "llm",
            data: { emotion: args.emotion, target: args.target },
          });
          break;
        }

        default:
          // exchange_item 和 activate_quest 已移除，静默忽略
          break;
      }
    }

    return delta;
  }

  // --- Private utilities ---

  private getQuestTemplate(world: WorldState, templateId: string) {
    return world.contentPool.questTemplates.find((t) => t.id === templateId);
  }

  private extractReplyText(text: string, npcName: string): string {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (typeof parsed.reply === "string" && parsed.reply.length > 0) {
          return parsed.reply;
        }
      } catch {
        logWrite("srv", "dbg", "JSON 解析失败，回退到文本清理");
      }
    }
    const cleaned = text
      .replace(/^```[\s\S]*?\n/, "")
      .replace(/\n```$/, "")
      .trim();
    return cleaned || `${npcName}看着你，没有说话。`;
  }

  private getFallbackDelta(_playerId: EntityId, npcId: EntityId, roomId?: string): SimulationDelta {
    return {
      dialogues: [
        {
          speakerId: npcId,
          content: "（NPC 看起来有些困惑，没有回应）",
          roomId: roomId ?? "",
          tick: 0,
        },
      ],
    };
  }
}

// --- 辅助函数 ---

function isNpc(entity: Entity | undefined): entity is NPCEntity {
  return Boolean(entity && entity.type === "npc");
}

function moodLabel(mood: number, moodLabels: Array<{ threshold: number; label: string }>): string {
  const sorted = [...moodLabels].sort((a, b) => b.threshold - a.threshold);
  const found = sorted.find((m) => mood >= m.threshold);
  return found?.label ?? sorted[sorted.length - 1]?.label ?? "平静";
}

function emotionTranslate(emotion: string, labels: Record<string, string>): string {
  return labels[emotion] ?? emotion;
}
