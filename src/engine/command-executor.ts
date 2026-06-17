/**
 * 命令执行器
 *
 * 接收结构化命令 {action, params}，执行副作用，返回 {events, delta, ended}。
 * 只产出 delta，不做 applyDelta（由 round-engine 负责）。
 * 不调 LLM（talk 只返回"需要生成选项"的信号）。
 */

import { checkFlee, resolveAttack } from "../combat/index.ts";
import { renderTemplate } from "../core/template.ts";
import type {
  CombatTemplates,
  CommandMessages,
  ContentPool,
  Entity,
  EntityId,
  FactionEntity,
  ItemChange,
  ItemEntity,
  NeedType,
  NPCEntity,
  PlayerEntity,
  RoomId,
  SimulationDelta,
  WorldState,
} from "../core/types.ts";
import { getEntity, getRoomEntities, moveEntity } from "../core/world.ts";
import { formatItemProperties } from "../shared/item-format.ts";
import { logWrite } from "../shared/log.ts";
import type { CommandEvent } from "../shared/protocol.ts";

export interface CommandResult {
  events: CommandEvent[];
  delta: SimulationDelta;
  ended: boolean;
  needsDialogueOptions?: { npcId: string; npcName: string };
  dialogueOptions?: import("../shared/protocol.ts").DialogueOption[];
  needsChatOptions?: { npcId: string; npcName: string };
  chatSubOptions?: import("../shared/protocol.ts").DialogueOption[];
  needsTradeOptions?: { npcId: string; npcName: string };
  tradeSubOptions?: import("../shared/protocol.ts").TradeOption[];
  operateOptions?: Array<{ actionId: string; label: string }>;
  bookDisplay?: { title: string; pages: string[] };
}

// --- Feasibility Check ---

export interface FeasibilityBlocker {
  type: string; // "rest" | "exit_condition" | "requirement" | ...
  reason: string;
}

export interface FeasibilityResult {
  feasible: boolean;
  blockers: FeasibilityBlocker[];
}

/**
 * 可行性检查 — 在执行命令之前调用，不产生任何副作用
 *
 * 各检查器独立运行，全部通过才返回 feasible=true。
 * 预留了出口条件和动作前置要求的扩展点。
 */
export function checkFeasibility(
  world: WorldState,
  entityId: EntityId,
  action: string,
  params: Record<string, unknown>,
): FeasibilityResult {
  const entity = getEntity(world, entityId);
  if (!entity) return { feasible: false, blockers: [{ type: "entity", reason: "找不到自己" }] };

  const blockers: FeasibilityBlocker[] = [];

  const restBlocker = checkRestFeasibility(world, entity, action, params);
  if (restBlocker) blockers.push(restBlocker);

  const requirementBlockers = checkActionRequirements(world, entity, action);
  blockers.push(...requirementBlockers);

  // 房间动作: 检查当前房间的 tag 是否支持此 action
  if (!isBuiltinAction(action)) {
    const roomTagBlocker = checkRoomTagFeasibility(world, entity, action);
    if (roomTagBlocker) blockers.push(roomTagBlocker);
  }

  if (action === "move") {
    const exitBlockers = checkExitConditions(world, entity, params);
    blockers.push(...exitBlockers);
  }

  return { feasible: blockers.length === 0, blockers };
}

function checkRestFeasibility(
  world: WorldState,
  entity: Entity,
  action: string,
  params: Record<string, unknown>,
): FeasibilityBlocker | null {
  if (action === "end_day" || action === "status" || action === "inventory") return null;

  // 结束当天的房间操作也豁免精力检查
  const effect = world.contentPool.actionEffects.find((a) => a.action === action);
  if (effect?.endsDay) return null;

  const currentRest = getCurrentRest(entity);
  if (currentRest === null) return null;

  const restCost = getActionRestCost(world, entity, action, params);
  if (restCost >= 0) return null;

  if (currentRest + restCost < 0) {
    return { type: "rest", reason: "精力不足，无法执行此操作。" };
  }
  return null;
}

function getCurrentRest(entity: Entity): number | null {
  if ("needs" in entity) {
    const e = entity as NPCEntity | PlayerEntity | FactionEntity;
    return e.needs.find((n) => n.type === "rest")?.value ?? null;
  }
  return null;
}

function getActionRestCost(
  world: WorldState,
  entity: Entity,
  action: string,
  params: Record<string, unknown>,
): number {
  if (action === "move") {
    return calcMoveRestCost(world, entity, params.direction as string);
  }
  // 战斗动作统一消耗 restCostPerAttack
  if (action === "attack" || action === "flee" || action === "defend") {
    return -world.contentPool.combatConfig.restCostPerAttack;
  }
  const effect = world.contentPool.actionEffects.find((c) => c.action === action);
  if (!effect) return 0;
  return (effect.needDeltas.rest as number) ?? 0;
}

export function resolveActionDuration(
  world: WorldState,
  entityId: EntityId,
  action: string,
  params: Record<string, unknown>,
): number {
  if (action === "end_day" || action === "status" || action === "inventory" || action === "look") {
    return 0;
  }

  const effectAction = action === "operate" ? (params.actionId as string | undefined) : action;
  if (!effectAction) return 0;

  const effect = world.contentPool.actionEffects.find(
    (candidate) => candidate.action === effectAction,
  );
  if (effect?.endsDay) return 0;

  if (action === "talk" && !params.optionId) return 0;
  if (action === "operate" && !params.actionId) return 0;
  if (action === "move") return calcMoveDuration(world, entityId, params.direction as string);

  return effect?.durationMinutes ?? 0;
}

function calcMoveRestCost(world: WorldState, entity: Entity, direction: string): number {
  const room = entity.roomId ? world.rooms.get(entity.roomId) : null;
  if (!room) return 0;
  const exit = room.exits.get(direction);
  if (!exit || exit.hidden) return 0;
  const terrainType = exit.terrain ?? room.terrain ?? "plain";
  const terrainCfg = world.contentPool.terrainConfig.find((tc) => tc.terrain === terrainType);
  const baseCost = terrainCfg?.baseCost ?? 2;
  // Apply weather movement multiplier
  const regionId = room.regionId;
  const weatherState = regionId ? world.weatherByRegion.get(regionId) : undefined;
  const weatherMultiplier = weatherState?.movementMultiplier ?? 1.0;
  return -(baseCost * (exit.distance ?? 1)) * weatherMultiplier;
}

