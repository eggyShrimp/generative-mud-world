import { describe, expect, it, vi } from "vitest";
import { EventBus } from "../core/event-bus.ts";
import { RoundEngine } from "../core/round-engine.ts";
import type { NPCEntity, PlayerEntity, SimulationDelta } from "../core/types.ts";
import {
  addEntity,
  addRegion,
  addRoom,
  createPlayer,
  createRoom,
  createWorld,
} from "../core/world.ts";
import type { DialogueGenerator } from "../llm/dialogue-generator.ts";
import { InteractionDispatcher, LLMAdapter } from "../llm/index.ts";

function stubAdapter() {
  return new LLMAdapter({ baseUrl: "http://localhost/v1", apiKey: "x", model: "x" });
}

function stubDispatcher() {
  const d = new InteractionDispatcher(stubAdapter());
  vi.spyOn(d, "checkReachable").mockResolvedValue(false);
  vi.spyOn(d, "runSettlementBatch").mockResolvedValue({
    deltas: [],
    worldMutations: [],
    contentPoolMutations: [],
  });
  return d;
}

function stubSimulation() {
  return { runDay: () => ({}) };
}

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

function setupWorldWithNPC() {
  const world = setupWorld();
  // 移动玩家到酒馆（和 NPC 同房间）
  const player = world.entities.get("p1");
  if (!player) throw new Error("player not found");

  const tavern = world.rooms.get("tavern");
  if (!tavern) throw new Error("tavern not found");

  const market = world.rooms.get("market");
  if (!market) throw new Error("market not found");

  player.roomId = "tavern";
  tavern.entities.add("p1");
  market.entities.delete("p1");

  const npc: NPCEntity = {
    id: "npc1",
    name: "老马",
    type: "npc",
    roomId: "tavern",
    description: "热情的酒馆老板",
    npcTier: "core",
    personality: "热情",
    mood: 50,
    memories: [],
    needs: [{ type: "social", value: 50, baseUrgency: 0.3, decayRate: 3 }],
    traits: [],
    schedule: [],
    relations: [],
    availableActions: [],
    inventory: [],
    combatState: {
      hp: 50,
      maxHp: 50,
      combatTarget: null,
      threatTable: {},
      lastAttackTick: 0,
      isDefending: false,
      isIncapacitated: false,
      incapacitatedUntil: 0,
    },
    equipment: { weapon: null, armor: null, cloak: null, accessory: null },
  };
  addEntity(world, npc);
  return world;
}

function setupWorldWithObserver() {
  const world = setupWorldWithNPC();
  const observer: NPCEntity = {
    id: "obs1",
    name: "老王",
    type: "npc",
    roomId: "tavern",
    description: "酒馆常客",
    npcTier: "background",
    personality: "多疑",
    mood: 50,
    memories: [],
    needs: [],
    traits: [{ name: "suspicious", value: 80 }],
    schedule: [],
    relations: [{ targetId: "p1", level: 40, label: "认识", lastInteractionTick: 0 }],
    availableActions: [],
    inventory: [],
    combatState: {
      hp: 50,
      maxHp: 50,
      combatTarget: null,
      threatTable: {},
      lastAttackTick: 0,
      isDefending: false,
      isIncapacitated: false,
      incapacitatedUntil: 0,
    },
    equipment: { weapon: null, armor: null, cloak: null, accessory: null },
  };
  addEntity(world, observer);
  return world;
}

function mockDialogueGenerator(delta: SimulationDelta): DialogueGenerator {
  return {
    generateFixedChatMenu: vi.fn().mockReturnValue([
      { id: "opt_1", label: "你好", type: "idle_chat" },
      { id: "opt_2", label: "再见", type: "close" },
    ]),
    handleChatOption: vi.fn().mockResolvedValue({ delta, subOptions: undefined }),
  } as unknown as DialogueGenerator;
}

function mockDialogueGeneratorWithSubOptions(
  delta: SimulationDelta,
  subOptions: Array<{ id: string; label: string; type: string }>,
): DialogueGenerator {
  return {
    generateFixedChatMenu: vi.fn().mockReturnValue([]),
    handleChatOption: vi.fn().mockResolvedValue({ delta, subOptions }),
  } as unknown as DialogueGenerator;
}

