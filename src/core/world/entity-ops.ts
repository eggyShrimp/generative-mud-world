import { logWrite } from "../../shared/log.ts";
import type { CombatState, Entity, EntityId, PlayerEntity, RoomId, WorldState } from "../types.ts";

export function createDefaultCombatState(): CombatState {
  return {
    hp: 50,
    maxHp: 50,
    combatTarget: null,
    threatTable: {},
    lastAttackTick: 0,
    isDefending: false,
    isIncapacitated: false,
    incapacitatedUntil: 0,
  };
}

export function addEntity(world: WorldState, entity: Entity): void {
  world.entities.set(entity.id, entity);
  if (entity.roomId) {
    const room = world.rooms.get(entity.roomId);
    if (room) room.entities.add(entity.id);
  }
}

export function removeEntity(world: WorldState, id: EntityId): void {
  const entity = world.entities.get(id);
  if (!entity) return;
  if (entity.roomId) {
    const room = world.rooms.get(entity.roomId);
    room?.entities.delete(id);
  }
  world.entities.delete(id);
}

export function getEntity<T extends Entity = Entity>(
  world: WorldState,
  id: EntityId,
): T | undefined {
  return world.entities.get(id) as T | undefined;
}

export function moveEntity(world: WorldState, entityId: EntityId, toRoomId: RoomId): void {
  const entity = world.entities.get(entityId);
  if (!entity) return;
  if (entity.roomId) {
    world.rooms.get(entity.roomId)?.entities.delete(entityId);
  }
  entity.roomId = toRoomId;
  world.rooms.get(toRoomId)?.entities.add(entityId);
}

export function discoverRoom(player: PlayerEntity, roomId: RoomId): void {
  if (!player.knownRooms.includes(roomId)) {
    player.knownRooms.push(roomId);
  }
}

export function initializePlayer(_world: WorldState, player: PlayerEntity): void {
  if (player.roomId) {
    discoverRoom(player, player.roomId);
    logWrite("srv", "info", `[PlayerInit] ${player.name} 出生在 ${player.roomId}`);
  }
}
