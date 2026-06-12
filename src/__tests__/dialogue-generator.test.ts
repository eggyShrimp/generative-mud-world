import { describe, expect, it, vi } from "vitest";
import type { NPCEntity, PlayerEntity } from "../core/types.ts";
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
import type { LLMAdapter } from "../llm/adapter.ts";
import { DialogueGenerator } from "../llm/dialogue-generator.ts";

function mockAdapter(
  responseText: string,
  toolCalls?: Array<{ id: string; function: { name: string; arguments: string } }>,
) {
  return {
    chat: vi.fn().mockResolvedValue({ text: responseText, toolCalls }),
    generate: vi.fn().mockResolvedValue({ text: responseText, toolCalls }),
  } as unknown as LLMAdapter;
}

function setupWorld(opts?: { npcTags?: string[]; npcInventory?: boolean }) {
  const world = createWorld();
  world.contentPool.conversationDirections = [
    { key: "personal_story", instruction: "询问NPC背景或个人过往经历" },
    { key: "world_rumor", instruction: "打听当地流言或近期事件" },
  ];
  addRegion(world, {
    id: "test",
    name: "test",
    dominantCulture: "test",
    prosperity: 50,
    threatLevel: 10,
  });
  const room = createRoom("tavern", "酒馆", "test", "昏暗的酒馆");
  addRoom(world, room);
  const player = createPlayer("p1", "赵行舟", "tavern", world.contentPool);
  addEntity(world, player);

  const npcOverrides: Partial<NPCEntity> = {
    name: "老马",
    roomId: "tavern",
    npcTier: "core",
    personality: "热情",
    mood: 50,
    memories: [],
    needs: [{ type: "hunger", value: 50, baseUrgency: 5, decayRate: 2 }],
    traits: [],
    schedule: [],
    relations: [],
    availableActions: [],
    inventory: opts?.npcInventory
      ? [createItem("sword1", "铁剑", "test_sword", { atkBonus: 5 }, "npc1")]
      : [],
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
    tags: opts?.npcTags,
  };
  const npc = createNPC("npc1", npcOverrides);
  addEntity(world, npc);

  // Set up entityActionsByTag for functional tests
  if (opts?.npcTags) {
    for (const tag of opts.npcTags) {
      world.contentPool.entityActionsByTag[tag] = ["serve_ale", "serve_meal"];
      world.contentPool.entityActionLabels.serve_ale = "来一杯麦酒";
      world.contentPool.entityActionLabels.serve_meal = "来一份热餐";
      world.contentPool.entityTagLabels[tag] = "酒馆老板";
    }
  }

  return world;
}

// ============================================================
// generateFixedChatMenu — 固定菜单生成
// ============================================================

