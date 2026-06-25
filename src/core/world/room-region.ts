import type { Entity, Region, RegionId, Room, RoomId, WorldState } from "../types.ts";

export function addRoom(world: WorldState, room: Room): void {
  world.rooms.set(room.id, room);
}

export function getRoomEntities(world: WorldState, roomId: RoomId): Entity[] {
  const room = world.rooms.get(roomId);
  if (!room) return [];
  return Array.from(room.entities)
    .map((id) => world.entities.get(id))
    .filter((e): e is Entity => e !== undefined);
}

export function addRegion(world: WorldState, region: Region): void {
  world.regions.set(region.id, region);
}

export function getRegionEntities(world: WorldState, regionId: RegionId): Entity[] {
  return Array.from(world.entities.values()).filter(
    (e) => e.roomId && world.rooms.get(e.roomId)?.regionId === regionId,
  );
}
