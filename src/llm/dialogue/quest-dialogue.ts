import type { z } from "zod";
import {
  checkPrerequisites,
  collectSubQuestIds,
  getQuestInteractionsForEntity,
  resolveQuestAccept,
} from "../../core/quest-utils.ts";
import type {
  EntityId,
  NPCEntity,
  PlayerEntity,
  SimulationDelta,
  WorldState,
} from "../../core/types.ts";
import { logWrite } from "../../shared/log.ts";
import type { DialogueOption } from "../../shared/protocol.ts";
import type { LLMAdapter } from "../adapter.ts";
import { buildContext, buildMinimalContext } from "./context-builders.ts";
import { getHistoryKey } from "./conversation-history.ts";
import { getPostSelectOptions } from "./follow-up.ts";
import {
  makeCloseOption,
  makeContinueOption,
  type PendingQuestMenu,
  QuestMenuSchema,
} from "./helpers.ts";
import { extractReplyText, getQuestTemplate } from "./internal-helpers.ts";

export function getEligibleQuestTriggers(world: WorldState, player: PlayerEntity, npc: NPCEntity) {
  const subQuestIds = collectSubQuestIds(world.contentPool);
  return world.contentPool.questTemplates.filter((t) => {
    const isTalkTriggeredStoryline =
      t.stages &&
      t.autoTrigger?.type === "player_action" &&
      t.autoTrigger.conditions.some((c) => c.action === "talk" && c.targetId === npc.id);
    const isNpcGivenQuest = !t.stages && t.giverNpcId === npc.id && !subQuestIds.has(t.id);
    if (!isTalkTriggeredStoryline && !isNpcGivenQuest) return false;
    if (player.activeQuests.some((q) => q.templateId === t.id)) return false;
    if (!t.repeatable) {
      if (player.completedQuests.includes(t.id)) return false;
      if (player.activeStorylines.some((s) => s.storylineId === t.id)) return false;
      if (world.completedStorylines.includes(t.id)) return false;
    } else if (player.completedQuests.includes(t.id) && t.cooldownDays) {
      const lastDay = player.questCooldowns[t.id];
      if (lastDay !== undefined && world.time.day - lastDay < t.cooldownDays) return false;
    }
    if (t.prerequisites) {
      if (!checkPrerequisites(player.completedQuests, t.prerequisites)) return false;
    }
    if (t.minRelation) {
      const rel = player.relations.find((r) => r.targetId === t.minRelation?.npcId);
      if ((rel?.level ?? 0) < (t.minRelation?.minValue ?? 0)) return false;
    }
    return true;
  });
}

export function getQuestDeliverSubOptions(
  world: WorldState,
  player: PlayerEntity,
  npc: NPCEntity,
): DialogueOption[] {
  return player.activeQuests
    .filter((q) => {
      if (q.status !== "active") return false;
      const template = getQuestTemplate(world, q.templateId);
      return template?.giverNpcId === npc.id && q.groupCompleted.every(Boolean);
    })
    .map((q) => ({
      ...makeContinueOption(
        `quest_deliver:${q.templateId}`,
        getQuestTemplate(world, q.templateId)?.title ?? q.templateId,
        "quest_deliver_select",
        {
          tag: "quest",
          meta: { templateId: q.templateId },
        },
      ),
    }));
}

export function limitTaskSceneOptions(
  baseOptions: DialogueOption[],
  chatOptions: DialogueOption[],
): DialogueOption[] {
  const maxOptions = 4;
  const questOptions = chatOptions.filter((option) => option.tag === "quest");
  const ordinaryOptions = chatOptions.filter((option) => option.tag !== "quest");
  const fixedOptions = [...baseOptions, ...questOptions];
  const ordinarySlots = Math.max(0, maxOptions - fixedOptions.length);
  return [...fixedOptions, ...ordinaryOptions.slice(0, ordinarySlots)];
}

export async function handleQuestTriggerMenu(
  adapter: LLMAdapter,
  world: WorldState,
  player: PlayerEntity,
  npc: NPCEntity,
  optionId: string,
  pending: Map<string, PendingQuestMenu>,
): Promise<{
  delta: SimulationDelta;
  subOptions?: DialogueOption[];
  pending: Map<string, PendingQuestMenu>;
}> {
  const questId = optionId.replace("menu:quest_trigger__", "");
  const quest =
    getEligibleQuestTriggers(world, player, npc).find((t) => t.id === questId) ??
    getEligibleQuestTriggers(world, player, npc)[0];
  if (!quest) {
    clearPendingQuestMenuFn(player.id, npc.id, pending);
    return { delta: {}, subOptions: [], pending };
  }

  const menu = await generateQuestMenuFn(adapter, world, player, npc, quest);
  pending.set(getHistoryKey(player.id, npc.id), menu.pending);
  return {
    delta: {
      dialogues: [
        {
          speakerId: npc.id,
          content: menu.narrative,
          roomId: player.roomId ?? "",
          tick: world.tick,
        },
      ],
    },
    subOptions: menu.subOptions,
    pending,
  };
}

