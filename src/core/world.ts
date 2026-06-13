import type { CombatState } from "../combat/types.ts";
import { logWrite } from "../shared/log.ts";
import { resolveRelationLabel } from "./relation-label.ts";
import type {
  ContentPool,
  Entity,
  EntityId,
  FactionEntity,
  GameTime,
  ItemEntity,
  NeedType,
  NPCEntity,
  PlayerEntity,
  Region,
  RegionId,
  Room,
  RoomId,
  SimulationDelta,
  Trait,
  WorldEvent,
  WorldState,
} from "./types.ts";

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

export function createWorld(): WorldState {
  return {
    tick: 0,
    entities: new Map(),
    rooms: new Map(),
    regions: new Map(),
    eventLog: [],
    time: { tick: 0, hour: 6, day: 1, month: 1, year: 1 },
    round: 0,
    contentPool: createDefaultContentPool(),
    completedStorylines: [],
  };
}

// Entity operations
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

// Room operations
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

// Region operations
export function addRegion(world: WorldState, region: Region): void {
  world.regions.set(region.id, region);
}

export function getRegionEntities(world: WorldState, regionId: RegionId): Entity[] {
  return Array.from(world.entities.values()).filter(
    (e) => e.roomId && world.rooms.get(e.roomId)?.regionId === regionId,
  );
}

// Event log
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

// Time
export function advanceTime(world: WorldState): void {
  world.tick++;
  world.time.tick = world.tick;
  world.time.hour++;
  if (world.time.hour >= 24) {
    world.time.hour = 0;
    world.time.day++;
    if (world.time.day > 30) {
      world.time.day = 1;
      world.time.month++;
      if (world.time.month > 12) {
        world.time.month = 1;
        world.time.year++;
      }
    }
  }
}

export function advanceDay(world: WorldState): void {
  const cal = world.contentPool.calendar;
  world.time.hour = cal.hourStart;
  world.time.day++;
  world.tick += 24;
  world.time.tick = world.tick;
  if (world.time.day > cal.daysPerMonth) {
    world.time.day = 1;
    world.time.month++;
    if (world.time.month > cal.monthsPerYear) {
      world.time.month = 1;
      world.time.year++;
    }
  }
}

export function formatDate(time: GameTime, pool?: { calendar: ContentPool["calendar"] }): string {
  const cal = pool?.calendar;
  const monthNames = cal?.monthNames ?? [];
  const month = monthNames[time.month - 1] ?? `${time.month}月`;
  const yearStr = cal?.yearFormat
    ? cal.yearFormat.replace("{era}", cal.eraName).replace("{year}", String(time.year))
    : `第${time.year}年`;
  return `${yearStr} ${month} 第${time.day}日`;
}

let itemCounter = 0;

