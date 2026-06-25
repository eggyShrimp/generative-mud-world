import { logWrite } from "../../shared/log.ts";
import { resolveRelationLabel } from "../relation-label.ts";
import type {
  FactionEntity,
  ItemEntity,
  NPCEntity,
  PlayerEntity,
  SimulationDelta,
  WorldState,
} from "../types.ts";
import { discoverRoom } from "./entity-ops.ts";
import { logEvent } from "./event-log.ts";

let itemCounter = 0;

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

  for (const clueChange of delta.knownClueChanges ?? []) {
    const entity = world.entities.get(clueChange.playerId);
    if (entity?.type !== "player") {
      logWrite(
        "srv",
        "warn",
        `[applyDelta] ignored clue change, unknown player: ${clueChange.playerId}`,
      );
      continue;
    }
    const player = entity as PlayerEntity;
    if (!player.knownClues.some((c) => c.clueId === clueChange.clueId)) {
      player.knownClues.push({
        clueId: clueChange.clueId,
        sourceNpcId: clueChange.sourceNpcId,
        learnedAt: world.tick,
      });
    }
  }

  for (const discChange of delta.discoverableChanges ?? []) {
    const entity = world.entities.get(discChange.playerId);
    if (entity?.type !== "player") {
      logWrite(
        "srv",
        "warn",
        `[applyDelta] ignored discoverable change, unknown player: ${discChange.playerId}`,
      );
      continue;
    }
    const player = entity as PlayerEntity;
    if (!world.entities.has(discChange.entityId)) {
      logWrite(
        "srv",
        "warn",
        `[applyDelta] ignored discoverable change, unknown entity: ${discChange.entityId}`,
      );
      continue;
    }
    if (!player.discoveredEntities.includes(discChange.entityId)) {
      player.discoveredEntities.push(discChange.entityId);
    }
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
