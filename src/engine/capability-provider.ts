/**
 * 能力推导
 *
 * 根据 Entity 属性和所在房间，推导当前可用的操作。
 * 输出用于 state_update.capabilities 和客户端按钮渲染。
 */

import type { EntityId, WorldState } from "../core/types.ts";
import { getEntity } from "../core/world.ts";
import type { Capability } from "../shared/protocol.ts";

function actionLabel(world: WorldState, action: string): string {
  return (
    world.contentPool.narrativeTemplates.eventTitles[action] ??
    world.contentPool.entityActionLabels[action] ??
    action
  );
}

export function deriveCapabilities(world: WorldState, entityId: EntityId): Capability[] {
  const entity = getEntity(world, entityId);
  if (!entity) return [];

  const caps: Capability[] = [];
  const room = entity.roomId ? world.rooms.get(entity.roomId) : null;
  const readableTargets: string[] = [];

  // Incapacitated: only status
  if ("combatState" in entity && entity.combatState.isIncapacitated) {
    return [{ action: "status", label: actionLabel(world, "status") }];
  }

  const inCombat = "combatState" in entity && entity.combatState.combatTarget != null;

  if (inCombat) {
    // In combat: defend + flee + status, no move/talk/rest
    caps.push({ action: "defend", label: actionLabel(world, "defend") });
    caps.push({ action: "flee", label: actionLabel(world, "flee") });
    caps.push({ action: "status", label: actionLabel(world, "status") });
    return caps;
  }

  // Not in combat: standard capabilities + attack

  // move: 出口方向 (过滤隐藏出口, 但线索门控的隐藏出口在玩家知道线索时显示)
  if (room) {
    const playerForExit =
      entity.type === "player" ? (entity as import("../core/types.ts").PlayerEntity) : null;
    const directions = Array.from(room.exits.entries())
      .filter(([, exit]) => {
        if (!exit.hidden) return true;
        if (!exit.conditions || !playerForExit) return false;
        return exit.conditions.some(
          (cond) =>
            cond.type === "clue" && playerForExit.knownClues.some((c) => c.clueId === cond.value),
        );
      })
      .map(([dir]) => dir);
    if (directions.length > 0) {
      caps.push({
        action: "move",
        label: actionLabel(world, "move"),
        params: { type: "direction", values: directions },
      });
    }
  }

  // look: 房间 + 房间内实体
  const lookTargets = ["房间"];
  if (room) {
    const playerDiscovered =
      entity.type === "player"
        ? (entity as import("../core/types.ts").PlayerEntity).discoveredEntities
        : [];
    for (const eid of room.entities) {
      const e = world.entities.get(eid);
      if (!e || e.id === entityId) continue;
      if (
        e.type === "item" &&
        "discoverable" in e &&
        (e as import("../core/types.ts").ItemEntity).discoverable &&
        !playerDiscovered.includes(e.id)
      )
        continue;
      lookTargets.push(e.name);
    }
  }
  caps.push({
    action: "look",
    label: actionLabel(world, "look"),
    params: { type: "optional_target", values: lookTargets },
  });

  // talk: 房间内可对话 NPC
  if (room) {
    const talkTargets: string[] = [];
    for (const eid of room.entities) {
      const e = world.entities.get(eid);
      if (e && e.type === "npc") talkTargets.push(e.id);
    }
    if (talkTargets.length > 0) {
      caps.push({
        action: "talk",
        label: actionLabel(world, "talk"),
        params: { type: "npc_select", values: talkTargets },
      });
    }
  }

  // take: 房间内可拾取物品
  if (room) {
    const takeTargets: string[] = [];
    const playerDiscoveredForTake =
      entity.type === "player"
        ? (entity as import("../core/types.ts").PlayerEntity).discoveredEntities
        : [];
    for (const eid of room.entities) {
      const e = world.entities.get(eid);
      if (e && e.type === "item") {
        if (
          "discoverable" in e &&
          (e as import("../core/types.ts").ItemEntity).discoverable &&
          !playerDiscoveredForTake.includes(e.id)
        )
          continue;
        takeTargets.push(e.id);
        if (e.properties.readable === true) readableTargets.push(e.id);
      }
    }
    if (takeTargets.length > 0) {
      caps.push({
        action: "take",
        label: actionLabel(world, "take"),
        params: { type: "item_select", values: takeTargets },
      });
    }
  }

  // eat: 背包中可食用物品
  if ("inventory" in entity) {
    const inventory = entity.inventory as Array<{
      id: string;
      properties?: Record<string, unknown>;
    }>;
    if (inventory.length > 0) {
      caps.push({
        action: "drop",
        label: actionLabel(world, "drop"),
        params: { type: "item_select", values: inventory.map((i) => i.id) },
      });
      caps.push({
        action: "use",
        label: actionLabel(world, "use"),
        params: { type: "item_select", values: inventory.map((i) => i.id) },
      });
    }
    const edibleItems = (
      entity.inventory as Array<{ id: string; properties?: Record<string, unknown> }>
    )
      .filter((i) => i.properties?.edible)
      .map((i) => i.id);
    if (edibleItems.length > 0) {
      caps.push({
        action: "eat",
        label: actionLabel(world, "eat"),
        params: { type: "item_select", values: edibleItems },
      });
    }
    const readableItems = (
      entity.inventory as Array<{ id: string; properties?: Record<string, unknown> }>
    )
      .filter((i) => i.properties?.readable === true)
      .map((i) => i.id);
    readableTargets.push(...readableItems);
    // operate: 背包中有功能 tag 的物品
    const operableItems = (entity.inventory as Array<{ id: string; tags?: string[] }>)
      .filter((i) => {
        const tags = i.tags ?? [];
        return tags.some((tag) => (world.contentPool.entityActionsByTag[tag] ?? []).length > 0);
      })
      .map((i) => i.id);
    if (operableItems.length > 0) {
      caps.push({
        action: "operate",
        label: "操作",
        params: { type: "item_select", values: operableItems },
      });
    }
  }

  if (readableTargets.length > 0) {
    caps.push({
      action: "read",
      label: actionLabel(world, "read"),
      params: { type: "item_select", values: readableTargets },
    });
  }

  // attack: 房间内有 NPC
  if (room) {
    const attackTargets: string[] = [];
    for (const eid of room.entities) {
      const e = world.entities.get(eid);
      if (e && e.type === "npc" && "combatState" in e && !e.combatState.isIncapacitated) {
        attackTargets.push(e.id);
      }
    }
    if (attackTargets.length > 0) {
      caps.push({
        action: "attack",
        label: actionLabel(world, "attack"),
        params: { type: "npc_select", values: attackTargets },
      });
    }
  }

  // equip: 背包中有可装备物品
  if ("inventory" in entity && "equipment" in entity) {
    const equippableItems = (
      entity.inventory as Array<{ id: string; properties?: Record<string, unknown> }>
    )
      .filter((i) => i.properties?.atkBonus || i.properties?.defBonus)
      .map((i) => i.id);
    if (equippableItems.length > 0) {
      caps.push({
        action: "equip",
        label: actionLabel(world, "equip"),
        params: { type: "item_select", values: equippableItems },
      });
    }
  }

  // 固定操作 (无参数)
  caps.push({ action: "rest", label: actionLabel(world, "rest") });
  caps.push({ action: "status", label: actionLabel(world, "status") });
  caps.push({ action: "inventory", label: actionLabel(world, "inventory") });
  caps.push({ action: "quests", label: actionLabel(world, "quests") });
  caps.push({ action: "end_day", label: actionLabel(world, "end_day") });

  // 游记: 仅当玩家有游记条目时可用
  if (
    entity.type === "player" &&
    (entity as import("../core/types.ts").PlayerEntity).travelogue.length > 0
  ) {
    caps.push({ action: "travelogue", label: "游记" });
  }

  return caps;
}

