import type { NPCEntity, SimulationDelta, WorldState } from "../../core/types.ts";
import { logWrite } from "../../shared/log.ts";
import type { LLMAdapter } from "../adapter.ts";
import { buildMinimalContext } from "./context-builders.ts";
import { extractReplyText } from "./internal-helpers.ts";

export async function generateMenuTransitionDelta(
  adapter: LLMAdapter,
  world: WorldState,
  npc: NPCEntity,
  playerMessage: string | undefined,
  transitionType: "quest_trigger" | "quest_deliver" | "functional",
): Promise<SimulationDelta> {
  const npcContext = buildMinimalContext(world, npc);

  const userPrompts: Record<string, string> = {
    quest_trigger: `玩家对你说："${playerMessage ?? ""}"。判定他有接任务的意图。生成 1-2 句向玩家过渡到正题的回应。`,
    quest_deliver: `玩家对你说："${playerMessage ?? ""}"。判定他想交付已完成的任务。生成 1-2 句向玩家过渡到正题的回应。`,
    functional: `玩家对你说："${playerMessage ?? ""}"。判定他想使用你的服务。生成 1-2 句向玩家过渡到正题的回应。`,
  };

  const prompt = {
    system: `你是 MUD 游戏的 NPC。${npc.name}（${npcContext.npcRole}）。生成 1-2 句过渡对话，用中文。不要调用任何工具。`,
    user: userPrompts[transitionType],
  };

  try {
    const response = await adapter.chat(
      prompt.system,
      prompt.user,
      undefined,
      undefined,
      `dialogue-${transitionType}-menu`,
      false,
    );
    const replyText = extractReplyText(response.text, npc.name);
    if (replyText) {
      return {
        dialogues: [
          {
            speakerId: npc.id,
            content: replyText,
            roomId: npc.roomId ?? "",
            tick: world.tick,
          },
        ],
      };
    }
  } catch (err) {
    logWrite("srv", "warn", `[menu-transition] LLM failed for ${npc.name}: ${String(err)}`);
  }
  return {};
}
