import { describe, expect, it, vi } from "vitest";
import {
  addEntity,
  addRegion,
  addRoom,
  createPlayer,
  createRoom,
  createWorld,
} from "../core/world.ts";
import type { LLMAdapter } from "../llm/adapter.ts";
import { parsePlanWithLLM } from "../llm/plan-parser.ts";

function mockAdapter(responseText: string) {
  return {
    chat: vi.fn().mockResolvedValue({ text: responseText }),
    generate: vi.fn().mockResolvedValue({ text: responseText }),
  } as unknown as LLMAdapter;
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

describe("parsePlanWithLLM", () => {
  it("should parse valid move action", async () => {
    const adapter = mockAdapter('[{"type":"move","targetRoomId":"tavern"}]');
    const world = setupWorld();
    const actions = await parsePlanWithLLM(adapter, world, "p1", "去酒馆", 1);
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe("move");
    expect(actions[0].targetRoomId).toBe("tavern");
    expect(actions[0].actorId).toBe("p1");
    expect(actions[0].tick).toBe(1);
  });

  it("should parse valid wait action", async () => {
    const adapter = mockAdapter('[{"type":"wait"}]');
    const world = setupWorld();
    const actions = await parsePlanWithLLM(adapter, world, "p1", "等待", 5);
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe("wait");
    expect(actions[0].tick).toBe(5);
  });

  it("should parse valid talk action", async () => {
    const adapter = mockAdapter('[{"type":"talk","targetId":"npc1"}]');
    const world = setupWorld();
    const actions = await parsePlanWithLLM(adapter, world, "p1", "和NPC说话", 1);
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe("talk");
    expect(actions[0].targetId).toBe("npc1");
  });

  it("should filter out unsupported action types", async () => {
    const adapter = mockAdapter('[{"type":"fly","target":"moon"},{"type":"wait"}]');
    const world = setupWorld();
    const actions = await parsePlanWithLLM(adapter, world, "p1", "飞到月亮", 1);
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe("wait");
  });

  it("should handle JSON wrapped in markdown", async () => {
    const adapter = mockAdapter('```json\n[{"type":"move","targetRoomId":"tavern"}]\n```');
    const world = setupWorld();
    const actions = await parsePlanWithLLM(adapter, world, "p1", "去酒馆", 1);
    expect(actions).toHaveLength(1);
  });

  it("should return empty for no JSON match", async () => {
    const adapter = mockAdapter("no json here");
    const world = setupWorld();
    const actions = await parsePlanWithLLM(adapter, world, "p1", "测试", 1);
    expect(actions).toEqual([]);
  });

  it("should return empty for invalid JSON", async () => {
    const adapter = mockAdapter("{broken json}");
    const world = setupWorld();
    const actions = await parsePlanWithLLM(adapter, world, "p1", "测试", 1);
    expect(actions).toEqual([]);
  });

  it("should return empty for nonexistent player", async () => {
    const adapter = mockAdapter('[{"type":"wait"}]');
    const world = setupWorld();
    const actions = await parsePlanWithLLM(adapter, world, "ghost", "测试", 1);
    expect(actions).toEqual([]);
  });

  it("should return empty on LLM error", async () => {
    const adapter = {
      chat: vi.fn().mockRejectedValue(new Error("fail")),
      generate: vi.fn(),
    } as unknown as LLMAdapter;
    const world = setupWorld();
    const actions = await parsePlanWithLLM(adapter, world, "p1", "测试", 1);
    expect(actions).toEqual([]);
  });

  it("should include payload with raw text", async () => {
    const adapter = mockAdapter('[{"type":"wait"}]');
    const world = setupWorld();
    const actions = await parsePlanWithLLM(adapter, world, "p1", "原始终端文本", 1);
    expect(actions[0].payload).toEqual({ raw: "原始终端文本" });
  });
});