function calcMoveDuration(world: WorldState, entityId: EntityId, direction: string): number {
  const entity = getEntity(world, entityId);
  const room = entity?.roomId ? world.rooms.get(entity.roomId) : null;
  if (!entity || !room) return 0;

  const exit = room.exits.get(direction);
  if (!exit || exit.hidden) return 0;

  const effect = world.contentPool.actionEffects.find((candidate) => candidate.action === "move");
  const baseDuration = effect?.durationMinutes ?? 0;
  if (baseDuration <= 0) return 0;

  const terrainType = exit.terrain ?? room.terrain ?? "plain";
  const terrainCfg = world.contentPool.terrainConfig.find((tc) => tc.terrain === terrainType);
  const speedMod = terrainCfg && terrainCfg.speedMod > 0 ? terrainCfg.speedMod : 1;
  const weatherState = room.regionId ? world.weatherByRegion.get(room.regionId) : undefined;
  const weatherMultiplier = weatherState?.movementMultiplier ?? 1.0;
  const duration = (baseDuration * (exit.distance ?? 1) * weatherMultiplier) / speedMod;
  return Math.max(1, Math.round(duration));
}

// 预留扩展点 — 未来读取 ContentPool.actionRequirements，校验实体 trait
function checkActionRequirements(
  _world: WorldState,
  _entity: Entity,
  _action: string,
): FeasibilityBlocker[] {
  return [];
}

const BUILTIN_ACTIONS = new Set([
  "move",
  "look",
  "talk",
  "take",
  "drop",
  "use",
  "rest",
  "wait",
  "status",
  "inventory",
  "eat",
  "read",
  "say",
  "end_day",
  "attack",
  "flee",
  "defend",
  "equip",
  "unequip",
]);

function isBuiltinAction(action: string): boolean {
  return BUILTIN_ACTIONS.has(action);
}

function commandMessages(world: WorldState): CommandMessages {
  return world.contentPool.narrativeTemplates.commandMessages;
}

function combatTemplates(world: WorldState): CombatTemplates {
  return world.contentPool.narrativeTemplates.combatTemplates;
}

function checkRoomTagFeasibility(
  world: WorldState,
  entity: Entity,
  action: string,
): FeasibilityBlocker | null {
  const room = entity.roomId ? world.rooms.get(entity.roomId) : null;
  const tags = room?.tags ?? [];
  const actionAllowed = tags.some((tag) => {
    const actions = world.contentPool.entityActionsByTag[tag] ?? [];
    return actions.includes(action);
  });
  if (!actionAllowed) {
    return { type: "room_tag", reason: "未知操作" };
  }
  return null;
}

// 预留扩展点 — 未来实现 ExitConditionSchema 验证（trait/item/skill/time/season/quest）
function checkExitConditions(
  world: WorldState,
  _entity: Entity,
  params: Record<string, unknown>,
): FeasibilityBlocker[] {
  const blockers: FeasibilityBlocker[] = [];
  const direction = params.direction as string | undefined;
  if (!direction) return blockers;

  const room = _entity.roomId ? world.rooms.get(_entity.roomId) : null;
  if (!room) return blockers;
  const exit = room.exits.get(direction);
  if (!exit?.conditions || exit.conditions.length === 0) return blockers;

  for (const cond of exit.conditions) {
    if (cond.type === "time") {
      if (world.time.period !== cond.value) {
        blockers.push({ type: "exit_condition", reason: `此路仅在${cond.value}时开放` });
      }
    } else if (cond.type === "season") {
      if (world.time.season !== cond.value) {
        blockers.push({ type: "exit_condition", reason: `此路仅在${cond.value}季开放` });
      }
    }
  }

  return blockers;
}

export function executeCommand(
  world: WorldState,
  entityId: EntityId,
  action: string,
  params: Record<string, unknown>,
): CommandResult {
  switch (action) {
    case "move":
      return executeMove(world, entityId, params);
    case "look":
      return executeLook(world, entityId, params);
    case "talk":
      return executeTalk(world, entityId, params);
    case "take":
      return executeTake(world, entityId, params);
    case "drop":
      return executeDrop(world, entityId, params);
    case "use":
      return executeUse(world, entityId, params);
    case "rest":
      return executeRest(world, entityId);
    case "wait":
      return executeWait(world, entityId, params);
    case "status":
      return executeStatus(world, entityId);
    case "inventory":
      return executeInventory(world, entityId);
    case "eat":
      return executeEat(world, entityId, params);
    case "read":
      return executeRead(world, entityId, params);
    case "say":
      return executeSay(world, entityId, params);
    case "end_day":
      return executeEndDay(world, entityId, params);
    case "attack":
      return executeAttack(world, entityId, params);
    case "flee":
      return executeFlee(world, entityId);
    case "defend":
      return executeDefend(world, entityId);
    case "equip":
      return executeEquip(world, entityId, params);
    case "unequip":
      return executeUnequip(world, entityId, params);
    case "operate":
      return executeOperate(world, entityId, params);
  }

  // 数据驱动：检查是否为结束当天的房间操作（endsDay: true in actionEffects）
  const effect = world.contentPool.actionEffects.find((a) => a.action === action);
  if (effect?.endsDay) {
    return executeEndDayRoomAction(world, entityId, action);
  }

  // Room actions (eat_at_tavern, work_at_smithy, etc.) — not built-in player actions
  return executeRoomAction(world, entityId, action);
}

