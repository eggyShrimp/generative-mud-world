import type {
  NeedType,
  NPCEntity,
  PlayerEntity,
  SimulationDelta,
  WorldState,
} from "../../core/types.ts";
import type { LLMAdapter } from "../adapter.ts";
import { buildMinimalContext } from "./context-builders.ts";
import { getFunctionalActions } from "./fixed-menu.ts";
import { makeContinueOption } from "./helpers.ts";
import { extractReplyText } from "./internal-helpers.ts";

export function getFunctionalSubOptions(world: WorldState, npc: NPCEntity) {
  return getFunctionalActions(world, npc).map(
    (a) =>
      ({
        ...makeContinueOption(`functional:${a.actionId}`, a.label, "functional_select" as const, {
          meta: { actionId: a.actionId, label: a.label },
        }),
      }) as import("../../shared/protocol.ts").DialogueOption,
  );
}

export async function executeFunctional(
  adapter: LLMAdapter,
  world: WorldState,
  player: PlayerEntity,
  npc: NPCEntity,
  optionId: string,
): Promise<SimulationDelta> {
  const actionId = optionId.replace("functional:", "");

  const effect = world.contentPool.actionEffects.find((a) => a.action === actionId);
  if (!effect) return {};

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

  const label = world.contentPool.entityActionLabels[actionId] ?? actionId;
  const npcContext = buildMinimalContext(world, npc);
  const prompt = {
    system: `你是 MUD 游戏的 NPC。${npc.name}（${npcContext.npcRole}）正在为玩家提供"${label}"服务。生成 1-2 句服务对话，用中文，不要调用任何工具。回复用 JSON 格式输出，不要用 markdown 代码块包裹。{"reply": "NPC的对话回复文本"}`,
    user: `请为"${label}"服务生成对话。`,
  };
  try {
    const response = await adapter.chat(
      prompt.system,
      prompt.user,
      undefined,
      undefined,
      "dialogue-functional",
      false,
    );
    const replyText = extractReplyText(response.text, npc.name);
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
