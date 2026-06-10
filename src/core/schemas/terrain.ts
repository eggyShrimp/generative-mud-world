import { z } from "zod";

export const TerrainTypeSchema = z.enum([
  "road",
  "trail",
  "plain",
  "forest",
  "hills",
  "mountain",
  "desert",
  "oasis",
  "swamp",
  "river",
  "lake",
  "ocean",
  "bridge",
  "tunnel",
  "cave",
  "portal",
  "stairs_up",
  "stairs_down",
]);

export const TerrainConfigEntrySchema = z.object({
  terrain: TerrainTypeSchema,
  label: z.string().min(1),
  baseCost: z.number().min(0),
  speedMod: z.number().min(0),
  danger: z.number().min(0).max(10),
  requires: z.array(z.string()),
});

export const TerrainConfigSchema = z.array(TerrainConfigEntrySchema);

export type TerrainType = z.infer<typeof TerrainTypeSchema>;
export type TerrainConfigEntry = z.infer<typeof TerrainConfigEntrySchema>;
