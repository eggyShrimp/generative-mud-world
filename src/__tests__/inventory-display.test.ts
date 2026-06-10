import { describe, expect, it } from "vitest";
import type { GroupedItem } from "../client-tui/key-layer.ts";
import { findGroupForItem, formatGroupedItemName } from "../client-tui/key-layer.ts";
import type { InventoryItem } from "../shared/protocol.ts";

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

function makeGroup(name: string, count: number, startId = 1): GroupedItem {
  const items = Array.from({ length: count }, (_, i) => makeItem(`${startId + i}`, name));
  return { name, count, items };
}

describe("formatGroupedItemName", () => {
  it("单个物品不显示数量", () => {
    expect(formatGroupedItemName({ name: "草药", count: 1, items: [makeItem("1", "草药")] })).toBe(
      "草药",
    );
  });

  it("2 个堆叠显示 x 2", () => {
    const group = { name: "铜币", count: 2, items: [makeItem("1", "铜币"), makeItem("2", "铜币")] };
    expect(formatGroupedItemName(group)).toBe("铜币 x 2");
  });

  it("5 个堆叠显示 x 5", () => {
    const items = Array.from({ length: 5 }, (_, i) => makeItem(`${i + 1}`, "铜币"));
    expect(formatGroupedItemName({ name: "铜币", count: 5, items })).toBe("铜币 x 5");
  });

  it("大量堆叠显示 x 99", () => {
    const items = Array.from({ length: 99 }, (_, i) => makeItem(`${i + 1}`, "铁矿"));
    expect(formatGroupedItemName({ name: "铁矿", count: 99, items })).toBe("铁矿 x 99");
  });
});

describe("findGroupForItem", () => {
  it("物品在第一个组中", () => {
    const groups = [makeGroup("铜币", 5, 1), makeGroup("草药", 2, 6)];
    const result = findGroupForItem("3", groups);
    expect(result).toBe(groups[0]);
  });

  it("物品在中间组中", () => {
    const groups = [makeGroup("铜币", 2, 1), makeGroup("草药", 3, 3), makeGroup("铁矿", 1, 6)];
    const result = findGroupForItem("4", groups);
    expect(result).toBe(groups[1]);
  });

  it("物品不在任何组中", () => {
    const groups = [makeGroup("铜币", 2, 1), makeGroup("草药", 1, 3)];
    expect(findGroupForItem("unknown", groups)).toBeNull();
  });

  it("空组列表返回 null", () => {
    expect(findGroupForItem("1", [])).toBeNull();
  });

  it("多个物品在同组中找到正确组", () => {
    const groups = [makeGroup("铜币", 5, 1), makeGroup("草药", 1, 6)];
    const result = findGroupForItem("5", groups);
    expect(result).toBe(groups[0]);
    expect(result?.name).toBe("铜币");
  });
});
