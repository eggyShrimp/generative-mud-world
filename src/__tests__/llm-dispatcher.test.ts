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
});
