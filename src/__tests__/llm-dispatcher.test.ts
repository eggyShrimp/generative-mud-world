import { describe, expect, it, vi } from "vitest";
import {
  addEntity,
  addRegion,
  addRoom,
  createNPC,
  createRoom,
  createWorld,
} from "../core/world.ts";
import type { LLMAdapter } from "../llm/adapter.ts";
import { createTriggerDetector, InteractionDispatcher } from "../llm/dispatcher.ts";
import { parseMemoryCompressionOutput, parseWorldEventOutput } from "../llm/output-parser.ts";
import { buildDialoguePrompt } from "../llm/prompts/dialogue.ts";
import { buildMemoryCompressionPrompt } from "../llm/prompts/memory-compression.ts";
import { buildWorldEventPrompt } from "../llm/prompts/world-event.ts";

describe("TriggerDetector", () => {
  it("should trigger world_event at scheduled hours", () => {
    const world = createWorld();
    world.time.hour = 8;
    addRegion(world, {
      id: "test",
      name: "Test",
      dominantCulture: "test",
      prosperity: 50,
      threatLevel: 30,
    });

    const detector = createTriggerDetector();
    const triggers = detector.check(world);

    const worldEvents = triggers.filter((t) => t.type === "world_event");
    expect(worldEvents.length).toBeGreaterThan(0);
  });

  it("should trigger world_event every round", () => {
    const world = createWorld();
    world.time.hour = 3; // even at off-hours, always triggers now
    addRegion(world, {
      id: "test",
      name: "Test",
      dominantCulture: "test",
      prosperity: 50,
      threatLevel: 30,
    });

    const detector = createTriggerDetector();
    const triggers = detector.check(world);

    expect(triggers.filter((t) => t.type === "world_event").length).toBe(1);
  });

  it("should trigger memory compression for NPCs with many memories", () => {
    const world = createWorld();
    world.time.hour = 22;
    addRoom(world, createRoom("room_01", "Room", "test", ""));
    const npc = createNPC("npc_01", {
      npcTier: "core",
      roomId: "room_01",
      memories: Array.from({ length: 10 }, (_, i) => ({
        tick: i,
        content: `观察 ${i}`,
        importance: 0.3,
        type: "observation" as const,
      })),
    });
    addEntity(world, npc);

    const detector = createTriggerDetector();
    const triggers = detector.check(world);

    expect(triggers.filter((t) => t.type === "memory_compression").length).toBeGreaterThan(0);
  });
});

describe("Prompt builders", () => {
  it("buildWorldEventPrompt should include hotspots", () => {
    const { system, user } = buildWorldEventPrompt({
      era: "铁器时代",
      theme: "测试",
      recentEvents: [],
      hotspots: [{ region: "test", issue: "饥荒", severity: 0.9 }],
    });
    expect(system).toContain("世界模拟引擎");
    expect(user).toContain("test");
  });

  it("buildDialoguePrompt should include personality", () => {
    const { system, user } = buildDialoguePrompt({
      speaker: { name: "老铁", personality: "沉默寡言", mood: "neutral" },
      listener: { name: "冒险者" },
      relationship: { level: 30 },
      room: "铁匠铺",
      trigger: "这把剑多少钱？",
      memories: ["冒险者上周来修过剑"],
    });
    expect(system).toContain("老铁");
    expect(system).toContain("沉默寡言");
  });

  it("buildMemoryCompressionPrompt should include recent memories", () => {
    const npc = createNPC("npc_01", {
      name: "老铁",
      personality: "沉默寡言",
      memories: [
        { tick: 1, content: "帮寡妇修农具", importance: 0.5, type: "observation" },
        { tick: 2, content: "学徒跑路", importance: 0.8, type: "observation" },
      ],
    });
    const { user } = buildMemoryCompressionPrompt({ npc });
    expect(user).toContain("帮寡妇");
    expect(user).toContain("学徒跑路");
  });
});

describe("Output parser", () => {
  it("parseWorldEventOutput should parse event from JSON", () => {
    const text = `{
  "event": {
    "type": "economic_crisis",
    "title": "粮荒引发暴动",
    "description": "农民烧了粮仓",
    "scope": "region:west",
    "effects": [
      {"target": "region:west:all_npc", "need_change": {"hunger": -20}}
    ]
  }
}`;
    const delta = parseWorldEventOutput(text);
    expect(delta).not.toBeNull();
    expect(delta?.worldEvents?.[0].title).toBe("粮荒引发暴动");
    expect(delta?.needChanges?.[0].delta).toBe(-20);
  });

  it("parseMemoryCompressionOutput should parse insights", () => {
    const text = `{
  "insights": [
    {"content": "我对弱者更愿意帮助了", "effect": {"trait_modifier": {"compassion": 8, "trust": -5}}}
  ]
}`;
    const delta = parseMemoryCompressionOutput(text);
    expect(delta).not.toBeNull();
    expect(delta?.traitModifiers).toHaveLength(2);
  });
});

