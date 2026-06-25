import type {
  EntityId,
  Exit,
  ItemEntity,
  Need,
  NeedType,
  RoomId,
  WorldMutation,
  WorldState,
} from "../core/types.ts";
import { addEntity, addRoom, createItem, createNPC, createRoom } from "../core/world.ts";
import { getReverseDirection } from "../shared/directions.ts";
import { logWrite } from "../shared/log.ts";
import { getScheduleForRole } from "../simulation/index.ts";

// ============================================================
// Materializer: 将 WorldMutation 物化为 WorldState 中的实体
// 规则层，不调LLM
// ============================================================

export function materialize(world: WorldState, mutation: WorldMutation): string[] {
  const log: string[] = [];
  const roomNameToId = new Map<string, RoomId>();

  // 1. 创建新房间
  if (mutation.newRooms) {
    for (const roomDef of mutation.newRooms) {
      const roomId = generateRoomId(world, roomDef.name);
      roomNameToId.set(roomDef.name, roomId);
      const room = createRoom(
        roomId,
        roomDef.name,
        roomDef.regionId,
        roomDef.description,
        roomDef.terrain,
      );
      for (const [dir, rawDef] of Object.entries(roomDef.exits)) {
        const normalizedDef =
          typeof rawDef === "string"
            ? { to: rawDef, direction: dir, distance: 1, hidden: false, bidirectional: true }
            : rawDef;
        const exit: Exit = {
          ...normalizedDef,
          direction: normalizedDef.direction ?? dir,
          hidden: normalizedDef.hidden ?? false,
          bidirectional: normalizedDef.bidirectional ?? true,
        };
        room.exits.set(dir, exit);
        // 双向连接
        if (exit.bidirectional !== false) {
          const targetRoom = world.rooms.get(exit.to as RoomId);
          if (targetRoom) {
            const reverse = getReverseDirection(dir);
            if (reverse && !targetRoom.exits.has(reverse)) {
              targetRoom.exits.set(reverse, { ...exit, to: roomId, direction: reverse });
            }
          }
        }
      }
      addRoom(world, room);
      log.push(`新地点: ${roomDef.name}`);
    }
  }

  // 2. 创建新 NPC
  if (mutation.newNPCs) {
    const pool = world.contentPool;
    for (const npcDef of mutation.newNPCs) {
      const npcId = generateNPCId(world, npcDef.name);
      const schedule = npcDef.role ? getScheduleForRole(pool, npcDef.role) : [];
      const resolvedRoomId = roomNameToId.get(npcDef.roomId) ?? npcDef.roomId;

      const needs: Need[] = npcDef.needs
        ? Object.entries(npcDef.needs).map(([type, value]) => {
            const def = pool.needDefinitions.find((n) => n.type === type);
            return {
              type: type as unknown as NeedType,
              value,
              baseUrgency: def?.baseUrgency ?? 0.3,
              decayRate: def?.decayRate ?? 3,
            };
          })
        : [];

      const entity = createNPC(npcId, {
        name: npcDef.name,
        roomId: resolvedRoomId,
        personality: npcDef.personality,
        npcTier: npcDef.npcTier,
        tags: npcDef.tags ?? (npcDef.role ? [npcDef.role] : undefined),
        schedule,
        needs,
        traits: npcDef.traits ?? [],
      });
      addEntity(world, entity);

      if (npcDef.items && npcDef.items.length > 0) {
        const inventory: ItemEntity[] = [];
        for (const { templateId, quantity = 1 } of npcDef.items) {
          const template = pool.itemTemplates.find((t) => t.id === templateId);
          if (!template) {
            logWrite(
              "srv",
              "warn",
              `[materializer] add_npc ${npcDef.name}: unknown templateId "${templateId}"`,
            );
            continue;
          }
          for (let i = 0; i < quantity; i++) {
            const item = createItem(
              `${npcId}_item_${templateId}_${i}`,
              template.name,
              templateId,
              template.properties ?? {},
              npcId,
            );
            item.ownerId = npcId;
            addEntity(world, item);
            inventory.push(item);
          }
        }
        entity.inventory = inventory;
      }
      log.push(`新居民: ${npcDef.name} (${resolvedRoomId})`);
    }
  }

  // 3. 创建新派系
  if (mutation.newFactions) {
    for (const factionDef of mutation.newFactions) {
      const factionId = `faction_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const faction = {
        id: factionId,
        type: "faction" as const,
        name: factionDef.name,
        roomId: null,
        description: factionDef.goal,
        memberIds: factionDef.memberNPCIds,
        leaderId: factionDef.leaderNPCId,
        governanceForm: factionDef.governanceForm,
        identityLabel: factionDef.identityLabel ?? factionDef.name,
        economicBasis: factionDef.economicBasis ?? factionDef.goal,
        traits: factionDef.traits ?? [],
        needs: [],
        relations: [],
        population: factionDef.memberNPCIds.length,
        wealth: 50,
        militaryPower: 20,
        recognition: 10,
        cohesion: 60,
        influenceRadius: 1,
        availableActions: [],
      };
      addEntity(world, faction);
      log.push(`新派系: ${factionDef.name}`);
    }
  }

  // 4. 移除实体
  if (mutation.removeEntities) {
    for (const id of mutation.removeEntities) {
      world.entities.delete(id);
      log.push(`移除: ${id}`);
    }
  }

  return log;
}

function generateRoomId(world: WorldState, name: string): RoomId {
  const base = `room_${name.replace(/[^a-zA-Z\u4e00-\u9fa5]/g, "_").toLowerCase()}`;
  if (!world.rooms.has(base)) return base;
  return `${base}_${world.rooms.size}`;
}

function generateNPCId(world: WorldState, name: string): EntityId {
  const base = `npc_${name.replace(/[^a-zA-Z\u4e00-\u9fa5]/g, "_").toLowerCase()}`;
  if (!world.entities.has(base)) return base;
  return `${base}_${world.entities.size}`;
}