describe("DialogueGenerator.generateFixedChatMenu", () => {
  it("NPC 有 inventory → 固定菜单不含交易入口", () => {
    const world = setupWorld({ npcInventory: true });
    const gen = new DialogueGenerator(mockAdapter(""));
    const options = gen.generateFixedChatMenu(world, "p1", "npc1");
    expect(options.every((o) => o.type !== "functional_menu")).toBe(true);
  });

  it("NPC 无 inventory → 固定菜单为空", () => {
    const world = setupWorld();
    const gen = new DialogueGenerator(mockAdapter(""));
    const options = gen.generateFixedChatMenu(world, "p1", "npc1");
    expect(options).toHaveLength(0);
  });

  it("NPC tags 匹配 entityActionsByTag → 包含 functional_menu", () => {
    const world = setupWorld({ npcTags: ["tavern_keeper"] });
    const gen = new DialogueGenerator(mockAdapter(""));
    const options = gen.generateFixedChatMenu(world, "p1", "npc1");
    const func = options.find((o) => o.type === "functional_menu");
    expect(func).toBeDefined();
    expect(func!.label).toBe("酒馆老板");
  });

  it("NPC 无 tags → 不含 functional_menu", () => {
    const world = setupWorld();
    const gen = new DialogueGenerator(mockAdapter(""));
    const options = gen.generateFixedChatMenu(world, "p1", "npc1");
    expect(options.find((o) => o.type === "functional_menu")).toBeUndefined();
  });

  it("conversationDirections 不进入固定菜单", () => {
    const world = setupWorld();
    const gen = new DialogueGenerator(mockAdapter(""));
    const options = gen.generateFixedChatMenu(world, "p1", "npc1");
    const chat = options.filter((o) => o.type === "idle_chat");
    expect(chat).toEqual([]);
  });

  it("固定菜单只包含系统入口（functional）", () => {
    const world = setupWorld({ npcTags: ["tavern_keeper"] });
    const gen = new DialogueGenerator(mockAdapter(""));
    const options = gen.generateFixedChatMenu(world, "p1", "npc1");
    expect(options.map((o) => o.type)).toEqual(["functional_menu"]);
  });

  it("generateMenu: LLM 包装 conversationDirections，并追加 freeform", async () => {
    const world = setupWorld({ npcTags: ["tavern_keeper"] });
    const gen = new DialogueGenerator(
      mockAdapter(`{
        "options": [
          {"key": "personal_story", "label": "法显，你为何踏上这条路？"},
          {"key": "world_rumor", "label": "最近敦煌可有什么传闻？"},
          {"key": "freeform", "label": "你怎么看这座莫高窟？"}
        ]
      }`),
    );

    const options = await gen.generateChatMenu(world, "p1", "npc1");

    expect(options.map((o) => o.type)).toEqual([
      "functional_menu",
      "idle_chat",
      "idle_chat",
      "idle_chat",
    ]);
    expect(options.slice(1)).toEqual([
      {
        id: "chat:personal_story",
        label: "法显，你为何踏上这条路？",
        type: "idle_chat",
        meta: { directionKey: "personal_story" },
      },
      {
        id: "chat:world_rumor",
        label: "最近敦煌可有什么传闻？",
        type: "idle_chat",
        meta: { directionKey: "world_rumor" },
      },
      {
        id: "chat:freeform",
        label: "你怎么看这座莫高窟？",
        type: "idle_chat",
        meta: { freeform: true },
      },
    ]);
  });

  it("generateMenu: LLM 失败时退回内容池方向", async () => {
    const world = setupWorld({ npcTags: ["tavern_keeper"] });
    const adapter = mockAdapter("not json");
    const options = await new DialogueGenerator(adapter).generateChatMenu(world, "p1", "npc1");

    expect(options).toHaveLength(3);
    expect(options.slice(1).map((o) => o.label)).toEqual([
      "询问NPC背景或个人过往经历",
      "打听当地流言或近期事件",
    ]);
  });

  it("NPC 不存在 → 返回空", () => {
    const world = setupWorld();
    const gen = new DialogueGenerator(mockAdapter(""));
    const options = gen.generateFixedChatMenu(world, "p1", "nonexistent");
    expect(options).toHaveLength(0);
  });

  it("player 不存在 → 返回空", () => {
    const world = setupWorld();
    const gen = new DialogueGenerator(mockAdapter(""));
    const options = gen.generateFixedChatMenu(world, "nonexistent", "npc1");
    expect(options).toHaveLength(0);
  });

  it("eligible storyline → quest 方向注入 LLM 对话方向", async () => {
    const world = setupWorld();
    world.contentPool.questTemplates = [
      {
        id: "story_1",
        title: "酒馆的麻烦",
        description: "老马需要帮助",
        giverNpcId: "npc1",
        objectives: [
          { groupId: 0, type: "talk", targetId: "npc1", count: 1, description: "找老马谈谈" },
        ],
        rewards: {},
        repeatable: false,
        deadlineDays: null,
        stages: [
          {
            id: "s1",
            title: "开始",
            questIds: ["q1"],
            completionCondition: "all",
            narrativeGuide: "",
          },
        ],
        autoTrigger: {
          type: "player_action",
          conditions: [{ action: "talk", targetId: "npc1" }],
        },
      },
    ];
    const adapter = mockAdapter(
      JSON.stringify({
        options: [{ key: "quest_trigger__story_1", label: "听说你有麻烦？" }],
      }),
    );
    const gen = new DialogueGenerator(adapter);
    const options = await gen.generateChatMenu(world, "p1", "npc1");
    expect(options.find((o) => o.type === "quest_trigger_menu")).toBeDefined();
  });

  it("player 已完成 storyline → 不含 quest_trigger_menu", () => {
    const world = setupWorld();
    world.contentPool.questTemplates = [
      {
        id: "story_1",
        title: "酒馆的麻烦",
        description: "老马需要帮助",
        giverNpcId: "npc1",
        objectives: [],
        rewards: {},
        repeatable: false,
        deadlineDays: null,
        stages: [
          {
            id: "s1",
            title: "开始",
            questIds: ["q1"],
            completionCondition: "all",
            narrativeGuide: "",
          },
        ],
        autoTrigger: {
          type: "player_action",
          conditions: [{ action: "talk", targetId: "npc1" }],
        },
      },
    ];
    (world.entities.get("p1") as PlayerEntity).completedQuests = ["story_1"];
    const gen = new DialogueGenerator(mockAdapter(""));
    const options = gen.generateFixedChatMenu(world, "p1", "npc1");
    expect(options.find((o) => o.type === "quest_trigger_menu")).toBeUndefined();
  });

  it("player 有可交付的 activeQuest → quest 方向注入 LLM 对话方向", async () => {
    const world = setupWorld();
    world.contentPool.questTemplates = [
      {
        id: "q1",
        title: "送信",
        description: "把信送给老马",
        giverNpcId: "npc1",
        objectives: [
          { groupId: 0, type: "talk", targetId: "npc1", count: 1, description: "和老马说话" },
        ],
        rewards: {},
        repeatable: false,
        deadlineDays: null,
      },
    ];
    const player = world.entities.get("p1") as PlayerEntity;
    player.activeQuests = [
      {
        templateId: "q1",
        status: "active",
        acceptedDay: 1,
        deadlineDay: null,
        groupCompleted: [true],
        objectiveProgress: [1],
      },
    ];
    const adapter = mockAdapter(
      JSON.stringify({
        options: [{ key: "quest_deliver__q1", label: "信送到了！" }],
      }),
    );
    const gen = new DialogueGenerator(adapter);
    const options = await gen.generateChatMenu(world, "p1", "npc1");
    expect(options.find((o) => o.type === "quest_deliver_menu")).toBeDefined();
  });
});