export async function handleQuestDefer(
  world: WorldState,
  player: PlayerEntity,
  npc: NPCEntity,
  _optionId: string,
  pending: Map<string, PendingQuestMenu>,
): Promise<{
  delta: SimulationDelta;
  subOptions?: DialogueOption[];
  pending: Map<string, PendingQuestMenu>;
}> {
  const key = getHistoryKey(player.id, npc.id);
  const pendingMenu = pending.get(key);
  pending.delete(key);
  const reply =
    pendingMenu?.deferReply ??
    world.contentPool.narrativeTemplates.questMessages.deferReply.replace("{npcName}", npc.name);
  return {
    delta: {
      dialogues: [
        {
          speakerId: npc.id,
          content: reply,
          roomId: player.roomId ?? "",
          tick: world.tick,
        },
      ],
    },
    pending,
  };
}

export async function handleQuestTalkMenu(
  adapter: LLMAdapter,
  world: WorldState,
  player: PlayerEntity,
  npc: NPCEntity,
  optionId: string,
): Promise<{ delta: SimulationDelta; subOptions?: DialogueOption[] }> {
  const parts = optionId.split(":");
  const questId = parts[1];
  const objectiveIndex = Number(parts[2]);
  const interactions = getQuestInteractionsForEntity(world, player, npc.id);
  const interaction = interactions.find(
    (candidate) =>
      candidate.questId === questId &&
      candidate.objectiveIndex === objectiveIndex &&
      candidate.isPending,
  );
  if (!interaction) return { delta: {}, subOptions: getPostSelectOptions(world) };

  const prompt = {
    system: `你是 MUD 游戏的 NPC。${npc.name}正在回答玩家关于任务"${interaction.questTitle}"的问题。生成 2-3 句中文对话，不要调用任何工具。`,
    user: `玩家问起：${interaction.objectiveDescription}`,
  };

  let content = `${npc.name}认真回答了你关于「${interaction.questTitle}」的问题。`;
  try {
    const response = await adapter.chat(
      prompt.system,
      prompt.user,
      undefined,
      undefined,
      "dialogue-quest-talk",
      false,
    );
    content = extractReplyText(response.text, npc.name) || content;
  } catch (err) {
    logWrite(
      "srv",
      "warn",
      `[dialogue] quest talk generation failed quest=${interaction.questId}: ${String(err)}`,
    );
  }

  return {
    delta: {
      dialogues: [
        {
          speakerId: npc.id,
          content,
          roomId: player.roomId ?? "",
          tick: world.tick,
        },
      ],
      questObjectiveEvents: [
        {
          type: "player_talked_to_npc",
          tick: world.tick,
          actorId: player.id,
          data: {
            npcId: npc.id,
            optionId,
            optionType: "quest_talk_menu",
          },
        },
      ],
    },
    subOptions: getPostSelectOptions(world),
  };
}

interface GenerateQuestMenuResult {
  narrative: string;
  subOptions: DialogueOption[];
  pending: PendingQuestMenu;
}

async function generateQuestMenuFn(
  adapter: LLMAdapter,
  world: WorldState,
  player: PlayerEntity,
  npc: NPCEntity,
  quest: WorldState["contentPool"]["questTemplates"][number],
): Promise<GenerateQuestMenuResult> {
  const parsed = await tryGenerateQuestMenu(adapter, world, player, npc, quest);
  const fallback = buildFallbackQuestMenu(
    quest,
    npc,
    world.contentPool.narrativeTemplates.questMessages,
  );
  const data = parsed ?? fallback;
  const acceptOption = makeContinueOption(
    `quest_trigger:${quest.id}`,
    data.accept,
    "quest_trigger_select",
    {
      tag: "quest",
      meta: { templateId: quest.id, title: quest.title },
    },
  );
  const deferOption = makeCloseOption(`quest_defer:${quest.id}`, data.defer, "quest_defer", {
    tag: "quest",
    meta: { templateId: quest.id, title: quest.title },
  });
  const casualTopics = data.topics
    .slice(0, 1)
    .map((label, index) => makeContinueOption(`chat:quest_topic_${index}`, label, "idle_chat"));
  const newPending: PendingQuestMenu = {
    questId: quest.id,
    acceptOption,
    deferOption,
    deferReply:
      data.deferReply ??
      fallback.deferReply ??
      world.contentPool.narrativeTemplates.questMessages.deferReplyFallback.replace(
        "{npcName}",
        npc.name,
      ),
    casualTopics,
  };

  return {
    narrative: data.narrative,
    pending: newPending,
    subOptions: [
      acceptOption,
      deferOption,
      ...casualTopics,
      makeCloseOption(
        "chat:goodbye",
        world.contentPool.narrativeTemplates.questMessages.goodbyeOptionLabel,
        "close",
      ),
    ],
  };
}

