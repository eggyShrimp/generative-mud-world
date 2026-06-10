import { z } from "zod";
import { TerrainTypeSchema } from "./terrain.ts";

const LayoutConfigSchema = z.object({
  rows: z.number().int().min(1),
  cols: z.number().int().min(1),
  rooms: z.array(z.string()),
  defaultDistance: z.number().min(0).default(1),
  defaultTerrain: TerrainTypeSchema.default("plain"),
  worldOffsetX: z.number().int().optional(),
  worldOffsetY: z.number().int().optional(),
});

const RegionLinkSchema = z.object({
  fromRegion: z.string(),
  toRegion: z.string(),
  direction: z.string().min(1),
  distance: z.number().min(0).default(1),
  terrain: TerrainTypeSchema.optional(),
  difficulty: z.number().min(0).max(10).optional(),
});

const GraphEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  direction: z.string().min(1),
  distance: z.number().min(0).default(1),
  terrain: TerrainTypeSchema.optional(),
  hidden: z.boolean().optional().default(false),
  bidirectional: z.boolean().optional().default(true),
  conditions: z
    .array(
      z.object({
        type: z.enum(["skill", "item", "trait", "time", "season", "quest"]),
        value: z.string(),
      }),
    )
    .optional(),
  description: z.string().optional(),
});

export const GraphConfigSchema = z.object({
  layout: z.record(z.string(), LayoutConfigSchema).optional(),
  regionLinks: z.array(RegionLinkSchema).optional(),
  edges: z.array(GraphEdgeSchema).optional(),
});

export type GraphConfig = z.input<typeof GraphConfigSchema>;
export type LayoutConfig = z.input<typeof LayoutConfigSchema>;
export type RegionLink = z.input<typeof RegionLinkSchema>;