describe("RoundEngine — 基础命令", () => {
  it("should end day on end_day command", async () => {
    const world = setupWorld();
    const engine = new RoundEngine(world, new EventBus(), stubDispatcher(), stubSimulation());
    const result = await engine.executeStructuredCommand("p1", "end_day", {});
    expect(result.ended).toBe(true);
  });

  it("should execute look command", async () => {
    const world = setupWorld();
    const engine = new RoundEngine(world, new EventBus(), stubDispatcher(), stubSimulation());
    const result = await engine.executeStructuredCommand("p1", "look", { target: "房间" });
    expect(result.ended).toBe(false);
    expect(result.events.length).toBeGreaterThan(0);
    expect(result.events[0].type).toBe("look");
  });

  it("should execute move command", async () => {
    const world = setupWorld();
    const engine = new RoundEngine(world, new EventBus(), stubDispatcher(), stubSimulation());
    const result = await engine.executeStructuredCommand("p1", "move", { direction: "north" });
    expect(result.ended).toBe(false);
    expect(result.events[0].type).toBe("move");
    expect(result.events[0].description).toContain("酒馆");
  });

  it("should return error for invalid move direction", async () => {
    const world = setupWorld();
    const engine = new RoundEngine(world, new EventBus(), stubDispatcher(), stubSimulation());
    const result = await engine.executeStructuredCommand("p1", "move", { direction: "east" });
    expect(result.events[0].type).toBe("error");
  });

  it("should handle status command", async () => {
    const world = setupWorld();
    const engine = new RoundEngine(world, new EventBus(), stubDispatcher(), stubSimulation());
    const result = await engine.executeStructuredCommand("p1", "status", {});
    expect(result.events[0].type).toBe("status");
    expect(result.events[0].description).toContain("状态");
  });
});