// ============================================================
// handleOption — trade
// ============================================================

describe("DialogueGenerator.generateTradeMenu + handleTradeAction — buy", () => {
  function setupWithTrade(opts?: {
    itemValue?: number;
    startCoins?: number;
    npcTraits?: Array<{ name: string; value: number }>;
    relationLevel?: number;
    relationLabel?: string;
  }) {
    const world = setupWorld({ npcInventory: true });
    const templateId = "test_sword";
    const itemValue = opts?.itemValue ?? 10;

    world.contentPool.itemTemplates.push({
      id: templateId,
      name: "铁剑",
      properties: { value: itemValue },
    });

    const npc = world.entities.get("npc1") as NPCEntity;
    npc.inventory[0].templateId = templateId;
    npc.inventory[0].name = "铁剑";
    npc.inventory[0].description = "一柄结实的铁剑";

    if (opts?.npcTraits) {
      npc.traits = opts.npcTraits;
    }

    const player = world.entities.get("p1") as PlayerEntity;

    if (opts?.relationLevel !== undefined) {
      player.relations = [
        {
          targetId: "npc1",
          level: opts.relationLevel,
          label: opts.relationLabel ?? "熟人",
          lastInteractionTick: 0,
        },
      ];
    }

    if (opts?.startCoins !== undefined) {
      player.inventory = [];
      for (let i = 0; i < opts.startCoins; i++) {
        player.inventory.push({
          id: `p1_coin_${i}`,
          type: "item" as const,
          name: "铜币",
          description: "铜币",
          roomId: null,
          containerId: null,
          ownerId: "p1",
          templateId: "copper_coin",
          properties: { currency: true },
        });
      }
    }

    return world;
  }

  it("generateTradeMenu → 显示价格", () => {
    const world = setupWithTrade();
    const gen = new DialogueGenerator(mockAdapter(""));
    const options = gen.generateTradeMenu(world, "p1", "npc1");
    expect(options).toHaveLength(2); // 1 item + 1 sell entry
    expect(options[0].action).toBe("buy");
    expect(options[0].label).toContain("铁剑");
    expect(options[0].label).toContain("10");
    expect(options[0].meta?.price).toBe(10);
    expect(options[0].meta?.itemId).toBe("sword1");
    expect(options[0].meta?.itemDescription).toBe("一柄结实的铁剑");
    expect(options[0].meta?.itemPropertiesText).toBe("攻击：5");
    expect(options[1].action).toBe("sell_menu");
    expect(options[1].label).toBe("卖出物品");
  });

  it("handleTradeAction buy → 正常购买（扣铜币 + 转物品）", async () => {
    const world = setupWithTrade({ startCoins: 15 });
    const gen = new DialogueGenerator(mockAdapter("成交了"));
    const result = await gen.handleTradeAction(world, "p1", "npc1", "buy", "sword1");
    expect(result.delta.dialogues).toBeDefined();
    expect(result.delta.dialogues![0].content).toBe("成交了");
    const ics = result.delta.itemChanges!;
    const coinRemoves = ics.filter(
      (c) => c.templateId === "copper_coin" && c.operation === "remove",
    );
    expect(coinRemoves).toHaveLength(10);
    const itemRemove = ics.find((c) => c.templateId === "test_sword" && c.operation === "remove");
    const itemAdd = ics.find((c) => c.templateId === "test_sword" && c.operation === "add");
    expect(itemRemove?.targetId).toBe("npc1");
    expect(itemAdd?.targetId).toBe("p1");
  });

  it("handleTradeAction buy → 钱不够", async () => {
    const world = setupWithTrade({ startCoins: 3 });
    const gen = new DialogueGenerator(mockAdapter("你钱不够"));
    const result = await gen.handleTradeAction(world, "p1", "npc1", "buy", "sword1");
    expect(result.delta.itemChanges).toBeUndefined();
    expect(result.delta.dialogues![0].content).toBe("你钱不够");
  });

  it("handleTradeAction buy → 豪爽打折（generous NPC + 高关系）", async () => {
    const world = setupWithTrade({
      itemValue: 10,
      startCoins: 8,
      npcTraits: [{ name: "generous", value: 5 }],
      relationLevel: 80,
    });
    const gen = new DialogueGenerator(mockAdapter("算了，差一点当交朋友"));
    const result = await gen.handleTradeAction(world, "p1", "npc1", "buy", "sword1");
    expect(result.delta.dialogues).toBeDefined();
    const ics = result.delta.itemChanges!;
    const coinRemoves = ics.filter(
      (c) => c.templateId === "copper_coin" && c.operation === "remove",
    );
    expect(coinRemoves).toHaveLength(8);
  });

  it("handleTradeAction buy → 挚友白送（generous NPC + 极高关系 + 便宜物品）", async () => {
    const world = setupWithTrade({
      itemValue: 3,
      startCoins: 1,
      npcTraits: [{ name: "generous", value: 5 }],
      relationLevel: 95,
    });
    const gen = new DialogueGenerator(mockAdapter("送你吧"));
    const result = await gen.handleTradeAction(world, "p1", "npc1", "buy", "sword1");
    expect(result.delta.dialogues).toBeDefined();
    const ics = result.delta.itemChanges!;
    const coinRemoves = ics.filter(
      (c) => c.templateId === "copper_coin" && c.operation === "remove",
    );
    expect(coinRemoves).toHaveLength(0);
  });

  it("handleTradeAction buy 物品不存在 → 返回空 delta", async () => {
    const world = setupWithTrade();
    const gen = new DialogueGenerator(mockAdapter(""));
    const result = await gen.handleTradeAction(world, "p1", "npc1", "buy", "nonexistent");
    expect(result.delta.itemChanges).toBeUndefined();
  });

  it("handleTradeAction buy 物品无 value → 返回空 delta", async () => {
    const world = setupWorld({ npcInventory: true });
    const gen = new DialogueGenerator(mockAdapter(""));
    const result = await gen.handleTradeAction(world, "p1", "npc1", "buy", "sword1");
    expect(result.delta.itemChanges).toBeUndefined();
  });
});

