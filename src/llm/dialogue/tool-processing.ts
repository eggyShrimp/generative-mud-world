import type {
  ClueDefinition,
  DialogueEffectMapping,
  EntityId,
  NeedType,
  SimulationDelta,
} from "../../core/types.ts";
import type { ToolCallResult } from "../adapter.ts";
import {
  buildAffectNeedArgs,
  buildExpressEmotionArgs,
  ShareInformationSchema,
  ShiftRelationSchema,
} from "../dialogue-tools.ts";
import { emotionTranslate } from "./helpers.ts";

export function processToolCalls(
  toolCalls: ToolCallResult[],
  playerId: EntityId,
  npcId: EntityId,
  npcDisplayName: string,
  roomId: string | undefined,
  mapping: DialogueEffectMapping,
  emotionLabels: Record<string, string>,
  needTypes: string[],
  emotions: string[],
  clueDefinitions: ClueDefinition[],
): SimulationDelta {
  const delta: SimulationDelta = {};
  const affectNeedSchema = buildAffectNeedArgs(needTypes);
  const expressEmotionSchema = buildExpressEmotionArgs(emotions);

  for (const call of toolCalls) {
    switch (call.function.name) {
      case "shift_relation": {
        const parsed = ShiftRelationSchema.safeParse(JSON.parse(call.function.arguments));
        if (!parsed.success) continue;
        const args = parsed.data;
        const key = `${args.magnitude}_${args.direction}`;
        const effect = mapping.relation[key];
        if (effect) {
          delta.relationChanges = delta.relationChanges ?? [];
          delta.relationChanges.push({
            fromId: playerId,
            toId: npcId,
            delta: effect.delta,
          });
        }
        break;
      }

      case "affect_need": {
        const parsed = affectNeedSchema.safeParse(JSON.parse(call.function.arguments));
        if (!parsed.success) continue;
        const args = parsed.data;
        const key = `${args.magnitude}_${args.direction}`;
        const effect = mapping.needImpact[key];
        if (effect) {
          const targetId = args.target === "speaker" ? npcId : playerId;
          delta.needChanges = delta.needChanges ?? [];
          delta.needChanges.push({
            targetId,
            needType: args.need as unknown as NeedType,
            delta: effect.delta,
          });
        }
        break;
      }

      case "share_information": {
        const parsed = ShareInformationSchema.safeParse(JSON.parse(call.function.arguments));
        if (!parsed.success) continue;
        const args = parsed.data;
        const infoConfig = mapping.information[args.info_type];
        if (infoConfig) {
          delta.worldEvents = delta.worldEvents ?? [];
          delta.worldEvents.push({
            id: `info_${playerId}_${npcId}_${Date.now()}`,
            type: "information",
            title: `信息: ${args.summary}`,
            description: args.summary,
            scope: roomId ?? "global",
            tick: 0,
            source: "llm",
            data: {
              infoType: args.info_type,
              importance: infoConfig.memoryImportance,
              spreadChance: infoConfig.spreadChance,
            },
          });
        }
        if (args.clue_id) {
          const clueDef = clueDefinitions.find((c) => c.id === args.clue_id);
          if (clueDef?.knownByNpcIds.includes(npcId)) {
            delta.knownClueChanges = delta.knownClueChanges ?? [];
            delta.knownClueChanges.push({
              playerId,
              clueId: args.clue_id,
              sourceNpcId: npcId,
            });
          }
        }
        break;
      }

      case "express_emotion": {
        const parsed = expressEmotionSchema.safeParse(JSON.parse(call.function.arguments));
        if (!parsed.success) continue;
        const args = parsed.data;
        delta.worldEvents = delta.worldEvents ?? [];
        delta.worldEvents.push({
          id: `emotion_${npcId}_${Date.now()}`,
          type: "emotion",
          title: `情绪: ${args.emotion}`,
          description: `${npcDisplayName} 感到 ${emotionTranslate(args.emotion, emotionLabels)}`,
          scope: roomId ?? "global",
          tick: 0,
          source: "llm",
          data: { emotion: args.emotion, target: args.target },
        });
        break;
      }

      default:
        break;
    }
  }

  return delta;
}
