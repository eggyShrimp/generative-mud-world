import type { ItemEntity, NPCEntity, PlayerEntity, WorldState } from "../../core/types.ts";
import { deriveCapabilities, getRoomEntitiesInfo } from "../../engine/capability-provider.ts";
import { logWrite } from "../../shared/log.ts";
import type { QuestInfo } from "../../shared/protocol.ts";
import { buildMinimap } from "./minimap.ts";
import { enrichQuests } from "./quest-utils.ts";
import { getDirectionLabel, getTerrainLabel } from "./server-helpers.ts";
import type { Session } from "./session-manager.ts";

interface EntityWithNeeds {
  needs?: Array<{ type: string; value: number }>;
  inventory?: ItemEntity[];
  relations?: Array<{ targetId: string; level: number; label: string }>;
}

export function pushState(
  world: WorldState,
  session: Session,
  sendFn: (session: Session, data: unknown) => void,
): void {
  const entityId = session.controlledEntityId;
  if (!entityId) return;

  const entity = world.entities.get(entityId);
  if (!entity) return;
  const room = entity.roomId ? world.rooms.get(entity.roomId) : null;
  const player = entity.type === "player" ? (entity as PlayerEntity) : null;

  const rawInventory = (entity as EntityWithNeeds).inventory ?? [];
  const mappedInventory = rawInventory.map((item) => ({
    id: item.id,
    name: item.name,
    type: "item" as const,
    description: item.description,
    templateId: item.templateId,
    properties: item.properties,
  }));

  if (rawInventory.length > 0) {
    logWrite(
      "srv",
      "dbg",
      `pushState ${entityId} type=${entity.type} inventory=[${rawInventory.map((i) => i.id).join(",")}]`,
    );
  }

  const relations = ((entity as EntityWithNeeds).relations ?? []).map((rel) => {
    if (rel.label == null || String(rel.label).includes("undefined")) {
      logWrite(
        "srv",
        "warn",
        `[pushState] bad relation label targetId=${rel.targetId} label=${JSON.stringify(rel.label)}`,
      );
    }
    return {
      targetId: rel.targetId,
      targetName: world.entities.get(rel.targetId)?.name ?? rel.targetId,
      level: Math.round(rel.level),
      label: rel.label,
    };
  });

  const roomActions: Array<{
    id: string;
    label: string;
    endsDay?: boolean;
    restRecovery?: number;
  }> = [];
  if (room?.tags) {
    for (const tag of room.tags) {
      const actionIds = world.contentPool.entityActionsByTag[tag] ?? [];
      for (const actionId of actionIds) {
        if (!roomActions.some((a) => a.id === actionId)) {
          const effect = world.contentPool.actionEffects.find((a) => a.action === actionId);
          roomActions.push({
            id: actionId,
            label: world.contentPool.entityActionLabels[actionId] ?? actionId,
            endsDay: effect?.endsDay ?? undefined,
            restRecovery:
              effect?.endsDay && effect.needDeltas.rest
                ? Number(effect.needDeltas.rest)
                : undefined,
          });
        }
      }
    }
  }

  const groundEffect = world.contentPool.actionEffects.find((a) => a.action === "end_day");
  const groundRestRecovery = Number(groundEffect?.needDeltas.rest ?? 20);

  sendFn(session, {
    type: "state_update",
    entity: {
      id: entity.id,
      name: entity.name,
      type: entity.type,
      roomId: entity.roomId,
      needs: ((entity as EntityWithNeeds).needs ?? []).map((need) => ({
        type: need.type,
        label: world.contentPool.needLabels[need.type] ?? need.type,
        value: Math.round(need.value),
      })),
      traits: "traits" in entity ? entity.traits : [],
      inventory: mappedInventory,
      relations,
      activeQuests:
        "activeQuests" in entity
          ? enrichQuests((entity as PlayerEntity).activeQuests, world.contentPool.questTemplates)
          : [],
      combatState:
        "combatState" in entity
          ? {
              hp: (entity as NPCEntity | PlayerEntity).combatState.hp,
              maxHp: (entity as NPCEntity | PlayerEntity).combatState.maxHp,
              combatTarget: (entity as NPCEntity | PlayerEntity).combatState.combatTarget,
              isDefending: (entity as NPCEntity | PlayerEntity).combatState.isDefending,
              isIncapacitated: (entity as NPCEntity | PlayerEntity).combatState.isIncapacitated,
            }
          : undefined,
      equipment:
        entity.type === "player"
          ? {
              weapon: (entity as PlayerEntity).equipment.weapon?.name
                ? { name: (entity as PlayerEntity).equipment.weapon?.name ?? "" }
                : undefined,
              armor: (entity as PlayerEntity).equipment.armor?.name
                ? { name: (entity as PlayerEntity).equipment.armor?.name ?? "" }
                : undefined,
              cloak: (entity as PlayerEntity).equipment.cloak?.name
                ? { name: (entity as PlayerEntity).equipment.cloak?.name ?? "" }
                : undefined,
              accessory: (entity as PlayerEntity).equipment.accessory?.name
                ? { name: (entity as PlayerEntity).equipment.accessory?.name ?? "" }
                : undefined,
            }
          : undefined,
    },
    room: room
      ? {
          id: room.id,
          name: room.name,
          description: room.description,
          exits: Object.fromEntries(
            Array.from(room.exits.entries())
              .filter(([, exit]) => {
                if (!exit.hidden) return true;
                if (!exit.conditions || !player) return false;
                return exit.conditions.some(
                  (cond) =>
                    cond.type === "clue" && player.knownClues.some((c) => c.clueId === cond.value),
                );
              })
              .map(([dir, exit]) => [
                dir,
                {
                  to: exit.to,
                  directionLabel: getDirectionLabel(
                    world.contentPool.narrativeTemplates.directionNames,
                    dir,
                  ),
                  distance: exit.distance,
                  terrain: exit.terrain,
                  terrainLabel: getTerrainLabel(world, exit.terrain),
                  destinationName: player?.knownRooms.includes(exit.to)
                    ? world.rooms.get(exit.to)?.name
                    : undefined,
                },
              ]),
          ),
          entities: getRoomEntitiesInfo(world, room.id, entityId),
          minimap: player ? buildMinimap(world, player) : undefined,
          roomActions,
        }
      : null,
    capabilities: deriveCapabilities(world, entityId),
    itemPropertyLabels: world.contentPool.itemPropertyLabels,
    groundRestRecovery,
  });
}

export function buildEnrichedQuests(player: PlayerEntity, world: WorldState): QuestInfo[] {
  return enrichQuests(player.activeQuests, world.contentPool.questTemplates);
}