async function tryGenerateQuestMenu(
  adapter: LLMAdapter,
  world: WorldState,
  player: PlayerEntity,
  npc: NPCEntity,
  quest: WorldState["contentPool"]["questTemplates"][number],
): Promise<z.infer<typeof QuestMenuSchema> | null> {
  const context = buildContext(world, player, npc);
  const objectives = quest.objectives.map((o) => `- ${o.description}`).join("\n");
  const system = `你是 MUD 游戏的任务对话生成器。请根据 NPC、地点和任务资料生成一个任务协商回合。

NPC: ${context.npcName}
身份: ${context.npcRole}
性格: ${context.npcPersonality}
地点: ${context.roomName}
任务: ${quest.title}
任务描述: ${quest.description}
目标:
${objectives}

要求:
- narrative 是 NPC 讲述任务背景的 2-4 句中文
- accept 是玩家明确接受任务的话术
- defer 是玩家暂时推辞的话术
- deferReply 是 NPC 对玩家暂时推辞的简短回应
- topics 是 0-1 个普通追问或闲聊延伸话题
- 只输出 JSON，不要解释`;
  const user = `输出格式:
{"narrative":"NPC讲述任务背景","accept":"玩家接受任务","defer":"玩家暂时推辞","deferReply":"NPC回应推辞","topics":["普通追问"]}`;
  try {
    const response = await adapter.chat(
      system,
      user,
      undefined,
      undefined,
      "dialogue-quest-menu",
      false,
    );
    const jsonMatch = response.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return QuestMenuSchema.parse(JSON.parse(jsonMatch[0]));
  } catch (err) {
    logWrite(
      "srv",
      "warn",
      `[dialogue] quest menu generation failed quest=${quest.id}: ${String(err)}`,
    );
    return null;
  }
}

export function buildFallbackQuestMenu(
  quest: WorldState["contentPool"]["questTemplates"][number],
  npc: NPCEntity,
  questMessages: WorldState["contentPool"]["narrativeTemplates"]["questMessages"],
): z.infer<typeof QuestMenuSchema> {
  return {
    narrative: quest.description || quest.title,
    accept: questMessages.acceptLabelTemplate.replace("{questTitle}", quest.title),
    defer: questMessages.deferLabel,
    deferReply: questMessages.deferReply.replace("{npcName}", npc.name),
    topics: [],
  };
}

export function injectQuestOptions(
  playerId: EntityId,
  npcId: EntityId,
  baseOptions: DialogueOption[],
  pending: Map<string, PendingQuestMenu>,
): DialogueOption[] {
  const pendingMenu = pending.get(getHistoryKey(playerId, npcId));
  if (!pendingMenu) return baseOptions;
  const seen = new Set<string>();
  const ordinaryChatOptions = [...pendingMenu.casualTopics, ...baseOptions].filter(
    (option) => option.type === "idle_chat",
  );
  const closeOptions = baseOptions.filter((option) => option.type === "close");
  const merged = [
    pendingMenu.acceptOption,
    pendingMenu.deferOption,
    ...ordinaryChatOptions.slice(0, 1),
    ...closeOptions,
  ];
  return merged.filter((option) => {
    if (seen.has(option.id)) return false;
    seen.add(option.id);
    return true;
  });
}

function clearPendingQuestMenuFn(
  playerId: EntityId,
  npcId: EntityId,
  pending: Map<string, PendingQuestMenu>,
): Map<string, PendingQuestMenu> {
  pending.delete(getHistoryKey(playerId, npcId));
  return pending;
}

export { clearPendingQuestMenuFn as clearPendingQuestMenu };

export async function executeQuestTrigger(
  adapter: LLMAdapter,
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

  const npcContext = buildMinimalContext(world, npc);
  const prompt = {
    system: `你是 MUD 游戏的 NPC。${npc.name}（${npcContext.npcRole}）正在向玩家发布一个任务。生成 2-3 句任务发布对话，用中文，不要调用任何工具。`,
    user: `请为任务"${templateId}"生成发布对话。`,
  };
  try {
    const response = await adapter.chat(
      prompt.system,
      prompt.user,
      undefined,
      undefined,
      "dialogue-quest-trigger",
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
        content: `${npc.name}认真地看着你："我有个任务交给你。"`,
        roomId: npc.roomId ?? "",
        tick: world.tick,
      },
    ];
  }
  return delta;
}

export async function executeQuestDeliver(
  adapter: LLMAdapter,
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

  const npcContext = buildMinimalContext(world, npc);
  const prompt = {
    system: `你是 MUD 游戏的 NPC。${npc.name}（${npcContext.npcRole}）正在接收玩家完成的任务。生成 2-3 句奖励/感谢对话，用中文，不要调用任何工具。`,
    user: `玩家完成了任务"${templateId}"，请生成交付对话。`,
  };
  try {
    const response = await adapter.chat(
      prompt.system,
      prompt.user,
      undefined,
      undefined,
      "dialogue-quest-deliver",
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
        content: `${npc.name}满意地点了点头："干得好。"`,
        roomId: npc.roomId ?? "",
        tick: world.tick,
      },
    ];
  }
  return delta;
}
