import { describe, expect, it } from "vitest";
import {
  addEntity,
  addRegion,
  addRoom,
  createNPC,
  createPlayer,
  createRoom,
  createWorld,
} from "../core/world.ts";
import { deriveCapabilities, getRoomEntitiesInfo } from "../engine/capability-provider.ts";
import { checkFeasibility, executeCommand } from "../engine/command-executor.ts";

function setupWorld() {
  const world = createWorld();
  addRegion(world, {
    id: "test",
    name: "test",
    dominantCulture: "test",
    prosperity: 50,
    threatLevel: 10,
  });
  const market = createRoom("market", "集市", "test", "热闹的市场");
  const tavern = createRoom("tavern", "酒馆", "test", "昏暗的酒馆");
  market.exits.set("north", {
    to: "tavern",
    direction: "north",
    distance: 1,
    hidden: false,
    bidirectional: true,
  });
  tavern.exits.set("south", {
    to: "market",
    direction: "south",
    distance: 1,
    hidden: false,
    bidirectional: true,
  });
  addRoom(world, market);
  addRoom(world, tavern);
  const player = createPlayer("p1", "赵行舟", "market", world.contentPool);
  addEntity(world, player);
  return world;
}

describe("command-executor", () => {
  it("should execute look command", () => {
    const world = setupWorld();
    const result = executeCommand(world, "p1", "look", { target: "房间" });
    expect(result.events[0].type).toBe("look");
    expect(result.events[0].description).toContain("集市");
    expect(result.ended).toBe(false);
  });

  it("should execute move command", () => {
    const world = setupWorld();
    const result = executeCommand(world, "p1", "move", { direction: "north" });
    expect(result.events[0].type).toBe("move");
    expect(result.events[0].description).toContain("酒馆");
  });

  it("should fail move with invalid direction", () => {
    const world = setupWorld();
    const result = executeCommand(world, "p1", "move", { direction: "east" });
    expect(result.events[0].type).toBe("error");
  });

  it("should execute status command", () => {
    const world = setupWorld();
    const result = executeCommand(world, "p1", "status", {});
    expect(result.events[0].type).toBe("status");
  });

  it("should return needsDialogueOptions for talk", () => {
    const world = setupWorld();
    const result = executeCommand(world, "p1", "talk", { npcId: "nonexistent" });
    expect(result.events[0].type).toBe("error");
  });

  it("should handle unknown action", () => {
    const world = setupWorld();
    const result = executeCommand(world, "p1", "fly", {});
    expect(result.events[0].type).toBe("error");
    expect(result.events[0].description).toContain("未知操作");
  });

  it("should calculate rest cost from terrain and distance", () => {
    const world = createWorld();
    addRegion(world, {
      id: "test",
      name: "test",
      dominantCulture: "test",
      prosperity: 50,
      threatLevel: 10,
    });
    const base = createRoom("base", "营地", "test", "山脚营地", "plain");
    const peak = createRoom("peak", "山顶", "test", "险峻的山顶", "mountain");
    base.exits.set("北", {
      to: "peak",
      direction: "北",
      distance: 3,
      terrain: "mountain",
      hidden: false,
      bidirectional: true,
    });
    peak.exits.set("南", {
      to: "base",
      direction: "南",
      distance: 3,
      terrain: "mountain",
      hidden: false,
      bidirectional: true,
    });
    addRoom(world, base);
    addRoom(world, peak);
    // 添加地形配置
    world.contentPool.terrainConfig = [
      {
        terrain: "mountain",
        label: "山路",
        baseCost: 5,
        speedMod: 0.5,
        danger: 4,
        requires: ["climbing"],
      },
      { terrain: "plain", label: "平原", baseCost: 2, speedMod: 1.2, danger: 1, requires: [] },
    ];
    const player = createPlayer("p1", "登山者", "base", world.contentPool);
    addEntity(world, player);

    const result = executeCommand(world, "p1", "move", { direction: "北" });
    // mountain baseCost=5, distance=3 → restCost = -15
    expect(result.delta.needChanges).toBeDefined();
    const restChange = result.delta.needChanges?.find((c) => c.needType === "rest");
    expect(restChange).toBeDefined();
    expect(restChange?.delta).toBe(-15);
  });

  it("should use exit description as narrative when present", () => {
    const world = createWorld();
    addRegion(world, {
      id: "test",
      name: "test",
      dominantCulture: "test",
      prosperity: 50,
      threatLevel: 10,
    });
    const room1 = createRoom("room1", "入口", "test", "洞穴入口");
    const room2 = createRoom("room2", "深处", "test", "洞穴深处");
    room1.exits.set("下", {
      to: "room2",
      direction: "下",
      distance: 2,
      terrain: "cave",
      hidden: false,
      bidirectional: true,
      description: "你沿着潮湿的石阶走入黑暗深处",
    });
    room2.exits.set("上", {
      to: "room1",
      direction: "上",
      distance: 2,
      terrain: "cave",
      hidden: false,
      bidirectional: true,
    });
    addRoom(world, room1);
    addRoom(world, room2);
    world.contentPool.terrainConfig = [
      { terrain: "cave", label: "洞穴", baseCost: 3, speedMod: 0.8, danger: 3, requires: [] },
    ];
    const player = createPlayer("p1", "探索者", "room1", world.contentPool);
    addEntity(world, player);

    const result = executeCommand(world, "p1", "move", { direction: "下" });
    expect(result.events[0].description).toBe("你沿着潮湿的石阶走入黑暗深处");
  });

  it("should fail move to hidden exit", () => {
    const world = createWorld();
    addRegion(world, {
      id: "test",
      name: "test",
      dominantCulture: "test",
      prosperity: 50,
      threatLevel: 10,
    });
    const room1 = createRoom("room1", "大厅", "test", "空旷的大厅");
    const room2 = createRoom("room2", "暗室", "test", "隐藏的暗室");
    room1.exits.set("东", {
      to: "room2",
      direction: "东",
      distance: 1,
      hidden: true,
      bidirectional: false,
    });
    addRoom(world, room1);
    addRoom(world, room2);
    const player = createPlayer("p1", "旅人", "room1", world.contentPool);
    addEntity(world, player);

    const result = executeCommand(world, "p1", "move", { direction: "东" });
    expect(result.events[0].type).toBe("error");
  });

  it("should fail take when item not in room", () => {
    const world = setupWorld();
    const result = executeCommand(world, "p1", "take", { itemId: "nonexistent" });
    expect(result.events[0].type).toBe("error");
  });

  it("should fail take when itemId is missing", () => {
    const world = setupWorld();
    const result = executeCommand(world, "p1", "take", {});
    expect(result.events[0].type).toBe("error");
  });

  it("should fail take when item not in room entities", () => {
    const world = setupWorld();
    const herb = {
      type: "item" as const,
      id: "herb_01",
      name: "草药",
      roomId: "market",
      description: "草药",
      ownerId: null,
      containerId: null,
      properties: { templateId: "herb_01" },
    };
    world.entities.set("herb_01", herb as any);

    const result = executeCommand(world, "p1", "take", { itemId: "herb_01" });
    expect(result.events[0].type).toBe("error");
    expect(result.events[0].description).toContain("不在这");
  });

  it("take 物品 → delta 含 itemChanges (add 操作)", () => {
    const world = setupWorld();
    const room = world.rooms.get("market")!;
    const herb = {
      type: "item" as const,
      id: "herb_01",
      name: "草药",
      roomId: "market",
      description: "草药",
      ownerId: null,
      containerId: null,
      properties: { templateId: "herb_01" },
    };
    world.entities.set("herb_01", herb as any);
    room.entities.add("herb_01");

    const result = executeCommand(world, "p1", "take", { itemId: "herb_01" });

    expect(result.events[0].type).toBe("take");
    expect(result.delta.itemChanges).toBeDefined();
    expect(result.delta.itemChanges).toHaveLength(1);
    const change = result.delta.itemChanges![0];
    expect(change.operation).toBe("add");
    expect(change.targetId).toBe("p1");
    expect(change.itemId).toBe("herb_01");
    expect(change.qty).toBe(1);
  });

  it("take 物品 → 物品从 room.entities 移除", () => {
    const world = setupWorld();
    const room = world.rooms.get("market")!;
    const herb = {
      type: "item" as const,
      id: "herb_02",
      name: "草药",
      roomId: "market",
      description: "草药",
      ownerId: null,
      containerId: null,
      properties: { templateId: "herb_02" },
    };
    world.entities.set("herb_02", herb as any);
    room.entities.add("herb_02");

    executeCommand(world, "p1", "take", { itemId: "herb_02" });

    expect(room.entities.has("herb_02")).toBe(false);
  });

  it("drop 物品 → delta 含 itemChanges (remove 操作)", () => {
    const world = setupWorld();
    const player = world.entities.get("p1") as any;
    const herb = {
      type: "item" as const,
      id: "herb_03",
      name: "草药",
      roomId: null,
      description: "草药",
      ownerId: "p1",
      containerId: null,
      properties: { templateId: "herb_03" },
    };
    player.inventory.push(herb);
    world.entities.set("herb_03", herb as any);

    const result = executeCommand(world, "p1", "drop", { itemId: "herb_03" });

    expect(result.events[0].type).toBe("drop");
    expect(result.delta.itemChanges).toBeDefined();
    expect(result.delta.itemChanges).toHaveLength(1);
    const change = result.delta.itemChanges![0];
    expect(change.operation).toBe("remove");
    expect(change.targetId).toBe("p1");
    expect(change.itemId).toBe("herb_03");
    expect(change.qty).toBe(1);
  });

  it("drop 物品 → 物品加入 room.entities", () => {
    const world = setupWorld();
    const room = world.rooms.get("market")!;
    const player = world.entities.get("p1") as any;
    const herb = {
      type: "item" as const,
      id: "herb_04",
      name: "草药",
      roomId: null,
      description: "草药",
      ownerId: "p1",
      containerId: null,
      properties: { templateId: "herb_04" },
    };
    player.inventory.push(herb);
    world.entities.set("herb_04", herb as any);

    executeCommand(world, "p1", "drop", { itemId: "herb_04" });

    expect(room.entities.has("herb_04")).toBe(true);
  });

  it("should fail drop when item not in inventory", () => {
    const world = setupWorld();
    const result = executeCommand(world, "p1", "drop", { itemId: "nonexistent" });
    expect(result.events[0].type).toBe("error");
  });
});

