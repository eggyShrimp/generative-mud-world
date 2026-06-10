import { z } from "zod";
import { ExitSchema } from "./exit.ts";
import { TerrainTypeSchema } from "./terrain.ts";

export const NewExitSchema = ExitSchema;

export const NewRoomDefSchema = z.object({
  name: z.string().min(1),
  regionId: z.string().min(1),
  description: z.string(),
  terrain: TerrainTypeSchema.optional().default("plain"),
  exits: z.record(z.string(), NewExitSchema),
});

export const NewNPCDefSchema = z.object({
  name: z.string().min(1),
  roomId: z.string().min(1),
  personality: z.string(),
  npcTier: z.enum(["core", "regional", "background"]),
  role: z.string().optional(),
  gender: z.enum(["male", "female", "neutral"]).optional(),
  tags: z.array(z.string()).optional(),
  needs: z.record(z.string(), z.number()).optional(),
  traits: z.array(z.object({ name: z.string(), value: z.number() })).optional(),
  items: z
    .array(
      z.object({
        templateId: z.string().min(1),
        quantity: z.number().int().min(1).optional(),
      }),
    )
    .optional(),
});

export const NewFactionDefSchema = z.object({
  name: z.string().min(1),
  leaderNPCId: z.string().min(1),
  memberNPCIds: z.array(z.string()),
  goal: z.string(),
  governanceForm: z.string(),
  identityLabel: z.string().optional(),
  economicBasis: z.string().optional(),
  traits: z.array(z.object({ name: z.string(), value: z.number() })).optional(),
  needs: z.record(z.string(), z.number()).optional(),
});

export const WorldMutationSchema = z.object({
  newRooms: z.array(NewRoomDefSchema).optional(),
  newNPCs: z.array(NewNPCDefSchema).optional(),
  newFactions: z.array(NewFactionDefSchema).optional(),
  removeEntities: z.array(z.string()).optional(),
  narrativeContext: z.string().optional(),
});

export type NewRoomDef = z.infer<typeof NewRoomDefSchema>;
export type NewNPCDef = z.infer<typeof NewNPCDefSchema>;
export type NewFactionDef = z.infer<typeof NewFactionDefSchema>;
export type WorldMutation = z.infer<typeof WorldMutationSchema>;