// ============================================================
// handleOption — trade sell
// ============================================================

describe("DialogueGenerator.handleTradeAction — sell", () => {
  function setupSellTest(opts?: {
    npcCoins?: number;
    relationLevel?: number;
    playerItemValue?: number;
  }) {
    const world = setupWorld({ npcInventory: true });
    const templateId = "test_gem";

    world.contentPool.itemTemplates.push({
      id: templateId,
      name: "玉石料",
      properties: { value: opts?.playerItemValue ?? 10 },
    });

    const npc = world.entities.get("npc1") as NPCEntity;
    npc.inventory[0].properties.templateId = "test_sword";
    world.contentPool.itemTemplates.push({
      id: "test_sword",
      name: "铁剑",
      properties: { value: 5 },
    });

    if (opts?.npcCoins !== undefined) {
      npc.inventory = [];
      for (let i = 0; i < opts.npcCoins; i++) {
        npc.inventory.push({
          id: `npc1_coin_${i}`,
          type: "item" as const,
          name: "铜币",
          description: "铜币",
          roomId: null,
          containerId: null,
          ownerId: "npc1",
          templateId: "copper_coin",
          properties: { currency: true },
        });
      }
    }

    const player = world.entities.get("p1") as PlayerEntity;
    player.inventory = [];
    for (let i = 0; i < 5; i++) {
      player.inventory.push({
        id: `p1_coin_${i}`,
        type: "item" as const,
        name: "铜币",
        description: "铜币",
        roomId: null,
        containerId: null,
        ownerId: "p1",
        templateId: "copper_coin",
        properties: { currency: true },
      });
    }
    player.inventory.push({
      id: "p1_gem",
      type: "item" as const,
      name: "玉石料",
      description: "一块玉石料",
      roomId: null,
      containerId: null,
      ownerId: "p1",
      templateId,
      properties: {},
    });

    if (opts?.relationLevel !== undefined) {
      player.relations = [
        {
          targetId: "npc1",
          level: opts.relationLevel,
          label: "熟人",
          lastInteractionTick: 0,
        },
      ];
    }

    return world;
  }

  it("generateTradeMenu → 列出玩家可卖物品（排除铜币）", () => {
    const world = setupSellTest();
    const gen = new DialogueGenerator(mockAdapter(""));
    const options = gen.generateTradeMenu(world, "p1", "npc1");
    // generateTradeMenu 返回 NPC 商品 + 卖出入口，不含玩家物品
    // 卖出入口是 sell_menu 类型
    const sellEntry = options.find((o) => o.action === "sell_menu");
    expect(sellEntry).toBeDefined();
    expect(sellEntry!.label).toBe("卖出物品");
  });

  it("handleTradeAction sell → 成功卖出", async () => {
    const world = setupSellTest({ npcCoins: 15 });
    const gen = new DialogueGenerator(mockAdapter("好东西，我收了"));
    const result = await gen.handleTradeAction(world, "p1", "npc1", "sell", "p1_gem");
    expect(result.delta.dialogues).toBeDefined();
    const ics = result.delta.itemChanges!;
    const itemRemove = ics.find((c) => c.templateId === "test_gem" && c.operation === "remove");
    expect(itemRemove?.targetId).toBe("p1");
    const itemAdd = ics.find((c) => c.templateId === "test_gem" && c.operation === "add");
    expect(itemAdd?.targetId).toBe("npc1");
    const coinAdds = ics.filter((c) => c.templateId === "copper_coin" && c.operation === "add");
    expect(coinAdds).toHaveLength(6);
  });

  it("handleTradeAction sell → NPC 买不起", async () => {
    const world = setupSellTest({ npcCoins: 2 });
    const gen = new DialogueGenerator(mockAdapter("我买不起"));
    const result = await gen.handleTradeAction(world, "p1", "npc1", "sell", "p1_gem");
    expect(result.delta.itemChanges).toBeUndefined();
    expect(result.delta.dialogues![0].content).toBe("我买不起");
  });

  it("handleTradeAction sell → NPC 打折收货（高关系）", async () => {
    const world = setupSellTest({ npcCoins: 4, relationLevel: 85 });
    const gen = new DialogueGenerator(mockAdapter("钱不太够但交情好，有多少给多少"));
    const result = await gen.handleTradeAction(world, "p1", "npc1", "sell", "p1_gem");
    expect(result.delta.dialogues).toBeDefined();
    const ics = result.delta.itemChanges!;
    const coinAdds = ics.filter((c) => c.templateId === "copper_coin" && c.operation === "add");
    expect(coinAdds).toHaveLength(4);
  });
});

