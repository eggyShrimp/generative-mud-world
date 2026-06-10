/**
 * Delta Field Registry — 每个 SimulationDelta 字段的处理逻辑集中管理
 *
 * 注册表模式：加新字段只需在此文件添加一个 def，compose/isEmpty/apply/toEvents 四处自动生效。
 *
 * 字段分类（当前不拆 SimulationDelta，但心里知道有两类）：
 * - 实体状态变更：traitModifiers, needChanges, relationChanges, combatHpChanges,
 *                  questChanges, itemChanges, revealRooms
 * - 叙事记录：worldEvents, dialogues
 */

import { resolveRelationLabel } from "../core/relation-label.ts";
import { renderTemplate } from "../core/template.ts";
import type {
  EntityId,
  FactionEntity,
  ItemEntity,
  NPCEntity,
  PlayerEntity,
  SettlementMessages,
  SimulationDelta,
  WorldState,
} from "../core/types.ts";
import { logWrite } from "../shared/log.ts";
import type { CommandEvent } from "../shared/protocol.ts";

// ── 注册表接口 ──

export type ComposeStrategy = "merge-arrays" | "merge-objects" | "overwrite";

export interface DeltaFieldDef {
  key: keyof SimulationDelta;
  strategy: ComposeStrategy;
  apply: (world: WorldState, val: unknown) => void;
  toEvents?: (val: unknown, ctx: DeltaEventCtx) => CommandEvent[];
}

export interface DeltaEventCtx {
  entityName: (id: EntityId) => string;
  playerId: EntityId;
  needLabel: (type: string) => string;
  itemLabel: (templateId: string) => string;
  settlementMessages: SettlementMessages;
}

// ── 注册表 ──

export const DELTA_FIELDS: DeltaFieldDef[] = [
  { key: "traitModifiers", strategy: "merge-arrays", apply: applyTraitModifiers },
  {
    key: "needChanges",
    strategy: "merge-arrays",
    apply: applyNeedChanges,
    toEvents: needChangesToEvents,
  },
  {
    key: "relationChanges",
    strategy: "merge-arrays",
    apply: applyRelationChanges,
    toEvents: relationChangesToEvents,
  },
  {
    key: "worldEvents",
    strategy: "merge-arrays",
    apply: applyWorldEvents,
    toEvents: worldEventsToEvents,
  },
  { key: "dialogues", strategy: "merge-arrays", apply: noop },
  { key: "revealRooms", strategy: "merge-arrays", apply: applyRevealRooms },
  { key: "combatHpChanges", strategy: "merge-arrays", apply: applyCombatHpChanges },
  { key: "questChanges", strategy: "merge-arrays", apply: applyQuestChanges },
  {
    key: "itemChanges",
    strategy: "merge-arrays",
    apply: applyItemChanges,
    toEvents: itemChangesToEvents,
  },
];

// ── 公共 API ──

/** 遍历注册表，对 delta 中存在的每个字段调用其 apply 函数 */
export function applyDeltaFields(world: WorldState, delta: SimulationDelta): void {
  for (const field of DELTA_FIELDS) {
    const val = (delta as Record<string, unknown>)[field.key as string];
    if (val != null) {
      field.apply(world, val);
    }
  }
}

// ── 工具函数 ──

function noop(_world: WorldState, _val: unknown): void {}

/** 获取实体，带类型检查和日志 */
function getEntityChecked(
  world: WorldState,
  id: EntityId,
  capability: string,
): (NPCEntity | PlayerEntity | FactionEntity) | null {
  const entity = world.entities.get(id);
  if (!entity || !(capability in entity)) {
    logWrite("srv", "warn", `[applyDelta] ignored change, entity ${id} missing ${capability}`);
    return null;
  }
  return entity as NPCEntity | PlayerEntity | FactionEntity;
}

// ── Apply 函数 ──

function applyTraitModifiers(world: WorldState, val: unknown): void {
  for (const mod of (val as SimulationDelta["traitModifiers"]) ?? []) {
    const owner = getEntityChecked(world, mod.targetId, "traits");
    if (!owner) continue;
    const trait = owner.traits.find((t) => t.name === mod.trait);
    if (trait) {
      trait.value = Math.max(-100, Math.min(100, trait.value + mod.delta));
    } else {
      owner.traits.push({ name: mod.trait, value: Math.max(-100, Math.min(100, mod.delta)) });
    }
  }
}

function applyNeedChanges(world: WorldState, val: unknown): void {
  for (const change of (val as SimulationDelta["needChanges"]) ?? []) {
    const entity = getEntityChecked(world, change.targetId, "needs");
    if (!entity) continue;
    const need = entity.needs.find((n) => n.type === change.needType);
    if (need) {
      need.value = Math.max(0, Math.min(100, need.value + change.delta));
    } else {
      logWrite("srv", "warn", `[applyDelta] missing need ${change.needType} on ${change.targetId}`);
    }
  }
}