describe("RoundEngine — 对话端到端链路", () => {
  it("talk + optionId: result.events 包含 NPC 回复对话行", async () => {
    const world = setupWorldWithNPC();
    const llmDelta: SimulationDelta = {
      dialogues: [
        { speakerId: "npc1", content: "年轻人，最近怎么样？", roomId: "tavern", tick: 0 },
      ],
    };
    const gen = mockDialogueGenerator(llmDelta);
    const engine = new RoundEngine(world, new EventBus(), stubDispatcher(), stubSimulation());
    engine.setDialogueGenerator(gen);

    const result = await engine.executeStructuredCommand("p1", "talk", {
      npcId: "npc1",
      optionId: "opt_1",
      optionLabel: "你好",
    });

    // 验证 dialogue 事件出现在 result.events 中
    const dialogueEvents = result.events.filter((e) => e.type === "dialogue");
    expect(dialogueEvents).toHaveLength(1);
    expect(dialogueEvents[0].description).toContain("老马");
    expect(dialogueEvents[0].description).toContain("年轻人，最近怎么样？");
  });

  it("talk + optionId: 不再请求下一轮对话选项", async () => {
    const world = setupWorldWithNPC();
    const llmDelta: SimulationDelta = {
      dialogues: [{ speakerId: "npc1", content: "先说到这里。", roomId: "tavern", tick: 0 }],
    };
    const gen = mockDialogueGenerator(llmDelta);
    const engine = new RoundEngine(world, new EventBus(), stubDispatcher(), stubSimulation());
    engine.setDialogueGenerator(gen);

    const result = await engine.executeStructuredCommand("p1", "talk", {
      npcId: "npc1",
      optionId: "opt_1",
      optionLabel: "再见",
    });

    expect(result.needsDialogueOptions).toBeUndefined();
    expect(result.events.some((e) => e.type === "dialogue")).toBe(true);
  });

  it("talk + optionId: result.events 包含关系变化事件", async () => {
    const world = setupWorldWithNPC();
    const llmDelta: SimulationDelta = {
      dialogues: [{ speakerId: "npc1", content: "你好啊", roomId: "tavern", tick: 0 }],
      relationChanges: [{ fromId: "p1", toId: "npc1", delta: 2 }],
    };
    const gen = mockDialogueGenerator(llmDelta);
    const engine = new RoundEngine(world, new EventBus(), stubDispatcher(), stubSimulation());
    engine.setDialogueGenerator(gen);

    const result = await engine.executeStructuredCommand("p1", "talk", {
      npcId: "npc1",
      optionId: "opt_1",
      optionLabel: "你好",
    });

    const relEvents = result.events.filter((e) => e.type === "relation");
    expect(relEvents).toHaveLength(1);
    expect(relEvents[0].description).toContain("老马");
    expect(relEvents[0].description).toContain("+2");
  });

  it("talk + optionId: result.events 包含需求变化事件", async () => {
    const world = setupWorldWithNPC();
    const llmDelta: SimulationDelta = {
      dialogues: [{ speakerId: "npc1", content: "嗯", roomId: "tavern", tick: 0 }],
      needChanges: [
        { targetId: "npc1", needType: "social", delta: 3 },
        { targetId: "p1", needType: "rest", delta: -2 },
      ],
    };
    const gen = mockDialogueGenerator(llmDelta);
    const engine = new RoundEngine(world, new EventBus(), stubDispatcher(), stubSimulation());
    engine.setDialogueGenerator(gen);

    const result = await engine.executeStructuredCommand("p1", "talk", {
      npcId: "npc1",
      optionId: "opt_1",
      optionLabel: "你好",
    });

    const needEvents = result.events.filter((e) => e.type === "need");
    // 聚合后: 玩家自身需求 1 行 + NPC 需求 1 行
    expect(needEvents.length).toBeGreaterThanOrEqual(2);
    // 玩家 rest -2 存在 (needLabel 已翻译为中文)
    expect(
      needEvents.some((e) => e.description.includes("精力") && e.description.includes("-2")),
    ).toBe(true);
    // NPC 需求变化存在
    expect(needEvents.some((e) => e.description.includes("周围的人"))).toBe(true);
  });

  it("talk + optionId: result.events 包含信息/物品/事件", async () => {
    const world = setupWorldWithNPC();
    const llmDelta: SimulationDelta = {
      dialogues: [{ speakerId: "npc1", content: "小心点", roomId: "tavern", tick: 0 }],
      worldEvents: [
        {
          id: "info_1",
          type: "information",
          title: "警告",
          description: "东山有兽人",
          scope: "tavern",
          tick: 0,
          source: "llm",
          data: { infoType: "warning" },
        },
      ],
    };
    const gen = mockDialogueGenerator(llmDelta);
    const engine = new RoundEngine(world, new EventBus(), stubDispatcher(), stubSimulation());
    engine.setDialogueGenerator(gen);

    const result = await engine.executeStructuredCommand("p1", "talk", {
      npcId: "npc1",
      optionId: "opt_1",
      optionLabel: "有什么要注意的？",
    });

    const infoEvents = result.events.filter((e) => e.type === "information");
    expect(infoEvents).toHaveLength(1);
    expect(infoEvents[0].description).toBe("东山有兽人");
  });

  it("talk + optionId: 世界状态正确更新 (关系)", async () => {
    const world = setupWorldWithNPC();
    const llmDelta: SimulationDelta = {
      dialogues: [{ speakerId: "npc1", content: "你好", roomId: "tavern", tick: 0 }],
      relationChanges: [{ fromId: "p1", toId: "npc1", delta: 3 }],
    };
    const gen = mockDialogueGenerator(llmDelta);
    const engine = new RoundEngine(world, new EventBus(), stubDispatcher(), stubSimulation());
    engine.setDialogueGenerator(gen);

    await engine.executeStructuredCommand("p1", "talk", {
      npcId: "npc1",
      optionId: "opt_1",
      optionLabel: "你好",
    });

    // 验证世界状态中关系已更新
    const player = world.entities.get("p1");
    if (!player) throw new Error("player not found");

    const rel = (player as NPCEntity).relations.find((r) => r.targetId === "npc1");
    expect(rel).toBeDefined();
    expect(rel?.level).toBe(3);
  });

  it("talk + optionId: 世界状态正确更新 (NPC 需求)", async () => {
    const world = setupWorldWithNPC();
    const llmDelta: SimulationDelta = {
      dialogues: [{ speakerId: "npc1", content: "嗯", roomId: "tavern", tick: 0 }],
      needChanges: [{ targetId: "npc1", needType: "social", delta: 5 }],
    };
    const gen = mockDialogueGenerator(llmDelta);
    const engine = new RoundEngine(world, new EventBus(), stubDispatcher(), stubSimulation());
    engine.setDialogueGenerator(gen);

    await engine.executeStructuredCommand("p1", "talk", {
      npcId: "npc1",
      optionId: "opt_1",
      optionLabel: "你好",
    });

    // 验证 NPC 的 social 需求从 50 变为 55
    const npc = world.entities.get("npc1");
    if (!npc) throw new Error("npc not found");

    const social = (npc as NPCEntity).needs.find((n) => n.type === "social");
    expect(social?.value).toBe(55);
  });

  it("talk + optionId: 世界事件记录到 eventLog", async () => {
    const world = setupWorldWithNPC();
    const llmDelta: SimulationDelta = {
      dialogues: [{ speakerId: "npc1", content: "你好", roomId: "tavern", tick: 0 }],
      worldEvents: [
        {
          id: "info_1",
          type: "information",
          title: "信息",
          description: "有兽人",
          scope: "tavern",
          tick: 0,
          source: "llm",
          data: {},
        },
      ],
    };
    const gen = mockDialogueGenerator(llmDelta);
    const engine = new RoundEngine(world, new EventBus(), stubDispatcher(), stubSimulation());
    engine.setDialogueGenerator(gen);

    await engine.executeStructuredCommand("p1", "talk", {
      npcId: "npc1",
      optionId: "opt_1",
      optionLabel: "你好",
    });

    // applyDelta 会把 delta.events 记录到 world.eventLog
    const infoLogs = world.eventLog.filter((e) => e.type === "information");
    expect(infoLogs.length).toBeGreaterThan(0);
    expect(infoLogs.some((e) => e.description === "有兽人")).toBe(true);
  });
});