// ============================================================
// handleOption — trade pricing (关系影响)
// ============================================================

describe("DialogueGenerator.generateTradeMenu — pricing", () => {
  function setupPricingTest(relationLevel: number, startCoins = 20) {
    const world = setupWorld({ npcInventory: true });
    const templateId = "test_sword";

    world.contentPool.itemTemplates.push({
      id: templateId,
      name: "铁剑",
      properties: { value: 10 },
    });

    const npc = world.entities.get("npc1") as NPCEntity;
    npc.inventory[0].templateId = templateId;
    npc.inventory[0].name = "铁剑";

    const player = world.entities.get("p1") as PlayerEntity;
    player.inventory = [];
    for (let i = 0; i < startCoins; i++) {
      player.inventory.push({
        id: `p1_coin_${i}`,
        type: "item" as const,
        name: "铜币",
        description: "铜币",
        roomId: null,
        containerId: null,
        ownerId: "p1",
        templateId: "copper_coin",
        properties: { currency: true },
      });
    }

    player.relations = [
      {
        targetId: "npc1",
        level: relationLevel,
        label: relationLevel >= 80 ? "挚友" : relationLevel <= -70 ? "仇敌" : "陌生人",
        lastInteractionTick: 0,
      },
    ];

    return world;
  }

  it("挚友(100) → 买价打折", () => {
    const world = setupPricingTest(100, 20);
    const gen = new DialogueGenerator(mockAdapter(""));
    const options = gen.generateTradeMenu(world, "p1", "npc1");
    expect(options[0].label).toContain("8"); // 10 * 0.8 = 8
  });

  it("仇敌(-100) → 买价加价", () => {
    const world = setupPricingTest(-100, 20);
    const gen = new DialogueGenerator(mockAdapter(""));
    const options = gen.generateTradeMenu(world, "p1", "npc1");
    expect(options[0].label).toContain("12"); // 10 * 1.2 = 12
  });

  it("陌生人(0) → 标价不变", () => {
    const world = setupPricingTest(0, 20);
    const gen = new DialogueGenerator(mockAdapter(""));
    const options = gen.generateTradeMenu(world, "p1", "npc1");
    expect(options[0].label).toContain("10"); // 10 * 1.0 = 10
  });
});

// ============================================================
// handleOption — functional
// ============================================================