function executeMove(
  world: WorldState,
  entityId: EntityId,
  params: Record<string, unknown>,
): CommandResult {
  const entity = getEntity(world, entityId);
  if (!entity) return fail("找不到自己");

  const room = entity.roomId ? world.rooms.get(entity.roomId) : null;
  if (!room) return fail("不在任何房间内");

  const direction = params.direction as string;
  const exit = room.exits.get(direction);
  if (!exit) return fail(`${direction} 方向没有出口`);

  if (exit.hidden) {
    let clueAccess = false;
    if (exit.conditions && entity.type === "player") {
      const player = entity as PlayerEntity;
      clueAccess = exit.conditions.some(
        (cond) => cond.type === "clue" && player.knownClues.some((c) => c.clueId === cond.value),
      );
    }
    if (!clueAccess) return fail(`${direction} 方向没有出口`);
  }

  // 检查通行条件
  if (exit.conditions && exit.conditions.length > 0) {
    for (const cond of exit.conditions) {
      if (cond.type === "time" && world.time.period !== cond.value) {
        return fail(`此路仅在${cond.value}时开放`);
      }
      if (cond.type === "season" && world.time.season !== cond.value) {
        return fail(`此路仅在${cond.value}季开放`);
      }
      if (cond.type !== "time" && cond.type !== "season") {
        logWrite(
          "srv",
          "info",
          `[CommandExecutor] 出口条件: ${cond.type}=${cond.value} (未实现检查)`,
        );
      }
    }
  }

  const restCost = calcMoveRestCost(world, entity, direction);

  moveEntity(world, entityId, exit.to as RoomId);
  const targetRoom = world.rooms.get(exit.to as RoomId);
  const t = world.contentPool.narrativeTemplates;

  const delta: SimulationDelta = {
    needChanges: [
      {
        targetId: entityId,
        needType: "rest",
        delta: restCost,
      },
    ],
  };

  // 移动叙事 (使用边的 description 或默认模板)
  const narrative =
    exit.description ??
    t.moveNarrative
      .replace(/\{actor\}/g, entity.name)
      .replace(/\{room\}/g, targetRoom?.name ?? exit.to);

  return {
    events: [
      {
        type: "move",
        description: narrative,
      },
    ],
    delta,
    ended: false,
  };
}

function executeLook(
  world: WorldState,
  entityId: EntityId,
  params: Record<string, unknown>,
): CommandResult {
  const entity = getEntity(world, entityId);
  if (!entity) return fail("找不到自己");

  const room = entity.roomId ? world.rooms.get(entity.roomId) : null;
  if (!room) return fail("不在任何房间内");

  const target = params.target as string | undefined;
  if (!target || target === "房间") {
    const npcs = Array.from(room.entities)
      .map((eid) => world.entities.get(eid))
      .filter((e): e is NPCEntity => Boolean(e && e.type === "npc" && e.id !== entityId))
      .map((e) => e.name);
    const items = Array.from(room.entities)
      .map((eid) => world.entities.get(eid))
      .filter((e): e is ItemEntity => Boolean(e && e.type === "item"))
      .map((e) => e.name);
    const exits = Array.from(room.exits.keys());

    return {
      events: [
        {
          type: "look",
          description: renderTemplate(commandMessages(world).lookRoom, {
            room: room.name,
            description: room.description,
            npcs: npcs.join(", ") || "无",
            items: items.join(", ") || "无",
            exits: exits.join(", ") || "无",
          }),
        },
      ],
      delta: buildDelta(entityId, world.contentPool, "look"),
      ended: false,
    };
  }

  const found = Array.from(world.entities.values()).find((e) => e.name === target);
  if (found) {
    const details = [`观察 ${found.name}`];
    if (found.type === "npc") {
      details.push(`性格: ${found.personality}`);
      if (found.description) details.push(`描述: ${found.description}`);
    }
    if (found.type === "item") {
      if (found.description) details.push(`描述: ${found.description}`);
      const propertyText = formatItemProperties(
        found.properties,
        world.contentPool.itemPropertyLabels,
      );
      if (propertyText) details.push(`属性: ${propertyText}`);
    }
    return {
      events: [
        {
          type: "look",
          description: renderTemplate(commandMessages(world).lookEntity, {
            target: found.name,
            details: details.slice(1).join("。"),
          }),
        },
      ],
      delta: buildDelta(entityId, world.contentPool, "look"),
      ended: false,
    };
  }

  return fail(`没有看到 "${target}"`);
}

function executeTalk(
  world: WorldState,
  entityId: EntityId,
  params: Record<string, unknown>,
): CommandResult {
  const entity = getEntity(world, entityId);
  if (!entity) return fail("找不到自己");

  const room = entity.roomId ? world.rooms.get(entity.roomId) : null;
  if (!room) return fail("不在任何房间内");

  const npcId = params.npcId as string;
  if (!npcId) return fail("不知道要和谁说话");

  const npc = world.entities.get(npcId);
  if (npc?.type !== "npc") return fail(`${npcId} 不在这里`);
  if (npc.roomId !== entity.roomId) return fail(`${npc.name} 不在这里`);

  if (typeof params.optionId === "string" && params.optionId.length > 0) {
    return {
      events: [],
      delta: buildDelta(entityId, world.contentPool, "talk"),
      ended: false,
    };
  }

  return {
    events: [],
    delta: buildDelta(entityId, world.contentPool, "talk"),
    ended: false,
    needsDialogueOptions: { npcId: npc.id, npcName: npc.name },
  };
}

function executeTake(
  world: WorldState,
  entityId: EntityId,
  params: Record<string, unknown>,
): CommandResult {
  const entity = getEntity(world, entityId);
  if (!entity) return fail("找不到自己");

  const room = entity.roomId ? world.rooms.get(entity.roomId) : null;
  if (!room) return fail("不在任何房间内");

  const itemId = params.itemId as string;
  if (!itemId) return fail("不知道要捡什么");

  const item = world.entities.get(itemId);
  if (item?.type !== "item") return fail("没有找到这个物品");
  if (!room.entities.has(itemId)) return fail(`${item.name} 不在这里`);
  if (!hasInventory(entity)) return fail("当前角色不能携带物品");

  room.entities.delete(itemId);

  return {
    events: [
      {
        type: "take",
        description: renderTemplate(commandMessages(world).take, { item: item.name }),
      },
    ],
    delta: {
      itemChanges: [
        {
          targetId: entityId,
          templateId: itemId,
          operation: "add",
          qty: 1,
          itemId,
          name: item.name,
        },
      ],
    },
    ended: false,
  };
}

