import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { ContentPool } from "../core/types.ts";
import type { ToolDefinition } from "./adapter.ts";

const ShiftRelationArgs = z.object({
  direction: z.enum(["positive", "negative"]),
  magnitude: z.enum(["slight", "moderate", "strong"]),
});

const ShareInformationArgs = z.object({
  info_type: z.enum(["rumor", "warning", "gossip", "lore", "quest_hint"]),
  summary: z.string().min(1),
});

function buildAffectNeedArgs(needTypes: string[]) {
  if (needTypes.length === 0) {
    return z.object({
      target: z.enum(["speaker", "listener"]),
      need: z.string(),
      direction: z.enum(["positive", "negative"]),
      magnitude: z.enum(["slight", "moderate", "strong"]),
    });
  }
  return z.object({
    target: z.enum(["speaker", "listener"]),
    need: z.enum(needTypes as [string, ...string[]]),
    direction: z.enum(["positive", "negative"]),
    magnitude: z.enum(["slight", "moderate", "strong"]),
  });
}

function buildExpressEmotionArgs(emotions: string[]) {
  if (emotions.length === 0) {
    return z.object({
      emotion: z.string(),
      target: z.enum(["speaker", "listener", "topic"]),
    });
  }
  return z.object({
    emotion: z.enum(emotions as [string, ...string[]]),
    target: z.enum(["speaker", "listener", "topic"]),
  });
}

function zodSchemaToOpenAiParams(schema: z.ZodType): Record<string, unknown> {
  const jsonSchema = zodToJsonSchema(schema);
  if (
    typeof jsonSchema === "object" &&
    jsonSchema !== null &&
    "type" in jsonSchema &&
    "properties" in jsonSchema
  ) {
    const s = jsonSchema as Record<string, unknown>;
    return {
      type: s.type,
      properties: s.properties,
      ...("required" in s ? { required: s.required } : {}),
    };
  }
  return jsonSchema as Record<string, unknown>;
}

export function buildDialogueTools(pool: ContentPool): ToolDefinition[] {
  const needTypes = pool.needDefinitions.map((n) => n.type);
  const emotions = Object.keys(pool.emotionLabels);

  return [
    {
      type: "function",
      function: {
        name: "shift_relation",
        description: "改变说话者(NPC)与听者(玩家)之间的关系。在自然对话中体现态度变化时调用。",
        parameters: zodSchemaToOpenAiParams(ShiftRelationArgs),
      },
    },
    {
      type: "function",
      function: {
        name: "affect_need",
        description:
          "影响对话参与者的需求状态。例如安慰NPC使其social需求提升，或询问信息使玩家hunger需求下降。",
        parameters: zodSchemaToOpenAiParams(buildAffectNeedArgs(needTypes)),
      },
    },
    {
      type: "function",
      function: {
        name: "share_information",
        description: "NPC向玩家分享信息。信息会存为记忆，后续可能通过社会网络传播。",
        parameters: zodSchemaToOpenAiParams(ShareInformationArgs),
      },
    },
    {
      type: "function",
      function: {
        name: "express_emotion",
        description: "NPC表达情绪状态。记录到NPC记忆中，影响未来对话和行为。",
        parameters: zodSchemaToOpenAiParams(buildExpressEmotionArgs(emotions)),
      },
    },
  ];
}

export type { ShareInformationArgs, ShiftRelationArgs };
export type AffectNeedArgs = z.infer<ReturnType<typeof buildAffectNeedArgs>>;
export type ExpressEmotionArgs = z.infer<ReturnType<typeof buildExpressEmotionArgs>>;

export {
  buildAffectNeedArgs,
  buildExpressEmotionArgs,
  ShareInformationArgs as ShareInformationSchema,
  ShiftRelationArgs as ShiftRelationSchema,
};
