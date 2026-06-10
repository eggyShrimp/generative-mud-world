import { describe, expect, it } from "vitest";
import type { ItemEntity } from "../core/types.ts";
import {
  addEntity,
  addRegion,
  addRoom,
  applyDelta,
  createItem,
  createPlayer,
  createRoom,
  createWorld,
} from "../core/world.ts";
import { executeCommand } from "../engine/command-executor.ts";

function setupWorld(opts?: { itemTags?: string[] }) {
  const world = createWorld();
  addRegion(world, {
    id: "test",
    name: "test",
    dominantCulture: "test",
    prosperity: 50,
    threatLevel: 10,
  });
  const room = createRoom("smithy", "铁匠铺", "test", "火热的铁匠铺", undefined, ["smithy"]);
  addRoom(world, room);
  const player = createPlayer("p1", "赵行舟", "smithy", world.contentPool);
  addEntity(world, player);

  // Set up entityActionsByTag
  world.contentPool.entityActionsByTag.forge = ["smelt_ore", "craft_weapon"];
  world.contentPool.entityActionsByTag.cooking_tool = ["cook_meal"];
  world.contentPool.entityActionLabels.smelt_ore = "熔炼矿石";
  world.contentPool.entityActionLabels.craft_weapon = "打造武器";
  world.contentPool.entityActionLabels.cook_meal = "做一道菜";
  world.contentPool.entityTagLabels.forge = "锻炉";
  world.contentPool.entityTagLabels.cooking_tool = "厨具";

  // Add action effects
  world.contentPool.actionEffects = [
    {
      action: "smelt_ore",
      needDeltas: { rest: -10 },
      itemCosts: { iron_ore: 3 },
      itemDeltas: { iron_ingot: 1 },
    },
    { action: "cook_meal", needDeltas: {}, itemDeltas: { cooked_meal: 1 } },
  ];

  // Add a forge item to player inventory
  const forge = createItem("forge1", "锻炉", "test_item", {}, "p1", opts?.itemTags);
  (forge as ItemEntity).ownerId = "p1";
  player.inventory.push(forge);
  addEntity(world, forge);

  // Add a regular item (no tags)
  const bread = createItem("bread1", "面包", "test_item", { edible: true }, "p1");
  (bread as ItemEntity).ownerId = "p1";
  player.inventory.push(bread);
  addEntity(world, bread);

  return world;
}

function addIronOre(world: ReturnType<typeof setupWorld>, qty: number) {
  const player = world.entities.get("p1");
  if (player?.type !== "player") throw new Error("missing test player");
  for (let i = 1; i <= qty; i++) {
    const ore = createItem(`iron_ore_${i}`, "铁矿石", "iron_ore", { templateId: "iron_ore" }, "p1");
    ore.ownerId = "p1";
    player.inventory.push(ore);
    addEntity(world, ore);
  }
}

function countInventoryTemplate(world: ReturnType<typeof setupWorld>, templateId: string): number {
  const player = world.entities.get("p1");
  if (player?.type !== "player") throw new Error("missing test player");
  return player.inventory.filter((item) => item.templateId === templateId).length;
}

describe("executeOperate — 基础功能", () => {
  it("无 itemId → 返回错误", () => {
    const world = setupWorld({ itemTags: ["forge"] });
    const result = executeCommand(world, "p1", "operate", {});
    expect(result.events[0].description).toContain("请指定要操作的物品");
  });

  it("物品不存在 → 返回错误", () => {
    const world = setupWorld({ itemTags: ["forge"] });
    const result = executeCommand(world, "p1", "operate", { itemId: "nonexistent" });
    expect(result.events[0].description).toContain("找不到该物品");
  });

  it("物品无 tags → 返回不可操作", () => {
    const world = setupWorld();
    const result = executeCommand(world, "p1", "operate", { itemId: "bread1" });
    expect(result.events[0].description).toContain("此物品不可操作");
  });

  it("物品有 tags 但无 actionId → 返回可用操作列表", () => {
    const world = setupWorld({ itemTags: ["forge"] });
    const result = executeCommand(world, "p1", "operate", { itemId: "forge1" });
    expect(result.operateOptions).toBeDefined();
    expect(result.operateOptions).toHaveLength(2);
    expect(result.operateOptions![0].actionId).toBe("smelt_ore");
    expect(result.operateOptions![0].label).toBe("熔炼矿石");
    expect(result.operateOptions![1].actionId).toBe("craft_weapon");
  });

  it("物品有 tags + 有效 actionId → 执行操作", () => {
    const world = setupWorld({ itemTags: ["forge"] });
    // Add iron_ore to player inventory for the cost
    addIronOre(world, 3);

    const result = executeCommand(world, "p1", "operate", {
      itemId: "forge1",
      actionId: "smelt_ore",
    });
    expect(result.events[0].type).toBe("operate");
    expect(result.events[0].description).toContain("熔炼矿石");
    expect(result.delta.needChanges).toBeDefined();
    expect(result.delta.itemChanges).toBeDefined();
  });

  it("带 itemCosts 的操作只通过 delta 扣一次材料", () => {
    const world = setupWorld({ itemTags: ["forge"] });
    addIronOre(world, 9);

    const result = executeCommand(world, "p1", "operate", {
      itemId: "forge1",
      actionId: "smelt_ore",
    });
    applyDelta(world, result.delta);

    expect(countInventoryTemplate(world, "iron_ore")).toBe(6);
    expect(countInventoryTemplate(world, "iron_ingot")).toBe(1);
  });

  it("actionId 不在物品允许的操作中 → 返回错误", () => {
    const world = setupWorld({ itemTags: ["forge"] });
    const result = executeCommand(world, "p1", "operate", {
      itemId: "forge1",
      actionId: "cook_meal",
    });
    expect(result.events[0].description).toContain("此物品不支持该操作");
  });

  it("itemCosts 不足 → 返回错误", () => {
    const world = setupWorld({ itemTags: ["forge"] });
    // No iron_ore in inventory
    const result = executeCommand(world, "p1", "operate", {
      itemId: "forge1",
      actionId: "smelt_ore",
    });
    expect(result.events[0].type).toBe("error");
  });

  it("无 itemCosts 的操作 → 直接执行", () => {
    const world = setupWorld({ itemTags: ["cooking_tool"] });
    const result = executeCommand(world, "p1", "operate", {
      itemId: "forge1",
      actionId: "cook_meal",
    });
    expect(result.events[0].type).toBe("operate");
    expect(result.delta.itemChanges).toBeDefined();
  });
});

describe("executeOperate — 多 tag 合并", () => {
  it("物品有多个 tags → 合并去重", () => {
    const world = setupWorld({ itemTags: ["forge", "cooking_tool"] });
    const result = executeCommand(world, "p1", "operate", { itemId: "forge1" });
    expect(result.operateOptions).toHaveLength(3); // smelt_ore, craft_weapon, cook_meal
  });
});

describe("executeOperate — room 内物品", () => {
  it("room 内的物品也可以操作", () => {
    const world = setupWorld();
    // Add a forge to the room (not in inventory)
    const roomForge = createItem("room_forge", "大锻炉", "test_item", {}, "smithy", ["forge"]);
    addEntity(world, roomForge);
    world.rooms.get("smithy")!.entities.add("room_forge");

    const result = executeCommand(world, "p1", "operate", { itemId: "room_forge" });
    expect(result.operateOptions).toBeDefined();
    expect(result.operateOptions!.length).toBeGreaterThan(0);
  });
});
