import { describe, expect, it } from "vitest";
import type { InventoryItem } from "../shared/protocol.ts";

interface GroupedItem {
  name: string;
  count: number;
  items: InventoryItem[];
}

function groupInventory(items: InventoryItem[]): GroupedItem[] {
  const map = new Map<string, InventoryItem[]>();
  for (const item of items) {
    const key = (item.properties.templateId as string) ?? item.name;
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

function makeItem(id: string, name: string, templateId?: string): InventoryItem {
  return {
    id,
    name,
    type: "item",
    description: `desc-${name}`,
    templateId: templateId ?? "test_item",
    properties: templateId ? { templateId } : {},
  };
}

describe("groupInventory", () => {
  it("returns empty array for empty input", () => {
    expect(groupInventory([])).toEqual([]);
  });

  it("passes through single unique items unchanged", () => {
    const items = [makeItem("1", "草药"), makeItem("2", "铜钱"), makeItem("3", "火把")];
    const result = groupInventory(items);
    expect(result).toEqual([
      { name: "草药", count: 1, items: [items[0]] },
      { name: "铜钱", count: 1, items: [items[1]] },
      { name: "火把", count: 1, items: [items[2]] },
    ]);
  });

  it("groups items with the same name", () => {
    const items = [
      makeItem("1", "铜钱"),
      makeItem("2", "铜钱"),
      makeItem("3", "铜钱"),
      makeItem("4", "草药"),
    ];
    const result = groupInventory(items);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      name: "铜钱",
      count: 3,
      items: [items[0], items[1], items[2]],
    });
    expect(result[1]).toEqual({
      name: "草药",
      count: 1,
      items: [items[3]],
    });
  });

  it("groups by templateId when present", () => {
    const items = [
      makeItem("1", "旧铜钱", "copper_coin"),
      makeItem("2", "新铜钱", "copper_coin"),
      makeItem("3", "铜钱"),
    ];
    const result = groupInventory(items);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      name: "旧铜钱",
      count: 2,
      items: [items[0], items[1]],
    });
    expect(result[1]).toEqual({
      name: "铜钱",
      count: 1,
      items: [items[2]],
    });
  });

  it("groups correctly with all duplicates", () => {
    const items = [makeItem("1", "铜钱"), makeItem("2", "铜钱"), makeItem("3", "铜钱")];
    const result = groupInventory(items);
    expect(result).toHaveLength(1);
    expect(result[0].count).toBe(3);
  });

  it("preserves original item references", () => {
    const item1 = makeItem("1", "铜钱");
    const item2 = makeItem("2", "铜钱");
    const result = groupInventory([item1, item2]);
    expect(result[0].items[0]).toBe(item1);
    expect(result[0].items[1]).toBe(item2);
  });

  it("uses name as key when templateId is missing", () => {
    const items = [makeItem("1", "铜钱"), makeItem("2", "铜钱")];
    const result = groupInventory(items);
    expect(result[0].count).toBe(2);
  });

  it("handles mixed templateId and name-only grouping", () => {
    const items = [
      makeItem("1", "草药", "herb"),
      makeItem("2", "草药", "herb"),
      makeItem("3", "草药"),
      makeItem("4", "铜钱", "copper"),
      makeItem("5", "铜钱", "copper"),
    ];
    const result = groupInventory(items);
    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ name: "草药", count: 2, items: [items[0], items[1]] });
    expect(result[1]).toEqual({ name: "草药", count: 1, items: [items[2]] });
    expect(result[2]).toEqual({ name: "铜钱", count: 2, items: [items[3], items[4]] });
  });
});
