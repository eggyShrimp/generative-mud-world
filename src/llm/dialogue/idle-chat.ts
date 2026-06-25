import type { NPCEntity, PlayerEntity, SimulationDelta, WorldState } from "../../core/types.ts";
import type { LLMAdapter } from "../adapter.ts";
import { buildDialogueTools } from "../dialogue-tools.ts";
import { buildContext } from "./context-builders.ts";
import { getHistoryKey, recordConversationHistory } from "./conversation-history.ts";
import { extractFollowUpTopics } from "./follow-up.ts";
import type { ConversationEntry } from "./helpers.ts";
import { extractReplyText, getFallbackDelta } from "./internal-helpers.ts";
import { buildIdleChatPrompt } from "./prompt-builders.ts";
import { processToolCalls } from "./tool-processing.ts";

export async function generateIdleChatReply(
  adapter: LLMAdapter,
  world: WorldState,
  player: PlayerEntity,
  npc: NPCEntity,
  playerMessage: string | undefined,
  histories: Map<string, ConversationEntry[]>,
  conversationSummary: string | null,
): Promise<{
  delta: SimulationDelta;
  followUpTopics: string[];
  histories: Map<string, ConversationEntry[]>;
}> {
  const context = buildContext(world, player, npc);
  const historyKey = getHistoryKey(player.id, npc.id);
  const history = histories.get(historyKey) ?? [];
  const prompt = buildIdleChatPrompt(context, history, playerMessage, world, conversationSummary);

  try {
    const response = await adapter.chat(
      prompt.system,
      prompt.user,
      buildDialogueTools(world.contentPool),
      undefined,
      "dialogue-idle-chat",
      true,
    );
    const replyText = extractReplyText(response.text, npc.name);
    const followUpTopics = extractFollowUpTopics(response.toolCalls ?? []);
    const filteredToolCalls = (response.toolCalls ?? []).filter(
      (tc) => tc.function.name !== "suggest_followup_topics",
    );
    const toolDelta = processToolCalls(
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

    if (replyText) {
      const updatedHistories = recordConversationHistory(
        historyKey,
        playerMessage ?? "",
        replyText,
        world.tick,
        histories,
      );
      return { delta, followUpTopics, histories: updatedHistories };
    }

    return { delta, followUpTopics, histories };
  } catch {
    return {
      delta: getFallbackDelta(player.id, npc.id, player.roomId ?? undefined),
      followUpTopics: [],
      histories,
    };
  }
}
