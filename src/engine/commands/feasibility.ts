/**
 * 可行性检查系统
 *
 * 在执行命令之前调用，不产生任何副作用。
 * 各检查器独立运行，全部通过才返回 feasible=true。
 */

import type {
  Entity,
  EntityId,
  FactionEntity,
  NPCEntity,
  PlayerEntity,
  WorldState,
} from "../../core/types.ts";
import { getEntity } from "../../core/world.ts";

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

// Exported because executeMove in move.ts needs it
export function calcMoveRestCost(world: WorldState, entity: Entity, direction: string): number {
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

// --- Internal helpers ---

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
