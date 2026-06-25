import type { Entity, NPCEntity, PlayerEntity, WorldState } from "../../core/types.ts";
import { getRoomEntities } from "../../core/world.ts";
import { labelForLevel } from "./helpers.ts";

export interface DialogueContext {
  playerName: string;
  npcName: string;
  npcPersonality: string;
  npcMood: string;
  npcRole: string;
  roomName: string;
  roomDescription: string;
  npcNeeds: string;
  relationshipLevel: number;
  relationshipLabel: string;
  roomItems: string[];
  roomNpcs: string[];
  npcItems: Array<{ id: string; name: string }>;
  playerItems: Array<{ id: string; name: string }>;
  connectedRooms: string[];
  npcMemories: string[];
  npcKnownClues: Array<{ id: string; description: string }>;
}

export interface MinimalContext {
  npcRole: string;
}

export function buildMinimalContext(world: WorldState, npc: NPCEntity): MinimalContext {
  return {
    npcRole: (npc.tags?.[0] && world.contentPool.entityTagLabels[npc.tags[0]]) ?? npc.npcTier,
  };
}

export function buildContext(world: WorldState, player: Entity, npc: NPCEntity): DialogueContext {
  const room = player.roomId ? world.rooms.get(player.roomId) : null;
  const rel =
    "relations" in player
      ? (
          player as unknown as Record<
            string,
            Array<{ targetId: string; level: number; label: string }>
          >
        ).relations.find((r) => r.targetId === npc.id)
      : null;

  const roomId = player.roomId;
  const roomEntities = roomId ? getRoomEntities(world, roomId) : [];
  const roomItems = roomEntities.filter((e) => e.type === "item").map((e) => e.name);
  const roomNpcs = roomEntities
    .filter((e) => e.type === "npc" && e.id !== npc.id)
    .map((e) => e.name);

  const npcItems = npc.inventory.map((item) => ({ id: item.id, name: item.name }));
  const playerInventory = "inventory" in player ? (player as PlayerEntity).inventory : [];
  const playerItems = playerInventory.map((item) => ({ id: item.id, name: item.name }));

  const connectedRooms = room
    ? Array.from(room.exits.entries()).map(([dir, exit]) => {
        const targetRoom = world.rooms.get(exit.to);
        return `${dir}→${targetRoom?.name ?? exit.to}`;
      })
    : [];

  const npcMemories = npc.memories.slice(-5).map((m) => m.content);

  const npcKnownClues = world.contentPool.clueDefinitions
    .filter((c) => c.knownByNpcIds.includes(npc.id))
    .map((c) => ({ id: c.id, description: c.description }));

  return {
    playerName: player.name,
    npcName: npc.name,
    npcPersonality: npc.personality,
    npcMood: labelForLevel(world.contentPool.narrativeTemplates.moodLabels, npc.mood ?? 50),
    npcRole: buildMinimalContext(world, npc).npcRole,
    roomName: room?.name ?? roomId ?? "",
    roomDescription: room?.description ?? "",
    npcNeeds: npc.needs
      .map(
        (need) =>
          `${world.contentPool.needLabels[need.type] ?? need.type}: ${Math.round(need.value)}`,
      )
      .join(", "),
    relationshipLevel: rel?.level ?? 0,
    relationshipLabel:
      rel?.label ??
      labelForLevel(world.contentPool.narrativeTemplates.relationLabels, rel?.level ?? 0),
    roomItems,
    roomNpcs,
    npcItems,
    playerItems,
    connectedRooms,
    npcMemories,
    npcKnownClues,
  };
}
