/**
 * Delta Composer — 合并多个 SimulationDelta 并转换为 CommandEvent
 *
 * 此文件中的函数只读 ContentPool，不在代码中硬编码内容数据。
 *
 * ✅ ContentPool 应该包含的数据:
 *   - 行为标签/名称映射 (action → display label)
 *   - 性格/情绪标签 (trait/emotion → display name)
 *   - 阈值/乘数配置
 *   - 叙事模板字符串
 *
 * ✅ 代码中可以硬编码的内容:
 *   - 命令路由 (action === "talk")
 *   - 数学公式 (clamp, linear interpolation)
 *   - 逻辑常量 (Math.PI, 方向数组)
 */
import { renderTemplate } from "../core/template.ts";
import type { EntityId, SettlementMessages, SimulationDelta } from "../core/types.ts";
import type { CommandEvent } from "../shared/protocol.ts";
import type { SocialSignal } from "../simulation/social-ripple.ts";

/**
 * 合并多个 SimulationDelta 为一个
 *
 * 规则:
 * - traitModifiers / needChanges / relationChanges / dialogues: 数组合并
 * - worldEvents: 数组合并
 */
export function composeDeltas(...deltas: SimulationDelta[]): SimulationDelta {
  const result: SimulationDelta = {};

  for (const delta of deltas) {
    if (!delta || isEmptyDelta(delta)) continue;

    if (delta.traitModifiers?.length) {
      result.traitModifiers = [...(result.traitModifiers ?? []), ...delta.traitModifiers];
    }
    if (delta.needChanges?.length) {
      result.needChanges = [...(result.needChanges ?? []), ...delta.needChanges];
    }
    if (delta.relationChanges?.length) {
      result.relationChanges = [...(result.relationChanges ?? []), ...delta.relationChanges];
    }
    if (delta.dialogues?.length) {
      result.dialogues = [...(result.dialogues ?? []), ...delta.dialogues];
    }
    if (delta.worldEvents?.length) {
      result.worldEvents = [...(result.worldEvents ?? []), ...delta.worldEvents];
    }
    if (delta.combatHpChanges?.length) {
      result.combatHpChanges = [...(result.combatHpChanges ?? []), ...delta.combatHpChanges];
    }
    if (delta.questChanges?.length) {
      result.questChanges = [...(result.questChanges ?? []), ...delta.questChanges];
    }
    if (delta.itemChanges?.length) {
      result.itemChanges = [...(result.itemChanges ?? []), ...delta.itemChanges];
    }
    if (delta.revealRooms?.length) {
      result.revealRooms = [...(result.revealRooms ?? []), ...delta.revealRooms];
    }
    if (delta.knownClueChanges?.length) {
      result.knownClueChanges = [...(result.knownClueChanges ?? []), ...delta.knownClueChanges];
    }
    if (delta.discoverableChanges?.length) {
      result.discoverableChanges = [
        ...(result.discoverableChanges ?? []),
        ...delta.discoverableChanges,
      ];
    }
  }

  return result;
}

/**
 * 判断 action 是否产生社交信号（用于触发涟漪评估）
 * 从 ContentPool.socialRippleConfig.signalStrength 的 key 集合派生
 */
export function isSocialAction(action: string, signalStrength: Record<string, number>): boolean {
  return action in signalStrength;
}

export function createSocialSignal(
  actorId: string,
  action: string,
  signalStrength: Record<string, number>,
  roomId?: string,
  targetId?: string,
): SocialSignal | null {
  if (!isSocialAction(action, signalStrength)) return null;
  return { actorId, action, roomId, targetId };
}

// --- 内部工具 ---

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

// --- Delta → CommandEvent 转换 ---

/**
 * 将 SimulationDelta 的各字段转换为客户端可展示的 CommandEvent[]
 * 用于 executeStructuredCommand 中，将 LLM/涟漪产出的 delta 效果注入 result.events
 *
 * 聚合规则:
 * - 对话行: 每条独立事件
 * - 世界事件: 每条独立事件
 * - 关系变化: 所有变化聚合为 1 行
 * - 需求变化: 玩家自身聚合为 1 行，NPC 聚合为 1 行
 */
export function deltaToEvents(
  delta: SimulationDelta,
  entityName: (id: EntityId) => string,
  playerId: EntityId,
  needLabel: (type: string) => string,
  messages: SettlementMessages,
): CommandEvent[] {
  const events: CommandEvent[] = [];

  // 对话行
  for (const line of delta.dialogues ?? []) {
    events.push({
      type: "dialogue",
      description: renderTemplate(messages.dialogue, {
        speaker: entityName(line.speakerId),
        content: line.content,
      }),
    });
  }

  // 世界事件 (来自 delta.worldEvents)
  for (const event of delta.worldEvents ?? []) {
    events.push({
      type: event.type,
      description: event.description,
    });
  }

  // 关系变化 — 聚合为 1 行
  const relationChanges = delta.relationChanges ?? [];
  if (relationChanges.length > 0) {
    const parts = relationChanges.map((rel) => {
      const sign = rel.delta > 0 ? "+" : "";
      return `和${entityName(rel.toId)}${sign}${rel.delta}`;
    });
    events.push({
      type: "relation",
      description: renderTemplate(messages.relation, { changes: parts.join("，") }),
    });
  }

  // 需求变化 — 玩家/NPC 各聚合为 1 行
  const needChanges = delta.needChanges ?? [];
  const playerNeeds = needChanges.filter((n) => n.targetId === playerId);
  const npcNeeds = needChanges.filter((n) => n.targetId !== playerId);

  if (playerNeeds.length > 0) {
    const parts = playerNeeds.map((n) => {
      const sign = n.delta > 0 ? "+" : "";
      const label = needLabel(n.needType);
      return `${label}${sign}${n.delta}`;
    });
    events.push({
      type: "need",
      description: renderTemplate(messages.playerNeed, { changes: parts.join("，") }),
    });
  }

  if (npcNeeds.length > 0) {
    events.push({
      type: "need",
      description: messages.npcNeed,
    });
  }

  return events;
}