describe("RoundEngine — 社会涟漪端到端", () => {
  it("talk + observer: result.events 包含 observer_reaction", async () => {
    const world = setupWorldWithObserver();
    const llmDelta: SimulationDelta = {
      dialogues: [{ speakerId: "npc1", content: "你好", roomId: "tavern", tick: 0 }],
    };
    const gen = mockDialogueGenerator(llmDelta);
    const engine = new RoundEngine(world, new EventBus(), stubDispatcher(), stubSimulation());
    engine.setDialogueGenerator(gen);

    const result = await engine.executeStructuredCommand("p1", "talk", {
      npcId: "npc1",
      optionId: "opt_1",
      optionLabel: "你好",
    });

    const rippleEvents = result.events.filter((e) => e.type === "observer_reaction");
    expect(rippleEvents.length).toBeGreaterThan(0);
    expect(rippleEvents[0].description).toContain("老王");
    expect(rippleEvents[0].description).toContain("对话");
  });

  it("talk + observer: observer 关系发生变化", async () => {
    const world = setupWorldWithObserver();
    const llmDelta: SimulationDelta = {
      dialogues: [{ speakerId: "npc1", content: "你好", roomId: "tavern", tick: 0 }],
    };
    const gen = mockDialogueGenerator(llmDelta);
    const engine = new RoundEngine(world, new EventBus(), stubDispatcher(), stubSimulation());
    engine.setDialogueGenerator(gen);

    const result = await engine.executeStructuredCommand("p1", "talk", {
      npcId: "npc1",
      optionId: "opt_1",
      optionLabel: "你好",
    });

    // ripple 产出的关系事件: observer(obs1) → actor(p1)
    // 聚合格式: "结算 | 关系：和赵行舟+1"
    const relEvents = result.events.filter(
      (e) => e.type === "relation" && e.description.includes("赵行舟"),
    );
    expect(relEvents.length).toBeGreaterThan(0);
  });

  it("move (非社交动作): 无 observer_reaction 事件", async () => {
    const world = setupWorldWithObserver();
    const engine = new RoundEngine(world, new EventBus(), stubDispatcher(), stubSimulation());

    const result = await engine.executeStructuredCommand("p1", "move", { direction: "south" });

    const rippleEvents = result.events.filter((e) => e.type === "observer_reaction");
    expect(rippleEvents).toHaveLength(0);
  });

  it("talk + multiple observers: 多个旁观者各自反应", async () => {
    const world = setupWorldWithObserver();
    const observer2: NPCEntity = {
      id: "obs2",
      name: "张屠夫",
      type: "npc",
      roomId: "tavern",
      description: "",
      npcTier: "background",
      personality: "",
      mood: 50,
      memories: [],
      needs: [],
      traits: [],
      schedule: [],
      relations: [{ targetId: "p1", level: -50, label: "仇人", lastInteractionTick: 0 }],
      availableActions: [],
      inventory: [],
      combatState: {
        hp: 50,
        maxHp: 50,
        combatTarget: null,
        threatTable: {},
        lastAttackTick: 0,
        isDefending: false,
        isIncapacitated: false,
        incapacitatedUntil: 0,
      },
      equipment: { weapon: null, armor: null, cloak: null, accessory: null },
    };
    addEntity(world, observer2);

    const llmDelta: SimulationDelta = {
      dialogues: [{ speakerId: "npc1", content: "你好", roomId: "tavern", tick: 0 }],
    };
    const gen = mockDialogueGenerator(llmDelta);
    const engine = new RoundEngine(world, new EventBus(), stubDispatcher(), stubSimulation());
    engine.setDialogueGenerator(gen);

    const result = await engine.executeStructuredCommand("p1", "talk", {
      npcId: "npc1",
      optionId: "opt_1",
      optionLabel: "你好",
    });

    // 应有两个 observer_reaction 事件
    const rippleEvents = result.events.filter((e) => e.type === "observer_reaction");
    expect(rippleEvents).toHaveLength(2);

    // ripple 产出的关系事件聚合为 1 行
    const relEvents = result.events.filter(
      (e) => e.type === "relation" && e.description.includes("赵行舟"),
    );
    expect(relEvents.length).toBeGreaterThanOrEqual(1);
  });
});

