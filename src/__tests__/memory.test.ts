import { describe, expect, it } from "vitest";
import {
  addMemory,
  createDailyRoutineMemory,
  createMemoriesForAction,
  extractObserverIds,
  trimMemories,
} from "../core/memory.ts";
import type { NPCEntity, PlayerEntity, SimulationDelta, WorldState } from "../core/types.ts";
import {
  addEntity,
  addRegion,
  addRoom,
  createItem,
  createNPC,
  createPlayer,
  createRoom,
  createWorld,
} from "../core/world.ts";

// ── 测试工厂 ──

function makeNpc(overrides: Partial<NPCEntity> & { id: string }): NPCEntity {
  return createNPC(overrides.id, {
    name: overrides.name ?? overrides.id,
    roomId: overrides.roomId ?? "tavern",
    personality: "沉默",
    npcTier: "core",
    memories: overrides.memories ?? [],
    needs: overrides.needs ?? [],
    traits: overrides.traits ?? [],
    relations: overrides.relations ?? [],
    schedule: overrides.schedule ?? [],
    ...overrides,
  });
}

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
  addRoom(world, createRoom("smithy", "铁匠铺", "test", "叮当作响的铁匠铺"));
  return world;
}

function addPlayer(world: WorldState, id: string, name: string, roomId = "tavern"): PlayerEntity {
  const p = createPlayer(id, name, roomId, world.contentPool);
  addEntity(world, p);
  return p;
}

function addNpc(world: WorldState, overrides: Partial<NPCEntity> & { id: string }): NPCEntity {
  const npc = makeNpc(overrides);
  addEntity(world, npc);
  return npc;
}

// ============================================================
// addMemory
// ============================================================

describe("addMemory", () => {
  it("应该追加记忆到 entity.memories", () => {
    const world = setupWorld();
    const npc = addNpc(world, { id: "npc1" });
    addMemory(npc, "测试记忆", "observation", 0.5, 1);
    expect(npc.memories).toHaveLength(1);
    expect(npc.memories[0].content).toBe("测试记忆");
    expect(npc.memories[0].type).toBe("observation");
    expect(npc.memories[0].importance).toBe(0.5);
    expect(npc.memories[0].tick).toBe(1);
  });

  it("应该正确设置 entityIds", () => {
    const world = setupWorld();
    const npc = addNpc(world, { id: "npc1" });
    addMemory(npc, "带引用的记忆", "observation", 0.5, 1, ["actor1", "actor2"]);
    expect(npc.memories[0].entityIds).toEqual(["actor1", "actor2"]);
  });

  it("entityIds 为空数组时不设置字段", () => {
    const world = setupWorld();
    const npc = addNpc(world, { id: "npc1" });
    addMemory(npc, "无引用", "observation", 0.5, 1, []);
    expect(npc.memories[0].entityIds).toBeUndefined();
  });
});

// ============================================================
// trimMemories
// ============================================================

