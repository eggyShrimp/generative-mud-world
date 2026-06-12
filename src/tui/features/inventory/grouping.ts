import type { InventoryItem } from "../../../shared/protocol.ts";

// ── Types ──
// GroupedItem: 将相同 templateId 或 name 的物品堆叠为一组。
// 例如 3 个"铁剑" → { name: "铁剑", count: 3, items: [item1, item2, item3] }

export interface GroupedItem {
  name: string;
  count: number;
  items: InventoryItem[];
}

// ── Functions ──

export function groupInventory(items: InventoryItem[]): GroupedItem[] {
  const map = new Map<string, InventoryItem[]>();
  for (const item of items) {
    const key = item.templateId ?? item.name;
    const group = map.get(key);
    if (group) {
      group.push(item);
    } else {
      map.set(key, [item]);
    }
  }
  return Array.from(map.values()).map((group) => ({
    name: group[0].name,
    count: group.length,
    items: group,
  }));
}

export function formatGroupedItemName(group: GroupedItem): string {
  return group.count > 1 ? `${group.name} x ${group.count}` : group.name;
}

export function findGroupForItem(itemId: string, groups: GroupedItem[]): GroupedItem | null {
  return groups.find((g) => g.items.some((i) => i.id === itemId)) ?? null;
}