// Delta application
export function applyDelta(world: WorldState, delta: SimulationDelta): void {
  for (const mod of delta.traitModifiers ?? []) {
    const entity = world.entities.get(mod.targetId);
    if (!entity || !("traits" in entity)) {
      logWrite(
        "srv",
        "warn",
        `[applyDelta] ignored trait change, entity ${mod.targetId} missing traits`,
      );
      continue;
    }
    const owner = entity as NPCEntity | PlayerEntity | FactionEntity;
    const trait = owner.traits.find((t) => t.name === mod.trait);
    if (trait) {
      trait.value = Math.max(-100, Math.min(100, trait.value + mod.delta));
    } else {
      owner.traits.push({ name: mod.trait, value: Math.max(-100, Math.min(100, mod.delta)) });
    }
  }

  for (const change of delta.needChanges ?? []) {
    const entity = world.entities.get(change.targetId);
    if (!entity || !("needs" in entity)) {
      logWrite(
        "srv",
        "warn",
        `[applyDelta] ignored need change, entity ${change.targetId} missing needs`,
      );
      continue;
    }
    const e = entity as NPCEntity | PlayerEntity | FactionEntity;
    const need = e.needs.find((n) => n.type === change.needType);
    if (need) {
      need.value = Math.max(0, Math.min(100, need.value + change.delta));
    } else {
      logWrite("srv", "warn", `[applyDelta] missing need ${change.needType} on ${change.targetId}`);
    }
  }

  for (const change of delta.relationChanges ?? []) {
    const entity = world.entities.get(change.fromId);
    if (!entity || !("relations" in entity)) {
      logWrite(
        "srv",
        "warn",
        `[applyDelta] ignored relation change, entity ${change.fromId} missing relations`,
      );
      continue;
    }
    const e = entity as NPCEntity | PlayerEntity | FactionEntity;
    const rel = e.relations.find((r) => r.targetId === change.toId);
    if (rel) {
      rel.level = Math.max(-100, Math.min(100, rel.level + change.delta));
      rel.label = resolveRelationLabel(world.contentPool, rel.level, rel.label, change.newLabel);
      rel.lastInteractionTick = world.tick;
    } else {
      const level = Math.max(-100, Math.min(100, change.delta));
      e.relations.push({
        targetId: change.toId,
        level,
        label: resolveRelationLabel(world.contentPool, level, undefined, change.newLabel),
        lastInteractionTick: world.tick,
      });
    }
  }

  for (const event of delta.worldEvents ?? []) {
    logEvent(world, event);
  }

  for (const hpChange of delta.combatHpChanges ?? []) {
    const entity = world.entities.get(hpChange.targetId);
    if (!entity || !("combatState" in entity)) {
      logWrite(
        "srv",
        "warn",
        `[applyDelta] ignored combat change, unknown target: ${hpChange.targetId}`,
      );
      continue;
    }
    const cs = (entity as NPCEntity | PlayerEntity).combatState;
    cs.hp = Math.max(0, Math.min(cs.maxHp, cs.hp + hpChange.delta));
  }

  for (const change of delta.questChanges ?? []) {
    const player = world.entities.get(change.playerId) as PlayerEntity | undefined;
    if (player?.type !== "player") {
      logWrite(
        "srv",
        "warn",
        `[applyDelta] ignored quest change, unknown player: ${change.playerId}`,
      );
      continue;
    }
    switch (change.type) {
      case "accept": {
        if (player.activeQuests.some((q) => q.templateId === change.templateId)) break;
        const template = world.contentPool.questTemplates.find((t) => t.id === change.templateId);
        if (!template) {
          logWrite(
            "srv",
            "warn",
            `[applyDelta] ignored quest accept, unknown template: ${change.templateId}`,
          );
          break;
        }
        const maxGroup = template.objectives.reduce((max, o) => Math.max(max, o.groupId), 0);
        player.activeQuests.push({
          templateId: template.id,
          status: "active",
          acceptedDay: world.time.day,
          deadlineDay: template.deadlineDays ? world.time.day + template.deadlineDays : null,
          groupCompleted: Array.from({ length: maxGroup + 1 }, () => false),
          objectiveProgress: [],
        });
        break;
      }
      case "progress": {
        const quest = player.activeQuests.find((q) => q.templateId === change.templateId);
        if (quest?.status !== "active") break;
        const idx = change.objectiveIndex ?? 0;
        const template = world.contentPool.questTemplates.find((t) => t.id === change.templateId);
        if (!template) {
          logWrite(
            "srv",
            "warn",
            `[applyDelta] ignored quest progress, unknown template: ${change.templateId}`,
          );
          break;
        }
        quest.objectiveProgress[idx] = change.count ?? 0;
        const obj = template?.objectives[idx];
        if (obj && (change.count ?? 0) >= obj.count) {
          quest.groupCompleted[obj.groupId] = true;
        }
        break;
      }
      case "complete": {
        const quest = player.activeQuests.find((q) => q.templateId === change.templateId);
        if (quest) quest.status = "completed";
        if (!player.completedQuests.includes(change.templateId)) {
          player.completedQuests.push(change.templateId);
        }
        player.questCooldowns[change.templateId] = world.time.day;
        const template = world.contentPool.questTemplates.find((t) => t.id === change.templateId);
        if (template?.rewards) {
          const r = template.rewards;
          applyTraitRewards(player, r.traitModifiers);
          if (r.relationDelta) {
            const target = world.entities.get(r.relationDelta.targetId);
            if (target && "relations" in target) {
              const owner = target as NPCEntity | PlayerEntity | FactionEntity;
              const rel = owner.relations.find((rel) => rel.targetId === player.id);
              if (rel) {
                rel.level = Math.max(-100, Math.min(100, rel.level + r.relationDelta.delta));
                rel.lastInteractionTick = world.tick;
              } else {
                owner.relations.push({
                  targetId: player.id,
                  level: Math.max(-100, Math.min(100, r.relationDelta.delta)),
                  label: "任务相关",
                  lastInteractionTick: world.tick,
                });
              }
            }
          }
          applyNeedRewards(player, r.needChanges);
          applyItemRewards(world, player, r.items);
        }
        break;
      }
      case "fail": {
        const quest = player.activeQuests.find((q) => q.templateId === change.templateId);
        if (quest) quest.status = "failed";
        if (!player.failedQuests.some((f) => f.templateId === change.templateId)) {
          player.failedQuests.push({
            templateId: change.templateId,
            failedDay: world.time.day,
            reason: change.reason ?? "unknown",
          });
        }
        const template = world.contentPool.questTemplates.find((t) => t.id === change.templateId);
        if (template?.abandonPenalty) {
          const p = template.abandonPenalty;
          applyTraitRewards(player, p.traitModifiers);
          if (p.relationDelta) {
            const target = world.entities.get(p.relationDelta.targetId);
            if (target && "relations" in target) {
              const owner = target as NPCEntity | PlayerEntity | FactionEntity;
              const rel = owner.relations.find((rel) => rel.targetId === player.id);
              if (rel) {
                rel.level = Math.max(-100, Math.min(100, rel.level + p.relationDelta.delta));
                rel.lastInteractionTick = world.tick;
              }
            }
          }
          applyNeedRewards(player, p.needChanges);
        }
        break;
      }
    }
  }

  for (const change of delta.itemChanges ?? []) {
    const entity = world.entities.get(change.targetId);
    if (!entity || !("inventory" in entity)) {
      logWrite(
        "srv",
        "warn",
        `[applyDelta] ignored item change, entity ${change.targetId} has no inventory`,
      );
      continue;
    }
    const inv = (entity as NPCEntity | PlayerEntity).inventory;
    if (change.operation === "add") {
      if (change.itemId) {
        const item = world.entities.get(change.itemId);
        if (item?.type !== "item") {
          logWrite(
            "srv",
            "warn",
            `[applyDelta] item transfer: item ${change.itemId} not found or not an item`,
          );
          continue;
        }
        item.ownerId = change.targetId;
        item.containerId = null;
        item.roomId = null;
        inv.push(item as ItemEntity);
        continue;
      }
      const template = world.contentPool.itemTemplates.find((t) => t.id === change.templateId);
      const itemName = template?.name ?? change.templateId;
      const itemProps = { ...(template?.properties ?? {}) };
      for (let i = 0; i < change.qty; i++) {
        const item: ItemEntity = {
          type: "item",
          id: `${change.targetId}_${change.templateId}_${Date.now()}_${++itemCounter}`,
          name: itemName,
          roomId: null,
          description: itemName,
          ownerId: change.targetId,
          containerId: null,
          templateId: change.templateId,
          properties: itemProps,
        };
        world.entities.set(item.id, item);
        inv.push(item);
      }
    } else if (change.operation === "remove") {
      if (change.itemId) {
        const idx = inv.findIndex((i) => i.id === change.itemId);
        if (idx >= 0) {
          inv.splice(idx, 1);
        }
        continue;
      }
      let removed = 0;
      for (let i = inv.length - 1; i >= 0 && removed < change.qty; i--) {
        if (inv[i].templateId === change.templateId) {
          const item = inv[i];
          inv.splice(i, 1);
          world.entities.delete(item.id);
          removed++;
        }
      }
      if (removed < change.qty) {
        logWrite(
          "srv",
          "warn",
          `[applyDelta] item remove: only removed ${removed}/${change.qty} of ${change.templateId} from ${change.targetId}`,
        );
      }
    }
  }

  for (const reveal of delta.revealRooms ?? []) {
    const entity = world.entities.get(reveal.entityId);
    if (entity?.type !== "player") {
      logWrite(
        "srv",
        "warn",
        `[applyDelta] ignored room reveal, unknown player: ${reveal.entityId}`,
      );
      continue;
    }
    if (!world.rooms.has(reveal.roomId)) {
      logWrite("srv", "warn", `[applyDelta] ignored room reveal, unknown room: ${reveal.roomId}`);
      continue;
    }
    discoverRoom(entity, reveal.roomId);
  }
}

