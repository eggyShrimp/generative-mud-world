import type {
  ContentPool,
  EntityId,
  ItemEntity,
  NeedType,
  NPCEntity,
  PlayerEntity,
  RegionId,
  Room,
  RoomId,
  TerrainType,
  Trait,
} from "../types.ts";
import { createDefaultCombatState } from "./entity-ops.ts";

export function createNPC(
  id: EntityId,
  overrides: Partial<NPCEntity>,
  _pool?: ContentPool,
): NPCEntity {
  return {
    id,
    type: "npc",
    name: overrides.name ?? id,
    roomId: overrides.roomId ?? null,
    description: overrides.description ?? "",
    personality: overrides.personality ?? "",
    traits: overrides.traits ?? [],
    needs: overrides.needs ?? [],
    relations: overrides.relations ?? [],
    memories: overrides.memories ?? [],
    schedule: overrides.schedule ?? [],
    npcTier: overrides.npcTier ?? "background",
    mood: overrides.mood ?? 50,
    availableActions: overrides.availableActions ?? [],
    inventory: overrides.inventory ?? [],
    combatState: overrides.combatState ?? createDefaultCombatState(),
    equipment: overrides.equipment ?? { weapon: null, armor: null, cloak: null, accessory: null },
    tags: overrides.tags,
  };
}

export function createPlayer(
  id: EntityId,
  name: string,
  roomId: RoomId,
  pool?: ContentPool,
  desc?: string,
  traits?: Trait[],
): PlayerEntity {
  const needDefs = pool?.needDefinitions ?? [];
  const needs = needDefs.map((n) => ({
    type: n.type as unknown as NeedType,
    value: 70,
    baseUrgency: n.baseUrgency,
    decayRate: n.decayRate,
  }));
  const coinTemplate = pool?.itemTemplates?.find((t) => t.id === "copper_coin");
  const coinName = coinTemplate?.name ?? "copper_coin";
  return {
    id,
    type: "player",
    name,
    roomId,
    description: desc ?? name,
    traits: traits ?? [],
    needs:
      needs.length > 0
        ? needs
        : [
            { type: "hunger", value: 80, baseUrgency: 0.5, decayRate: 5 },
            { type: "safety", value: 70, baseUrgency: 0.4, decayRate: 2 },
            { type: "social", value: 50, baseUrgency: 0.3, decayRate: 3 },
            { type: "rest", value: 100, baseUrgency: 0.2, decayRate: 8 },
          ],
    relations: [],
    memories: [],
    inventory: [
      {
        id: `${id}_coin_1`,
        type: "item",
        name: coinName,
        description: coinName,
        roomId: null,
        containerId: null,
        ownerId: id,
        templateId: "copper_coin",
        properties: { currency: true },
      },
      {
        id: `${id}_coin_2`,
        type: "item",
        name: coinName,
        description: coinName,
        roomId: null,
        containerId: null,
        ownerId: id,
        templateId: "copper_coin",
        properties: { currency: true },
      },
      {
        id: `${id}_coin_3`,
        type: "item",
        name: coinName,
        description: coinName,
        roomId: null,
        containerId: null,
        ownerId: id,
        templateId: "copper_coin",
        properties: { currency: true },
      },
      {
        id: `${id}_coin_4`,
        type: "item",
        name: coinName,
        description: coinName,
        roomId: null,
        containerId: null,
        ownerId: id,
        templateId: "copper_coin",
        properties: { currency: true },
      },
      {
        id: `${id}_coin_5`,
        type: "item",
        name: coinName,
        description: coinName,
        roomId: null,
        containerId: null,
        ownerId: id,
        templateId: "copper_coin",
        properties: { currency: true },
      },
    ],
    knownRooms: [],
    combatState: createDefaultCombatState(),
    equipment: { weapon: null, armor: null, cloak: null, accessory: null },
    activeQuests: [],
    completedQuests: [],
    failedQuests: [],
    activeStorylines: [],
    questCooldowns: {},
    travelogue: [],
    knownClues: [],
    discoveredEntities: [],
  };
}

export function createRoom(
  id: RoomId,
  name: string,
  regionId: RegionId,
  desc: string,
  terrain?: string,
  tags?: string[],
): Room {
  return {
    id,
    name,
    description: desc,
    regionId,
    terrain: (terrain ?? "plain") as TerrainType,
    exits: new Map(),
    entities: new Set(),
    tags,
  };
}

export function createItem(
  id: EntityId,
  name: string,
  templateId: string,
  properties: Record<string, unknown>,
  containerId: RoomId | EntityId,
  tags?: string[],
): ItemEntity {
  return {
    id,
    type: "item",
    name,
    roomId: null,
    description: name,
    ownerId: null,
    containerId,
    templateId,
    properties,
    tags,
  };
}