describe("checkFeasibility", () => {
  it("should block movement when rest is insufficient", () => {
    const world = setupWorld();
    // 设置高消耗地形
    world.contentPool.terrainConfig = [
      { terrain: "plain", label: "平原", baseCost: 50, speedMod: 1, danger: 0, requires: [] },
    ];
    // 将精力降到很低
    const player = world.entities.get("p1");
    if (!player || !("needs" in player)) throw new Error("player not found");
    const restNeed = player.needs.find((n) => n.type === "rest");
    if (!restNeed) throw new Error("rest need not found");
    restNeed.value = 10; // 低于消耗

    const result = checkFeasibility(world, "p1", "move", { direction: "north" });
    expect(result.feasible).toBe(false);
    expect(result.blockers).toHaveLength(1);
    expect(result.blockers[0].type).toBe("rest");
    expect(result.blockers[0].reason).toContain("精力不足");
  });

  it("should allow movement when rest is sufficient", () => {
    const world = setupWorld();
    const result = checkFeasibility(world, "p1", "move", { direction: "north" });
    expect(result.feasible).toBe(true);
    expect(result.blockers).toHaveLength(0);
  });

  it("should allow end_day regardless of rest", () => {
    const world = setupWorld();
    const player = world.entities.get("p1");
    if (!player || !("needs" in player)) throw new Error("player not found");
    const restNeed = player.needs.find((n) => n.type === "rest");
    if (!restNeed) throw new Error("rest need not found");
    restNeed.value = 0;

    const result = checkFeasibility(world, "p1", "end_day", {});
    expect(result.feasible).toBe(true);
  });

  it("should allow status regardless of rest", () => {
    const world = setupWorld();
    const player = world.entities.get("p1");
    if (!player || !("needs" in player)) throw new Error("player not found");
    const restNeed = player.needs.find((n) => n.type === "rest");
    if (!restNeed) throw new Error("rest need not found");
    restNeed.value = 0;

    const result = checkFeasibility(world, "p1", "status", {});
    expect(result.feasible).toBe(true);
  });

  it("should allow inventory regardless of rest", () => {
    const world = setupWorld();
    const player = world.entities.get("p1");
    if (!player || !("needs" in player)) throw new Error("player not found");
    const restNeed = player.needs.find((n) => n.type === "rest");
    if (!restNeed) throw new Error("rest need not found");
    restNeed.value = 0;

    const result = checkFeasibility(world, "p1", "inventory", {});
    expect(result.feasible).toBe(true);
  });

  it("should allow rest action even at 0 rest", () => {
    const world = setupWorld();
    const player = world.entities.get("p1");
    if (!player || !("needs" in player)) throw new Error("player not found");
    const restNeed = player.needs.find((n) => n.type === "rest");
    if (!restNeed) throw new Error("rest need not found");
    restNeed.value = 0;

    const result = checkFeasibility(world, "p1", "rest", {});
    expect(result.feasible).toBe(true);
  });

  it("should block talk when rest is insufficient", () => {
    const world = setupWorld();
    const player = world.entities.get("p1");
    if (!player || !("needs" in player)) throw new Error("player not found");
    const restNeed = player.needs.find((n) => n.type === "rest");
    if (!restNeed) throw new Error("rest need not found");
    restNeed.value = 1; // talk 消耗 rest=-2, 1+(-2)=-1 < 0

    const result = checkFeasibility(world, "p1", "talk", { npcId: "nonexistent" });
    expect(result.feasible).toBe(false);
    expect(result.blockers[0].type).toBe("rest");
  });

  it("should return feasible for entity without rest need", () => {
    const world = setupWorld();
    // ItemEntity 没有 needs — checkFeasibility 应返回 feasible
    const result = checkFeasibility(world, "nonexistent_entity", "move", { direction: "north" });
    // entity 不存在时返回 not feasible
    expect(result.feasible).toBe(false);
    expect(result.blockers[0].type).toBe("entity");
  });

  it("should block attack when rest < restCostPerAttack", () => {
    const world = setupWorld();
    const player = world.entities.get("p1");
    if (!player || !("needs" in player)) throw new Error("player not found");
    const restNeed = player.needs.find((n) => n.type === "rest");
    if (!restNeed) throw new Error("rest need not found");
    restNeed.value = 0;

    const result = checkFeasibility(world, "p1", "attack", { targetId: "npc_01" });
    expect(result.feasible).toBe(false);
    expect(result.blockers[0].type).toBe("rest");
    expect(result.blockers[0].reason).toContain("精力不足");
  });

  it("should block flee when rest < restCostPerAttack", () => {
    const world = setupWorld();
    const player = world.entities.get("p1");
    if (!player || !("needs" in player)) throw new Error("player not found");
    const restNeed = player.needs.find((n) => n.type === "rest");
    if (!restNeed) throw new Error("rest need not found");
    restNeed.value = 0;

    const result = checkFeasibility(world, "p1", "flee", {});
    expect(result.feasible).toBe(false);
    expect(result.blockers[0].type).toBe("rest");
  });

  it("should block defend when rest < restCostPerAttack", () => {
    const world = setupWorld();
    const player = world.entities.get("p1");
    if (!player || !("needs" in player)) throw new Error("player not found");
    const restNeed = player.needs.find((n) => n.type === "rest");
    if (!restNeed) throw new Error("rest need not found");
    restNeed.value = 0;

    const result = checkFeasibility(world, "p1", "defend", {});
    expect(result.feasible).toBe(false);
    expect(result.blockers[0].type).toBe("rest");
  });

  it("should allow attack when rest >= restCostPerAttack", () => {
    const world = setupWorld();
    const player = world.entities.get("p1");
    if (!player || !("needs" in player)) throw new Error("player not found");
    const restNeed = player.needs.find((n) => n.type === "rest");
    if (!restNeed) throw new Error("rest need not found");
    restNeed.value = 1;

    const result = checkFeasibility(world, "p1", "attack", { targetId: "npc_01" });
    expect(result.feasible).toBe(true);
  });

  it("should allow flee when rest >= restCostPerAttack", () => {
    const world = setupWorld();
    const player = world.entities.get("p1");
    if (!player || !("needs" in player)) throw new Error("player not found");
    const restNeed = player.needs.find((n) => n.type === "rest");
    if (!restNeed) throw new Error("rest need not found");
    restNeed.value = 1;

    const result = checkFeasibility(world, "p1", "flee", {});
    expect(result.feasible).toBe(true);
  });

  it("should allow defend when rest >= restCostPerAttack", () => {
    const world = setupWorld();
    const player = world.entities.get("p1");
    if (!player || !("needs" in player)) throw new Error("player not found");
    const restNeed = player.needs.find((n) => n.type === "rest");
    if (!restNeed) throw new Error("rest need not found");
    restNeed.value = 1;

    const result = checkFeasibility(world, "p1", "defend", {});
    expect(result.feasible).toBe(true);
  });
});

