import { describe, expect, it } from "vitest";
import type { NPCEntity, WorldState } from "../core/types.ts";
import {
  addEntity,
  addRegion,
  addRoom,
  createNPC,
  createPlayer,
  createRoom,
  createWorld,
} from "../core/world.ts";
import { executeEntityAction } from "../engine/act-loop.ts";

// ── 测试工厂 ──

function setupWorld(): WorldState {
  const world = createWorld();
  addRegion(world, {
    id: "test",
    name: "test",
    dominantCulture: "test",
    prosperity: 50,
    threatLevel: 10,
  });
  addRoom(world, createRoom("tavern", "酒馆", "test", "昏暗的酒馆"));
  return world;
}

function addNpc(world: WorldState, overrides: Partial<NPCEntity> & { id: string }): NPCEntity {
  const npc = createNPC(overrides.id, {
    name: overrides.name ?? overrides.id,
    roomId: overrides.roomId ?? "tavern",
    personality: "沉默",
    npcTier: "core",
    memories: overrides.memories ?? [],
    needs: overrides.needs ?? [],
    traits: overrides.traits ?? [],
    relations: overrides.relations ?? [],
    schedule: [],
    ...overrides,
  });
  addEntity(world, npc);
  return npc;
}

function addPlayer(world: WorldState, id: string, name: string, roomId = "tavern") {
  const p = createPlayer(id, name, roomId, world.contentPool);
  addEntity(world, p);
  return p;
}

// ============================================================
// executeEntityAction — 基本流程
// ============================================================

describe("executeEntityAction — 基本流程", () => {
  it("传入 actionDelta → 返回 merged delta 包含原始 needChanges", () => {
    const world = setupWorld();
    addPlayer(world, "p1", "赵行舟");
    const result = executeEntityAction({
      world,
      actorId: "p1",
      action: "wait",
      actionDelta: { needChanges: [{ targetId: "p1", needType: "rest", delta: 3 }] },
      actionEvents: [],
    });
    expect(result.delta.needChanges).toBeDefined();
    expect(
      result.delta.needChanges?.some(
        (c) => c.targetId === "p1" && c.needType === "rest" && c.delta === 3,
      ),
    ).toBe(true);
  });

  it("传入 actionEvents → 返回 events 包含原始事件", () => {
    const world = setupWorld();
    addPlayer(world, "p1", "赵行舟");
    const result = executeEntityAction({
      world,
      actorId: "p1",
      action: "wait",
      actionDelta: {},
      actionEvents: [{ type: "test", description: "测试事件" }],
    });
    expect(result.events.some((e) => e.description === "测试事件")).toBe(true);
  });

  it("返回 memoriesCreated > 0（有记忆创建时）", () => {
    const world = setupWorld();
    addPlayer(world, "p1", "赵行舟");
    addNpc(world, { id: "npc1", name: "老马" });
    const result = executeEntityAction({
      world,
      actorId: "p1",
      action: "say",
      actionDelta: {},
      actionEvents: [],
      options: { roomId: "tavern" },
    });
    expect(result.memoriesCreated).toBeGreaterThan(0);
  });
});

// ============================================================
// executeEntityAction — ripple
// ============================================================

