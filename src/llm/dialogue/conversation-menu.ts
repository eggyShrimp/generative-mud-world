import type { NPCEntity, PlayerEntity, WorldState } from "../../core/types.ts";
import type { DialogueOption } from "../../shared/protocol.ts";
import type { LLMAdapter } from "../adapter.ts";
import type { DialogueContext } from "./context-builders.ts";
import { buildContext } from "./context-builders.ts";
import { formatOptionalList, makeContinueOption } from "./helpers.ts";

export function buildConversationDirectionOptions(
  directions: WorldState["contentPool"]["conversationDirections"],
): DialogueOption[] {
  return directions.map((direction) => {
    if (direction.key.startsWith("quest_trigger__")) {
      const storylineId = direction.key.replace("quest_trigger__", "");
      return makeContinueOption(
        `menu:quest_trigger__${storylineId}`,
        direction.instruction,
        "quest_trigger_menu",
        {
          tag: "quest",
          meta: { directionKey: direction.key },
        },
      );
    }
    if (direction.key.startsWith("quest_deliver__")) {
      const templateId = direction.key.replace("quest_deliver__", "");
      return makeContinueOption(
        `menu:quest_deliver__${templateId}`,
        direction.instruction,
        "quest_deliver_menu",
        {
          tag: "quest",
          meta: { directionKey: direction.key },
        },
      );
    }
    return makeContinueOption(`chat:${direction.key}`, direction.instruction, "idle_chat", {
      meta: { directionKey: direction.key },
    });
  });
}

export function buildConversationMenuPrompt(
  context: DialogueContext,
  directions: WorldState["contentPool"]["conversationDirections"],
) {
  const directionLines = directions
    .map((direction) => `- ${direction.key}: ${direction.instruction}`)
    .join("\n");
  const nearbyContextLines = [
    formatOptionalList("附近地点", context.connectedRooms, "，"),
    formatOptionalList("房间物品", context.roomItems, "、"),
    formatOptionalList("其他人物", context.roomNpcs, "、"),
  ]
    .filter((line): line is string => line !== null)
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
${nearbyContextLines}

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

export function parseConversationMenuOptions(
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

    if (key.startsWith("quest_trigger__")) {
      const storylineId = key.replace("quest_trigger__", "");
      options.push(
        makeContinueOption(
          `menu:quest_trigger__${storylineId}`,
          label.trim(),
          "quest_trigger_menu",
          {
            tag: "quest",
            meta: { directionKey: key },
          },
        ),
      );
    } else if (key.startsWith("quest_deliver__")) {
      const templateId = key.replace("quest_deliver__", "");
      options.push(
        makeContinueOption(
          `menu:quest_deliver__${templateId}`,
          label.trim(),
          "quest_deliver_menu",
          {
            tag: "quest",
            meta: { directionKey: key },
          },
        ),
      );
    } else {
      options.push(
        makeContinueOption(
          key === "freeform" ? "chat:freeform" : `chat:${key}`,
          label.trim(),
          "idle_chat",
          { meta: key === "freeform" ? { freeform: true } : { directionKey: key } },
        ),
      );
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

export async function generateConversationDirectionOptions(
  adapter: LLMAdapter,
  world: WorldState,
  player: PlayerEntity,
  npc: NPCEntity,
  extraDirections?: Array<{ key: string; instruction: string }>,
): Promise<DialogueOption[]> {
  const baseDirections = world.contentPool.conversationDirections;
  const directions = extraDirections ? [...baseDirections, ...extraDirections] : baseDirections;
  if (directions.length === 0) return [];

  const fallback = buildConversationDirectionOptions(directions);
  const context = buildContext(world, player, npc);
  const prompt = buildConversationMenuPrompt(context, directions);

  try {
    const response = await adapter.chat(
      prompt.system,
      prompt.user,
      undefined,
      undefined,
      "dialogue-menu-options",
      false,
    );
    const generated = parseConversationMenuOptions(response.text, directions);
    return generated.length > 0 ? generated : fallback;
  } catch {
    return fallback;
  }
}