function executeDrop(
  world: WorldState,
  entityId: EntityId,
  params: Record<string, unknown>,
): CommandResult {
  const entity = getEntity(world, entityId);
  if (!entity) return fail("找不到自己");
  if (!entity.roomId) return fail("不在任何房间内");

  const itemId = params.itemId as string;
  if (!itemId) return fail("不知道要放下什么");

  if (!hasInventory(entity)) return fail("当前角色没有背包");
  const itemIndex = entity.inventory.findIndex((item) => item.id === itemId);
  if (itemIndex < 0) return fail("背包里没有这个物品");

  const item = entity.inventory[itemIndex];
  item.ownerId = null;
  item.containerId = entity.roomId;
  item.roomId = entity.roomId;
  world.rooms.get(entity.roomId)?.entities.add(item.id);

  return {
    events: [
      {
        type: "drop",
        description: renderTemplate(commandMessages(world).drop, { item: item.name }),
      },
    ],
    delta: {
      itemChanges: [
        { targetId: entityId, templateId: itemId, operation: "remove", qty: 1, itemId },
      ],
    },
    ended: false,
  };
}

function executeUse(
  world: WorldState,
  entityId: EntityId,
  params: Record<string, unknown>,
): CommandResult {
  const entity = getEntity(world, entityId);
  if (!entity) return fail("找不到自己");

  const itemId = params.itemId as string;
  if (!itemId) return fail("不知道要使用什么");

  if (!hasInventory(entity)) return fail("当前角色没有背包");
  const item = entity.inventory.find((candidate) => candidate.id === itemId);
  if (!item) return fail("背包里没有这个物品");

  const needDeltas = getItemNeedDeltas(item.properties ?? {});
  const consumed = Boolean(item.properties?.consumable ?? item.properties?.edible);
  if (consumed) {
    const index = entity.inventory.findIndex((candidate) => candidate.id === itemId);
    if (index >= 0) entity.inventory.splice(index, 1);
    world.entities.delete(itemId);
  }

  const delta: SimulationDelta =
    Object.keys(needDeltas).length > 0
      ? {
          needChanges: Object.entries(needDeltas).map(([needType, delta]) => ({
            targetId: entityId,
            needType: needType as unknown as NeedType,
            delta,
          })),
        }
      : {};

  const effectText = formatNeedDeltas(needDeltas, world.contentPool.needLabels);
  return {
    events: [
      {
        type: "use",
        description: effectText
          ? renderTemplate(commandMessages(world).useWithEffect, {
              item: item.name,
              effect: effectText,
            })
          : renderTemplate(commandMessages(world).useNoEffect, { item: item.name }),
      },
    ],
    delta,
    ended: false,
  };
}

function executeOperate(
  world: WorldState,
  entityId: EntityId,
  params: Record<string, unknown>,
): CommandResult {
  const entity = getEntity(world, entityId);
  if (!entity) return fail("找不到自己");

  const itemId = params.itemId as string | undefined;
  const actionId = params.actionId as string | undefined;

  if (!itemId) {
    return fail("请指定要操作的物品");
  }

  // Find the item in player inventory or room
  const player = entity as PlayerEntity;
  const item =
    player.inventory.find((i) => i.id === itemId) ??
    (entity.roomId
      ? (getRoomEntities(world, entity.roomId).find((e) => e.id === itemId && e.type === "item") as
          | ItemEntity
          | undefined)
      : undefined);

  if (!item) return fail("找不到该物品");

  const tags = item.tags ?? [];

  // Get available actions from item tags
  const availableActions: Array<{ actionId: string; label: string }> = [];
  const seen = new Set<string>();
  for (const tag of tags) {
    const actions = world.contentPool.entityActionsByTag[tag] ?? [];
    for (const aid of actions) {
      if (seen.has(aid)) continue;
      seen.add(aid);
      availableActions.push({
        actionId: aid,
        label: world.contentPool.entityActionLabels[aid] ?? aid,
      });
    }
  }

  if (availableActions.length === 0) {
    return fail("此物品不可操作");
  }

  // If no actionId specified, return available actions (sub-menu)
  if (!actionId) {
    return {
      events: [
        {
          type: "operate_options",
          description: `可对${item.name}执行的操作: ${availableActions.map((a) => a.label).join("、")}`,
        },
      ],
      delta: {},
      ended: false,
      operateOptions: availableActions,
    };
  }

  // Validate actionId is allowed by item tags
  if (!availableActions.some((a) => a.actionId === actionId)) {
    return fail("此物品不支持该操作");
  }

  // Find ActionEffect
  const effect = world.contentPool.actionEffects.find((a) => a.action === actionId);
  if (!effect) return fail("未知操作");

  // Check item costs
  if (effect.itemCosts) {
    const blockers = checkItemCostFeasibility(player, effect.itemCosts);
    if (blockers.length > 0) return fail(blockers[0]);
  }

  // Build delta
  const delta = resolveActionEffect(entityId, world.contentPool, actionId);
  const label = world.contentPool.entityActionLabels[actionId] ?? actionId;
  const effectText = formatNeedDeltas(effect.needDeltas, world.contentPool.needLabels);

  return {
    events: [
      {
        type: "operate",
        description: effectText
          ? renderTemplate(commandMessages(world).roomActionWithEffect, {
              label,
              effect: effectText,
            })
          : renderTemplate(commandMessages(world).roomAction, { label }),
      },
    ],
    delta,
    ended: false,
  };
}

function executeRest(world: WorldState, entityId: EntityId): CommandResult {
  const delta = buildDelta(entityId, world.contentPool, "rest");
  return {
    events: [{ type: "rest", description: commandMessages(world).rest }],
    delta,
    ended: false,
  };
}

function executeWait(
  world: WorldState,
  entityId: EntityId,
  params: Record<string, unknown>,
): CommandResult {
  const entity = getEntity(world, entityId);
  const name = entity?.name ?? "某人";
  const t = world.contentPool.narrativeTemplates;

  const raw = (params.raw ?? "") as string;
  const desc =
    raw.length > 0 && raw.length < 30
      ? `${name}: ${raw}`
      : t.waitNarrative.replace(/\{actor\}/g, name);

  return {
    events: [{ type: "wait", description: desc }],
    delta: buildDelta(entityId, world.contentPool, "wait"),
    ended: false,
  };
}

