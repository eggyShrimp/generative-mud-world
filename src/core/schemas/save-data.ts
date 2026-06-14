import { z } from "zod";

export const ConversationSummaryEntrySchema = z.object({
  summary: z.string(),
  lastTick: z.number(),
});

export const SaveMetaSchema = z.object({
  slotId: z.string().min(1),
  worldId: z.string().min(1),
  savedAt: z.number(),
  gameTick: z.number(),
  round: z.number(),
});

export const SaveDataSchema = z.object({
  meta: SaveMetaSchema,
  conversations: z.object({
    summaries: z.record(z.string(), z.array(ConversationSummaryEntrySchema)),
  }),
});
