import type { RegionId, RoomId, WorldEvent, WorldState } from "../types.ts";

export function logEvent(world: WorldState, event: WorldEvent): void {
  world.eventLog.push(event);
}

export function getRecentEvents(
  world: WorldState,
  scope: RoomId | RegionId | "global",
  sinceTick?: number,
): WorldEvent[] {
  return world.eventLog.filter((e) => {
    if (e.scope !== scope && e.scope !== "global") return false;
    if (sinceTick !== undefined && e.tick < sinceTick) return false;
    return true;
  });
}