function executeStatus(world: WorldState, entityId: EntityId): CommandResult {
  const entity = getEntity(world, entityId);
  if (!entity) return fail("找不到自己");

  const needLabels = world.contentPool.needLabels;
  const traitLabels = world.contentPool.traitLabels;
  const needs =
    "needs" in entity
      ? entity.needs
          .map((need) => `${needLabels[need.type] ?? need.type}: ${Math.round(need.value)}%`)
          .join(", ")
      : "未知";
  const traits =
    "traits" in entity
      ? entity.traits
          .map((trait) => `${traitLabels[trait.name] ?? trait.name}: ${trait.value}`)
          .join(", ")
      : "";

  return {
    events: [
      {
        type: "status",
        description: traits
          ? renderTemplate(commandMessages(world).statusWithTraits, { needs, traits })
          : renderTemplate(commandMessages(world).status, { needs }),
      },
    ],
    delta: {},
    ended: false,
  };
}

function executeInventory(world: WorldState, entityId: EntityId): CommandResult {
  const entity = getEntity(world, entityId);
  if (!entity) return fail("找不到自己");
  if (!hasInventory(entity)) return fail("当前角色没有背包");

  const inv = entity.inventory ?? [];
  if (inv.length === 0)
    return {
      events: [{ type: "inventory", description: commandMessages(world).inventoryEmpty }],
      delta: {},
      ended: false,
    };

  return {
    events: [
      {
        type: "inventory",
        description: renderTemplate(commandMessages(world).inventoryList, {
          items: inv.map((item) => item.name).join(", "),
        }),
      },
    ],
    delta: {},
    ended: false,
  };
}

function executeSay(
  world: WorldState,
  entityId: EntityId,
  params: Record<string, unknown>,
): CommandResult {
  const entity = getEntity(world, entityId);
  if (!entity) return fail("找不到自己");

  const message = (params.message ?? "") as string;
  if (!message) return fail("没有说话内容");

  return {
    events: [
      {
        type: "say",
        description: renderTemplate(commandMessages(world).say, {
          actor: entity.name,
          message,
        }),
      },
    ],
    delta: buildDelta(entityId, world.contentPool, "say"),
    ended: false,
  };
}

function executeEndDay(
  world: WorldState,
  entityId: EntityId,
  params: Record<string, unknown> = {},
): CommandResult {
  const entity = getEntity(world, entityId);
  if (!entity) return fail("找不到自己");
  const name = entity.name ?? "某人";
  const context = params.context as string | undefined;
  const itemId = params.itemId as string | undefined;

  // context: "item" → 使用背包中的休息物品
  if (context === "item" && itemId && hasInventory(entity)) {
    const item = entity.inventory.find((i) => i.id === itemId);
    if (!item) return fail("背包里没有这个物品");
    if (!item.properties.restItem) return fail("这不是休息物品");

    const restRecovery = Number(item.properties.restRecovery ?? 0);
    const durability = Number(item.properties.durability ?? -1);

    // 递减耐久度
    if (durability > 0) {
      item.properties.durability = durability - 1;
    }

    // 耐久归零 → 移除物品
    if (durability === 1) {
      const idx = entity.inventory.indexOf(item);
      if (idx >= 0) entity.inventory.splice(idx, 1);
      world.entities.delete(item.id);
    }

    return {
      events: [
        {
          type: "end_day",
          description: `你使用${item.name}休息，精力恢复 +${restRecovery}。`,
        },
      ],
      delta: {
        needChanges: [
          { targetId: entityId, needType: "rest" as unknown as NeedType, delta: restRecovery },
        ],
      },
      ended: true,
    };
  }

  // 默认：原地休息（从 ContentPool end_day actionEffect 读取恢复值）
  const groundEffect = world.contentPool.actionEffects.find((a) => a.action === "end_day");
  const groundRest = Number(groundEffect?.needDeltas.rest ?? 20);
  const t = world.contentPool.narrativeTemplates;
  const endCmd = t.endingCommands[0] ?? "结束今天";

  return {
    events: [
      {
        type: "end_day",
        description: renderTemplate(commandMessages(world).endDay, {
          actor: name,
          command: endCmd,
        }),
      },
    ],
    delta: {
      needChanges: [
        { targetId: entityId, needType: "rest" as unknown as NeedType, delta: groundRest },
      ],
    },
    ended: true,
  };
}

/**
 * 数据驱动的结束当天房间操作（如 sleep_at_inn, rest_at_camp）
 * 任何 actionEffect 中 endsDay: true 的房间操作都会走这里。
 */
function executeEndDayRoomAction(
  world: WorldState,
  entityId: EntityId,
  action: string,
): CommandResult {
  const entity = getEntity(world, entityId);
  if (!entity) return fail("找不到自己");

  const room = entity.roomId ? world.rooms.get(entity.roomId) : null;
  if (!room?.tags) return fail("位置不支持此操作");

  // 校验：当前房间的 tag 是否提供此操作
  const tagForAction = room.tags.find((tag) => {
    const actions = world.contentPool.entityActionsByTag[tag] ?? [];
    return actions.includes(action);
  });
  if (!tagForAction) return fail(`此处无法执行：${action}`);

  const effect = world.contentPool.actionEffects.find((a) => a.action === action);
  if (!effect) return fail(`未知操作：${action}`);

  const restDelta = Number(effect.needDeltas.rest ?? 0);
  const label = world.contentPool.entityActionLabels[action] ?? action;

  return {
    events: [
      {
        type: "end_day",
        description: `你在${label}，精力恢复 +${restDelta}。`,
      },
    ],
    delta: {
      needChanges: [
        { targetId: entityId, needType: "rest" as unknown as NeedType, delta: restDelta },
      ],
    },
    ended: true,
  };
}

// --- Combat Handlers ---

