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

export const WeatherStateSchema = z.object({
  id: z.string(),
  label: z.string(),
  movementMultiplier: z.number(),
  visibilityMultiplier: z.number(),
  narrativeDesc: z.string(),
});

export const SaveDataSchema = z.object({
  version: z.literal(1).default(1),
  meta: SaveMetaSchema,
  conversations: z.object({
    summaries: z.record(z.string(), z.array(ConversationSummaryEntrySchema)),
  }),
  weatherByRegion: z.record(z.string(), WeatherStateSchema).default({}),
});