describe("executeEntityAction — ripple", () => {
  it("action 有信号强度 → ripple 生效并合并结果", () => {
    const world = setupWorld();
    addPlayer(world, "p1", "赵行舟");
    // npc1 是交互目标（会被 ripple 跳过），npc2 是第三方观察者
    addNpc(world, {
      id: "npc1",
      name: "老马",
      relations: [{ targetId: "p1", level: 50, label: "朋友", lastInteractionTick: 0 }],
    });
    addNpc(world, {
      id: "npc2",
      name: "铁匠",
      relations: [{ targetId: "p1", level: 30, label: "认识", lastInteractionTick: 0 }],
    });
    const result = executeEntityAction({
      world,
      actorId: "p1",
      action: "talk",
      actionDelta: {},
      actionEvents: [],
      options: { targetId: "npc1", roomId: "tavern" },
    });
    // talk 有信号强度，npc2 作为观察者应产生 relationChanges
    expect(result.delta.relationChanges).toBeDefined();
    expect(result.delta.relationChanges?.length).toBeGreaterThan(0);
  });

  it("action 无信号强度 → 跳过 ripple", () => {
    const world = setupWorld();
    addPlayer(world, "p1", "赵行舟");
    addNpc(world, { id: "npc1", name: "老马" });
    const result = executeEntityAction({
      world,
      actorId: "p1",
      action: "unknown_action",
      actionDelta: {},
      actionEvents: [],
      options: { roomId: "tavern" },
    });
    // unknown_action 不在 signalStrength 中，无 ripple
    expect(result.delta.relationChanges).toBeUndefined();
  });
});

// ============================================================
// executeEntityAction — memory 控制
// ============================================================

describe("executeEntityAction — memory 控制", () => {
  it("createMemory = true（默认）→ 创建记忆", () => {
    const world = setupWorld();
    addPlayer(world, "p1", "赵行舟");
    const npc = addNpc(world, { id: "npc1", name: "老马" });
    executeEntityAction({
      world,
      actorId: "p1",
      action: "say",
      actionDelta: {},
      actionEvents: [],
      options: { roomId: "tavern" },
    });
    // createSayMemories 为观察者（NPC）创建记忆，不是发言者
    expect(npc.memories.length).toBeGreaterThan(0);
  });

  it("createMemory = false → 不创建记忆，memoriesCreated = 0", () => {
    const world = setupWorld();
    addPlayer(world, "p1", "赵行舟");
    const npc = addNpc(world, { id: "npc1", name: "老马" });
    const result = executeEntityAction({
      world,
      actorId: "p1",
      action: "say",
      actionDelta: {},
      actionEvents: [],
      options: { roomId: "tavern", createMemory: false },
    });
    expect(result.memoriesCreated).toBe(0);
    expect(npc.memories).toHaveLength(0);
  });
});

// ============================================================
// executeEntityAction — compose
// ============================================================

describe("executeEntityAction — compose", () => {
  it("多个 delta（action + llm）→ 正确合并 needChanges", () => {
    const world = setupWorld();
    addPlayer(world, "p1", "赵行舟");
    const result = executeEntityAction({
      world,
      actorId: "p1",
      action: "talk",
      actionDelta: { needChanges: [{ targetId: "p1", needType: "rest", delta: -2 }] },
      actionEvents: [],
      options: {
        targetId: "npc1",
        roomId: "tavern",
        llmDelta: { needChanges: [{ targetId: "p1", needType: "social", delta: 5 }] },
      },
    });
    expect(result.delta.needChanges).toBeDefined();
    expect(result.delta.needChanges?.length).toBeGreaterThanOrEqual(2);
    expect(result.delta.needChanges?.some((c) => c.needType === "rest" && c.delta === -2)).toBe(
      true,
    );
    expect(result.delta.needChanges?.some((c) => c.needType === "social" && c.delta === 5)).toBe(
      true,
    );
  });
});

// ============================================================
// executeEntityAction — combat delta pipeline
// ============================================================