function executeAttack(
  world: WorldState,
  entityId: EntityId,
  params: Record<string, unknown>,
): CommandResult {
  const entity = getEntity(world, entityId) as PlayerEntity | NPCEntity | undefined;
  if (!entity || !("combatState" in entity)) return fail("找不到自己");

  if (entity.combatState.isIncapacitated) {
    return fail(`${entity.name} 已经倒下了，无法攻击。`);
  }

  const targetId = params.targetId as string | undefined;
  if (!targetId) return fail("不知道要攻击谁");

  const target = world.entities.get(targetId) as PlayerEntity | NPCEntity | undefined;
  if (!target || !("combatState" in target)) return fail("目标不存在");

  if (target.combatState.isIncapacitated) {
    return fail(`${target.name} 已经倒下了。`);
  }

  // Set combat targets (state flag, direct write)
  entity.combatState.combatTarget = targetId;
  const config = world.contentPool.combatConfig;
  const templates = combatTemplates(world);

  // Collect HP/need changes as delta (instead of direct mutation)
  const combatHpChanges: import("../combat/types.ts").CombatHpChange[] = [];
  const needChanges: import("../core/types.ts").NeedChange[] = [];

  // Player attacks target
  const attackerResult = resolveAttack(entity, target, config, templates);

  // HP damage → delta
  combatHpChanges.push({
    targetId,
    delta: attackerResult.hpChange.delta,
  });

  // Rest cost → delta
  needChanges.push({
    targetId: entityId,
    needType: attackerResult.needChange.needType,
    delta: attackerResult.needChange.delta,
  });

  // Update threat table (state flag, direct write)
  target.combatState.threatTable[entityId] = (target.combatState.threatTable[entityId] ?? 0) + 10;

  const events: CommandEvent[] = [
    {
      type: "combat_attack",
      description: renderTemplate(templates.attackStart, {
        attacker: entity.name,
        defender: target.name,
      }),
    },
    {
      type: attackerResult.event.type,
      description: attackerResult.event.description,
    },
  ];

  // Counter-attack if target has combatTarget set to attacker
  if (target.combatState.combatTarget === entityId && !target.combatState.isIncapacitated) {
    const counterResult = resolveAttack(target, entity, config, templates);

    // HP damage to attacker → delta
    combatHpChanges.push({
      targetId: entityId,
      delta: counterResult.hpChange.delta,
    });

    // Rest cost to counter-attacker → delta
    needChanges.push({
      targetId: targetId,
      needType: counterResult.needChange.needType,
      delta: counterResult.needChange.delta,
    });

    events.push({
      type: counterResult.event.type,
      description: counterResult.event.description,
    });
  }

  return {
    events,
    delta: {
      combatHpChanges,
      needChanges,
    },
    ended: false,
  };
}

function executeFlee(world: WorldState, entityId: EntityId): CommandResult {
  const entity = getEntity(world, entityId) as PlayerEntity | NPCEntity | undefined;
  if (!entity || !("combatState" in entity)) return fail("找不到自己");

  if (!entity.combatState.combatTarget) {
    return fail("你没有在战斗中，不需要逃跑。");
  }

  const targetId = entity.combatState.combatTarget;
  const target = world.entities.get(targetId) as PlayerEntity | NPCEntity | undefined;
  if (!target || !("combatState" in target)) {
    // Target gone, clear combat state
    entity.combatState.combatTarget = null;
    return fail("对手已经不在了。");
  }

  const config = world.contentPool.combatConfig;
  const templates = combatTemplates(world);
  const success = checkFlee(entity, target, config);

  const needChange = {
    targetId: entityId,
    needType: "rest" as const,
    delta: -config.restCostPerAttack,
  };

  if (success) {
    entity.combatState.combatTarget = null;
    entity.combatState.isDefending = false;
    // Clear target's combat target if it was pointing at us
    if (target.combatState.combatTarget === entityId) {
      target.combatState.combatTarget = null;
    }
    return {
      events: [
        {
          type: "combat_flee_success",
          description: renderTemplate(templates.fleeSuccess, { actor: entity.name }),
        },
      ],
      delta: { needChanges: [needChange] },
      ended: false,
    };
  }

  return {
    events: [
      {
        type: "combat_flee_fail",
        description: renderTemplate(templates.fleeFail, { actor: entity.name }),
      },
    ],
    delta: { needChanges: [needChange] },
    ended: false,
  };
}

function executeDefend(world: WorldState, entityId: EntityId): CommandResult {
  const entity = getEntity(world, entityId) as PlayerEntity | NPCEntity | undefined;
  if (!entity || !("combatState" in entity)) return fail("找不到自己");

  if (!entity.combatState.combatTarget) {
    return fail("你没有在战斗中，不需要防御。");
  }

  entity.combatState.isDefending = true;
  const config = world.contentPool.combatConfig;
  return {
    events: [
      {
        type: "defend",
        description: renderTemplate(combatTemplates(world).defend, { actor: entity.name }),
      },
    ],
    delta: {
      needChanges: [{ targetId: entityId, needType: "rest", delta: -config.restCostPerAttack }],
    },
    ended: false,
  };
}

function executeEquip(
  world: WorldState,
  entityId: EntityId,
  params: Record<string, unknown>,
): CommandResult {
  const entity = getEntity(world, entityId) as PlayerEntity | NPCEntity | undefined;
  if (!entity) return fail("找不到自己");
  if (!("inventory" in entity) || !("equipment" in entity)) return fail("当前角色无法装备物品");

  const itemId = params.itemId as string | undefined;
  if (!itemId) return fail("不知道要装备什么");

  const itemIndex = entity.inventory.findIndex((i) => i.id === itemId);
  if (itemIndex < 0) return fail("背包里没有这个物品");

  const item = entity.inventory[itemIndex];

  // Determine slot: weapon if atkBonus, else armor; also check equipmentSlot property
  const equipmentSlot = item.properties?.equipmentSlot as string | undefined;
  let slot: "weapon" | "armor" | "cloak" | "accessory";
  if (
    equipmentSlot &&
    (equipmentSlot === "weapon" ||
      equipmentSlot === "armor" ||
      equipmentSlot === "cloak" ||
      equipmentSlot === "accessory")
  ) {
    slot = equipmentSlot;
  } else if (item.properties?.atkBonus) {
    slot = "weapon";
  } else {
    slot = "armor";
  }

  // Unequip existing item in that slot
  const existing = entity.equipment[slot];
  if (existing) {
    entity.inventory.push(existing);
  }

  // Equip new item
  entity.inventory.splice(itemIndex, 1);
  entity.equipment[slot] = item;

  return {
    events: [
      {
        type: "equip",
        description: existing
          ? renderTemplate(commandMessages(world).equipWithSwap, {
              item: item.name,
              previous: existing.name,
            })
          : renderTemplate(commandMessages(world).equip, { item: item.name }),
      },
    ],
    delta: {},
    ended: false,
  };
}