describe("RoundEngine — 可行性检查管道", () => {
  it("should block move when rest is insufficient", async () => {
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
    restNeed.value = 10;

    const engine = new RoundEngine(world, new EventBus(), stubDispatcher(), stubSimulation());
    const result = await engine.executeStructuredCommand("p1", "move", { direction: "north" });

    expect(result.events[0].type).toBe("error");
    expect(result.events[0].description).toContain("精力不足");
    // 玩家不应被移动
    expect(player.roomId).toBe("market");
  });

  it("should not change world state when feasibility check fails", async () => {
    const world = setupWorld();
    world.contentPool.terrainConfig = [
      { terrain: "plain", label: "平原", baseCost: 50, speedMod: 1, danger: 0, requires: [] },
    ];
    const player = world.entities.get("p1");
    if (!player || !("needs" in player)) throw new Error("player not found");
    const restNeed = player.needs.find((n) => n.type === "rest");
    if (!restNeed) throw new Error("rest need not found");
    restNeed.value = 10;
    const originalRest = restNeed.value;

    const engine = new RoundEngine(world, new EventBus(), stubDispatcher(), stubSimulation());
    await engine.executeStructuredCommand("p1", "move", { direction: "north" });

    // 精力值不应改变（delta 未 apply）
    expect(restNeed.value).toBe(originalRest);
  });

  it("should allow move when rest is sufficient", async () => {
    const world = setupWorld();
    const engine = new RoundEngine(world, new EventBus(), stubDispatcher(), stubSimulation());
    const result = await engine.executeStructuredCommand("p1", "move", { direction: "north" });

    expect(result.events[0].type).toBe("move");
    const player = world.entities.get("p1");
    expect(player?.roomId).toBe("tavern");
  });

  it("should allow end_day even at 0 rest", async () => {
    const world = setupWorld();
    const player = world.entities.get("p1");
    if (!player || !("needs" in player)) throw new Error("player not found");
    const restNeed = player.needs.find((n) => n.type === "rest");
    if (!restNeed) throw new Error("rest need not found");
    restNeed.value = 0;

    const engine = new RoundEngine(world, new EventBus(), stubDispatcher(), stubSimulation());
    const result = await engine.executeStructuredCommand("p1", "end_day", {});

    expect(result.ended).toBe(true);
  });

  it("should reject commands from already-ended players", async () => {
    const world = setupWorld();
    const engine = new RoundEngine(world, new EventBus(), stubDispatcher(), stubSimulation());

    // End the day first
    await engine.executeStructuredCommand("p1", "end_day", {});

    // Try to act after ended — should get an ended result
    const result = await engine.executeStructuredCommand("p1", "look", {});

    // Player should not be able to act
    expect(result.ended).toBe(true);
    expect(result.events[0].type).toBe("system");
  });
});

