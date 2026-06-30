import type { WorldState } from "../../core/types.ts";
import type { DialogueOption } from "../../shared/protocol.ts";
import type { DialogueContext } from "./context-builders.ts";
import { formatConversationHistory } from "./conversation-history.ts";
import type { ConversationEntry } from "./helpers.ts";
import { makeContinueOption } from "./helpers.ts";

export interface ChatPrompt {
  system: string;
  user: string;
}

export function buildIdleChatPrompt(
  context: DialogueContext,
  conversationHistory: ConversationEntry[],
  playerMessage: string | undefined,
  world: WorldState,
  conversationSummary: string | null,
): ChatPrompt {
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

  const summaryLabel = world.contentPool.narrativeTemplates.conversationSummaryLabel;
  const summarySection = conversationSummary ? `\n${summaryLabel}:\n  ${conversationSummary}` : "";

  const historySection = formatConversationHistory(conversationHistory, context.npcName);

  const userLine = playerMessage
    ? `玩家刚才说: ${playerMessage}`
    : `玩家向 ${context.npcName} 打了个招呼。`;

  const moodLine = context.npcMood ? `心情: ${context.npcMood}\n` : "";
  const relationshipText = context.relationshipLabel
    ? `${context.relationshipLabel} (${context.relationshipLevel})`
    : String(context.relationshipLevel);

  return {
    system: `你正在扮演 ${context.npcName}（${context.npcRole}，${context.npcPersonality}性格）。\n
${moodLine}需求: ${context.npcNeeds}
关系: ${relationshipText}
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
- 若分享已知线索，在 share_information 中使用 clue_id 参数
- 回复用 JSON 格式输出，不要用 markdown 代码块包裹
- {"reply": "NPC的对话回复文本"}`,
    user: userLine,
  };
}

export function buildFollowUpOptionsPrompt(
  context: DialogueContext,
  selectedText: string,
  relationshipLevel: number,
): ChatPrompt {
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

export function parseFollowUpOptions(text: string): DialogueOption[] {
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

    options.push(makeContinueOption(`followup:${index}`, trimmed, "idle_chat"));
    index++;

    if (options.length >= 5) break;
  }

  if (options.length > 0 && options.length < 3) {
    return options;
  }

  return options;
}
