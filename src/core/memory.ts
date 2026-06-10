/**
 * 记忆系统 — NPC/玩家记忆的创建、裁剪、查询
 *
 * 记忆是 act-loop 的副作用之一，不通过 SimulationDelta 管道传递，
 * 直接写入 entity.memories。
 */

import type {
  Entity,
  EntityId,
  Memory,
  MemoryTemplates,
  NPCEntity,
  PlayerEntity,
  SimulationDelta,
  Tick,
  WorldState,
} from "./types.ts";

const DEFAULT_MAX_MEMORIES = 100;

// ── 类型守卫 ──

function hasMemories(entity: Entity): entity is NPCEntity | PlayerEntity {
  return entity.type === "npc" || entity.type === "player";
}

function isNpc(entity: Entity): entity is NPCEntity {
  return entity.type === "npc";
}

// ── 基础操作 ──

/**
 * 为实体添加一条记忆，自动裁剪超出上限的旧记忆
 */
export function addMemory(
  entity: NPCEntity | PlayerEntity,
  content: string,
  type: Memory["type"],
  importance: number,
  tick: Tick,
  entityIds?: EntityId[],
): void {
  const memory: Memory = { tick, content, importance, type };
  if (entityIds && entityIds.length > 0) {
    memory.entityIds = entityIds;
  }
  entity.memories.push(memory);
  trimMemories(entity);
}

/**
 * 裁剪记忆到上限，优先移除最旧的低重要度 observation
 */
export function trimMemories(entity: NPCEntity | PlayerEntity, max = DEFAULT_MAX_MEMORIES): void {
  if (entity.memories.length <= max) return;

  // 按 importance 升序（低重要度优先移除），同 importance 按 tick 升序（旧的优先移除）
  entity.memories.sort((a, b) => {
    if (a.importance !== b.importance) return a.importance - b.importance;
    return a.tick - b.tick;
  });

  // 移除前 (length - max) 条
  entity.memories.splice(0, entity.memories.length - max);
}

// ── 观察者提取 ──

/**
 * 从 ripple delta 的 relationChanges 中提取观察者 ID
 */
export function extractObserverIds(rippleDelta: SimulationDelta): EntityId[] {
  return rippleDelta.relationChanges?.map((r) => r.fromId) ?? [];
}

// ── 行为记忆创建（act-loop 的 Step 5） ──

/**
 * 根据 action 类型创建对应记忆
 *
 * 包括：
 * - 行为者的自身记忆（移动、拾取、对话等）
 * - ripple 观察者的观测记忆
 * - 特殊情况（look 对敏感 NPC）
 *
 * @returns 创建的记忆数量
 */
export function createMemoriesForAction(
  world: WorldState,
  actorId: EntityId,
  action: string,
  actionDelta: SimulationDelta,
  options: {
    targetId?: EntityId;
    roomId?: string;
    oldRoomId?: string;
    llmDelta?: SimulationDelta;
  } = {},
): number {
  const actor = world.entities.get(actorId);
  if (!actor) return 0;

  let count = 0;

  // ── 1. 移动：出发房间和到达房间的 NPC 观测 ──
  if (action === "move") {
    count += createMoveMemories(world, actorId, options.roomId, options.oldRoomId);
    return count;
  }

  // ── 2. 对话：NPC + player 的对话记忆 ──
  if (action === "talk" && options.targetId && options.llmDelta) {
    count += createTalkMemories(world, actorId, options.targetId, options.roomId, options.llmDelta);
  }

  // ── 3. look：仅敏感 NPC ──
  if (action === "look" && options.targetId) {
    count += createLookMemory(world, actorId, options.targetId);
    return count;
  }

  // ── 4. ripple 观察者记忆 ──
  const observerIds = options.targetId
    ? (actionDelta.relationChanges?.map((r) => r.fromId) ?? [])
    : (actionDelta.relationChanges?.map((r) => r.fromId) ?? []);

  if (observerIds.length > 0) {
    count += createObserverMemories(
      world,
      observerIds,
      actorId,
      action,
      options.targetId,
      options.roomId,
    );
  }

  // ── 5. say：房间内所有 NPC 听到了 ──
  if (action === "say" && options.roomId) {
    count += createSayMemories(world, actorId, options.roomId);
  }

  // ── 6. take/drop：行为者自身记忆 ──
  if ((action === "take" || action === "drop") && hasMemories(actor)) {
    const mt = getMemoryTemplates(world);
    const itemName = options.targetId
      ? (world.entities.get(options.targetId)?.name ?? mt.fallbackItemName)
      : mt.fallbackItemName;
    const template = action === "take" ? mt.take.self : mt.drop.self;
    addMemory(actor, fillTemplate(template, { item: itemName }), "observation", 0.3, world.tick, [
      actorId,
      ...(options.targetId ? [options.targetId] : []),
    ]);
    count++;
  }

  return count;
}