function applyTraitRewards(
  player: PlayerEntity,
  modifiers: Array<{ trait: string; delta: number }> | undefined,
): void {
  for (const tm of modifiers ?? []) {
    const trait = player.traits.find((t) => t.name === tm.trait);
    if (trait) {
      trait.value = Math.max(-100, Math.min(100, trait.value + tm.delta));
    } else {
      player.traits.push({
        name: tm.trait,
        value: Math.max(-100, Math.min(100, tm.delta)),
      });
    }
  }
}

function applyNeedRewards(
  player: PlayerEntity,
  changes: Array<{ needType: string; delta: number }> | undefined,
): void {
  for (const nc of changes ?? []) {
    const need = player.needs.find((n) => n.type === nc.needType);
    if (need) {
      need.value = Math.max(0, Math.min(100, need.value + nc.delta));
    } else {
      logWrite("srv", "warn", `[applyDelta] missing reward need ${nc.needType} on ${player.id}`);
    }
  }
}

function applyItemRewards(
  world: WorldState,
  player: PlayerEntity,
  rewards: Array<{ itemId: string; quantity: number; name?: string }> | undefined,
): void {
  for (const reward of rewards ?? []) {
    const template = world.contentPool.itemTemplates.find((t) => t.id === reward.itemId);
    const itemName = reward.name ?? template?.name ?? reward.itemId;
    for (let i = 0; i < reward.quantity; i++) {
      const item: ItemEntity = {
        type: "item",
        id: `${player.id}_${reward.itemId}_${Date.now()}_${++itemCounter}`,
        name: itemName,
        roomId: null,
        description: itemName,
        ownerId: player.id,
        containerId: null,
        templateId: reward.itemId,
        properties: { ...(template?.properties ?? {}), questItem: true },
      };
      world.entities.set(item.id, item);
      player.inventory.push(item);
    }
  }
}