describe("trimMemories", () => {
  it("记忆数 ≤ 默认上限(100)时不裁剪", () => {
    const world = setupWorld();
    const npc = addNpc(world, { id: "npc1" });
    for (let i = 0; i < 50; i++) {
      addMemory(npc, `记忆${i}`, "observation", 0.5, i);
    }
    expect(npc.memories).toHaveLength(50);
    trimMemories(npc);
    expect(npc.memories).toHaveLength(50);
  });

  it("超过上限 → 移除最旧的低重要度 observation", () => {
    const world = setupWorld();
    const npc = addNpc(world, { id: "npc1" });
    // 添加 10 条低重要度 + 95 条高重要度 = 105 条（超过 100）
    for (let i = 0; i < 10; i++) addMemory(npc, `低${i}`, "observation", 0.1, i);
    for (let i = 0; i < 95; i++) addMemory(npc, `高${i}`, "conversation", 0.9, i + 100);
    trimMemories(npc);
    expect(npc.memories).toHaveLength(100);
    // 最旧的低重要度应被移除
    const lowCount = npc.memories.filter((m) => m.importance === 0.1).length;
    expect(lowCount).toBeLessThan(10);
  });

  it("同重要度时优先移除最早的", () => {
    const world = setupWorld();
    const npc = addNpc(world, { id: "npc1" });
    for (let i = 0; i < 105; i++) addMemory(npc, `记忆${i}`, "observation", 0.5, i);
    trimMemories(npc);
    expect(npc.memories).toHaveLength(100);
    // 最早的几条应被移除
    expect(npc.memories.some((m) => m.tick === 0)).toBe(false);
    expect(npc.memories.some((m) => m.tick === 4)).toBe(false);
  });

  it("自定义上限 → 按自定义值裁剪", () => {
    const world = setupWorld();
    const npc = addNpc(world, { id: "npc1" });
    for (let i = 0; i < 15; i++) addMemory(npc, `记忆${i}`, "observation", 0.5, i);
    trimMemories(npc, 10);
    expect(npc.memories).toHaveLength(10);
  });

  it("裁剪后保留高重要度记忆", () => {
    const world = setupWorld();
    const npc = addNpc(world, { id: "npc1" });
    // 先加低重要度，再加高重要度，使总数 > 100
    for (let i = 0; i < 95; i++) addMemory(npc, `低${i}`, "observation", 0.1, i);
    addMemory(npc, "重要对话", "conversation", 0.9, 200);
    for (let i = 0; i < 10; i++) addMemory(npc, `补${i}`, "observation", 0.2, i + 300);
    trimMemories(npc);
    // 高重要度对话应保留
    expect(npc.memories.some((m) => m.content === "重要对话")).toBe(true);
  });

  it("刚好 100 条（边界）→ 不裁剪", () => {
    const world = setupWorld();
    const npc = addNpc(world, { id: "npc1" });
    for (let i = 0; i < 100; i++) addMemory(npc, `记忆${i}`, "observation", 0.5, i);
    trimMemories(npc);
    expect(npc.memories).toHaveLength(100);
  });
});

// ============================================================
// extractObserverIds
// ============================================================

describe("extractObserverIds", () => {
  it("有 relationChanges → 提取所有 fromId", () => {
    const delta: SimulationDelta = {
      relationChanges: [
        { fromId: "obs1", toId: "actor", delta: 2 },
        { fromId: "obs2", toId: "actor", delta: -1 },
      ],
    };
    expect(extractObserverIds(delta)).toEqual(["obs1", "obs2"]);
  });

  it("无 relationChanges → 返回空数组", () => {
    expect(extractObserverIds({})).toEqual([]);
  });

  it("空 delta → 返回空数组", () => {
    expect(extractObserverIds({ needChanges: [] })).toEqual([]);
  });
});

// ============================================================
// createMemoriesForAction — talk
// ============================================================

