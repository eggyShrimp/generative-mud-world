import type {
  EntityId,
  NPCEntity,
  PlayerEntity,
  SimulationDelta,
  WorldState,
} from "../../core/types.ts";
import { formatItemProperties } from "../../shared/item-format.ts";
import { logWrite } from "../../shared/log.ts";
import type { TradeOption } from "../../shared/protocol.ts";
import {
  computeBuyPrice,
  getCurrencyName,
  getItemValue,
  isTradeable,
  tradePriceMultiplier,
} from "./trade/trade-utils.ts";

export function getQuestTemplate(world: WorldState, templateId: string) {
  return world.contentPool.questTemplates.find((t) => t.id === templateId);
}

export function extractReplyText(text: string, npcName: string): string {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (typeof parsed.reply === "string" && parsed.reply.length > 0) {
        return parsed.reply;
      }
      if (typeof parsed.reply === "string") {
        return "";
      }
    } catch {
      logWrite("srv", "dbg", "JSON 解析失败，回退到文本清理");
    }
  }
  let cleaned = text
    .replace(/^```[\s\S]*?\n/, "")
    .replace(/\n```$/, "")
    .trim();

  if (npcName && cleaned.startsWith(npcName)) {
    const afterName = cleaned.slice(npcName.length);
    cleaned = afterName.replace(/^[：:]\s*/, "").trim();
  }

  return cleaned || "";
}

export function getFallbackDelta(
  _playerId: EntityId,
  npcId: EntityId,
  roomId?: string,
): SimulationDelta {
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

export function getTradeSubOptions(
  npc: NPCEntity,
  world: WorldState,
  player: PlayerEntity,
): TradeOption[] {
  const multiplier = tradePriceMultiplier(npc, player);
  const currencyName = getCurrencyName(world);
  const buyOptions: TradeOption[] = npc.inventory
    .filter((item) => isTradeable(world, item))
    .map((item) => {
      const value = getItemValue(world, item);
      const price = computeBuyPrice(value, multiplier);
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