export function getRoomEntitiesInfo(
  world: WorldState,
  roomId: string,
  viewerId?: string,
): Array<{
  id: string;
  name: string;
  type: string;
  description?: string;
  typeLabel?: string;
  interactable?: boolean;
  takeable?: boolean;
  combatState?: {
    hp: number;
    maxHp: number;
    combatTarget?: string | null;
    isDefending: boolean;
    isIncapacitated: boolean;
  };
  properties?: Record<string, unknown>;
}> {
  const room = world.rooms.get(roomId);
  if (!room) return [];

  const result: Array<{
    id: string;
    name: string;
    type: string;
    description?: string;
    typeLabel?: string;
    interactable?: boolean;
    takeable?: boolean;
    combatState?: {
      hp: number;
      maxHp: number;
      combatTarget?: string | null;
      isDefending: boolean;
      isIncapacitated: boolean;
    };
    properties?: Record<string, unknown>;
  }> = [];
  for (const eid of room.entities) {
    const e = world.entities.get(eid);
    if (!e) continue;

    if (
      e.type === "item" &&
      "discoverable" in e &&
      (e as import("../core/types.ts").ItemEntity).discoverable
    ) {
      if (viewerId) {
        const viewer = world.entities.get(viewerId);
        const discoveredEntities =
          viewer?.type === "player"
            ? (viewer as import("../core/types.ts").PlayerEntity).discoveredEntities
            : [];
        if (!discoveredEntities.includes(e.id)) continue;
      } else {
        continue;
      }
    }

    const entry: (typeof result)[number] = {
      id: e.id,
      name: e.name,
      type: e.type,
      description:
        "description" in e && e.description
          ? e.description
          : e.type === "npc"
            ? e.personality
            : undefined,
      typeLabel: world.contentPool.narrativeTemplates.eventTitles[`entity.${e.type}`] ?? e.type,
      interactable: e.type === "npc",
      takeable: e.type === "item",
    };
    if ("combatState" in e) {
      const cs = (
        e as import("../core/types.ts").NPCEntity | import("../core/types.ts").PlayerEntity
      ).combatState;
      entry.combatState = {
        hp: cs.hp,
        maxHp: cs.maxHp,
        combatTarget: cs.combatTarget,
        isDefending: cs.isDefending,
        isIncapacitated: cs.isIncapacitated,
      };
    }
    if (e.type === "item") {
      entry.properties = (e as import("../core/types.ts").ItemEntity).properties;
    }
    result.push(entry);
  }
  return result;
}