describe("DialogueGenerator.handleChatOption — functional", () => {
  it("functional_menu → 返回 entityActionsByTag 子菜单", async () => {
    const world = setupWorld({ npcTags: ["tavern_keeper"] });
    const gen = new DialogueGenerator(mockAdapter(""));
    const result = await gen.handleChatOption(
      world,
      "p1",
      "npc1",
      "functional_menu",
      "menu:functional",
    );
    expect(result.subOptions).toHaveLength(2);
    expect(result.subOptions![0].type).toBe("functional_select");
    expect(result.subOptions![0].meta?.actionId).toBe("serve_ale");
    expect(result.subOptions![1].meta?.actionId).toBe("serve_meal");
  });

  it("functional_select → 执行 actionEffect + LLM 对话", async () => {
    const world = setupWorld({ npcTags: ["tavern_keeper"] });
    world.contentPool.actionEffects = [
      { action: "serve_ale", needDeltas: { social: 5 }, itemDeltas: { ale: 1 } },
    ];
    const gen = new DialogueGenerator(mockAdapter("来，尝尝新酿的麦酒。"));
    const result = await gen.handleChatOption(
      world,
      "p1",
      "npc1",
      "functional_select",
      "functional:serve_ale",
    );
    expect(result.delta.needChanges).toBeDefined();
    expect(result.delta.itemChanges).toBeDefined();
    expect(result.delta.dialogues).toBeDefined();
    expect(result.delta.dialogues![0].content).toContain("麦酒");
  });

  it("functional_select actionId 不在 actionEffects → 返回空", async () => {
    const world = setupWorld({ npcTags: ["tavern_keeper"] });
    const gen = new DialogueGenerator(mockAdapter(""));
    const result = await gen.handleChatOption(
      world,
      "p1",
      "npc1",
      "functional_select",
      "functional:nonexistent",
    );
    expect(result.delta.needChanges).toBeUndefined();
  });
});

// ============================================================
// handleOption — idle_chat (LLM 对话 + 轻量 tool)
// ============================================================

describe("DialogueGenerator.handleChatOption — idle_chat", () => {
  it("返回 LLM 对话文本", async () => {
    const world = setupWorld();
    const adapter = mockAdapter("你好啊，年轻人。今天酒馆生意不错。");
    const gen = new DialogueGenerator(adapter);
    const result = await gen.handleChatOption(world, "p1", "npc1", "idle_chat", "menu:chat");
    expect(result.delta.dialogues).toBeDefined();
    expect(result.delta.dialogues![0].speakerId).toBe("npc1");
    expect(result.delta.dialogues![0].content).toContain("年轻人");
  });

  it("LLM 调用 shift_relation tool → 处理关系变化", async () => {
    const world = setupWorld();
    const toolCalls = [
      {
        id: "call_1",
        function: {
          name: "shift_relation",
          arguments: JSON.stringify({ direction: "positive", magnitude: "slight" }),
        },
      },
    ];
    const adapter = mockAdapter("聊得很开心。", toolCalls);
    const gen = new DialogueGenerator(adapter);
    const result = await gen.handleChatOption(world, "p1", "npc1", "idle_chat", "menu:chat");
    expect(result.delta.relationChanges).toBeDefined();
    expect(result.delta.relationChanges![0].delta).toBeGreaterThan(0);
  });

  it("LLM 调用 express_emotion tool → 生成情绪事件", async () => {
    const world = setupWorld();
    const toolCalls = [
      {
        id: "call_1",
        function: {
          name: "express_emotion",
          arguments: JSON.stringify({ emotion: "happy", target: "listener" }),
        },
      },
    ];
    const adapter = mockAdapter("（笑了笑）", toolCalls);
    const gen = new DialogueGenerator(adapter);
    const result = await gen.handleChatOption(world, "p1", "npc1", "idle_chat", "menu:chat");
    expect(result.delta.worldEvents).toBeDefined();
    expect(result.delta.worldEvents![0].type).toBe("emotion");
  });

  it("LLM 错误 → 返回 fallback delta", async () => {
    const world = setupWorld();
    const adapter = {
      chat: vi.fn().mockRejectedValue(new Error("LLM down")),
      generate: vi.fn(),
    } as unknown as LLMAdapter;
    const gen = new DialogueGenerator(adapter);
    const result = await gen.handleChatOption(world, "p1", "npc1", "idle_chat", "menu:chat");
    expect(result.delta.dialogues).toBeDefined();
    expect(result.delta.dialogues![0].content).toContain("困惑");
  });

  it("exchange_item tool call 被忽略（已移除）", async () => {
    const world = setupWorld();
    const toolCalls = [
      {
        id: "call_1",
        function: {
          name: "exchange_item",
          arguments: JSON.stringify({
            direction: "give",
            item_id: "x",
            item_name: "test",
            value: "small",
          }),
        },
      },
    ];
    const adapter = mockAdapter("给你这个。", toolCalls);
    const gen = new DialogueGenerator(adapter);
    const result = await gen.handleChatOption(world, "p1", "npc1", "idle_chat", "menu:chat");
    expect(result.delta.itemChanges).toBeUndefined();
  });

  it("activate_quest tool call 被忽略（已移除）", async () => {
    const world = setupWorld();
    const toolCalls = [
      {
        id: "call_1",
        function: {
          name: "activate_quest",
          arguments: JSON.stringify({ templateId: "story_1" }),
        },
      },
    ];
    const adapter = mockAdapter("我有个任务。", toolCalls);
    const gen = new DialogueGenerator(adapter);
    const result = await gen.handleChatOption(world, "p1", "npc1", "idle_chat", "menu:chat");
    expect(result.delta.questChanges).toBeUndefined();
  });

  it("多个 tool calls 组合处理", async () => {
    const world = setupWorld();
    const toolCalls = [
      {
        id: "call_1",
        function: {
          name: "shift_relation",
          arguments: JSON.stringify({ direction: "positive", magnitude: "moderate" }),
        },
      },
      {
        id: "call_2",
        function: {
          name: "express_emotion",
          arguments: JSON.stringify({ emotion: "happy", target: "listener" }),
        },
      },
    ];
    const adapter = mockAdapter("很开心的对话。", toolCalls);
    const gen = new DialogueGenerator(adapter);
    const result = await gen.handleChatOption(world, "p1", "npc1", "idle_chat", "menu:chat");
    expect(result.delta.relationChanges).toBeDefined();
    expect(result.delta.worldEvents).toBeDefined();
    expect(result.delta.dialogues).toBeDefined();
  });

  it("JSON 带 reply 字段 → 提取 reply 文本", async () => {
    const world = setupWorld();
    const adapter = mockAdapter('{"reply":"你好，年轻人。"}');
    const gen = new DialogueGenerator(adapter);
    const result = await gen.handleChatOption(world, "p1", "npc1", "idle_chat", "menu:chat");
    expect(result.delta.dialogues![0].content).toBe("你好，年轻人。");
  });
});