function executeUnequip(
  world: WorldState,
  entityId: EntityId,
  params: Record<string, unknown>,
): CommandResult {
  const entity = getEntity(world, entityId) as PlayerEntity | NPCEntity | undefined;
  if (!entity) return fail("找不到自己");
  if (!("inventory" in entity) || !("equipment" in entity)) return fail("当前角色无法操作装备");

  const slot = params.slot as string | undefined;
  if (!slot || (slot !== "weapon" && slot !== "armor" && slot !== "cloak" && slot !== "accessory"))
    return fail("不知道要卸下哪个装备");

  const item = entity.equipment[slot as keyof typeof entity.equipment];
  if (!item)
    return fail(
      `${slot === "weapon" ? "武器" : slot === "armor" ? "防具" : slot === "cloak" ? "斗篷" : "饰物"}槽没有装备`,
    );

  entity.equipment[slot] = null;
  entity.inventory.push(item);

  return {
    events: [
      {
        type: "unequip",
        description: renderTemplate(commandMessages(world).unequip, { item: item.name }),
      },
    ],
    delta: {},
    ended: false,
  };
}

function executeEat(
  world: WorldState,
  entityId: EntityId,
  params: Record<string, unknown>,
): CommandResult {
  const entity = getEntity(world, entityId);
  if (!entity) return fail("找不到自己");
  if (!hasInventory(entity)) return fail("当前角色没有背包");

  const itemId = params.itemId as string | undefined;
  let item: ItemEntity | undefined;

  if (itemId) {
    item = entity.inventory.find((i) => i.id === itemId) as ItemEntity | undefined;
    if (!item) return fail("背包里没有这个物品");
  } else {
    item = entity.inventory.find((i) => i.properties?.edible) as ItemEntity | undefined;
    if (!item) return fail("背包里没有可食用的物品");
  }

  if (!item.properties?.edible) return fail(`${item.name} 不可食用`);

  const needDeltas = getItemNeedDeltas(item.properties);
  const index = entity.inventory.findIndex((i) => i.id === item?.id);
  if (index >= 0) entity.inventory.splice(index, 1);
  world.entities.delete(item.id);

  const delta: SimulationDelta =
    Object.keys(needDeltas).length > 0
      ? {
          needChanges: Object.entries(needDeltas).map(([needType, d]) => ({
            targetId: entityId,
            needType: needType as unknown as NeedType,
            delta: d,
          })),
        }
      : {};

  const effectText = formatNeedDeltas(needDeltas, world.contentPool.needLabels);
  return {
    events: [
      {
        type: "eat",
        description: effectText
          ? renderTemplate(commandMessages(world).eatWithEffect, {
              item: item.name,
              effect: effectText,
            })
          : renderTemplate(commandMessages(world).eatNoEffect, { item: item.name }),
      },
    ],
    delta,
    ended: false,
  };
}

function executeRead(
  world: WorldState,
  entityId: EntityId,
  params: Record<string, unknown>,
): CommandResult {
  const entity = getEntity(world, entityId);
  if (!entity) return fail("找不到自己");

  const itemId = params.itemId as string | undefined;
  if (!itemId) return fail(commandMessages(world).readSpecifyItem);

  const item = findReadableCandidate(world, entity, itemId);
  if (!item) return fail(commandMessages(world).readItemNotFound);
  if (item.properties.readable !== true) {
    return fail(renderTemplate(commandMessages(world).readNotReadable, { item: item.name }));
  }

  const bookContent = world.contentPool.bookContents.find(
    (candidate) => candidate.itemTemplateId === item.templateId,
  );
  if (!bookContent) {
    return fail(renderTemplate(commandMessages(world).readMissingContent, { item: item.name }));
  }

  const needDeltas = getItemNeedDeltas(item.properties);
  const traitModifiers = getItemTraitModifiers(item.properties);
  const delta: SimulationDelta = {};
  if (Object.keys(needDeltas).length > 0) {
    delta.needChanges = Object.entries(needDeltas).map(([needType, d]) => ({
      targetId: entityId,
      needType: needType as unknown as NeedType,
      delta: d,
    }));
  }
  if (traitModifiers.length > 0) {
    delta.traitModifiers = traitModifiers.map((modifier) => ({
      targetId: entityId,
      trait: modifier.trait,
      delta: modifier.delta,
    }));
  }

  const effectText = formatNeedDeltas(needDeltas, world.contentPool.needLabels);
  return {
    events: [
      {
        type: "book_read",
        description: effectText
          ? renderTemplate(commandMessages(world).readWithEffect, {
              item: item.name,
              effect: effectText,
            })
          : renderTemplate(commandMessages(world).readNoEffect, { item: item.name }),
      },
    ],
    delta,
    ended: false,
    bookDisplay: {
      title: bookContent.title,
      pages: bookContent.pages,
    },
  };
}

// --- Helpers ---

function fail(message: string): CommandResult {
  return {
    events: [{ type: "error", description: message }],
    delta: {},
    ended: false,
  };
}

function buildDelta(entityId: EntityId, pool: ContentPool, action: string): SimulationDelta {
  return resolveActionEffect(entityId, pool, action);
}

/**
 * 解析 action 效果 → SimulationDelta (needChanges + itemChanges + itemCosts)
 * 玩家路径和 NPC 路径共享此函数，避免逻辑重复。
 */
export function resolveActionEffect(
  entityId: EntityId,
  pool: ContentPool,
  action: string,
): SimulationDelta {
  const effect = pool.actionEffects.find((candidate) => candidate.action === action);
  if (!effect) return {};

  // needChanges
  const needChanges = Object.entries(effect.needDeltas).map(([needType, delta]) => ({
    targetId: entityId,
    needType: needType as unknown as NeedType,
    delta: delta as number,
  }));

  // itemChanges: itemCosts (remove) + itemDeltas (add)
  const itemChanges: ItemChange[] = [];
  if (effect.itemCosts) {
    for (const [templateId, qty] of Object.entries(effect.itemCosts)) {
      itemChanges.push({ targetId: entityId, templateId, operation: "remove", qty });
    }
  }
  if (effect.itemDeltas) {
    for (const [templateId, qty] of Object.entries(effect.itemDeltas)) {
      itemChanges.push({ targetId: entityId, templateId, operation: "add", qty });
    }
  }

  const delta: SimulationDelta = {};
  if (needChanges.length > 0) delta.needChanges = needChanges;
  if (itemChanges.length > 0) delta.itemChanges = itemChanges;
  return delta;
}

/**
 * 通用房间动作 (eat_at_tavern, work_at_smithy, etc.)
 * 非内置玩家命令的 action 都走这里。
 */
