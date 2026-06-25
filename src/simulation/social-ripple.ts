/**
 * Social Ripple — 评估同房间 NPC 对交互的观察反应
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
import type {
  EntityId,
  NPCEntity,
  RelationChange,
  SimulationDelta,
  SocialRippleConfig,
  WorldEvent,
  WorldState,
} from "../core/types.ts";

/**
 * 社会涟漪信号 — 任何玩家交互产生的社会信号
 */
export interface SocialSignal {
  actorId: EntityId;
  action: string;
  targetId?: EntityId;
  roomId?: string;
}

/**
 * 评估社会涟漪: 同房间 NPC 观察到交互后，基于关系权重和性格乘数产生关系变化
 *
 * 核心公式:
 *   score = signalStrength × careFactor × traitMultiplier
 *
 * 其中:
 *   signalStrength = ContentPool.socialRippleConfig.signalStrength[action]
 *   careFactor = 插值计算 observer ↔ participant 的关系权重
 *   traitMultiplier = observer 性格对信号的放大/缩小系数
 *
 * 纯函数: 输入 (world, signal) → 输出 SimulationDelta
 */
export function evaluateSocialRipples(world: WorldState, signal: SocialSignal): SimulationDelta {
  const config = world.contentPool.socialRippleConfig;
  if (!config.enabled) return {};

  const actor = world.entities.get(signal.actorId);
  if (!actor?.roomId) return {};

  const room = world.rooms.get(actor.roomId);
  if (!room) return {};

  const signalStrength = config.signalStrength[signal.action];
  if (signalStrength === undefined || signalStrength === 0) return {};

  const relationChanges: RelationChange[] = [];
  const events: WorldEvent[] = [];

  for (const entityId of room.entities) {
    // 跳过行为者本人
    if (entityId === signal.actorId) continue;
    // 跳过交互目标（如果有的话）
    if (entityId === signal.targetId) continue;

    const observer = world.entities.get(entityId);
    if (observer?.type !== "npc") continue;

    const npc = observer as NPCEntity;

    // 计算 observer 对 actor 和 target 的在乎程度
    const relToActor = getRelationLevel(npc, signal.actorId);
    const relToTarget = signal.targetId ? getRelationLevel(npc, signal.targetId) : 0;

    // 关系权重: 取两者中绝对值更大的那个（更在乎谁）
    const careActor = interpolateWeight(relToActor, config);
    const careTarget = signal.targetId ? interpolateWeight(relToTarget, config) : 0;
    const careFactor = Math.abs(careActor) >= Math.abs(careTarget) ? careActor : careTarget;

    // 如果完全不在乎，跳过
    if (Math.abs(careFactor) < 0.1) continue;

    // 性格乘数: 取 observer 所有 trait 中乘数最极端的
    const traitMultiplier = computeTraitMultiplier(npc.traits, config.traitMultipliers);

    // 计算涟漪分数
    const score = signalStrength * careFactor * traitMultiplier;

    // 低于阈值不产生反应
    if (Math.abs(score) < config.threshold) continue;

    // 截断到 maxDelta
    const delta = Math.max(-config.maxDelta, Math.min(config.maxDelta, Math.round(score)));

    relationChanges.push({
      fromId: entityId,
      toId: signal.actorId,
      delta,
    });

    const targetName = getTargetName(world, signal.targetId);
    const actionTitle =
      world.contentPool.narrativeTemplates.eventTitles[signal.action] ?? signal.action;
    const observedAction = targetName ? `你和${targetName}的${actionTitle}` : `你的${actionTitle}`;

    events.push({
      id: `ripple_${entityId}_${signal.actorId}_${world.tick}`,
      type: "observer_reaction",
      title: "旁观者反应",
      description: `${npc.name} 注意到了${observedAction}`,
      scope: room.id,
      tick: world.tick,
      source: "simulation",
      data: {
        observerId: entityId,
        actorId: signal.actorId,
        action: signal.action,
        score: Math.round(score * 10) / 10,
      },
    });
  }

  return {
    relationChanges: relationChanges.length > 0 ? relationChanges : undefined,
    worldEvents: events.length > 0 ? events : undefined,
  };
}

// --- 内部工具函数 ---

/**
 * 从 NPC 的 relations 数组中获取与目标的关系等级
 */
function getRelationLevel(npc: NPCEntity, targetId: EntityId): number {
  const rel = npc.relations.find((r) => r.targetId === targetId);
  return rel?.level ?? 0;
}

/**
 * 线性插值: 根据关系水平查找对应的权重乘数
 */
function interpolateWeight(relationLevel: number, config: SocialRippleConfig): number {
  const points = config.relationWeightPoints;
  const multipliers = config.relationWeightMultipliers;

  if (points.length === 0) return 1.0;

  // 低于最小断点
  if (relationLevel <= points[0]) return multipliers[0];
  // 高于最大断点
  if (relationLevel >= points[points.length - 1]) return multipliers[multipliers.length - 1];

  // 线性插值
  for (let i = 0; i < points.length - 1; i++) {
    if (relationLevel >= points[i] && relationLevel <= points[i + 1]) {
      const t = (relationLevel - points[i]) / (points[i + 1] - points[i]);
      return multipliers[i] + t * (multipliers[i + 1] - multipliers[i]);
    }
  }

  return 1.0;
}

/**
 * 从 observer 的 traits 中计算综合性格乘数
 * 取所有 trait 中绝对值最极端的乘数（最敏感的性格决定反应）
 */
function computeTraitMultiplier(
  traits: Array<{ name: string; value: number }>,
  traitMultipliers: Record<string, number>,
): number {
  let maxAbsMultiplier = 1.0;
  let extremeMultiplier = 1.0;

  for (const trait of traits) {
    const multiplier = traitMultipliers[trait.name];
    if (multiplier !== undefined && Math.abs(multiplier) > Math.abs(maxAbsMultiplier)) {
      maxAbsMultiplier = Math.abs(multiplier);
      extremeMultiplier = multiplier;
    }
  }

  return extremeMultiplier;
}

/**
 * 获取交互目标的名称
 */
function getTargetName(world: WorldState, targetId?: EntityId): string {
  if (!targetId) return "";
  const entity = world.entities.get(targetId);
  return entity?.name ?? targetId;
}
