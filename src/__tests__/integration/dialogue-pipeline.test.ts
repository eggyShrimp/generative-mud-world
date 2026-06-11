/**
 * 集成测试: 对话全链路
 *
 * 验证 talk → LLM reply → relation/need/event/memory 的完整管道:
 *   1. 初始 talk 返回 needsDialogueOptions
 *   2. talk + optionId 触发 dialogueGenerator.generateReply
 *   3. LLM delta 的 relationChanges / needChanges / events 正确应用到世界状态
 *   4. 社交涟漪 (observer_reaction) 在有旁观者时触发
 *   5. 记忆正确创建
 *   6. rest 消耗生效
 */
import { describe, expect, it } from "vitest";
import type { NPCEntity, SimulationDelta } from "../../core/types.ts";
import {
  createTestEngine,
  mockDialogueGeneratorWithSubOptions,
  setupWorldWithNPC,
  setupWorldWithObserver,
} from "../fixtures/integration-helpers.ts";
import {
  dialogueDeltaFull,
  dialogueDeltaSimple,
  dialogueDeltaWithItemExchange,
} from "../fixtures/llm-responses.ts";

describe("集成: 对话全链路", () => {
  it("初始 talk → needsDialogueOptions (不调 LLM)", async () => {
    const world = setupWorldWithNPC();
    const engine = createTestEngine(world);

    const result = await engine.executeStructuredCommand("p1", "talk", { npcId: "npc1" });

    const dialogueEvents = result.events.filter((e) => e.type === "dialogue");
    expect(dialogueEvents).toHaveLength(0);
    expect(result.needsDialogueOptions).toBeDefined();
    expect(result.needsDialogueOptions?.npcId).toBe("npc1");
  });

  it("talk + optionId → 对话 + 关系变化 + 需求变化 + 信息事件", async () => {
    const world = setupWorldWithNPC();
    const llmDelta = dialogueDeltaFull("npc1", "tavern");
    const engine = createTestEngine(world, { dialogueDelta: llmDelta });

    const result = await engine.executeStructuredCommand("p1", "talk", {
      npcId: "npc1",
      optionId: "opt_1",
      optionLabel: "有什么要注意的？",
    });

    // 1. 对话事件
    const dialogueEvents = result.events.filter((e) => e.type === "dialogue");
    expect(dialogueEvents).toHaveLength(1);
    expect(dialogueEvents[0].description).toContain("老马");
    expect(dialogueEvents[0].description).toContain("最近不太平");

    // 2. 关系变化事件
    const relEvents = result.events.filter((e) => e.type === "relation");
    expect(relEvents.length).toBeGreaterThanOrEqual(1);

    // 3. 需求变化事件
    const needEvents = result.events.filter((e) => e.type === "need");
    expect(needEvents.length).toBeGreaterThanOrEqual(1);

    // 4. 信息事件
    const infoEvents = result.events.filter((e) => e.type === "information");
    expect(infoEvents).toHaveLength(1);
    expect(infoEvents[0].description).toBe("东山有兽人");

    // 5. 世界状态验证: 关系
    const player = world.entities.get("p1")!;
    const rel = (player as NPCEntity).relations.find((r) => r.targetId === "npc1");
    expect(rel).toBeDefined();
    expect(rel?.level).toBe(2);

    // 6. 世界状态验证: NPC 需求
    const npc = world.entities.get("npc1") as NPCEntity;
    const social = npc.needs.find((n) => n.type === "social");
    expect(social?.value).toBe(53); // 初始 50 + 3

    // 7. 世界事件日志
    const infoLogs = world.eventLog.filter((e) => e.type === "information");
    expect(infoLogs.some((e) => e.description === "东山有兽人")).toBe(true);
  });

  it("talk + optionId: 轻量 delta (仅关系) → 无信息事件", async () => {
    const world = setupWorldWithNPC();
    const llmDelta = dialogueDeltaSimple("npc1", "tavern");
    const engine = createTestEngine(world, { dialogueDelta: llmDelta });

    const result = await engine.executeStructuredCommand("p1", "talk", {
      npcId: "npc1",
      optionId: "opt_1",
      optionLabel: "你好",
    });

    const infoEvents = result.events.filter((e) => e.type === "information");
    expect(infoEvents).toHaveLength(0);

    const dialogueEvents = result.events.filter((e) => e.type === "dialogue");
    expect(dialogueEvents).toHaveLength(1);

    // 世界状态: 关系 +1
    const player = world.entities.get("p1")!;
    const rel = (player as NPCEntity).relations.find((r) => r.targetId === "npc1");
    expect(rel?.level).toBe(1);
  });

  it("talk + 旁观者 → observer_reaction + 涟漪关系变化", async () => {
    const world = setupWorldWithObserver();
    const llmDelta: SimulationDelta = {
      dialogues: [{ speakerId: "npc1", content: "你好", roomId: "tavern", tick: 0 }],
    };
    const engine = createTestEngine(world, { dialogueDelta: llmDelta });

    const result = await engine.executeStructuredCommand("p1", "talk", {
      npcId: "npc1",
      optionId: "opt_1",
      optionLabel: "你好",
    });

    // 旁观者反应事件
    const rippleEvents = result.events.filter((e) => e.type === "observer_reaction");
    expect(rippleEvents).toHaveLength(1);
    expect(rippleEvents[0].description).toContain("老王");
    expect(rippleEvents[0].description).toContain("对话");

    // 旁观者关系变化
    const relEvents = result.events.filter(
      (e) => e.type === "relation" && e.description.includes("赵行舟"),
    );
    expect(relEvents.length).toBeGreaterThanOrEqual(1);
  });

  it("talk + 多旁观者 → 每个旁观者各自反应", async () => {
    const world = setupWorldWithObserver();
    // 添加第二个旁观者
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
      equipment: { weapon: null, armor: null },
    };
    world.entities.set("obs2", observer2);
    world.rooms.get("tavern")?.entities.add("obs2");

    const llmDelta: SimulationDelta = {
      dialogues: [{ speakerId: "npc1", content: "你好", roomId: "tavern", tick: 0 }],
    };
    const engine = createTestEngine(world, { dialogueDelta: llmDelta });

    const result = await engine.executeStructuredCommand("p1", "talk", {
      npcId: "npc1",
      optionId: "opt_1",
      optionLabel: "你好",
    });

    // 两个旁观者各有 reaction
    const rippleEvents = result.events.filter((e) => e.type === "observer_reaction");
    expect(rippleEvents).toHaveLength(2);
  });

  it("talk → rest 消耗生效", async () => {
    const world = setupWorldWithNPC();
    const player = world.entities.get("p1") as NPCEntity;
    const initialRest = player.needs.find((n) => n.type === "rest")?.value;

    const llmDelta: SimulationDelta = {
      dialogues: [{ speakerId: "npc1", content: "嗯", roomId: "tavern", tick: 0 }],
    };
    const engine = createTestEngine(world, { dialogueDelta: llmDelta });

    await engine.executeStructuredCommand("p1", "talk", {
      npcId: "npc1",
      optionId: "opt_1",
      optionLabel: "你好",
    });

    const afterRest = player.needs.find((n) => n.type === "rest")?.value;
    expect(afterRest).toBeLessThan(initialRest!);
  });

  it("talk → 记忆创建", async () => {
    const world = setupWorldWithNPC();
    const player = world.entities.get("p1") as NPCEntity;
    const initialMemories = player.memories.length;

    const llmDelta: SimulationDelta = {
      dialogues: [{ speakerId: "npc1", content: "你好", roomId: "tavern", tick: 0 }],
    };
    const engine = createTestEngine(world, { dialogueDelta: llmDelta });

    await engine.executeStructuredCommand("p1", "talk", {
      npcId: "npc1",
      optionId: "opt_1",
      optionLabel: "你好",
    });

    expect(player.memories.length).toBeGreaterThan(initialMemories);
  });

  it("talk → LLM 产出 itemChanges → composeDeltas 保留 → 物品已转移", async () => {
    const world = setupWorldWithNPC();
    const npc = world.entities.get("npc1") as NPCEntity;
    const player = world.entities.get("p1") as NPCEntity;

    // 给 NPC 一个草药，并注册到 world.entities
    const herb = {
      type: "item" as const,
      id: "herb_01",
      name: "草药",
      roomId: null,
      description: "一株草药",
      ownerId: "npc1",
      containerId: null,
      properties: { templateId: "herb_01" },
    };
    npc.inventory.push(herb as any);
    world.entities.set("herb_01", herb as any);

    const playerItemCountBefore = player.inventory.length;
    const npcItemCountBefore = npc.inventory.length;

    const llmDelta = dialogueDeltaWithItemExchange("npc1", "tavern", "herb_01", "草药");
    const engine = createTestEngine(world, { dialogueDelta: llmDelta });

    const result = await engine.executeStructuredCommand("p1", "talk", {
      npcId: "npc1",
      optionId: "opt_1",
      optionLabel: "我需要帮助",
    });

    // 对话事件存在
    const dialogueEvents = result.events.filter((e) => e.type === "dialogue");
    expect(dialogueEvents).toHaveLength(1);

    // 交换事件存在
    const exchangeEvents = result.events.filter((e) => e.type === "item_exchange");
    expect(exchangeEvents).toHaveLength(1);

    // 世界状态验证：NPC 失去物品，玩家获得物品
    expect(npc.inventory).toHaveLength(npcItemCountBefore - 1);
    expect(player.inventory).toHaveLength(playerItemCountBefore + 1);
    expect(player.inventory.some((i: any) => i.id === "herb_01")).toBe(true);
    expect(herb.ownerId).toBe("p1");
  });

  it("idle_chat 续对话: handleOption 返回 subOptions → needsDialogueOptions 含完整结构", async () => {
    const world = setupWorldWithNPC();
    const subOptions = [
      { id: "chat:followup_0", label: "打听传闻", type: "idle_chat" },
      { id: "chat:followup_1", label: "请求建议", type: "idle_chat" },
      { id: "chat:goodbye", label: "告别", type: "close" },
    ];
    const delta: SimulationDelta = {
      dialogues: [{ speakerId: "npc1", content: "东山有兽人出没。", roomId: "tavern", tick: 0 }],
    };
    const gen = mockDialogueGeneratorWithSubOptions(delta, subOptions);
    const engine = createTestEngine(world);
    engine.setDialogueGenerator(gen);

    const result = await engine.executeStructuredCommand("p1", "talk", {
      npcId: "npc1",
      optionId: "opt_1",
      optionLabel: "最近有什么传闻？",
      optionType: "idle_chat",
    });

    expect(result.needsDialogueOptions).toBeDefined();
    expect(result.dialogueOptions).toHaveLength(3);
    expect(result.dialogueOptions![2].type).toBe("close");
  });
});
