import type {
  Entity,
  NPCEntity,
  PlayerEntity,
  SimulationDelta,
  WorldState,
} from "../../core/types.ts";
import { logWrite } from "../../shared/log.ts";
import type { LLMAdapter } from "../adapter.ts";
import { buildMinimalContext } from "./context-builders.ts";
import { labelForLevel } from "./helpers.ts";
import { extractReplyText } from "./internal-helpers.ts";
import {
  computeBuyPrice,
  computeSellPrice,
  countCurrency,
  findCurrencyItems,
  getCurrencyName,
  getItemValue,
  getRelation,
  isTradeable,
  npcHasTrait,
  tradePriceMultiplier,
} from "./trade/trade-utils.ts";

export async function generateTradeReply(
  adapter: LLMAdapter,
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
  const npcCtx = buildMinimalContext(world, npc);
  const rel = getRelation(npc, player);
  const relLabel =
    rel?.label ??
    labelForLevel(world.contentPool.narrativeTemplates.relationLabels, rel?.level ?? 0);
  const relLevel = rel?.level ?? 0;
  const npcTraits = npc.traits
    .filter((t) => t.value > 0)
    .map((t) => t.name)
    .join("、");
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
    const response = await adapter.chat(
      system,
      p.user,
      undefined,
      undefined,
      "dialogue-trade",
      false,
    );
    logWrite("srv", "dbg", `[trade] LLM response text="${response.text.slice(0, 80)}"`);
    return extractReplyText(response.text, npc.name);
  } catch (err) {
    logWrite("srv", "warn", `[trade] LLM call failed for ${npc.name}: ${String(err)}`);
    if (scenario === "buy_poor" || scenario === "sell_poor") {
      return `（${npc.name}摇了摇头，这桩买卖做不成）`;
    }
    return `（${npc.name}完成了交易）`;
  }
}

interface TradeContext {
  itemName: string;
  buyPrice: number;
  playerCoins: number;
  actualPrice: number;
  currencyName: string;
}

function _buildTradeContext(
  _npc: NPCEntity,
  _player: PlayerEntity,
  world: WorldState,
  item: Entity & { templateId: string },
  price: number,
  counterpartCoins: number,
): TradeContext {
  const currencyName = getCurrencyName(world);
  return {
    itemName: item.name,
    buyPrice: price,
    playerCoins: counterpartCoins,
    actualPrice: price,
    currencyName,
  };
}

export async function executeTrade(
  adapter: LLMAdapter,
  world: WorldState,
  player: PlayerEntity,
  npc: NPCEntity,
  itemId: string,
): Promise<SimulationDelta> {
  const item = npc.inventory.find((i) => i.id === itemId);
  if (!item) return {};

  if (!isTradeable(world, item)) return {};

  const value = getItemValue(world, item);
  if (value === 0) return {};

  const multiplier = tradePriceMultiplier(npc, player);
  const buyPrice = computeBuyPrice(value, multiplier);
  const playerCoins = countCurrency(player);
  const rel = getRelation(npc, player);
  const relLevel = rel?.level ?? 0;
  const shortfall = buyPrice - playerCoins;
  const currencyName = getCurrencyName(world);

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
  } else if (npcHasTrait(npc, "generous") && relLevel >= 90 && shortfall <= 3) {
    outcome = "buy_gift";
    actualPrice = 0;
  } else if (
    npcHasTrait(npc, "generous") &&
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

  const replyText = await generateTradeReply(adapter, world, npc, player, outcome, {
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
      const playerCoinItems = findCurrencyItems(player);
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
    delta.questObjectiveEvents = [
      {
        type: "player_acquired_item",
        tick: world.tick,
        actorId: player.id,
        data: { itemId, templateId: tradeItemTemplateId, qty: 1, npcId: npc.id },
      },
    ];
  }

  return delta;
}

export async function executeSellTrade(
  adapter: LLMAdapter,
  world: WorldState,
  player: PlayerEntity,
  npc: NPCEntity,
  itemId: string,
): Promise<SimulationDelta> {
  const item = player.inventory.find((i) => i.id === itemId);
  if (!item) return {};

  if (!isTradeable(world, item)) return {};

  const value = getItemValue(world, item);
  if (value === 0) return {};

  const multiplier = tradePriceMultiplier(npc, player);
  const sellPrice = computeSellPrice(value, multiplier);
  const npcCoins = countCurrency(npc);
  const rel = getRelation(npc, player);
  const relLevel = rel?.level ?? 0;
  const shortfall = sellPrice - npcCoins;
  const currencyName = getCurrencyName(world);

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

  const replyText = await generateTradeReply(adapter, world, npc, player, outcome, {
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
      const npcCoinItems = findCurrencyItems(npc);
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
    delta.questObjectiveEvents = [
      {
        type: "player_delivered_item",
        tick: world.tick,
        actorId: player.id,
        data: { itemId, templateId: tradeItemTemplateId, qty: 1, npcId: npc.id },
      },
    ];
  }

  return delta;
}