describe("InteractionDispatcher content pool evolve", () => {
  it("uses LLM tools to build book content mutations", async () => {
    const world = createWorld();
    world.time.day = 1;
    world.time.month = 1;
    world.round = 1;

    const adapter = {
      chat: vi.fn().mockResolvedValue({
        text: "",
        toolCalls: [
          {
            id: "call_1",
            function: {
              name: "add_book_content",
              arguments: JSON.stringify({
                id: "sutra_copy",
                itemTemplateId: "sutra_copy",
                title: "佛经抄本",
                pages: ["第一页", "第二页"],
              }),
            },
          },
        ],
      }),
      generate: vi.fn(),
      getBaseUrl: () => "http://localhost",
      getApiKey: () => "test",
    } as unknown as LLMAdapter;
    const dispatcher = new InteractionDispatcher(adapter);
    dispatcher.reachable = true;

    const result = await dispatcher.runSettlementBatch(world);

    expect(adapter.chat).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.arrayContaining([
        expect.objectContaining({
          function: expect.objectContaining({ name: "add_book_content" }),
        }),
      ]),
      "auto",
      "content_pool_evolve",
    );
    expect(result.contentPoolMutations).toEqual([
      {
        addBookContents: [
          {
            id: "sutra_copy",
            itemTemplateId: "sutra_copy",
            title: "佛经抄本",
            pages: ["第一页", "第二页"],
          },
        ],
      },
    ]);
  });

  it("should include world-state context in content_pool_evolve LLM prompt", async () => {
    const world = createWorld();
    world.time.day = 1;
    world.time.month = 1;
    world.round = 1;

    addRegion(world, {
      id: "region_dunhuang",
      name: "敦煌郡",
      dominantCulture: "大唐边塞",
      prosperity: 65,
      threatLevel: 40,
    });
    addRoom(world, createRoom("room_dunhuang_mogao", "莫高窟", "region_dunhuang", ""));
    addRoom(world, createRoom("room_yumen_beacon", "玉门烽燧", "region_dunhuang", ""));
    const npc = createNPC("npc_monk_faxian", {
      name: "法显",
      roomId: "room_dunhuang_mogao",
      personality: "汉地来的中年僧人，在莫高窟修行抄经。面容清瘦，语气温和平静。",
      npcTier: "core",
      tags: ["monk"],
    });
    addEntity(world, npc);

    world.contentPool.questTemplates = [
      {
        id: "quest_mogao_cipher",
        title: "千佛暗码",
        description: "法显在壁画后发现暗格",
        giverNpcId: "npc_monk_faxian",
        objectives: [
          {
            groupId: 0,
            type: "talk",
            targetId: "npc_monk_faxian",
            count: 1,
            description: "听法显讲述",
          },
        ],
        rewards: { narrative: "完成" },
        repeatable: false,
        deadlineDays: null,
      },
    ];
    world.contentPool.itemTemplates = [
      {
        id: "sutra_copy",
        name: "佛经抄本",
        properties: { readable: true, spiritual: true, value: 5 },
      },
    ];
    world.contentPool.clueDefinitions = [
      {
        id: "cave_17_secret",
        description: "莫高窟第十七窟壁画后似乎藏着什么",
        knownByNpcIds: ["npc_monk_faxian"],
      },
    ];
    world.contentPool.roomTemplates = [
      { culture: "大唐戍堡", rooms: [], names: [], personalities: [] },
    ];

    const capturedArgs: Array<{ system: string; user: string; tools: unknown[] }> = [];
    const adapter = {
      chat: vi.fn().mockImplementation(async (system: string, user: string, tools: unknown[]) => {
        capturedArgs.push({ system, user, tools });
        return { text: "", toolCalls: [] };
      }),
      generate: vi.fn(),
      getBaseUrl: () => "http://localhost",
      getApiKey: () => "test",
    } as unknown as LLMAdapter;
    const dispatcher = new InteractionDispatcher(adapter);
    dispatcher.reachable = true;

    await dispatcher.runSettlementBatch(world);

    expect(capturedArgs.length).toBeGreaterThanOrEqual(1);
    const evolveCall = capturedArgs.find(
      (args) => args.user.includes("existingNpcs") || args.user.includes("法显"),
    );
    expect(evolveCall).toBeDefined();
    const { system, user, tools } = evolveCall!;

    // 验证基础 context 字段存在
    expect(user).toContain('"existingNeeds"');
    expect(user).toContain('"existingActions"');
    expect(user).toContain('"existingRoles"');
    expect(user).toContain('"existingCultures"');
    expect(user).toContain('"existingTraitLabels"');

    // 验证 NPC 和房间摘要
    expect(user).toContain("法显");
    expect(user).toContain("npc_monk_faxian");
    expect(user).toContain("莫高窟");
    expect(user).toContain("玉门烽燧");

    // 验证任务和物品摘要
    expect(user).toContain("千佛暗码");
    expect(user).toContain("佛经抄本");

    // 验证线索摘要
    expect(user).toContain("cave_17_secret");

    // 验证系统 prompt 包含任务质量约束
    expect(system).toContain("单一 talk 目标");
    expect(system).toContain("混合多种目标类型");

    // 验证系统 prompt 包含优质/劣质示例
    expect(system).toContain("千佛暗码");
    expect(system).toContain("找人");

    // 验证工具定义包含 add_quest_template
    const toolNames = tools
      .filter(
        (t): t is { function: { name: string } } =>
          typeof t === "object" && t !== null && "function" in t,
      )
      .map((t) => (t as { function: { name: string } }).function.name);
    expect(toolNames).toContain("add_quest_template");
  });
});