describe("RoundEngine — 完整对话链路 (LLM + ContentPool + Ripple)", () => {
  it("talk 完整链路: dialogue + relation + need + ripple 全部出现在 events", async () => {
    const world = setupWorldWithObserver();
    const llmDelta: SimulationDelta = {
      dialogues: [
        { speakerId: "npc1", content: "最近不太平，东山有兽人。", roomId: "tavern", tick: 0 },
      ],
      relationChanges: [{ fromId: "p1", toId: "npc1", delta: 2 }],
      needChanges: [{ targetId: "npc1", needType: "social", delta: 3 }],
      worldEvents: [
        {
          id: "info_1",
          type: "information",
          title: "警告",
          description: "东山有兽人",
          scope: "tavern",
          tick: 0,
          source: "llm",
          data: {},
        },
      ],
    };
    const gen = mockDialogueGenerator(llmDelta);
    const engine = new RoundEngine(world, new EventBus(), stubDispatcher(), stubSimulation());
    engine.setDialogueGenerator(gen);

    const result = await engine.executeStructuredCommand("p1", "talk", {
      npcId: "npc1",
      optionId: "opt_1",
      optionLabel: "有什么要注意的？",
    });

    // 应包含: dialogue(1) + information(1) + relation(1: 聚合) + need(1+: 聚合) + observer_reaction(1)
    const dialogueEvents = result.events.filter((e) => e.type === "dialogue");
    const infoEvents = result.events.filter((e) => e.type === "information");
    const relEvents = result.events.filter((e) => e.type === "relation");
    const needEvents = result.events.filter((e) => e.type === "need");
    const rippleEvents = result.events.filter((e) => e.type === "observer_reaction");

    expect(dialogueEvents).toHaveLength(1);
    expect(infoEvents).toHaveLength(1);
    expect(relEvents.length).toBeGreaterThanOrEqual(1); // 聚合后 1 行
    expect(needEvents.length).toBeGreaterThanOrEqual(1);
    // NPC 需求变化已聚合
    expect(needEvents.some((e) => e.description.includes("周围的人"))).toBe(true);
    expect(rippleEvents).toHaveLength(1);

    // 世界状态也应正确
    const player = world.entities.get("p1");
    if (!player) throw new Error("player not found");

    const rel = (player as NPCEntity).relations.find((r) => r.targetId === "npc1");
    expect(rel?.level).toBe(2);
    const npc = world.entities.get("npc1");
    if (!npc) throw new Error("npc not found");

    expect((npc as NPCEntity).needs.find((n) => n.type === "social")?.value).toBe(53);
  });

  it("talk 无 LLM delta (初始 talk): 不产生 dialogue 事件，返回 needsDialogueOptions", async () => {
    const world = setupWorldWithNPC();
    const engine = new RoundEngine(world, new EventBus(), stubDispatcher(), stubSimulation());

    const result = await engine.executeStructuredCommand("p1", "talk", { npcId: "npc1" });

    // 初始 talk 不应有 dialogue 事件 (LLM 未参与)
    const dialogueEvents = result.events.filter((e) => e.type === "dialogue");
    expect(dialogueEvents).toHaveLength(0);

    // 应返回 needsDialogueOptions 信号
    expect(result.needsDialogueOptions).toBeDefined();
    expect(result.needsDialogueOptions?.npcId).toBe("npc1");
  });

  it("talk 无 observer: 无 observer_reaction 事件，只有 LLM 产出", async () => {
    const world = setupWorldWithNPC();
    const llmDelta: SimulationDelta = {
      dialogues: [{ speakerId: "npc1", content: "你好", roomId: "tavern", tick: 0 }],
      relationChanges: [{ fromId: "p1", toId: "npc1", delta: 1 }],
    };
    const gen = mockDialogueGenerator(llmDelta);
    const engine = new RoundEngine(world, new EventBus(), stubDispatcher(), stubSimulation());
    engine.setDialogueGenerator(gen);

    const result = await engine.executeStructuredCommand("p1", "talk", {
      npcId: "npc1",
      optionId: "opt_1",
      optionLabel: "你好",
    });

    const rippleEvents = result.events.filter((e) => e.type === "observer_reaction");
    expect(rippleEvents).toHaveLength(0);

    const dialogueEvents = result.events.filter((e) => e.type === "dialogue");
    expect(dialogueEvents).toHaveLength(1);
  });

  it("talk + subOptions → 返回 needsDialogueOptions + dialogueOptions", async () => {
    const world = setupWorldWithNPC();
    const subOptions = [
      { id: "chat:followup_0", label: "继续聊", type: "idle_chat" },
      { id: "chat:goodbye", label: "告别", type: "close" },
    ];
    const delta: SimulationDelta = {
      dialogues: [{ speakerId: "npc1", content: "今天酒馆很热闹。", roomId: "tavern", tick: 0 }],
    };
    const gen = mockDialogueGeneratorWithSubOptions(delta, subOptions);
    const engine = new RoundEngine(world, new EventBus(), stubDispatcher(), stubSimulation());
    engine.setDialogueGenerator(gen);

    const result = await engine.executeStructuredCommand("p1", "talk", {
      npcId: "npc1",
      optionId: "chat:followup_0",
      optionLabel: "继续聊",
      optionType: "idle_chat",
    });

    expect(result.needsChatOptions).toBeDefined();
    expect(result.needsChatOptions!.npcId).toBe("npc1");
    expect(result.chatSubOptions!.length).toBe(2);
    expect(result.chatSubOptions![0].label).toBe("继续聊");
    expect(result.chatSubOptions![1].label).toBe("告别");
  });
});