function applyRelationChanges(world: WorldState, val: unknown): void {
  for (const change of (val as SimulationDelta["relationChanges"]) ?? []) {
    const entity = getEntityChecked(world, change.fromId, "relations");
    if (!entity) continue;
    if (!world.entities.has(change.toId)) {
      logWrite(
        "srv",
        "warn",
        `[applyDelta] ignored relation change, unknown target: ${change.toId}`,
      );
      continue;
    }
    const rel = entity.relations.find((r) => r.targetId === change.toId);
    if (rel) {
      rel.level = Math.max(-100, Math.min(100, rel.level + change.delta));
      rel.label = resolveRelationLabel(world.contentPool, rel.level, rel.label, change.newLabel);
      rel.lastInteractionTick = world.tick;
    } else {
      const level = Math.max(-100, Math.min(100, change.delta));
      entity.relations.push({
        targetId: change.toId,
        level,
        label: resolveRelationLabel(world.contentPool, level, undefined, change.newLabel),
        lastInteractionTick: world.tick,
      });
    }
  }
}

function applyCombatHpChanges(world: WorldState, val: unknown): void {
  for (const change of (val as SimulationDelta["combatHpChanges"]) ?? []) {
    const entity = world.entities.get(change.targetId);
    if (!entity || !("combatState" in entity)) {
      logWrite(
        "srv",
        "warn",
        `[applyDelta] ignored combat change, unknown target: ${change.targetId}`,
      );
      continue;
    }
    const e = entity as NPCEntity | PlayerEntity;
    if (!e.combatState) {
      logWrite(
        "srv",
        "warn",
        `[applyDelta] ignored combat change, missing combat state: ${change.targetId}`,
      );
      continue;
    }
    e.combatState.hp = Math.max(0, Math.min(e.combatState.maxHp, e.combatState.hp + change.delta));
  }
}

function applyWorldEvents(world: WorldState, val: unknown): void {
  for (const event of (val as SimulationDelta["worldEvents"]) ?? []) {
    world.eventLog.push(event);
  }
}

function applyRevealRooms(world: WorldState, val: unknown): void {
  for (const reveal of (val as SimulationDelta["revealRooms"]) ?? []) {
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
    const player = entity as PlayerEntity;
    if (!player.knownRooms.includes(reveal.roomId)) {
      player.knownRooms.push(reveal.roomId);
    }
  }
}

// ── Item ID 计数器 ──
let _itemCounter = 0;

