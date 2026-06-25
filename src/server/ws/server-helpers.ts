import type { RoomId, WorldState } from "../../core/types.ts";

export function getDirectionLabel(
  directionNames: Record<string, string>,
  direction: string,
): string {
  if (direction in directionNames) return direction;
  return Object.entries(directionNames).find(([, value]) => value === direction)?.[0] ?? direction;
}

export function getExitLabels(
  exits: Map<string, { to: RoomId }>,
  directionNames: Record<string, string>,
): string[] {
  return Array.from(exits.keys()).map((dir) => getDirectionLabel(directionNames, dir));
}

export function getTerrainLabel(world: WorldState, terrain?: string): string | undefined {
  if (!terrain) return undefined;
  return (
    world.contentPool.terrainConfig.find((entry) => entry.terrain === terrain)?.label ?? terrain
  );
}

export function getExitMask(
  exits: Map<string, { to: RoomId }>,
  directionNames: Record<string, string>,
): number {
  let mask = 0;
  const dirs = Object.keys(directionNames);
  if (exits.has(dirs[0]) || exits.has(directionNames[dirs[0]])) mask |= 0b0001;
  if (exits.has(dirs[2]) || exits.has(directionNames[dirs[2]])) mask |= 0b0010;
  if (exits.has(dirs[1]) || exits.has(directionNames[dirs[1]])) mask |= 0b0100;
  if (exits.has(dirs[3]) || exits.has(directionNames[dirs[3]])) mask |= 0b1000;
  return mask;
}