// ── 内部实现 ──

function createMoveMemories(
  world: WorldState,
  actorId: EntityId,
  roomId?: string, // old room
  oldRoomId?: string,
): number {
  const actor = world.entities.get(actorId);
  if (!actor) return 0;

  const srcRoomId = oldRoomId ?? roomId;
  let count = 0;

  // 出发房间的 NPC 看到离开
  if (srcRoomId) {
    const srcRoom = world.rooms.get(srcRoomId);
    if (srcRoom) {
      for (const eid of srcRoom.entities) {
        if (eid === actorId) continue;
        const observer = world.entities.get(eid);
        if (!observer || !hasMemories(observer)) continue;
        addMemory(
          observer,
          fillTemplate(getMemoryTemplates(world).move.observerLeave, {
            actor: actor.name,
            room: srcRoom.name,
          }),
          "observation",
          0.2,
          world.tick,
          [actorId],
        );
        count++;
      }
    }
  }

  // 到达房间的 NPC 看到来人
  const newRoomId = actor.roomId;
  if (newRoomId && newRoomId !== srcRoomId) {
    const newRoom = world.rooms.get(newRoomId);
    if (newRoom) {
      for (const eid of newRoom.entities) {
        if (eid === actorId) continue;
        const observer = world.entities.get(eid);
        if (!observer || !hasMemories(observer)) continue;
        addMemory(
          observer,
          fillTemplate(getMemoryTemplates(world).move.observerArrive, {
            actor: actor.name,
            room: newRoom.name,
          }),
          "observation",
          0.2,
          world.tick,
          [actorId],
        );
        count++;
      }
    }
  }

  // 行为者自身记忆
  if (hasMemories(actor)) {
    const newRoom = newRoomId ? world.rooms.get(newRoomId) : null;
    if (newRoom) {
      addMemory(
        actor,
        fillTemplate(getMemoryTemplates(world).move.self, { room: newRoom.name }),
        "observation",
        0.15,
        world.tick,
      );
      count++;
    }
  }

  return count;
}

function createTalkMemories(
  world: WorldState,
  actorId: EntityId,
  targetId: EntityId,
  roomId: string | undefined,
  llmDelta: SimulationDelta,
): number {
  const actor = world.entities.get(actorId);
  const target = world.entities.get(targetId);
  if (!actor || !target || !hasMemories(target)) return 0;

  const roomName = roomId ? (world.rooms.get(roomId)?.name ?? "") : "";
  const dialogue = llmDelta.dialogues?.[0]?.content ?? "";

  // NPC 对话记忆
  const truncated = dialogue.length > 60 ? `${dialogue.substring(0, 60)}…` : dialogue;
  addMemory(
    target,
    fillTemplate(getMemoryTemplates(world).talk.target, {
      actor: actor.name,
      room: roomName,
      text: truncated,
    }),
    "conversation",
    0.5,
    world.tick,
    [actorId, targetId],
  );

  // 玩家对话记忆
  if (hasMemories(actor)) {
    addMemory(
      actor,
      fillTemplate(getMemoryTemplates(world).talk.self, {
        target: target.name,
        room: roomName,
      }),
      "conversation",
      0.4,
      world.tick,
      [actorId, targetId],
    );
    return 2;
  }

  return 1;
}