describe("createMemoriesForAction — talk", () => {
  it("talk 后 → NPC target 生成一条 conversation 记忆", () => {
    const world = setupWorld();
    const _player = addPlayer(world, "p1", "赵行舟");
    const npc = addNpc(world, { id: "npc1", name: "老马" });
    const llmDelta: SimulationDelta = {
      dialogues: [{ speakerId: "npc1", content: "你好啊", roomId: "tavern", tick: 0 }],
    };
    const count = createMemoriesForAction(
      world,
      "p1",
      "talk",
      {},
      { targetId: "npc1", roomId: "tavern", llmDelta },
    );
    expect(count).toBeGreaterThanOrEqual(1);
    expect(npc.memories).toHaveLength(1);
    expect(npc.memories[0].type).toBe("conversation");
    expect(npc.memories[0].content).toContain("你好啊");
  });

  it("talk 后 → player actor 也生成一条 conversation 记忆", () => {
    const world = setupWorld();
    const player = addPlayer(world, "p1", "赵行舟");
    const _npc = addNpc(world, { id: "npc1", name: "老马" });
    const llmDelta: SimulationDelta = {
      dialogues: [{ speakerId: "npc1", content: "你好", roomId: "tavern", tick: 0 }],
    };
    createMemoriesForAction(
      world,
      "p1",
      "talk",
      {},
      { targetId: "npc1", roomId: "tavern", llmDelta },
    );
    expect(player.memories).toHaveLength(1);
    expect(player.memories[0].type).toBe("conversation");
  });

  it("对话内容超过 60 字时截断", () => {
    const world = setupWorld();
    addPlayer(world, "p1", "赵行舟");
    const npc = addNpc(world, { id: "npc1", name: "老马" });
    const longText = "这是一段很长很长的对话".repeat(10);
    const llmDelta: SimulationDelta = {
      dialogues: [{ speakerId: "npc1", content: longText, roomId: "tavern", tick: 0 }],
    };
    createMemoriesForAction(
      world,
      "p1",
      "talk",
      {},
      { targetId: "npc1", roomId: "tavern", llmDelta },
    );
    expect(npc.memories[0].content).toContain("…");
    expect(npc.memories[0].content.length).toBeLessThan(longText.length);
  });

  it("entityIds 包含 actorId 和 targetId", () => {
    const world = setupWorld();
    addPlayer(world, "p1", "赵行舟");
    const npc = addNpc(world, { id: "npc1", name: "老马" });
    const llmDelta: SimulationDelta = {
      dialogues: [{ speakerId: "npc1", content: "你好", roomId: "tavern", tick: 0 }],
    };
    createMemoriesForAction(
      world,
      "p1",
      "talk",
      {},
      { targetId: "npc1", roomId: "tavern", llmDelta },
    );
    expect(npc.memories[0].entityIds).toEqual(["p1", "npc1"]);
  });

  it("无 llmDelta 时 → 不创建对话记忆", () => {
    const world = setupWorld();
    addPlayer(world, "p1", "赵行舟");
    const npc = addNpc(world, { id: "npc1", name: "老马" });
    createMemoriesForAction(world, "p1", "talk", {}, { targetId: "npc1", roomId: "tavern" });
    expect(npc.memories).toHaveLength(0);
  });

  it("无 targetId 时 → 不创建对话记忆", () => {
    const world = setupWorld();
    addPlayer(world, "p1", "赵行舟");
    const npc = addNpc(world, { id: "npc1", name: "老马" });
    const llmDelta: SimulationDelta = {
      dialogues: [{ speakerId: "npc1", content: "你好", roomId: "tavern", tick: 0 }],
    };
    createMemoriesForAction(world, "p1", "talk", {}, { roomId: "tavern", llmDelta });
    expect(npc.memories).toHaveLength(0);
  });
});

// ============================================================
// createMemoriesForAction — move
// ============================================================

describe("createMemoriesForAction — move", () => {
  it("move → 旧房间 NPC 各生成离开记忆", () => {
    const world = setupWorld();
    const _player = addPlayer(world, "p1", "赵行舟");
    const npc = addNpc(world, { id: "npc1", name: "老马" });
    const count = createMemoriesForAction(world, "p1", "move", {}, { roomId: "tavern" });
    expect(count).toBeGreaterThanOrEqual(1);
    expect(npc.memories[0].content).toContain("离开了");
  });

  it("move → 新房间 NPC 各生成到达记忆", () => {
    const world = setupWorld();
    const player = addPlayer(world, "p1", "赵行舟", "tavern");
    const npcInSmithy = addNpc(world, { id: "npc2", name: "铁匠", roomId: "smithy" });
    // 模拟移动：player 移到 smithy
    player.roomId = "smithy";
    const count = createMemoriesForAction(world, "p1", "move", {}, { roomId: "tavern" });
    expect(count).toBeGreaterThanOrEqual(1);
    expect(npcInSmithy.memories[0].content).toContain("来到了");
  });

  it("move → 行为者自身生成到达记忆", () => {
    const world = setupWorld();
    const player = addPlayer(world, "p1", "赵行舟", "tavern");
    addNpc(world, { id: "npc1", name: "老马" });
    // 模拟移动：player 移到 smithy
    player.roomId = "smithy";
    createMemoriesForAction(world, "p1", "move", {}, { roomId: "tavern" });
    expect(player.memories.some((m) => m.content.includes("到达了"))).toBe(true);
  });

  it("行为者本人不在观察者中", () => {
    const world = setupWorld();
    const npc = addNpc(world, { id: "npc1", name: "老马" });
    createMemoriesForAction(world, "npc1", "move", {}, { roomId: "tavern" });
    // npc1 不应给自己创建"看到离开"的记忆（只有到达，不是观察者）
    expect(npc.memories.every((m) => !m.content.includes("看到"))).toBe(true);
  });

  it("非 NPC/Player 实体被跳过", () => {
    const world = setupWorld();
    const item = createItem("item1", "木箱", "test_item", {}, "tavern");
    addEntity(world, item);
    const count = createMemoriesForAction(world, "p1", "move", {}, { roomId: "tavern" });
    // item 没有 memories，应被跳过，不产生错误
    expect(count).toBe(0);
  });
});

