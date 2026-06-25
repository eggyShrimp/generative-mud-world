import type { SaveManager } from "../../core/save-manager.ts";
import type { EntityId, WorldState } from "../../core/types.ts";
import { logWrite } from "../../shared/log.ts";
import type { LLMAdapter } from "../adapter.ts";
import type { ConversationEntry } from "./helpers.ts";
import { MAX_HISTORY_ROUNDS } from "./helpers.ts";

export function getHistoryKey(playerId: string, npcId: string): string {
  return `${playerId}:${npcId}`;
}

export function formatConversationHistory(history: ConversationEntry[], npcName: string): string {
  if (history.length === 0) return "";
  const lines = history.map((entry) => {
    const speaker = entry.speaker === "player" ? "玩家" : npcName;
    return `${speaker}: ${entry.content}`;
  });
  return `对话历史:\n${lines.join("\n")}`;
}

export function scheduleConversationSummary(
  world: WorldState,
  playerId: EntityId,
  npcId: EntityId,
  histories: Map<string, ConversationEntry[]>,
  adapter: LLMAdapter,
  saveManager: SaveManager,
): Map<string, ConversationEntry[]> {
  const key = getHistoryKey(playerId, npcId);
  const history = histories.get(key);
  if (!history || history.length === 0) return histories;

  histories.delete(key);
  const historySnapshot = history.map((entry) => ({ ...entry }));
  void generateAndSaveConversationSummary(
    world,
    playerId,
    npcId,
    historySnapshot,
    adapter,
    saveManager,
  );
  return histories;
}

export async function generateAndSaveConversationSummary(
  world: WorldState,
  playerId: EntityId,
  npcId: EntityId,
  history: ConversationEntry[],
  adapter: LLMAdapter,
  saveManager: SaveManager,
): Promise<void> {
  const npc = world.entities.get(npcId);
  const npcName = npc?.name ?? "NPC";

  const summaryPrompt = world.contentPool.narrativeTemplates.conversationSummaryPrompt;

  const historyText = history
    .map((e) => `${e.speaker === "player" ? "玩家" : npcName}: ${e.content}`)
    .join("\n");

  const prompt = summaryPrompt.replace("{history}", historyText);

  try {
    const response = await adapter.chat(prompt, "", [], undefined, "dialogue-summary", false);
    const summary = response.text?.trim() || "";
    if (summary) {
      saveManager.conversations.setSummary(playerId, npcId, summary, world.tick);
      saveManager.capture(world);
      saveManager.save();
    }
  } catch (err) {
    logWrite(
      "srv",
      "warn",
      `DialogueGenerator: summary generation failed for ${playerId}/${npcId}: ${String(err)}`,
    );
  }
}

export function recordConversationHistory(
  key: string,
  playerMessage: string,
  npcReply: string,
  tick: number,
  histories: Map<string, ConversationEntry[]>,
): Map<string, ConversationEntry[]> {
  if (!playerMessage && !npcReply) return histories;
  const entries = histories.get(key) ?? [];
  if (playerMessage) {
    entries.push({ speaker: "player", content: playerMessage, tick });
  }
  if (npcReply) {
    entries.push({ speaker: "npc", content: npcReply, tick });
  }
  if (entries.length > MAX_HISTORY_ROUNDS * 2) {
    histories.set(key, entries.slice(-MAX_HISTORY_ROUNDS * 2));
    return histories;
  }
  histories.set(key, entries);
  return histories;
}
