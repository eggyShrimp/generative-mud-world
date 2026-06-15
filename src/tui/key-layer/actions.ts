import type { Capability, RoomEntity } from "../../shared/protocol.ts";
import type { GameClient } from "../client/types.ts";
import {
  findGroupForItem,
  formatGroupedItemName,
  type GroupedItem,
  groupInventory,
} from "../features/inventory/grouping.ts";
import { getEventStyle } from "../theme/event-style.ts";
import type { KeyBinding } from "./types.ts";

export { findGroupForItem, formatGroupedItemName, type GroupedItem, groupInventory };

export function capabilityTargets(capabilities: Capability[], action: string): string[] {
  return capabilities.find((c) => c.action === action)?.params?.values ?? [];
}

export function actionColor(action: string): string {
  return getEventStyle(action).color;
}

export function capabilityLabel(
  capabilities: Capability[],
  action: string,
  fallback: string,
): string {
  return capabilities.find((c) => c.action === action)?.label ?? fallback;
}

export function bindingLabel(client: GameClient, binding: KeyBinding): string {
  const action = binding.labelAction ?? binding.action;
  return action ? capabilityLabel(client.capabilities(), action, binding.label) : binding.label;
}

// ── Action Builders ──
// 为实体和库存物品构建可用动作列表。
// 返回的 run 函数直接调用 client.execute 或其他 client 方法。

export function getEntityActions(
  entity: RoomEntity,
  capabilities: Capability[] = [],
): Array<{
  label: string;
  color?: string;
  run: (client: GameClient, entity: RoomEntity) => void;
}> {
  const entityActions: Array<{
    label: string;
    color?: string;
    run: (client: GameClient, entity: RoomEntity) => void;
  }> = [];

  if (capabilityTargets(capabilities, "take").includes(entity.id)) {
    entityActions.push({
      label: capabilityLabel(capabilities, "take", "拾取"),
      color: actionColor("take"),
      run: (client, target) => client.execute("take", { itemId: target.id }),
    });
  }
  if (capabilityTargets(capabilities, "read").includes(entity.id)) {
    entityActions.push({
      label: capabilityLabel(capabilities, "read", "阅读"),
      color: actionColor("read"),
      run: (client, target) => client.execute("read", { itemId: target.id }),
    });
  }
  if (capabilityTargets(capabilities, "talk").includes(entity.id)) {
    entityActions.push({
      label: capabilityLabel(capabilities, "talk", "交谈"),
      color: actionColor("dialogue"),
      run: (client, target) => client.requestDialogueOptions(target.id),
    });
  }
  entityActions.push({
    label: capabilityLabel(capabilities, "look", "观察"),
    color: actionColor("look"),
    run: (client, target) => client.execute("look", { target: target.name }),
  });
  if (capabilityTargets(capabilities, "attack").includes(entity.id)) {
    entityActions.push({
      label: capabilityLabel(capabilities, "attack", "攻击"),
      color: actionColor("attack"),
      run: (client, target) => {
        client.startCombat(target.id, target.name);
        client.execute("attack", { targetId: target.id });
      },
    });
  }
  if (capabilityTargets(capabilities, "operate").includes(entity.id)) {
    entityActions.push({
      label: capabilityLabel(capabilities, "operate", "操作"),
      color: actionColor("operate"),
      run: (client, target) => client.execute("operate", { itemId: target.id }),
    });
  }

  return entityActions;
}

export function getInventoryActions(
  group: GroupedItem,
  capabilities: Capability[] = [],
): Array<{
  label: string;
  color?: string;
  run: (client: GameClient, group: GroupedItem) => void;
}> {
  const actions: Array<{
    label: string;
    color?: string;
    run: (client: GameClient, group: GroupedItem) => void;
  }> = [
    {
      label: capabilityLabel(capabilities, "use", "使用"),
      color: actionColor("use"),
      run: (client, g) => client.execute("use", { itemId: g.items[0].id }),
    },
    {
      label: capabilityLabel(capabilities, "look", "观察"),
      color: actionColor("look"),
      run: (client, g) => client.execute("look", { target: g.items[0].name }),
    },
    {
      label: capabilityLabel(capabilities, "drop", "丢下"),
      color: actionColor("drop"),
      run: (client, g) => client.execute("drop", { itemId: g.items[0].id }),
    },
  ];
  if (capabilityTargets(capabilities, "operate").includes(group.items[0].id)) {
    actions.splice(1, 0, {
      label: capabilityLabel(capabilities, "operate", "操作"),
      color: actionColor("operate"),
      run: (client, g) => client.execute("operate", { itemId: g.items[0].id }),
    });
  }
  if (capabilityTargets(capabilities, "read").includes(group.items[0].id)) {
    actions.splice(1, 0, {
      label: capabilityLabel(capabilities, "read", "阅读"),
      color: actionColor("read"),
      run: (client, g) => client.execute("read", { itemId: g.items[0].id }),
    });
  }
  if (group.count > 1) {
    actions.push({
      label: `丢下全部 x${group.count}`,
      color: actionColor("drop"),
      run: (client, g) => {
        for (const item of g.items) {
          client.execute("drop", { itemId: item.id });
        }
      },
    });
  }
  return actions;
}
