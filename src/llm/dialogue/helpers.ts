import { z } from "zod";
import type { Entity, NPCEntity } from "../../core/types.ts";
import type { DialogueOption, DialogueOptionType } from "../../shared/protocol.ts";

export interface ConversationEntry {
  speaker: "player" | "npc";
  content: string;
  tick: number;
}

export const MAX_HISTORY_ROUNDS = 10;

export const QuestMenuSchema = z.object({
  narrative: z.string().trim().min(1),
  accept: z.string().trim().min(1),
  defer: z.string().trim().min(1),
  deferReply: z.string().trim().min(1).optional(),
  topics: z.array(z.string().trim().min(1)).default([]),
});

export interface PendingQuestMenu {
  questId: string;
  acceptOption: DialogueOption;
  deferOption: DialogueOption;
  deferReply: string;
  casualTopics: DialogueOption[];
}

export function makeContinueOption(
  id: string,
  label: string,
  type: DialogueOptionType,
  extra: Omit<Partial<DialogueOption>, "id" | "label" | "type" | "behavior"> = {},
): DialogueOption {
  return {
    ...extra,
    id,
    label,
    type,
    behavior: { kind: "continue", expects: "chat_options" },
  };
}

export function makeCloseOption(
  id: string,
  label: string,
  type: DialogueOptionType,
  extra: Omit<Partial<DialogueOption>, "id" | "label" | "type" | "behavior"> = {},
): DialogueOption {
  return {
    ...extra,
    id,
    label,
    type,
    behavior: { kind: "close" },
  };
}

export function isNpc(entity: Entity | undefined): entity is NPCEntity {
  return Boolean(entity && entity.type === "npc");
}

export function emotionTranslate(emotion: string, labels: Record<string, string>): string {
  return labels[emotion] ?? emotion;
}

export function labelForLevel(
  labels: Array<{ threshold: number; label: string }>,
  level: number,
): string {
  const sorted = [...labels].sort((a, b) => b.threshold - a.threshold);
  const found = sorted.find((label) => level >= label.threshold);
  return found?.label ?? sorted[sorted.length - 1]?.label ?? "";
}

export function formatOptionalList(
  label: string,
  values: string[],
  separator: string,
): string | null {
  if (values.length === 0) return null;
  return `${label}: ${values.join(separator)}`;
}