function applyItemChanges(world: WorldState, val: unknown): void {
  const pool = world.contentPool;
  for (const change of (val as NonNullable<SimulationDelta["itemChanges"]>) ?? []) {
    const entity = world.entities.get(change.targetId);
    if (!entity || !("inventory" in entity)) {
      logWrite(
        "srv",
        "warn",
        `[applyDelta] ignored item change, entity ${change.targetId} has no inventory`,
      );
      continue;
    }
    const inv = (entity as PlayerEntity | NPCEntity).inventory;

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
      const template = pool.itemTemplates.find((t) => t.id === change.templateId);
      const itemName = template?.name ?? change.templateId;
      const itemProps = { ...(template?.properties ?? {}) };
      for (let i = 0; i < change.qty; i++) {
        const item: ItemEntity = {
          type: "item",
          id: `${change.targetId}_${change.templateId}_${Date.now()}_${++_itemCounter}`,
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
}

// ── questChanges 的 apply 逻辑复杂，保持为独立函数 ──

function applyQuestChanges(world: WorldState, val: unknown): void {
  for (const change of (val as NonNullable<SimulationDelta["questChanges"]>) ?? []) {
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
        if (template.minRelation) {
          const rel = player.relations.find((r) => r.targetId === template.minRelation?.npcId);
          const relValue = rel?.level ?? 0;
          if (relValue < template.minRelation.minValue) {
            logWrite(
              "srv",
              "warn",
              `[applyDelta] ignored quest accept, relation too low: ${template.minRelation.npcId} (${relValue}/${template.minRelation.minValue})`,
            );
            break;
          }
        }
        if (
          template.repeatable &&
          template.cooldownDays &&
          player.completedQuests.includes(template.id)
        ) {
          const lastDay = player.questCooldowns[template.id];
          if (lastDay !== undefined && world.time.day - lastDay < template.cooldownDays) {
            logWrite(
              "srv",
              "warn",
              `[applyDelta] ignored quest accept, still in cooldown: ${template.id}`,
            );
            break;
          }
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
        const template = world.contentPool.questTemplates.find((t) => t.id === change.templateId);
        if (!template) break;
        quest.objectiveProgress[change.objectiveIndex ?? 0] = change.count ?? 0;
        const obj = template.objectives[change.objectiveIndex ?? 0];
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
          if (r.traitModifiers) {
            for (const tm of r.traitModifiers) {
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
          if (r.needChanges) {
            for (const nc of r.needChanges) {
              const need = player.needs.find((n) => n.type === nc.needType);
              if (need) {
                need.value = Math.max(0, Math.min(100, need.value + nc.delta));
              }
            }
          }
          if (r.items) {
            for (const ri of r.items) {
              for (let i = 0; i < ri.quantity; i++) {
                const itemId = `${ri.itemId}_${Date.now()}_${i}`;
                const item: ItemEntity = {
                  type: "item",
                  id: itemId,
                  name: ri.name ?? ri.itemId,
                  roomId: null,
                  description: ri.name ?? ri.itemId,
                  ownerId: player.id,
                  containerId: null,
                  templateId: ri.itemId,
                  properties: { questItem: true },
                };
                world.entities.set(itemId, item);
                player.inventory.push(item);
              }
            }
          }
        }
        break;
      }
      case "fail": {
        const quest = player.activeQuests.find((q) => q.templateId === change.templateId);
        if (quest) quest.status = "failed";
        player.failedQuests.push({
          templateId: change.templateId,
          failedDay: world.time.day,
          reason: change.reason,
        });
        logWrite(
          "srv",
          "info",
          `[applyDelta] quest failed: ${change.templateId} (reason: ${change.reason ?? "unknown"})`,
        );
        const template = world.contentPool.questTemplates.find((t) => t.id === change.templateId);
        if (template?.abandonPenalty) {
          const p = template.abandonPenalty;
          if (p.traitModifiers) {
            for (const tm of p.traitModifiers) {
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
          if (p.needChanges) {
            for (const nc of p.needChanges) {
              const need = player.needs.find((n) => n.type === nc.needType);
              if (need) {
                need.value = Math.max(0, Math.min(100, need.value + nc.delta));
              }
            }
          }
        }
        break;
      }
    }
  }
}

// ── toEvents 函数 ──

function needChangesToEvents(val: unknown, ctx: DeltaEventCtx): CommandEvent[] {
  const events: CommandEvent[] = [];
  const needChanges = (val as NonNullable<SimulationDelta["needChanges"]>) ?? [];
  const playerNeeds = needChanges.filter((n) => n.targetId === ctx.playerId);
  const npcNeeds = needChanges.filter((n) => n.targetId !== ctx.playerId);

  if (playerNeeds.length > 0) {
    const parts = playerNeeds.map((n) => {
      const sign = n.delta > 0 ? "+" : "";
      const label = ctx.needLabel(n.needType);
      return `${label}${sign}${n.delta}`;
    });
    events.push({
      type: "need",
      description: renderTemplate(ctx.settlementMessages.playerNeed, { changes: parts.join("，") }),
    });
  }

  if (npcNeeds.length > 0) {
    events.push({ type: "need", description: ctx.settlementMessages.npcNeed });
  }

  return events;
}

function relationChangesToEvents(val: unknown, ctx: DeltaEventCtx): CommandEvent[] {
  const changes = (val as NonNullable<SimulationDelta["relationChanges"]>) ?? [];
  if (changes.length === 0) return [];
  const parts = changes.map((rel) => {
    const sign = rel.delta > 0 ? "+" : "";
    return `和${ctx.entityName(rel.fromId)}${sign}${rel.delta}`;
  });
  return [
    {
      type: "relation",
      description: renderTemplate(ctx.settlementMessages.relation, { changes: parts.join("，") }),
    },
  ];
}

function worldEventsToEvents(val: unknown, _ctx: DeltaEventCtx): CommandEvent[] {
  return ((val as NonNullable<SimulationDelta["worldEvents"]>) ?? []).map((event) => ({
    type: event.type,
    description: event.description,
  }));
}

function itemChangesToEvents(val: unknown, ctx: DeltaEventCtx): CommandEvent[] {
  const changes = (val as NonNullable<SimulationDelta["itemChanges"]>) ?? [];
  if (changes.length === 0) return [];

  // 按 entity 分组
  const byEntity = new Map<EntityId, typeof changes>();
  for (const change of changes) {
    const arr = byEntity.get(change.targetId) ?? [];
    arr.push(change);
    byEntity.set(change.targetId, arr);
  }

  const events: CommandEvent[] = [];
  for (const [entityId, entityChanges] of byEntity) {
    const parts = entityChanges.map((c) => {
      const label = ctx.itemLabel(c.templateId);
      const sign = c.operation === "add" ? "+" : "-";
      return `${sign}${c.qty} ${label}`;
    });
    const entityDisplayName = entityId === ctx.playerId ? "" : `${ctx.entityName(entityId)} `;
    events.push({
      type: "item",
      description: renderTemplate(ctx.settlementMessages.item, {
        entity: entityDisplayName,
        changes: parts.join("，"),
      }),
    });
  }

  return events;
}
