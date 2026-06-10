import { z } from "zod";
import { TerrainTypeSchema } from "./terrain.ts";

export const ExitConditionSchema = z.object({
  type: z.enum(["skill", "item", "trait", "time", "season", "quest"]),
  value: z.string(),
});

export const ExitSchema = z.object({
  to: z.string(),
  direction: z.string().min(1),
  distance: z.number().min(0).default(1),
  terrain: TerrainTypeSchema.optional(),
  hidden: z.boolean().optional().default(false),
  bidirectional: z.boolean().optional().default(true),
  conditions: z.array(ExitConditionSchema).optional(),
  description: z.string().optional(),
});

export type ExitCondition = z.infer<typeof ExitConditionSchema>;
export type Exit = z.infer<typeof ExitSchema>;