// ============================================================
// RoundEngine — 脉冲战斗集成
// ============================================================

describe("RoundEngine — pulse integration", () => {
  it("非脉冲 tick (tick=1) 不触发 combat pulse", async () => {
    const world = setupWorld();
    world.tick = 1;
    const player = createPlayer("p1", "赵行舟", "market", world.contentPool);
    player.combatState.combatTarget = null;
    addEntity(world, player);

    const engine = new RoundEngine(world, new EventBus(), stubDispatcher(), stubSimulation());
    await engine.settleDay({
      onReportReady: vi.fn(),
      onRoundStart: vi.fn(),
      onSettlementStarted: () => {},
      onActionResult: vi.fn(),
      getPlayerIds: () => ["p1"],
    });

    // 世界应正常推进，不崩溃
    expect(world.round).toBe(1);
  });

  it("脉冲 tick (tick=3) 无战斗实体时不崩溃", async () => {
    const world = setupWorld();
    world.tick = 3;
    const player = createPlayer("p1", "赵行舟", "market", world.contentPool);
    player.combatState.combatTarget = null;
    addEntity(world, player);

    const engine = new RoundEngine(world, new EventBus(), stubDispatcher(), stubSimulation());
    await engine.settleDay({
      onReportReady: vi.fn(),
      onRoundStart: vi.fn(),
      onSettlementStarted: () => {},
      onActionResult: vi.fn(),
      getPlayerIds: () => ["p1"],
    });

    expect(world.round).toBe(1);
  });

  it("shouldPulse — tick % 3 === 0 返回 true", async () => {
    const { shouldPulse } = await import("../combat/pulse.ts");
    const world = setupWorld();
    world.tick = 3;
    expect(shouldPulse(world, world.contentPool.combatConfig)).toBe(true);
  });

  it("shouldPulse — tick=0 返回 false", async () => {
    const { shouldPulse } = await import("../combat/pulse.ts");
    const world = setupWorld();
    world.tick = 0;
    expect(shouldPulse(world, world.contentPool.combatConfig)).toBe(false);
  });

  it("shouldPulse — tick=1 (非脉冲) 返回 false", async () => {
    const { shouldPulse } = await import("../combat/pulse.ts");
    const world = setupWorld();
    world.tick = 1;
    expect(shouldPulse(world, world.contentPool.combatConfig)).toBe(false);
  });
});

