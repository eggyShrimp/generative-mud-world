/**
 * Act Loop — 通用交互循环
 *
 * 任意 entity（玩家或 NPC）的行为都经过此循环：
 *   1. 计算 social ripple
 *   2. compose deltas + apply
 *   3. 创建记忆
 *   4. delta → events
 *
 * 此文件是纯编排逻辑，不直接读写 ContentPool，只调用子模块。
 */

import { createMemoriesForAction } from "../core/memory.ts";
import type { EntityId, SimulationDelta, WorldState } from "../core/types.ts";
import { applyDelta } from "../core/world.ts";
import type { CommandEvent } from "../shared/protocol.ts";
import { evaluateSocialRipples } from "../simulation/social-ripple.ts";
import { composeDeltas, createSocialSignal, deltaToEvents } from "./delta-composer.ts";

export interface ActLoopContext {
  world: WorldState;
  actorId: EntityId;
  action: string;
  /** 行为的基础 delta（来自 command-executor 或 schedule-executor） */
  actionDelta: SimulationDelta;
  /** 行为的基础 events（来自 command-executor） */
  actionEvents: CommandEvent[];
  options?: {
    targetId?: EntityId;
    roomId?: string;
    oldRoomId?: string;
    llmDelta?: SimulationDelta;
    createMemory?: boolean;
  };
}

export interface ActLoopResult {
  delta: SimulationDelta;
  events: CommandEvent[];
  memoriesCreated: number;
}

/**
 * 通用 act loop — 任何 entity 的行为都走此函数
 *
 * 调用方负责：
 * - 玩家: executeCommand() → actionDelta + actionEvents
 * - NPC schedule: ContentPool lookup → actionDelta
 *
 * 此函数负责：
 * - social ripple（同房间 NPC 观察反应）
 * - compose + applyDelta
 * - 创建记忆
 * - delta → events
 */
export function executeEntityAction(ctx: ActLoopContext): ActLoopResult {
  const { world, actorId, action, actionDelta, actionEvents, options = {} } = ctx;

  const { targetId, roomId, llmDelta, createMemory = true } = options;

  // === Step 1: Social ripple（仅对有社会信号的 action 生效）===
  const signalStrength = world.contentPool.socialRippleConfig.signalStrength;
  const signal = createSocialSignal(actorId, action, signalStrength, roomId, targetId);
  const rippleDelta = signal ? evaluateSocialRipples(world, signal) : {};

  // === Step 2: Compose + Apply ===
  const mergedDelta = composeDeltas(actionDelta, llmDelta ?? {}, rippleDelta);
  if (!isEmptyDelta(mergedDelta)) {
    applyDelta(world, mergedDelta);
  }

  // === Step 3: 创建记忆 ===
  let memoriesCreated = 0;
  if (createMemory) {
    memoriesCreated = createMemoriesForAction(world, actorId, action, mergedDelta, {
      targetId,
      roomId,
      oldRoomId: options.oldRoomId,
      llmDelta,
    });
  }

  // === Step 4: Delta → Events ===
  const entityName = (id: EntityId) => world.entities.get(id)?.name ?? id;
  const needLabel = (nt: string) => world.contentPool.needLabels[nt] ?? nt;
  const deltaEvents = deltaToEvents(
    mergedDelta,
    entityName,
    actorId,
    needLabel,
    world.contentPool.narrativeTemplates.settlementMessages,
  );

  return {
    delta: mergedDelta,
    events: [...actionEvents, ...deltaEvents],
    memoriesCreated,
  };
}

// ── 内部工具 ──

function isEmptyDelta(delta: SimulationDelta): boolean {
  return (
    !delta.traitModifiers?.length &&
    !delta.needChanges?.length &&
    !delta.relationChanges?.length &&
    !delta.dialogues?.length &&
    !delta.worldEvents?.length &&
    !delta.combatHpChanges?.length &&
    !delta.questChanges?.length &&
    !delta.itemChanges?.length &&
    !delta.revealRooms?.length &&
    !delta.knownClueChanges?.length &&
    !delta.discoverableChanges?.length
  );
}
