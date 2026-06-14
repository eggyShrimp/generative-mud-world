import { z } from "zod";
import { GraphConfigSchema } from "./graph.ts";
import { TerrainTypeSchema } from "./terrain.ts";

const RegionConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  dominantCulture: z.string(),
  prosperity: z.number().min(0).max(100),
  threatLevel: z.number().min(0).max(100),
});

const RoomConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  regionId: z.string().min(1),
  description: z.string(),
  terrain: TerrainTypeSchema.optional().default("plain"),
  tags: z.array(z.string()).optional().default([]),
});

const InventoryItemConfigSchema = z.object({
  templateId: z.string().min(1),
  quantity: z.number().int().min(1).optional(),
});

const NPCConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  roomId: z.string().min(1),
  personality: z.string(),
  npcTier: z.enum(["core", "regional", "background"]),
  role: z.string().optional(),
  tags: z.array(z.string()).optional(),
  traits: z.array(z.object({ name: z.string(), value: z.number() })).optional(),
  needs: z.record(z.string(), z.number()).optional(),
  items: z.array(InventoryItemConfigSchema).optional(),
});

const PlayerConfigSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  roomId: z.string().min(1),
  description: z.string().optional(),
  traits: z.array(z.object({ name: z.string(), value: z.number() })).optional(),
  needs: z.record(z.string(), z.number()).optional(),
  items: z.array(InventoryItemConfigSchema).optional(),
});

export const WorldConfigSchema = z.object({
  name: z.string().min(1),
  seed: z.string(),
  era: z.string(),
  regions: z.array(RegionConfigSchema).min(1),
  rooms: z.array(RoomConfigSchema).min(1),
  exits: z.record(z.string(), z.record(z.string(), z.string())).optional(),
  graph: GraphConfigSchema.optional(),
  npcs: z.array(NPCConfigSchema).optional(),
  players: z.array(PlayerConfigSchema).optional(),
});

export type WorldConfig = z.infer<typeof WorldConfigSchema>;