// Entity factory helpers
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
    equipment: overrides.equipment ?? { weapon: null, armor: null },
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
  return {
    id,
    type: "player",
    name,
    roomId,
    description: desc ?? `${name}，路过此地的旅人。`,
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
        name: "铜币",
        description: "铜币",
        roomId: null,
        containerId: null,
        ownerId: id,
        templateId: "copper_coin",
        properties: { currency: true },
      },
      {
        id: `${id}_coin_2`,
        type: "item",
        name: "铜币",
        description: "铜币",
        roomId: null,
        containerId: null,
        ownerId: id,
        templateId: "copper_coin",
        properties: { currency: true },
      },
      {
        id: `${id}_coin_3`,
        type: "item",
        name: "铜币",
        description: "铜币",
        roomId: null,
        containerId: null,
        ownerId: id,
        templateId: "copper_coin",
        properties: { currency: true },
      },
      {
        id: `${id}_coin_4`,
        type: "item",
        name: "铜币",
        description: "铜币",
        roomId: null,
        containerId: null,
        ownerId: id,
        templateId: "copper_coin",
        properties: { currency: true },
      },
      {
        id: `${id}_coin_5`,
        type: "item",
        name: "铜币",
        description: "铜币",
        roomId: null,
        containerId: null,
        ownerId: id,
        templateId: "copper_coin",
        properties: { currency: true },
      },
    ],
    knownRooms: [],
    combatState: createDefaultCombatState(),
    equipment: { weapon: null, armor: null },
    activeQuests: [],
    completedQuests: [],
    failedQuests: [],
    activeStorylines: [],
    questCooldowns: {},
    travelogue: [],
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
    terrain: (terrain ?? "plain") as import("./types.ts").TerrainType,
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

// --- ContentPool — 可演化数据 ---