// ── 战斗后效管线 ──

describe("RoundEngine — 战斗后效管线 (resolveCombatConsequences)", () => {
  it("攻击后 HP ≤ 0 → rCC 触发虚弱", async () => {
    const world = setupWorldWithNPC();
    const player = world.entities.get("p1") as PlayerEntity;
    const npc = world.entities.get("npc1") as NPCEntity;

    // NPC HP 设为 1，一击必倒
    npc.combatState.hp = 1;
    npc.combatState.maxHp = 50;
    npc.combatState.combatTarget = "p1";
    player.combatState.combatTarget = "npc1";

    const engine = new RoundEngine(world, new EventBus(), stubDispatcher(), stubSimulation());
    const result = await engine.executeStructuredCommand("p1", "attack", { targetId: "npc1" });

    // rCC 应触发 NPC 虚弱（HP ≤ 0）
    expect(npc.combatState.isIncapacitated).toBe(true);
    expect(npc.combatState.combatTarget).toBeNull();
    // 虚弱事件已推送到 events
    const defeatEvents = result.events.filter(
      (e) => e.type === "combat_victory" || e.type === "combat_defeat",
    );
    expect(defeatEvents.length).toBeGreaterThanOrEqual(1);
  });

  it("攻击消耗 rest 到 0 → 力竭虚弱 + 当天结束", async () => {
    const world = setupWorldWithNPC();
    const player = world.entities.get("p1") as PlayerEntity;
    const npc = world.entities.get("npc1") as NPCEntity;

    // 玩家 rest = 1，攻击消耗 1 → rest = 0 → 力竭
    const restNeed = player.needs.find((n) => n.type === "rest");
    if (!restNeed) throw new Error("rest need not found");
    restNeed.value = 1;

    player.combatState.combatTarget = "npc1";
    npc.combatState.combatTarget = "p1";

    const engine = new RoundEngine(world, new EventBus(), stubDispatcher(), stubSimulation());
    const result = await engine.executeStructuredCommand("p1", "attack", { targetId: "npc1" });

    // 力竭虚弱
    expect(player.combatState.isIncapacitated).toBe(true);
    expect(player.combatState.hp).toBe(0);
    expect(player.combatState.combatTarget).toBeNull();
    // 当天结束
    expect(result.ended).toBe(true);
  });

  it("虚弱者 → 任何动作立即结束", async () => {
    const world = setupWorldWithNPC();
    const player = world.entities.get("p1") as PlayerEntity;

    player.combatState.isIncapacitated = true;
    player.combatState.hp = 0;

    const engine = new RoundEngine(world, new EventBus(), stubDispatcher(), stubSimulation());
    const result = await engine.executeStructuredCommand("p1", "status", {});

    expect(result.ended).toBe(true);
  });

  it("非战斗场景 rest ≤ 10 → 自动结束 + 清理战斗状态", async () => {
    const world = setupWorldWithNPC();
    const player = world.entities.get("p1") as PlayerEntity;

    const restNeed = player.needs.find((n) => n.type === "rest");
    if (!restNeed) throw new Error("rest need not found");
    restNeed.value = 10;
    player.combatState.combatTarget = "npc1";
    player.combatState.isDefending = true;

    const engine = new RoundEngine(world, new EventBus(), stubDispatcher(), stubSimulation());
    const result = await engine.executeStructuredCommand("p1", "status", {});

    expect(result.ended).toBe(true);
    expect(player.combatState.combatTarget).toBeNull();
    expect(player.combatState.isDefending).toBe(false);
  });
});