// ============================================================
// createMemoriesForAction — take/drop
// ============================================================

describe("createMemoriesForAction — take/drop", () => {
  it("take → 行为者自身生成拿起了记忆", () => {
    const world = setupWorld();
    const player = addPlayer(world, "p1", "赵行舟");
    const item = createItem("item1", "草药", "test_item", {}, "tavern");
    addEntity(world, item);
    createMemoriesForAction(world, "p1", "take", {}, { targetId: "item1", roomId: "tavern" });
    expect(player.memories).toHaveLength(1);
    expect(player.memories[0].content).toContain("拿起了");
    expect(player.memories[0].content).toContain("草药");
  });

  it("drop → 行为者自身生成放下了记忆", () => {
    const world = setupWorld();
    const player = addPlayer(world, "p1", "赵行舟");
    const item = createItem("item1", "铜币", "test_item", {}, "tavern");
    addEntity(world, item);
    createMemoriesForAction(world, "p1", "drop", {}, { targetId: "item1", roomId: "tavern" });
    expect(player.memories).toHaveLength(1);
    expect(player.memories[0].content).toContain("放下了");
    expect(player.memories[0].content).toContain("铜币");
  });

  it("无 targetId 时 → 物品名默认为东西", () => {
    const world = setupWorld();
    const player = addPlayer(world, "p1", "赵行舟");
    createMemoriesForAction(world, "p1", "take", {}, { roomId: "tavern" });
    expect(player.memories[0].content).toContain("东西");
  });
});

// ============================================================
// createMemoriesForAction — look
// ============================================================

describe("createMemoriesForAction — look", () => {
  it("被观察的 NPC 有 suspicious > 30 → 产生记忆", () => {
    const world = setupWorld();
    const _actor = addPlayer(world, "p1", "赵行舟");
    const npc = addNpc(world, {
      id: "npc1",
      name: "老马",
      traits: [{ name: "suspicious", value: 50 }],
    });
    const count = createMemoriesForAction(world, "p1", "look", {}, { targetId: "npc1" });
    expect(count).toBe(1);
    expect(npc.memories).toHaveLength(1);
    expect(npc.memories[0].content).toContain("打量了我");
    expect(npc.memories[0].entityIds).toEqual(["p1"]);
  });

  it("被观察的 NPC 无敏感特质 → 不产生记忆", () => {
    const world = setupWorld();
    addPlayer(world, "p1", "赵行舟");
    const npc = addNpc(world, { id: "npc1", name: "老马", traits: [{ name: "kind", value: 50 }] });
    const count = createMemoriesForAction(world, "p1", "look", {}, { targetId: "npc1" });
    expect(count).toBe(0);
    expect(npc.memories).toHaveLength(0);
  });

  it("被观察的非 NPC 实体 → 不产生记忆", () => {
    const world = setupWorld();
    addPlayer(world, "p1", "赵行舟");
    const item = createItem("item1", "木箱", "test_item", {}, "tavern");
    addEntity(world, item);
    const count = createMemoriesForAction(world, "p1", "look", {}, { targetId: "item1" });
    expect(count).toBe(0);
  });
});

// ============================================================
// createMemoriesForAction — say
// ============================================================