function createLookMemory(world: WorldState, actorId: EntityId, targetId: EntityId): number {
  const actor = world.entities.get(actorId);
  const target = world.entities.get(targetId);
  if (!actor || !target || !isNpc(target) || !hasMemories(target)) return 0;

  const sensitiveTraits = world.contentPool.sensitiveTraitNames;
  const isSensitive = target.traits.some((t) => sensitiveTraits.includes(t.name) && t.value > 30);
  if (!isSensitive) return 0;

  addMemory(
    target,
    fillTemplate(getMemoryTemplates(world).look.self, { actor: actor.name }),
    "observation",
    0.4,
    world.tick,
    [actorId],
  );
  return 1;
}

function createObserverMemories(
  world: WorldState,
  observerIds: EntityId[],
  actorId: EntityId,
  action: string,
  targetId?: EntityId,
  roomId?: string,
): number {
  const actor = world.entities.get(actorId);
  if (!actor) return 0;

  const roomName = roomId ? (world.rooms.get(roomId)?.name ?? "") : "";
  const targetName = targetId ? (world.entities.get(targetId)?.name ?? "") : "";
  let count = 0;

  const actionLabel = getActionLabel(action, world);

  for (const obsId of observerIds) {
    if (obsId === actorId) continue;
    const observer = world.entities.get(obsId);
    if (!observer || !hasMemories(observer)) continue;

    const mt = getMemoryTemplates(world);
    let content: string;
    switch (action) {
      case "talk":
        content = targetName
          ? fillTemplate(mt.talk.observer, {
              actor: actor.name,
              target: targetName,
              room: roomName,
              action: actionLabel,
            })
          : fillTemplate(mt.talk.observerNoTarget, {
              actor: actor.name,
              room: roomName,
              action: actionLabel,
            });
        break;
      case "take":
        content = targetName
          ? fillTemplate(mt.take.observer, { actor: actor.name, item: targetName })
          : fillTemplate(mt.take.observer, { actor: actor.name, item: mt.fallbackItemName });
        break;
      case "drop":
        content = targetName
          ? fillTemplate(mt.drop.observer, { actor: actor.name, item: targetName })
          : fillTemplate(mt.drop.observer, { actor: actor.name, item: mt.fallbackItemName });
        break;
      default:
        content = fillTemplate(mt.talk.observerNoTarget, {
          actor: actor.name,
          room: roomName,
          action: actionLabel,
        });
        break;
    }

    addMemory(
      observer,
      content,
      "observation",
      0.3,
      world.tick,
      [actorId, targetId].filter(Boolean) as EntityId[],
    );
    count++;
  }

  return count;
}

function createSayMemories(world: WorldState, actorId: EntityId, roomId: string): number {
  const actor = world.entities.get(actorId);
  const room = world.rooms.get(roomId);
  if (!actor || !room) return 0;

  let count = 0;
  for (const eid of room.entities) {
    if (eid === actorId) continue;
    const observer = world.entities.get(eid);
    if (!observer || !hasMemories(observer)) continue;
    addMemory(
      observer,
      fillTemplate(getMemoryTemplates(world).say.observer, {
        actor: actor.name,
        room: room.name,
      }),
      "observation",
      0.2,
      world.tick,
      [actorId],
    );
    count++;
  }

  return count;
}

// ── 每日例行记忆 ──

/**
 * NPC 每日结算时生成的例行记忆汇总
 */
export function createDailyRoutineMemory(npc: NPCEntity, tick: Tick, world: WorldState): void {
  addMemory(npc, getMemoryTemplates(world).dailyRoutine, "observation", 0.05, tick);
}

// ── 工具函数 ──

function getActionLabel(action: string, world: WorldState): string {
  const titles = world.contentPool.narrativeTemplates.eventTitles;
  if (titles[action]) return titles[action];
  return action.replace(/_/g, " ");
}

function fillTemplate(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{${key}}`, value);
  }
  return result;
}

function getMemoryTemplates(world: WorldState): MemoryTemplates {
  return world.contentPool.narrativeTemplates.memoryTemplates;
}