// ============================================================
// handleOption — 边缘情况
// ============================================================

describe("DialogueGenerator.handleChatOption — 边缘情况", () => {
  it("未知 optionType → 返回 fallback delta", async () => {
    const world = setupWorld();
    const gen = new DialogueGenerator(mockAdapter(""));
    const result = await gen.handleChatOption(world, "p1", "npc1", "unknown_type" as any, "x");
    expect(result.delta.dialogues).toBeDefined();
  });

  it("NPC 不存在 → 返回空", async () => {
    const world = setupWorld();
    const gen = new DialogueGenerator(mockAdapter(""));
    const result = await gen.handleChatOption(world, "p1", "nonexistent", "idle_chat", "menu:chat");
    expect(result.delta).toEqual({});
  });

  it("player 不存在 → 返回空", async () => {
    const world = setupWorld();
    const gen = new DialogueGenerator(mockAdapter(""));
    const result = await gen.handleChatOption(
      world,
      "nonexistent",
      "npc1",
      "idle_chat",
      "menu:chat",
    );
    expect(result.delta).toEqual({});
  });
});

// ============================================================
// handleOption — 连续对话 subOptions
// ============================================================

function mockAdapterWithTopics(
  reply: string,
  topics: string[],
  toolCalls?: Array<{ id: string; function: { name: string; arguments: string } }>,
) {
  const baseToolCalls = toolCalls ?? [];
  const allToolCalls = [
    ...baseToolCalls,
    {
      id: "call_topics",
      function: {
        name: "suggest_followup_topics",
        arguments: JSON.stringify({ topics }),
      },
    },
  ];
  return mockAdapter(reply, allToolCalls.length > 0 ? allToolCalls : undefined);
}