describe("capability-provider", () => {
  it("should derive capabilities for player", () => {
    const world = setupWorld();
    const caps = deriveCapabilities(world, "p1");
    expect(caps.length).toBeGreaterThan(0);
    expect(caps.some((c) => c.action === "move")).toBe(true);
    expect(caps.some((c) => c.action === "look")).toBe(true);
    expect(caps.some((c) => c.action === "status")).toBe(true);
    expect(caps.some((c) => c.action === "end_day")).toBe(true);
  });

  it("should include all directions in move params", () => {
    const world = setupWorld();
    const caps = deriveCapabilities(world, "p1");
    const moveCap = caps.find((c) => c.action === "move");
    expect(moveCap).toBeDefined();
    expect(moveCap?.params).toBeDefined();
    expect(moveCap?.params?.values).toContain("north");
  });

  it("should return room entities info", () => {
    const world = setupWorld();
    const entities = getRoomEntitiesInfo(world, "market");
    expect(entities.length).toBe(1);
    expect(entities[0].name).toBe("赵行舟");
  });

  it("room NPC info includes personality as dialogue description", () => {
    const world = setupWorld();
    const npc = createNPC("npc1", {
      name: "法显",
      roomId: "market",
      personality: "汉地来的中年僧人，在莫高窟修行抄经。",
    });
    addEntity(world, npc);

    const entities = getRoomEntitiesInfo(world, "market");

    expect(entities.find((e) => e.id === "npc1")?.description).toBe(
      "汉地来的中年僧人，在莫高窟修行抄经。",
    );
  });

  it("should filter hidden exits from move capability", () => {
    const world = createWorld();
    addRegion(world, {
      id: "test",
      name: "test",
      dominantCulture: "test",
      prosperity: 50,
      threatLevel: 10,
    });
    const room1 = createRoom("room1", "大厅", "test", "空旷的大厅");
    const room2 = createRoom("room2", "暗室", "test", "隐藏的暗室");
    const room3 = createRoom("room3", "花园", "test", "美丽的花园");
    room1.exits.set("东", {
      to: "room2",
      direction: "东",
      distance: 1,
      hidden: true,
      bidirectional: false,
    });
    room1.exits.set("南", {
      to: "room3",
      direction: "南",
      distance: 1,
      hidden: false,
      bidirectional: true,
    });
    addRoom(world, room1);
    addRoom(world, room2);
    addRoom(world, room3);
    const player = createPlayer("p1", "旅人", "room1", world.contentPool);
    addEntity(world, player);

    const caps = deriveCapabilities(world, "p1");
    const moveCap = caps.find((c) => c.action === "move");
    expect(moveCap).toBeDefined();
    expect(moveCap?.params?.values).toContain("南");
    expect(moveCap?.params?.values).not.toContain("东");
  });

  it("should show all non-hidden exits including those with conditions", () => {
    const world = createWorld();
    addRegion(world, {
      id: "test",
      name: "test",
      dominantCulture: "test",
      prosperity: 50,
      threatLevel: 10,
    });
    const room1 = createRoom("room1", "入口", "test", "");
    const room2 = createRoom("room2", "密室", "test", "");
    room1.exits.set("北", {
      to: "room2",
      direction: "北",
      distance: 1,
      hidden: false,
      bidirectional: true,
      conditions: [{ type: "item", value: "钥匙" }],
    });
    addRoom(world, room1);
    addRoom(world, room2);
    const player = createPlayer("p1", "旅人", "room1", world.contentPool);
    addEntity(world, player);

    const caps = deriveCapabilities(world, "p1");
    const moveCap = caps.find((c) => c.action === "move");
    expect(moveCap?.params?.values).toContain("北");
  });
});