function executeRoomAction(world: WorldState, entityId: EntityId, action: string): CommandResult {
  const entity = getEntity(world, entityId);
  if (!entity) return fail("找不到自己");

  // 检查房间是否支持此动作 (通过 tag 路由)
  const room = entity.roomId ? world.rooms.get(entity.roomId) : null;
  const tags = room?.tags ?? [];
  const actionAllowed = tags.some((tag) => {
    const actions = world.contentPool.entityActionsByTag[tag] ?? [];
    return actions.includes(action);
  });
  if (!actionAllowed) return fail(`未知操作: ${action}`);

  const effect = world.contentPool.actionEffects.find((candidate) => candidate.action === action);
  if (!effect) return fail(`未知操作: ${action}`);

  const entityWithNeeds = entity as PlayerEntity | NPCEntity | FactionEntity;

  // 检查物品消耗是否足够
  if (effect.itemCosts && hasInventory(entity)) {
    const blockers = checkItemCostFeasibility(entityWithNeeds, effect.itemCosts);
    if (blockers.length > 0) {
      return fail(blockers[0]);
    }
    // 执行物品消耗
    for (const [templateId, qty] of Object.entries(effect.itemCosts)) {
      removeItems(entityWithNeeds as PlayerEntity, templateId, qty);
    }
  }

  const delta = resolveActionEffect(entityId, world.contentPool, action);

  if (entity.type === "player" && room) {
    const player = entity as PlayerEntity;
    for (const eid of room.entities) {
      const roomEntity = world.entities.get(eid);
      if (roomEntity?.type !== "item") continue;
      const item = roomEntity as import("../core/types.ts").ItemEntity;
      if (!item.discoverable) continue;
      if (player.discoveredEntities.includes(item.id)) continue;
      const clueId = (item.discoverable as import("../core/types.ts").DiscoverableCondition)
        .requiredClueId;
      const hasClue = player.knownClues.some((c) => c.clueId === clueId);
      if (!hasClue) continue;
      delta.discoverableChanges = delta.discoverableChanges ?? [];
      delta.discoverableChanges.push({
        playerId: entityId,
        entityId: item.id,
        operation: "discover",
      });
    }
  }

  const label = world.contentPool.entityActionLabels[action] ?? action;
  const effectText = formatNeedDeltas(effect.needDeltas, world.contentPool.needLabels);
  return {
    events: [
      {
        type: "room_action",
        description: effectText
          ? renderTemplate(commandMessages(world).roomActionWithEffect, {
              label,
              effect: effectText,
            })
          : renderTemplate(commandMessages(world).roomAction, { label }),
      },
    ],
    delta,
    ended: false,
  };
}

/**
 * 检查玩家是否有足够物品支付 itemCosts
 * 返回 blocker 消息列表，空数组表示可行
 */
function checkItemCostFeasibility(
  entity: PlayerEntity | NPCEntity | FactionEntity,
  itemCosts: Record<string, number>,
): string[] {
  if (!("inventory" in entity)) return [];
  const blockers: string[] = [];
  for (const [templateId, qty] of Object.entries(itemCosts)) {
    const held = countItemsByTemplate(entity as PlayerEntity, templateId);
    if (held < qty) {
      blockers.push(`需要 ${qty} 个 ${templateId}，只有 ${held} 个`);
    }
  }
  return blockers;
}

function _hasEnoughItems(entity: PlayerEntity, templateId: string, qty: number): boolean {
  return countItemsByTemplate(entity, templateId) >= qty;
}

function countItemsByTemplate(entity: PlayerEntity, templateId: string): number {
  return entity.inventory.filter((item) => item.templateId === templateId).length;
}

function removeItems(entity: PlayerEntity, templateId: string, qty: number): void {
  let remaining = qty;
  for (let i = entity.inventory.length - 1; i >= 0 && remaining > 0; i--) {
    if (entity.inventory[i].templateId === templateId) {
      entity.inventory.splice(i, 1);
      remaining--;
    }
  }
}

function hasInventory(entity: Entity): entity is PlayerEntity {
  return entity.type === "player";
}

function findReadableCandidate(
  world: WorldState,
  entity: Entity,
  itemId: string,
): ItemEntity | undefined {
  if (hasInventory(entity)) {
    const inventoryItem = entity.inventory.find((item) => item.id === itemId);
    if (inventoryItem) return inventoryItem;
  }

  if (!entity.roomId) return undefined;
  return getRoomEntities(world, entity.roomId).find(
    (candidate): candidate is ItemEntity => candidate.type === "item" && candidate.id === itemId,
  );
}

function getItemNeedDeltas(properties: Record<string, unknown>): Record<string, number> {
  if (properties.needDeltas && typeof properties.needDeltas === "object") {
    return Object.fromEntries(
      Object.entries(properties.needDeltas as Record<string, unknown>)
        .map(([needType, delta]) => [needType, Number(delta)] as const)
        .filter(([, delta]) => Number.isFinite(delta)),
    );
  }

  const deltas: Record<string, number> = {};
  if (typeof properties.hungerRestore === "number") deltas.hunger = properties.hungerRestore;
  if (typeof properties.restRestore === "number") deltas.rest = properties.restRestore;
  if (typeof properties.socialRestore === "number") deltas.social = properties.socialRestore;
  if (typeof properties.safetyRestore === "number") deltas.safety = properties.safetyRestore;
  return deltas;
}

function getItemTraitModifiers(properties: Record<string, unknown>): Array<{
  trait: string;
  delta: number;
}> {
  if (!Array.isArray(properties.traitModifiers)) return [];
  return properties.traitModifiers
    .map((modifier) => {
      if (!modifier || typeof modifier !== "object") return null;
      const record = modifier as Record<string, unknown>;
      const delta = Number(record.delta);
      if (typeof record.trait !== "string" || !Number.isFinite(delta)) return null;
      return { trait: record.trait, delta };
    })
    .filter((modifier): modifier is { trait: string; delta: number } => modifier !== null);
}

function formatNeedDeltas(deltas: Record<string, number>, labels: Record<string, string>): string {
  return Object.entries(deltas)
    .map(([needType, delta]) => `${labels[needType] ?? needType} ${delta > 0 ? "+" : ""}${delta}`)
    .join("，");
}