describe("createMemoriesForAction — say", () => {
  it("say → 同房间所有 NPC 生成听到记忆", () => {
    const world = setupWorld();
    addPlayer(world, "p1", "赵行舟");
    const npc1 = addNpc(world, { id: "npc1", name: "老马" });
    const npc2 = addNpc(world, { id: "npc2", name: "铁匠" });
    const count = createMemoriesForAction(world, "p1", "say", {}, { roomId: "tavern" });
    expect(count).toBe(2);
    expect(npc1.memories[0].content).toContain("听到");
    expect(npc2.memories[0].content).toContain("听到");
  });

  it("行为者自己不在观察者中", () => {
    const world = setupWorld();
    const npc = addNpc(world, { id: "npc1", name: "老马" });
    addNpc(world, { id: "npc2", name: "铁匠" });
    createMemoriesForAction(world, "npc1", "say", {}, { roomId: "tavern" });
    // npc1 不应收到自己的记忆，只有 npc2
    expect(npc.memories).toHaveLength(0);
  });
});

// ============================================================
// createMemoriesForAction — ripple 观察者
// ============================================================

describe("createMemoriesForAction — ripple 观察者", () => {
  it("ripple relationChanges → 为每个观察者创建记忆", () => {
    const world = setupWorld();
    addPlayer(world, "p1", "赵行舟");
    const npc1 = addNpc(world, { id: "obs1", name: "观察者甲" });
    const npc2 = addNpc(world, { id: "obs2", name: "观察者乙" });
    const rippleDelta: SimulationDelta = {
      relationChanges: [
        { fromId: "obs1", toId: "p1", delta: 2 },
        { fromId: "obs2", toId: "p1", delta: -1 },
      ],
    };
    const count = createMemoriesForAction(world, "p1", "talk", rippleDelta, {
      targetId: "npc1",
      roomId: "tavern",
    });
    expect(count).toBeGreaterThanOrEqual(2);
    expect(npc1.memories.some((m) => m.content.includes("注意到"))).toBe(true);
    expect(npc2.memories.some((m) => m.content.includes("注意到"))).toBe(true);
  });

  it("观察者正好是行为者自己 → 跳过", () => {
    const world = setupWorld();
    addPlayer(world, "p1", "赵行舟");
    const _npc1 = addNpc(world, { id: "npc1", name: "老马" });
    // ripple 指向 actor 自己
    const rippleDelta: SimulationDelta = {
      relationChanges: [{ fromId: "p1", toId: "p1", delta: 2 }],
    };
    createMemoriesForAction(world, "p1", "talk", rippleDelta, {
      targetId: "npc1",
      roomId: "tavern",
    });
    // p1 不应收到自己的观察记忆
    const player = world.entities.get("p1") as PlayerEntity;
    expect(player.memories.every((m) => !m.content.includes("注意到"))).toBe(true);
  });
});

// ============================================================
// createDailyRoutineMemory
// ============================================================

describe("createDailyRoutineMemory", () => {
  it("为 NPC 添加 importance 0.05 的 observation", () => {
    const world = setupWorld();
    const npc = addNpc(world, { id: "npc1", name: "老马" });
    createDailyRoutineMemory(npc, 42, world);
    expect(npc.memories).toHaveLength(1);
    expect(npc.memories[0].content).toBe("度过了日常的一天");
    expect(npc.memories[0].importance).toBe(0.05);
    expect(npc.memories[0].type).toBe("observation");
    expect(npc.memories[0].tick).toBe(42);
  });
});

// ============================================================
// trimMemories + addMemory 联调
// ============================================================

describe("trimMemories + addMemory 联调", () => {
  it("连续添加 101 条 → 自动裁剪到 100", () => {
    const world = setupWorld();
    const npc = addNpc(world, { id: "npc1" });
    for (let i = 0; i < 101; i++) addMemory(npc, `记忆${i}`, "observation", 0.5, i);
    expect(npc.memories).toHaveLength(100);
  });

  it("裁剪后保留最近的高重要度记忆", () => {
    const world = setupWorld();
    const npc = addNpc(world, { id: "npc1" });
    // 95 条低重要度
    for (let i = 0; i < 95; i++) addMemory(npc, `低${i}`, "observation", 0.1, i);
    // 6 条高重要度（总共 101）
    for (let i = 0; i < 6; i++) addMemory(npc, `高${i}`, "conversation", 0.9, i + 100);
    expect(npc.memories).toHaveLength(100);
    // 所有高重要度应保留
    const highCount = npc.memories.filter((m) => m.importance === 0.9).length;
    expect(highCount).toBe(6);
  });
});