describe("executeEntityAction — itemChanges in compose", () => {
  it("llmDelta 含 itemChanges → result.delta.itemChanges 保留", () => {
    const world = setupWorld();
    const player = addPlayer(world, "p1", "赵行舟");
    const npc = addNpc(world, { id: "npc1", name: "铁匠" });

    // 给 NPC 一个物品
    const herb = {
      type: "item" as const,
      id: "herb_01",
      name: "草药",
      roomId: null,
      description: "草药",
      ownerId: "npc1",
      containerId: null,
      properties: { templateId: "herb_01" },
    };
    npc.inventory.push(herb as any);
    world.entities.set("herb_01", herb as any);

    const result = executeEntityAction({
      world,
      actorId: "p1",
      action: "talk",
      actionDelta: {},
      actionEvents: [],
      options: {
        targetId: "npc1",
        roomId: "tavern",
        llmDelta: {
          dialogues: [{ speakerId: "npc1", content: "拿着", roomId: "tavern", tick: 0 }],
          itemChanges: [
            {
              targetId: "npc1",
              templateId: "herb_01",
              operation: "remove",
              qty: 1,
              itemId: "herb_01",
            },
            {
              targetId: "p1",
              templateId: "herb_01",
              operation: "add",
              qty: 1,
              itemId: "herb_01",
              name: "草药",
            },
          ],
        },
      },
    });

    // itemChanges 应保留在合并后的 delta 中
    expect(result.delta.itemChanges).toBeDefined();
    expect(result.delta.itemChanges).toHaveLength(2);

    // applyDelta 应已执行：NPC 失去物品，玩家获得物品
    expect(npc.inventory).toHaveLength(0);
    expect(player.inventory.some((i: any) => i.id === "herb_01")).toBe(true);
  });

  it("llmDelta 仅含 itemChanges（无 dialogues/worldEvents）→ 不被 isEmptyDelta 判空", () => {
    const world = setupWorld();
    const player = addPlayer(world, "p1", "赵行舟");
    const npc = addNpc(world, { id: "npc1", name: "铁匠" });

    const herb = {
      type: "item" as const,
      id: "herb_02",
      name: "草药",
      roomId: null,
      description: "草药",
      ownerId: "npc1",
      containerId: null,
      properties: { templateId: "herb_02" },
    };
    npc.inventory.push(herb as any);
    world.entities.set("herb_02", herb as any);

    const result = executeEntityAction({
      world,
      actorId: "p1",
      action: "talk",
      actionDelta: {},
      actionEvents: [],
      options: {
        targetId: "npc1",
        roomId: "tavern",
        llmDelta: {
          itemChanges: [
            {
              targetId: "npc1",
              templateId: "herb_02",
              operation: "remove",
              qty: 1,
              itemId: "herb_02",
            },
            {
              targetId: "p1",
              templateId: "herb_02",
              operation: "add",
              qty: 1,
              itemId: "herb_02",
              name: "草药",
            },
          ],
        },
      },
    });

    // itemChanges 不能被丢弃
    expect(result.delta.itemChanges).toHaveLength(2);
    expect(npc.inventory).toHaveLength(0);
    expect(player.inventory.some((i: any) => i.id === "herb_02")).toBe(true);
  });
});

// ============================================================
// executeEntityAction — take/drop 经 itemChanges 管线
// ============================================================