export function createDefaultContentPool(): ContentPool {
  return {
    needDefinitions: [
      {
        type: "hunger",
        baseUrgency: 0.5,
        decayRate: 5,
        description: "对食物的需求",
        bornFrom: "baseline",
      },
      {
        type: "safety",
        baseUrgency: 0.4,
        decayRate: 2,
        description: "对人身安全的需求",
        bornFrom: "baseline",
      },
      {
        type: "social",
        baseUrgency: 0.3,
        decayRate: 3,
        description: "对社交互动的需求",
        bornFrom: "baseline",
      },
      {
        type: "rest",
        baseUrgency: 0.2,
        decayRate: 8,
        description: "对休息的需求",
        bornFrom: "baseline",
      },
    ],

    actionEffects: [
      {
        action: "eat_at_tavern",
        needDeltas: { hunger: 30, social: 10 },
        itemCosts: { copper_coin: 3 },
      },
      { action: "eat_at_home", needDeltas: { hunger: 25 } },
      { action: "sleep_at_home", needDeltas: { rest: 50 } },
      { action: "work_at_smithy", needDeltas: { rest: -10 }, itemDeltas: { iron_ore: 1 } },
      {
        action: "work_at_farm",
        needDeltas: { rest: -15, hunger: -5 },
        itemDeltas: { copper_coin: 2 },
      },
      { action: "guard_post", needDeltas: { safety: 10, rest: -5 } },
      { action: "serve_lunch", needDeltas: { social: 10 }, itemDeltas: { copper_coin: 2 } },
      { action: "serve_dinner", needDeltas: { social: 10 }, itemDeltas: { copper_coin: 2 } },
      { action: "prepare_tavern", needDeltas: { rest: -5 } },
      { action: "rest", needDeltas: { rest: 15 } },
      { action: "tend_stall", needDeltas: { social: 5, rest: -8 }, itemDeltas: { copper_coin: 3 } },
      { action: "count_coins", needDeltas: {} },
      { action: "socialize", needDeltas: { social: 10 } },
      { action: "patrol", needDeltas: { safety: 5, rest: -5 } },
      { action: "move", needDeltas: { rest: -5 } },
      { action: "talk", needDeltas: { social: 5, rest: -2 } },
      { action: "wait", needDeltas: { rest: 3 } },
    ],

    needActionMap: [
      { needType: "hunger", actionNames: ["eat_at_tavern", "eat_at_home"] },
      { needType: "safety", actionNames: ["guard_post", "patrol"] },
      {
        needType: "social",
        actionNames: ["socialize", "eat_at_tavern", "serve_lunch", "serve_dinner", "tend_stall"],
      },
      { needType: "rest", actionNames: ["sleep_at_home", "rest"] },
    ],

    scheduleTemplates: [
      {
        role: "blacksmith",
        schedule: [
          {
            startHour: 6,
            endHour: 12,
            action: "work_at_smithy",
            targetRoomId: null,
            priority: 8,
            deviationAllowed: true,
          },
          {
            startHour: 12,
            endHour: 13,
            action: "eat_at_tavern",
            targetRoomId: null,
            priority: 9,
            deviationAllowed: false,
          },
          {
            startHour: 13,
            endHour: 18,
            action: "work_at_smithy",
            targetRoomId: null,
            priority: 8,
            deviationAllowed: true,
          },
          {
            startHour: 18,
            endHour: 19,
            action: "eat_at_tavern",
            targetRoomId: null,
            priority: 9,
            deviationAllowed: false,
          },
          {
            startHour: 19,
            endHour: 22,
            action: "socialize",
            targetRoomId: null,
            priority: 5,
            deviationAllowed: true,
          },
          {
            startHour: 22,
            endHour: 6,
            action: "sleep_at_home",
            targetRoomId: null,
            priority: 10,
            deviationAllowed: false,
          },
        ],
      },
      {
        role: "guard",
        schedule: [
          {
            startHour: 6,
            endHour: 14,
            action: "guard_post",
            targetRoomId: null,
            priority: 9,
            deviationAllowed: false,
          },
          {
            startHour: 14,
            endHour: 15,
            action: "eat_at_tavern",
            targetRoomId: null,
            priority: 9,
            deviationAllowed: false,
          },
          {
            startHour: 15,
            endHour: 22,
            action: "patrol",
            targetRoomId: null,
            priority: 8,
            deviationAllowed: true,
          },
          {
            startHour: 22,
            endHour: 6,
            action: "sleep_at_home",
            targetRoomId: null,
            priority: 10,
            deviationAllowed: false,
          },
        ],
      },
      {
        role: "farmer",
        schedule: [
          {
            startHour: 5,
            endHour: 12,
            action: "work_at_farm",
            targetRoomId: null,
            priority: 8,
            deviationAllowed: true,
          },
          {
            startHour: 12,
            endHour: 13,
            action: "eat_at_home",
            targetRoomId: null,
            priority: 9,
            deviationAllowed: false,
          },
          {
            startHour: 13,
            endHour: 18,
            action: "work_at_farm",
            targetRoomId: null,
            priority: 8,
            deviationAllowed: true,
          },
          {
            startHour: 18,
            endHour: 20,
            action: "eat_at_home",
            targetRoomId: null,
            priority: 9,
            deviationAllowed: false,
          },
          {
            startHour: 20,
            endHour: 5,
            action: "sleep_at_home",
            targetRoomId: null,
            priority: 10,
            deviationAllowed: false,
          },
        ],
      },
      {
        role: "tavern_keeper",
        schedule: [
          {
            startHour: 6,
            endHour: 12,
            action: "prepare_tavern",
            targetRoomId: null,
            priority: 9,
            deviationAllowed: false,
          },
          {
            startHour: 12,
            endHour: 14,
            action: "serve_lunch",
            targetRoomId: null,
            priority: 9,
            deviationAllowed: false,
          },
          {
            startHour: 14,
            endHour: 18,
            action: "rest",
            targetRoomId: null,
            priority: 7,
            deviationAllowed: true,
          },
          {
            startHour: 18,
            endHour: 23,
            action: "serve_dinner",
            targetRoomId: null,
            priority: 9,
            deviationAllowed: false,
          },
          {
            startHour: 23,
            endHour: 6,
            action: "sleep_at_home",
            targetRoomId: null,
            priority: 10,
            deviationAllowed: false,
          },
        ],
      },
      {
        role: "merchant",
        schedule: [
          {
            startHour: 7,
            endHour: 12,
            action: "tend_stall",
            targetRoomId: null,
            priority: 9,
            deviationAllowed: true,
          },
          {
            startHour: 12,
            endHour: 13,
            action: "eat_at_tavern",
            targetRoomId: null,
            priority: 8,
            deviationAllowed: false,
          },
          {
            startHour: 13,
            endHour: 18,
            action: "tend_stall",
            targetRoomId: null,
            priority: 9,
            deviationAllowed: true,
          },
          {
            startHour: 18,
            endHour: 19,
            action: "eat_at_home",
            targetRoomId: null,
            priority: 8,
            deviationAllowed: false,
          },
          {
            startHour: 19,
            endHour: 22,
            action: "count_coins",
            targetRoomId: null,
            priority: 6,
            deviationAllowed: true,
          },
          {
            startHour: 22,
            endHour: 7,
            action: "sleep_at_home",
            targetRoomId: null,
            priority: 10,
            deviationAllowed: false,
          },
        ],
      },
    ],

    narrativeTemplates: {
      eventTitles: {
        move: "移动",
        talk: "对话",
        wait: "等待",
        rest: "休息",
        look: "观察",
        take: "拾取",
        drop: "丢下",
        use: "使用",
        eat: "食用",
        say: "说话",
        inventory: "背包",
        status: "状态",
        end_day: "结束今天",
        attack: "攻击",
        flee: "逃跑",
        defend: "防御",
        equip: "装备",
        unequip: "卸下",
        quests: "任务",
        trade: "交易",
        hostile: "敌对",
        help: "帮助",
        ignore: "无视",
        "entity.npc": "人物",
        "entity.item": "物品",
        "entity.player": "玩家",
        "entity.faction": "派系",
      },
      moveNarrative: "{actor} 到达了 {room}。",
      talkNarrative: '{actor}: "{query}"\n{target}: "{response}"',
      waitNarrative: "{actor} 在原地逗留了一会。",
      npcNotFound: "{npcName}不在这里。",
      npcSilentFallback: "{target}点了点头，没有多说什么。",
      emptyDaySummary: "平淡的一天。",
      moodLabels: [
        { threshold: 0, label: "低落" },
        { threshold: 50, label: "平静" },
        { threshold: 70, label: "愉快" },
      ],
      relationLabels: [
        { threshold: 0, label: "冷淡" },
        { threshold: 30, label: "普通" },
        { threshold: 50, label: "友好" },
      ],
      endingCommands: ["结束今天", "休息", "过完这天", "结束这一天"],
      chatPattern:
        "(和|跟|问|找|与)([^，。\\s]{1,6})(聊天|说话|讲话|打听|问话|聊聊|谈谈|对话|了解|问问)",
      directionNames: { 北: "north", 南: "south", 东: "east", 西: "west", 上: "up", 下: "down" },
      spectatorFallbackName: "旁观者",
      regionStatusLabels: {
        prosperityLow: "经济困难",
        threatHigh: "军事紧张",
        stable: "稳定",
      },
      defaultTheme: "边疆",
      memoryTemplates: {
        take: { self: "拿起了{item}", observer: "看到 {actor} 拿起了{item}" },
        drop: { self: "放下了{item}", observer: "看到 {actor} 放下了{item}" },
        move: {
          self: "到达了{room}",
          observerLeave: "看到 {actor} 离开了{room}",
          observerArrive: "{actor} 来到了{room}",
        },
        talk: {
          self: "与 {target} 在{room}交谈",
          target: "与 {actor} 在{room}交谈。{text}",
          observer: "注意到 {actor} 和 {target} 在{room}{action}",
          observerNoTarget: "注意到 {actor} 在{room}{action}",
        },
        look: { self: "{actor} 打量了我" },
        say: { observer: "听到 {actor} 在{room}说了话" },
        dailyRoutine: "度过了日常的一天",
        fallbackItemName: "东西",
      },
      combatTemplates: {
        attackStart: "{attacker} 对 {defender} 发起了攻击！",
        hit: "{attacker} 对 {defender} 造成了 {damage} 点伤害。",
        crit: "暴击！{attacker} 对 {defender} 造成了 {damage} 点伤害！",
        playerDown: "{target} 倒下了...",
        npcDefeated: "{target} 被击败了！",
        npcDeath: "{target} 死亡了。",
        npcFlee: "{actor} 逃跑了！",
        fleeSuccess: "{actor} 成功逃出了战斗！",
        fleeFail: "{actor} 试图逃跑，但被拦截了！",
        defend: "{actor} 摆出防御姿态，减少受到的伤害。",
      },
      commandMessages: {
        lookRoom: "{room}: {description}。在场: {npcs}。物品: {items}。出口: {exits}",
        lookEntity: "观察 {target}。{details}",
        take: "捡起了 {item}",
        drop: "放下了 {item}",
        useWithEffect: "使用了 {item}（{effect}）",
        useNoEffect: "使用了 {item}，暂时没有明显效果。",
        rest: "休息了一会，恢复了一些精力。",
        status: "状态: {needs}。",
        statusWithTraits: "状态: {needs}。特质: {traits}。",
        inventoryEmpty: "身上空无一物。",
        inventoryList: "携带物品: {items}",
        say: '{actor}: "{message}"',
        endDay: "{actor} {command}",
        equip: "装备了 {item}。",
        equipWithSwap: "装备了 {item}，卸下了 {previous}。",
        unequip: "卸下了 {item}。",
        eatWithEffect: "吃了 {item}（{effect}）",
        eatNoEffect: "吃了 {item}，暂时没有明显效果。",
        roomAction: "{label}",
        roomActionWithEffect: "{label}（{effect}）",
      },
      settlementMessages: {
        dialogue: "{speaker}：{content}",
        relation: "结算 | 关系：{changes}",
        playerNeed: "结算 | 身体：{changes}",
        npcNeed: "结算 | 周围的人需求也发生了变化",
        item: "结算 | {entity}物品：{changes}",
      },
      questMessages: {
        completeTitle: "任务完成: {title}",
        completeDescription: "你完成了「{title}」。",
        failTitle: "任务失败: {title}",
        failDescription: "你未能在截止日期前完成「{title}」。",
        discoverTitle: "发现任务: {title}",
        discoverDescription: "你发现了「{title}」。",
      },
      traveloguePrompt: `你是游记作家。请根据玩家今日的经历，以第三人称章回体小说的风格撰写一篇游记。

写作要求:
- 使用第三人称叙事，以角色名为叙述主语
- 章回体风格: 标题用简洁的章回名（如"第三回·苍山城初遇奇人"），正文要展现角色在世界的经历
- 3-5段正文，每段4-6句话，生动刻画场景
- 以地点为线索组织叙事，每到一个新地点另起一段
- 融入诗意描写：景色、氛围、角色的细微感受
- 保留遭遇NPC的对话要点

输出格式为严格的JSON:
{"title": "章回标题", "narrative": "正文内容"}`,
    },

    calendar: {
      hourStart: 6,
      daysPerMonth: 30,
      monthsPerYear: 12,
      monthNames: [
        "初春月",
        "仲春月",
        "暮春月",
        "初夏月",
        "仲夏月",
        "暮夏月",
        "初秋月",
        "仲秋月",
        "暮秋月",
        "初冬月",
        "仲冬月",
        "暮冬月",
      ],
      eraName: "铁器纪元",
      yearFormat: "{era}第{year}年",
    },

    behaviorAtoms: [],

    namePools: [
      {
        culture: "西境农耕文化",
        surnames: ["赵", "钱", "孙", "李", "周", "吴", "郑", "王", "冯", "陈"],
        maleGiven: ["行舟", "大山", "德", "仁", "勇", "守田", "铁柱", "志远", "青山", "福"],
        femaleGiven: ["秀", "兰", "春芽", "巧", "珠", "月", "翠", "芬", "桂英", "小荷"],
        neutralGiven: ["石头", "小河", "顺", "平安", "丰收"],
        epithetPatterns: ["老{char}", "{surname}铁匠", "{surname}{given}", "{role}{name}"],
      },
    ],

    roomTemplates: [
      {
        culture: "农耕",
        rooms: [
          { name: "小村庄", desc: "几间土坯房，烟囱冒着炊烟，鸡犬之声相闻。" },
          { name: "麦田", desc: "大片金黄的麦田，远处能看到几个农舍。" },
          { name: "河边磨坊", desc: "一座老旧的水车吱呀作响，几个村民在排队磨面。" },
          { name: "果园", desc: "桃树和李树成排，果子挂满枝头。" },
          { name: "猎人小屋", desc: "一座木屋，墙上挂着几张兽皮，门口晾着腊肉。" },
        ],
        names: ["赵大", "钱嫂", "孙老头", "李木匠", "周猎户"],
        personalities: ["勤劳朴实", "沉默寡言", "热情好客", "警惕陌生人", "爱讲故事"],
      },
      {
        culture: "军阀部落",
        rooms: [
          { name: "废弃营寨", desc: "木栅栏已经腐朽，但还能看到曾经驻军的痕迹。" },
          { name: "乱石岗", desc: "嶙峋的巨石间能藏不少人，有烧火留下的灰烬。" },
          { name: "哨塔废墟", desc: "一座半塌的石塔，视野开阔，能看到很远的距离。" },
        ],
        names: ["铁牙", "断臂老吴", "独眼狼"],
        personalities: ["粗鲁暴躁", "沉默戒惧", "亡命之徒", "讲义气"],
      },
    ],

    llmTriggerConfig: {
      worldEvent: { perSettlement: 1, enabled: true },
      memoryCompression: { maxCandidates: 3, minMemoriesToTrigger: 3, enabled: true },
      settlementGrowth: {
        npcToRoomRatio: 4,
        prosperityThreshold: 70,
        threatThreshold: 30,
        enabled: true,
      },
      contentPoolEvolve: { checkDay: 1, enabled: true },
      narrativeDirection: { intervalMonths: 1, enabled: false },
      culturalEvolution: { adoptionThreshold: 0.3, enabled: false },
      discoveryGeneration: { activityThreshold: 1000, enabled: false },
      dialogueOptions: { optionCount: 4, enabled: true },
    },

    // LLM tool_calls → 数值映射 (规则引擎查表, 不在 LLM 决定)
    dialogueEffectMapping: {
      relation: {
        slight_positive: { delta: 1 },
        moderate_positive: { delta: 2 },
        strong_positive: { delta: 4 },
        slight_negative: { delta: -1 },
        moderate_negative: { delta: -2 },
        strong_negative: { delta: -4 },
      },
      needImpact: {
        slight_positive: { delta: 3 },
        moderate_positive: { delta: 6 },
        strong_positive: { delta: 10 },
        slight_negative: { delta: -3 },
        moderate_negative: { delta: -6 },
        strong_negative: { delta: -10 },
      },
      information: {
        rumor: { memoryImportance: 0.3, spreadChance: 0.3 },
        warning: { memoryImportance: 0.5, spreadChance: 0.1 },
        gossip: { memoryImportance: 0.2, spreadChance: 0.5 },
        lore: { memoryImportance: 0.4, spreadChance: 0.1 },
        quest_hint: { memoryImportance: 0.6, spreadChance: 0 },
      },
      itemExchange: {
        trivial: { valueRange: [1, 3] },
        small: { valueRange: [3, 10] },
        moderate: { valueRange: [10, 30] },
      },
    },

    // 社会涟漪: 交互的社会信号 → 观察者评价 → 关系变化
    socialRippleConfig: {
      enabled: true,
      signalStrength: {
        talk: 2,
        trade: 1,
        hostile: -5,
        help: 4,
        ignore: -1,
        take: 1,
        use: 0,
      },
      // 关系权重: observer ↔ participant 的关系水平 → 放大系数
      // [-100, -50, -20, 20, 50, 100] 对应 [-2, -1, 0.3, 1, 1.5, 2]
      relationWeightPoints: [-100, -50, -20, 20, 50, 100],
      relationWeightMultipliers: [-2, -1, 0.3, 1, 1.5, 2],
      // 性格乘数 (1.0=中性, >1=放大, <1=缩小, 负=反转)
      traitMultipliers: {
        suspicious: 1.3,
        kind: 1.2,
        generous: 1.2,
        selfish: 0.4,
        pragmatic: 0.8,
        naive: 1.5,
        paranoid: 2.0,
        jealous: -1.5,
      },
      threshold: 0.5,
      maxDelta: 5,
    },

    emotionLabels: {
      grateful: "感激",
      angry: "愤怒",
      surprised: "惊讶",
      worried: "担忧",
      happy: "开心",
      disappointed: "失望",
      suspicious: "怀疑",
      amused: "觉得有趣",
      fearful: "恐惧",
      contemptuous: "轻蔑",
    },

    needLabels: {
      hunger: "饥饿",
      safety: "安全",
      social: "社交",
      rest: "精力",
      achievement: "成就",
    },

    traitLabels: {
      suspicious: "多疑",
      kind: "善良",
      generous: "慷慨",
      selfish: "自私",
      pragmatic: "务实",
      naive: "天真",
      paranoid: "偏执",
      jealous: "嫉妒",
      compassion: "同理心",
      trust: "信任",
      ambition: "野心",
      unity: "团结",
      greed: "贪婪",
      courage: "勇气",
      discipline: "自律",
      diligence: "勤奋",
      discontent: "不满",
      skepticism: "怀疑",
      optimism: "乐观",
    },

    sensitiveTraitNames: ["suspicious", "paranoid", "cautious", "jealous"],

    itemPropertyLabels: {
      currency: "货币",
      value: "价值",
      material: "材料",
      valuable: "贵重物",
      needDeltas: "效果",
      hungerRestore: "恢复饥饿",
      restRestore: "恢复精力",
      socialRestore: "恢复社交",
      safetyRestore: "恢复安全",
      restItem: "休息用品",
      restRecovery: "恢复精力",
      durability: "耐久",
      consumable: "消耗品",
      edible: "可食用",
      drinkable: "可饮用",
      usable: "可使用",
      lightSource: "光源",
      readable: "可阅读",
      spiritual: "灵性物品",
      weapon: "武器",
      atkBonus: "攻击",
      defBonus: "防御",
      questItem: "任务物品",
    },

    itemTemplates: [
      { id: "copper_coin", name: "铜币", properties: { currency: true } },
      { id: "iron_ore", name: "铁矿石", properties: { material: true } },
    ],

    questTemplates: [],

    combatConfig: {
      baseHp: 50,
      enduranceToHp: 1.5,
      baseAtk: 5,
      skillToAtk: 0.4,
      strengthToAtk: 0.3,
      baseDef: 3,
      skillToDef: 0.2,
      enduranceToDef: 0.3,
      baseSpd: 5,
      skillToSpd: 0.2,
      agilityToSpd: 0.3,
      damageMultiplier: 1.0,
      defenseReductionPerPoint: 0.6,
      minDamage: 1,
      damageVariance: 0.2,
      critBaseChance: 0.1,
      critSpdBonus: 0.002,
      critMultiplier: 1.5,
      pulseInterval: 3,
      restCostPerAttack: 1,
      fleeBaseChance: 0.5,
      fleeSpdBonus: 0.015,
      incapacitatedDuration: 120,
      defendingBonus: 5,
      defenseDamageMultiplier: 0.5,
      npcHostilityThreshold: -30,
      npcAttackCooldown: 60,
      fleeHpThreshold: 0.3,
      fleeCourageThreshold: 0,
      fleeBaseAttemptChance: 0.3,
      defaultCourageValue: 50,
    },
    combatSkills: [],

    storylineConfig: { eventLookbackWindow: 10 },

    terrainConfig: [],

    entityActionsByTag: {},
    entityActionLabels: {},
    entityTagLabels: {},

    conversationDirections: [],
  };
}
