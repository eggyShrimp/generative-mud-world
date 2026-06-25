import type { WorldState } from "../../core/types.ts";
import type { DialogueOption } from "../../shared/protocol.ts";
import type { ToolCallResult } from "../adapter.ts";
import { SuggestFollowupTopicsSchema } from "../dialogue-tools.ts";
import { makeCloseOption, makeContinueOption } from "./helpers.ts";

export function extractFollowUpTopics(toolCalls: ToolCallResult[]): string[] {
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

export function buildFollowUpOptions(topics: string[], world: WorldState): DialogueOption[] {
  const seen = new Set<string>();
  const options: DialogueOption[] = [];

  const add = (opt: DialogueOption) => {
    if (!seen.has(opt.id)) {
      seen.add(opt.id);
      options.push(opt);
    }
  };

  for (let i = 0; i < topics.length; i++) {
    add(makeContinueOption(`chat:followup_${i}`, topics[i], "idle_chat"));
  }

  add(
    makeCloseOption(
      "chat:goodbye",
      world.contentPool.narrativeTemplates.questMessages.goodbyeOptionLabel,
      "close",
    ),
  );

  return options;
}

export function getPostSelectOptions(world: WorldState): DialogueOption[] {
  return [
    makeCloseOption(
      "chat:goodbye",
      world.contentPool.narrativeTemplates.questMessages.goodbyeOptionLabel,
      "close",
    ),
  ];
}