describe("executeEntityAction — take/drop itemChanges pipeline", () => {
  it("take 产出的 itemChanges → composeDeltas 保留 → applyDelta 转移物品到背包", () => {
    const world = setupWorld();
    const player = addPlayer(world, "p1", "赵行舟");

    const herb = {
      type: "item" as const,
      id: "herb_take",
      name: "草药",
      roomId: "tavern",
      description: "草药",
      ownerId: null,
      containerId: null,
      properties: { templateId: "herb_take" },
    };
    world.entities.set("herb_take", herb as any);
    world.rooms.get("tavern")!.entities.add("herb_take");

    // 模拟 executeTake 重构后产出的 delta（room.entities.delete 已在 command-executor 中完成）
    world.rooms.get("tavern")!.entities.delete("herb_take");
    const actionDelta = {
      itemChanges: [
        {
          targetId: "p1",
          templateId: "herb_take",
          operation: "add" as const,
          qty: 1,
          itemId: "herb_take",
          name: "草药",
        },
      ],
    };

    const result = executeEntityAction({
      world,
      actorId: "p1",
      action: "take",
      actionDelta,
      actionEvents: [{ type: "take", description: "你捡起了 草药" }],
      options: { roomId: "tavern" },
    });

    expect(result.delta.itemChanges).toBeDefined();
    expect(result.delta.itemChanges).toHaveLength(1);
    expect(player.inventory.some((i: any) => i.id === "herb_take")).toBe(true);
    expect(herb.ownerId).toBe("p1");
    expect(herb.roomId).toBeNull();
  });

  it("drop 产出的 itemChanges → composeDeltas 保留 → applyDelta 从背包移除", () => {
    const world = setupWorld();
    const player = addPlayer(world, "p1", "赵行舟");

    const herb: any = {
      type: "item",
      id: "herb_drop",
      name: "草药",
      roomId: null,
      description: "草药",
      ownerId: "p1",
      containerId: null,
      properties: { templateId: "herb_drop" },
    };
    player.inventory.push(herb);
    world.entities.set("herb_drop", herb);

    // 模拟 executeDrop 重构后产出的 delta（room.entities.add/item.roomId 等已在 command-executor 中完成）
    world.rooms.get("tavern")!.entities.add("herb_drop");
    herb.roomId = "tavern";
    herb.ownerId = null;
    herb.containerId = "tavern";

    const actionDelta = {
      itemChanges: [
        {
          targetId: "p1",
          templateId: "herb_drop",
          operation: "remove" as const,
          qty: 1,
          itemId: "herb_drop",
        },
      ],
    };

    const result = executeEntityAction({
      world,
      actorId: "p1",
      action: "drop",
      actionDelta,
      actionEvents: [{ type: "drop", description: "你放下了 草药" }],
      options: { roomId: "tavern" },
    });

    expect(result.delta.itemChanges).toBeDefined();
    expect(result.delta.itemChanges).toHaveLength(1);
    expect(player.inventory.some((i: any) => i.id === "herb_drop")).toBe(false);
  });
});

describe("executeEntityAction — combat delta", () => {
  it("含 combatHpChanges 的 actionDelta → applyDelta 应用 HP 变化", () => {
    const world = setupWorld();
    addPlayer(world, "p1", "赵行舟");
    const npc = addNpc(world, { id: "npc1", name: "山贼" });
    npc.combatState.hp = 40;

    executeEntityAction({
      world,
      actorId: "p1",
      action: "attack",
      actionDelta: {
        combatHpChanges: [{ targetId: "npc1", delta: -15 }],
      },
      actionEvents: [],
    });

    expect(npc.combatState.hp).toBe(25);
  });

  it("含 combatHpChanges 的 actionDelta → 不使 isEmptyDelta 误判为空", () => {
    const world = setupWorld();
    addPlayer(world, "p1", "赵行舟");
    const result = executeEntityAction({
      world,
      actorId: "p1",
      action: "attack",
      actionDelta: {
        combatHpChanges: [{ targetId: "npc1", delta: -15 }],
      },
      actionEvents: [],
    });
    // 非空 delta 应返回 effective delta
    expect(result.delta.combatHpChanges).toBeDefined();
    expect(result.delta.combatHpChanges?.length).toBe(1);
  });

  it("combatHpChanges + needChanges 同时存在 → 两者均被应用", () => {
    const world = setupWorld();
    const player = addPlayer(world, "p1", "赵行舟");
    const npc = addNpc(world, { id: "npc1", name: "山贼" });
    npc.combatState.hp = 40;
    const restNeed = player.needs.find((n) => n.type === "rest")!;
    const restBefore = restNeed.value;

    executeEntityAction({
      world,
      actorId: "p1",
      action: "attack",
      actionDelta: {
        combatHpChanges: [{ targetId: "npc1", delta: -15 }],
        needChanges: [{ targetId: "p1", needType: "rest", delta: -3 }],
      },
      actionEvents: [],
    });

    expect(npc.combatState.hp).toBe(25);
    expect(restNeed.value).toBe(restBefore - 3);
  });
});