describe("DialogueGenerator.handleChatOption — 连续对话", () => {
  it("idle_chat 返回 subOptions：LLM 话题全部转换 + 告别在末位", async () => {
    const world = setupWorld();
    const topics = ["最近有什么事？", "这酒馆开了多久？", "你认识镇上的人吗？"];
    const adapter = mockAdapterWithTopics("今天酒馆很热闹。", topics);
    const gen = new DialogueGenerator(adapter);
    const result = await gen.handleChatOption(world, "p1", "npc1", "idle_chat", "menu:chat");

    expect(result.delta.dialogues).toBeDefined();
    expect(result.subOptions).toBeDefined();

    // LLM 话题全部转换为 idle_chat 类型选项
    const topicOptions = result.subOptions!.filter((o) => o.type === "idle_chat");
    expect(topicOptions.length).toBe(topics.length);
    expect(topicOptions.every((o) => topics.includes(o.label))).toBe(true);
    // id 按 chat:followup_<index> 规则生成
    for (let i = 0; i < topics.length; i++) {
      expect(topicOptions[i].id).toBe(`chat:followup_${i}`);
    }

    // 末项是告别
    const last = result.subOptions![result.subOptions!.length - 1];
    expect(last.type).toBe("close");
    expect(last.id).toBe("chat:goodbye");
  });

  it('idle_chat + "chat:goodbye" optionId → 不返回 subOptions', async () => {
    const world = setupWorld();
    const adapter = mockAdapterWithTopics("后会有期。", ["嗯，再见"]);
    const gen = new DialogueGenerator(adapter);
    const result = await gen.handleChatOption(world, "p1", "npc1", "idle_chat", "chat:goodbye");

    expect(result.delta.dialogues).toBeDefined();
    expect(result.subOptions).toBeUndefined();
  });

  it("LLM 未调用 suggest_followup_topics → 仅含系统注入 + 告别", async () => {
    const world = setupWorld({ npcInventory: true });
    const adapter = mockAdapter("今天没什么特别的。");
    const gen = new DialogueGenerator(adapter);
    const result = await gen.handleChatOption(world, "p1", "npc1", "idle_chat", "menu:chat");

    expect(result.subOptions).toBeDefined();
    const types = result.subOptions!.map((o) => o.type);
    // 无 LLM 话题，只有 close（告别）
    expect(types).toContain("close");
  });

  it("subOptions 不含系统注入选项（trade/quest 已独立）", async () => {
    const world = setupWorld({ npcInventory: true });
    const topics = ["看看你的货", "有什么好东西", "这些怎么卖"];
    const adapter = mockAdapterWithTopics("需要买点什么？", topics);
    const gen = new DialogueGenerator(adapter);
    const result = await gen.handleChatOption(world, "p1", "npc1", "idle_chat", "menu:chat");

    const types = result.subOptions!.map((o) => o.type);
    // LLM 话题
    expect(types.filter((t) => t === "idle_chat").length).toBe(topics.length);
    // 不含 trade_menu（交易已独立）
    expect(types).not.toContain("trade_menu");
    // 告别
    expect(types).toContain("close");
    // 顺序: LLM 话题 → 告别
    const goodbyeIdx = types.indexOf("close");
    expect(goodbyeIdx).toBeGreaterThanOrEqual(topics.length);
  });

  it("close 类型 → 返回告别 delta，不调 LLM", async () => {
    const world = setupWorld();
    const adapter = mockAdapter("");
    const gen = new DialogueGenerator(adapter);
    const result = await gen.handleChatOption(world, "p1", "npc1", "close", "chat:goodbye");

    expect(result.delta.dialogues).toBeDefined();
    expect(result.delta.dialogues![0].content).toContain("告别");
    expect(result.subOptions).toBeUndefined();
    // 验证未调用 LLM
    expect(adapter.chat).not.toHaveBeenCalled();
  });

  it("conversation history 在连续对话中追加", async () => {
    const world = setupWorld();
    const gen = new DialogueGenerator(mockAdapterWithTopics("我是老马。", ["你在哪工作？"]));

    // 第一轮
    await gen.handleChatOption(world, "p1", "npc1", "idle_chat", "menu:chat", "你是谁？");
    // 第二轮（验证不报错，prompt 内部应含历史）
    const result2 = await gen.handleChatOption(
      world,
      "p1",
      "npc1",
      "idle_chat",
      "chat:followup_0",
      "你在哪工作？",
    );
    expect(result2.delta.dialogues).toBeDefined();
  });

  it("close 类型 → 清除对话历史", async () => {
    const world = setupWorld();
    const gen = new DialogueGenerator(mockAdapter("再见。"));
    // 先建立一些历史
    await gen.handleChatOption(world, "p1", "npc1", "idle_chat", "menu:chat", "你好");
    // 告别 → 清除历史
    await gen.handleChatOption(world, "p1", "npc1", "close", "chat:goodbye");
    // 验证不报错（新的对话应该重新开始）
    const result = await gen.handleChatOption(
      world,
      "p1",
      "npc1",
      "idle_chat",
      "menu:chat",
      "又见面了",
    );
    expect(result.delta.dialogues).toBeDefined();
  });

  it("suggest_followup_topics 参数校验失败 → 降级空话题", async () => {
    const world = setupWorld();
    const adapter = {
      chat: vi.fn().mockResolvedValue({
        text: "你好",
        toolCalls: [
          {
            id: "call_1",
            function: {
              name: "suggest_followup_topics",
              arguments: JSON.stringify({ topics: "not-array" }),
            },
          },
        ],
      }),
      generate: vi.fn(),
    } as unknown as LLMAdapter;
    const gen = new DialogueGenerator(adapter);
    const result = await gen.handleChatOption(world, "p1", "npc1", "idle_chat", "menu:chat");

    // 降级：只有 告别（无系统注入因为没有 inventory/quests）
    expect(result.subOptions).toBeDefined();
    expect(result.subOptions!.length).toBe(1);
    expect(result.subOptions![0].label).toBe("告别");
  });
});
