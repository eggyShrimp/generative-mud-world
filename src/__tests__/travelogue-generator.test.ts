/**
 * 游记生成器测试
 *
 * 测试 collectPlayerEvents, extractLocationsVisited, buildTraveloguePrompt,
 * parseTravelogueOutput, generateTravelogueEntry 五个核心函数。
 */

import { describe, expect, it, vi } from "vitest";
import type { WorldEvent, WorldState } from "../core/types.ts";
import {
  addEntity,
  addRoom,
  createNPC,
  createPlayer,
  createRoom,
  createWorld,
  logEvent,
} from "../core/world.ts";
import {
  buildTraveloguePrompt,
  collectPlayerEvents,
  extractLocationsVisited,
  extractTodayClues,
  generateTravelogueEntry,
  getLocationNames,
  parseTravelogueOutput,
} from "../llm/travelogue-generator.ts";

function setupBaseWorld(): WorldState {
  const world = createWorld();
  const room = createRoom("market", "集市", "test", "热闹的市场");
  addRoom(world, room);
  return world;
}

function makeEvent(
  overrides: Partial<WorldEvent> & { description: string; type: string },
): WorldEvent {
  return {
    id: overrides.id ?? `evt_${Math.random().toString(36).slice(2, 8)}`,
    type: overrides.type,
    title: overrides.title ?? overrides.description,
    description: overrides.description,
    scope: overrides.scope ?? "global",
    tick: overrides.tick ?? 0,
    source: overrides.source ?? "simulation",
    data: overrides.data ?? {},
  };
}

// ============================================================
// collectPlayerEvents
// ============================================================

describe("collectPlayerEvents — 事件收集", () => {
  it("无事件时返回空数组", () => {
    const world = setupBaseWorld();
    const player = createPlayer("p1", "赵行舟", "market", world.contentPool);
    addEntity(world, player);

    const events = collectPlayerEvents(world, "p1");
    expect(events).toEqual([]);
  });

  it("仅返回 actorId 匹配玩家的事件", () => {
    const world = setupBaseWorld();
    const player = createPlayer("p1", "赵行舟", "market", world.contentPool);
    addEntity(world, player);
    logEvent(
      world,
      makeEvent({
        description: "赵行舟移动",
        type: "move",
        data: { actorId: "p1" },
        scope: "market",
      }),
    );
    logEvent(
      world,
      makeEvent({
        description: "其他人移动",
        type: "move",
        data: { actorId: "npc1" },
        scope: "tavern",
      }),
    );

    const events = collectPlayerEvents(world, "p1");
    expect(events.length).toBe(1);
    expect(events[0].description).toBe("赵行舟移动");
  });

  it("返回 scope 为玩家房间的事件", () => {
    const world = setupBaseWorld();
    const player = createPlayer("p1", "赵行舟", "market", world.contentPool);
    addEntity(world, player);
    logEvent(world, makeEvent({ description: "集市发生的事", type: "event", scope: "market" }));
    logEvent(world, makeEvent({ description: "酒馆发生的事", type: "event", scope: "tavern" }));

    const events = collectPlayerEvents(world, "p1");
    expect(events.length).toBe(1);
    expect(events[0].description).toBe("集市发生的事");
  });

  it("返回全局事件", () => {
    const world = setupBaseWorld();
    const player = createPlayer("p1", "赵行舟", "market", world.contentPool);
    addEntity(world, player);
    logEvent(world, makeEvent({ description: "天下大事", type: "world_event", scope: "global" }));

    const events = collectPlayerEvents(world, "p1");
    expect(events.length).toBe(1);
  });

  it("不返回其他玩家/房间的无关事件", () => {
    const world = setupBaseWorld();
    const player = createPlayer("p1", "赵行舟", "market", world.contentPool);
    addEntity(world, player);
    logEvent(
      world,
      makeEvent({
        description: "别人的事",
        type: "event",
        scope: "unknown",
        data: { actorId: "npc1" },
      }),
    );

    const events = collectPlayerEvents(world, "p1");
    expect(events.length).toBe(0);
  });

  it("不存在的玩家 ID 返回空数组", () => {
    const world = setupBaseWorld();
    const events = collectPlayerEvents(world, "nonexistent");
    expect(events).toEqual([]);
  });
});

// ============================================================
// extractLocationsVisited
// ============================================================

describe("extractLocationsVisited — 地点提取", () => {
  it("空事件列表 → 空地点列表", () => {
    const world = setupBaseWorld();
    const locations = extractLocationsVisited([], world);
    expect(locations).toEqual([]);
  });

  it("从移动事件中提取房间 ID（fromRoomId + toRoomId）", () => {
    const world = setupBaseWorld();
    const tavern = createRoom("tavern", "酒馆", "test", "昏暗的酒馆");
    addRoom(world, tavern);

    const events = [
      makeEvent({
        description: "赵行舟移动到酒馆",
        type: "move",
        data: { fromRoomId: "market", toRoomId: "tavern" },
      }),
    ];

    const locations = extractLocationsVisited(events, world);
    expect(locations).toContain("market");
    expect(locations).toContain("tavern");
  });

  it("从对话事件中提取 roomId", () => {
    const world = setupBaseWorld();
    const events = [
      makeEvent({
        description: "赵行舟与老马交谈",
        type: "talk",
        data: { roomId: "market", targetId: "npc1" },
      }),
    ];

    const locations = extractLocationsVisited(events, world);
    expect(locations).toContain("market");
  });

  it("去重：同一房间多次出现只保留一次", () => {
    const world = setupBaseWorld();
    const events = [
      makeEvent({ description: "event1", type: "move", data: { toRoomId: "market" } }),
      makeEvent({ description: "event2", type: "talk", data: { roomId: "market" } }),
      makeEvent({ description: "event3", type: "move", data: { fromRoomId: "market" } }),
    ];

    const locations = extractLocationsVisited(events, world);
    expect(locations.length).toBe(1);
    expect(locations[0]).toBe("market");
  });

  it("保持首次出现顺序", () => {
    const world = setupBaseWorld();
    const tavern = createRoom("tavern", "酒馆", "test", "昏暗的酒馆");
    addRoom(world, tavern);

    const events = [
      makeEvent({ description: "先去集市", type: "move", data: { toRoomId: "market" } }),
      makeEvent({ description: "再去酒馆", type: "move", data: { toRoomId: "tavern" } }),
    ];

    const locations = extractLocationsVisited(events, world);
    expect(locations).toEqual(["market", "tavern"]);
  });
});

describe("getLocationNames — 地点名转换", () => {
  it("只返回世界中存在的房间名", () => {
    const world = setupBaseWorld();
    const tavern = createRoom("tavern", "酒馆", "test", "昏暗的酒馆");
    addRoom(world, tavern);

    const names = getLocationNames(["market", "missing_room", "tavern"], world);

    expect(names).toEqual(["集市", "酒馆"]);
  });
});

// ============================================================
// buildTraveloguePrompt
// ============================================================

describe("buildTraveloguePrompt — prompt 构建", () => {
  it("系统消息使用 ContentPool 模板", () => {
    const world = setupBaseWorld();
    const player = createPlayer("p1", "赵行舟", "market", world.contentPool);
    addEntity(world, player);
    world.contentPool.narrativeTemplates.traveloguePrompt = "自定义模板";

    const { system } = buildTraveloguePrompt([], [], player, world);
    expect(system).toBe("自定义模板");
  });

  it("用户消息包含玩家名称", () => {
    const world = setupBaseWorld();
    const player = createPlayer("p1", "赵行舟", "market", world.contentPool);
    addEntity(world, player);

    const { user } = buildTraveloguePrompt([], [], player, world);
    expect(user).toContain("赵行舟");
  });

  it("用户消息包含格式化日期", () => {
    const world = setupBaseWorld();
    const player = createPlayer("p1", "赵行舟", "market", world.contentPool);
    addEntity(world, player);

    const { user } = buildTraveloguePrompt([], [], player, world);
    expect(user).toContain("日期:");
  });

  it("用户消息包含事件编号列表", () => {
    const world = setupBaseWorld();
    const player = createPlayer("p1", "赵行舟", "market", world.contentPool);
    addEntity(world, player);

    const events = [
      makeEvent({ description: "到达集市", type: "move" }),
      makeEvent({ description: "遇到老马", type: "talk" }),
    ];
    const { user } = buildTraveloguePrompt(events, [], player, world);
    expect(user).toContain("1. 到达集市");
    expect(user).toContain("2. 遇到老马");
  });

  it("用户消息包含途经地点与房间名", () => {
    const world = setupBaseWorld();
    const player = createPlayer("p1", "赵行舟", "market", world.contentPool);
    addEntity(world, player);

    const { user } = buildTraveloguePrompt([], ["market"], player, world);
    expect(user).toContain("集市");
  });

  it("用户消息包含遭遇的 NPC 名称", () => {
    const world = setupBaseWorld();
    const npc = createNPC("npc1", { name: "老马", roomId: "market" });
    addEntity(world, npc);
    const player = createPlayer("p1", "赵行舟", "market", world.contentPool);
    addEntity(world, player);

    const events = [
      makeEvent({
        description: "与老马交谈",
        type: "talk",
        data: { targetId: "npc1", roomId: "market" },
      }),
    ];
    const { user } = buildTraveloguePrompt(events, [], player, world);
    expect(user).toContain("老马");
  });

  it("ContentPool 模板为空时使用内置 fallback", () => {
    const world = setupBaseWorld();
    const player = createPlayer("p1", "赵行舟", "market", world.contentPool);
    addEntity(world, player);
    world.contentPool.narrativeTemplates.traveloguePrompt = "";

    const { system } = buildTraveloguePrompt([], [], player, world);
    expect(system).toContain("你是游记作家");
  });

  it("若有前几日游记，拼入上下文", () => {
    const world = setupBaseWorld();
    const player = createPlayer("p1", "赵行舟", "market", world.contentPool);
    addEntity(world, player);
    player.travelogue.push({
      day: 1,
      month: 1,
      year: 1,
      date: "大历1年 初春月 第1日",
      title: "第一回·初到边城",
      location: "market",
      locations: ["market"],
      locationNames: ["集市"],
      narrative: "是日，赵行舟初到边城...",
      keyEvents: ["到达边城"],
      createdAt: 0,
    });

    const { user } = buildTraveloguePrompt([], [], player, world);
    expect(user).toContain("前情回顾");
    expect(user).toContain("第一回·初到边城");
  });

  it("包含角色特质信息", () => {
    const world = setupBaseWorld();
    const player = createPlayer("p1", "赵行舟", "market", world.contentPool, undefined, [
      { name: "courage", value: 60 },
      { name: "ambition", value: 40 },
    ]);
    addEntity(world, player);

    const { user } = buildTraveloguePrompt([], [], player, world);
    expect(user).toContain("角色特质");
    expect(user).toContain("勇气");
    expect(user).toContain("野心");
  });
});

// ============================================================
// extractTodayClues — 线索提取
// ============================================================

describe("extractTodayClues — 线索提取", () => {
  it("无游记记录时返回所有已知线索", () => {
    const world = setupBaseWorld();
    const npc = createNPC("npc1", { name: "法显", roomId: "market" });
    addEntity(world, npc);
    const player = createPlayer("p1", "赵行舟", "market", world.contentPool);
    player.knownClues = [{ clueId: "cave_17_secret", sourceNpcId: "npc1", learnedAt: 5 }];
    world.contentPool.clueDefinitions = [
      { id: "cave_17_secret", description: "第十七窟不只是藏经洞", knownByNpcIds: ["npc1"] },
    ];
    addEntity(world, player);

    const clues = extractTodayClues(player, world);
    expect(clues).toHaveLength(1);
    expect(clues[0].description).toBe("第十七窟不只是藏经洞");
    expect(clues[0].sourceNpcName).toBe("法显");
  });

  it("只返回上一条游记之后获得的线索", () => {
    const world = setupBaseWorld();
    const npc = createNPC("npc1", { name: "法显", roomId: "market" });
    addEntity(world, npc);
    const player = createPlayer("p1", "赵行舟", "market", world.contentPool);
    player.travelogue.push({
      day: 1,
      month: 1,
      year: 1,
      date: "大历1年 初春月 第1日",
      title: "第一回",
      location: "market",
      locations: [],
      locationNames: [],
      narrative: "...",
      keyEvents: [],
      createdAt: 100,
    });
    player.knownClues = [
      { clueId: "old_clue", sourceNpcId: "npc1", learnedAt: 50 },
      { clueId: "new_clue", sourceNpcId: "npc1", learnedAt: 150 },
    ];
    world.contentPool.clueDefinitions = [
      { id: "old_clue", description: "旧线索", knownByNpcIds: ["npc1"] },
      { id: "new_clue", description: "新线索", knownByNpcIds: ["npc1"] },
    ];
    addEntity(world, player);

    const clues = extractTodayClues(player, world);
    expect(clues).toHaveLength(1);
    expect(clues[0].description).toBe("新线索");
  });

  it("缺失 clueDefinition 的线索被跳过", () => {
    const world = setupBaseWorld();
    const player = createPlayer("p1", "赵行舟", "market", world.contentPool);
    player.knownClues = [
      { clueId: "missing_clue", sourceNpcId: "npc1", learnedAt: 5 },
      { clueId: "valid_clue", sourceNpcId: "npc1", learnedAt: 5 },
    ];
    world.contentPool.clueDefinitions = [
      { id: "valid_clue", description: "有效线索", knownByNpcIds: ["npc1"] },
    ];
    addEntity(world, player);

    const clues = extractTodayClues(player, world);
    expect(clues).toHaveLength(1);
    expect(clues[0].description).toBe("有效线索");
  });

  it("无已知线索时返回空数组", () => {
    const world = setupBaseWorld();
    const player = createPlayer("p1", "赵行舟", "market", world.contentPool);
    addEntity(world, player);

    const clues = extractTodayClues(player, world);
    expect(clues).toEqual([]);
  });
});

// ============================================================
// buildTraveloguePrompt — 线索注入
// ============================================================

describe("buildTraveloguePrompt — 线索注入", () => {
  it("有今日线索时 prompt 包含'今日获悉的线索'", () => {
    const world = setupBaseWorld();
    const npc = createNPC("npc1", { name: "法显", roomId: "market" });
    addEntity(world, npc);
    const player = createPlayer("p1", "赵行舟", "market", world.contentPool);
    player.knownClues = [{ clueId: "cave_17_secret", sourceNpcId: "npc1", learnedAt: 5 }];
    world.contentPool.clueDefinitions = [
      { id: "cave_17_secret", description: "第十七窟不只是藏经洞", knownByNpcIds: ["npc1"] },
    ];
    addEntity(world, player);

    const { user } = buildTraveloguePrompt([], [], player, world);
    expect(user).toContain("今日获悉的线索");
    expect(user).toContain("第十七窟不只是藏经洞");
    expect(user).toContain("法显");
  });

  it("无线索时 prompt 不包含'今日获悉的线索'", () => {
    const world = setupBaseWorld();
    const player = createPlayer("p1", "赵行舟", "market", world.contentPool);
    addEntity(world, player);

    const { user } = buildTraveloguePrompt([], [], player, world);
    expect(user).not.toContain("今日获悉的线索");
  });

  it("旧线索不重复出现在 prompt 中", () => {
    const world = setupBaseWorld();
    const npc = createNPC("npc1", { name: "法显", roomId: "market" });
    addEntity(world, npc);
    const player = createPlayer("p1", "赵行舟", "market", world.contentPool);
    player.travelogue.push({
      day: 1,
      month: 1,
      year: 1,
      date: "大历1年 初春月 第1日",
      title: "第一回",
      location: "market",
      locations: [],
      locationNames: [],
      narrative: "...",
      keyEvents: [],
      createdAt: 100,
    });
    player.knownClues = [
      { clueId: "old_clue", sourceNpcId: "npc1", learnedAt: 50 },
      { clueId: "new_clue", sourceNpcId: "npc1", learnedAt: 150 },
    ];
    world.contentPool.clueDefinitions = [
      { id: "old_clue", description: "旧线索", knownByNpcIds: ["npc1"] },
      { id: "new_clue", description: "新线索", knownByNpcIds: ["npc1"] },
    ];
    addEntity(world, player);

    const { user } = buildTraveloguePrompt([], [], player, world);
    expect(user).not.toContain("旧线索");
    expect(user).toContain("新线索");
  });
});

// ============================================================
// parseTravelogueOutput
// ============================================================

describe("parseTravelogueOutput — 输出解析", () => {
  it("正确解析 { title, narrative } JSON", () => {
    const result = parseTravelogueOutput(
      JSON.stringify({ title: "第三回·苍山城初遇奇人", narrative: "话说那日..." }),
    );
    expect(result).not.toBeNull();
    expect(result!.title).toBe("第三回·苍山城初遇奇人");
    expect(result!.narrative).toBe("话说那日...");
  });

  it("处理 LLM 包裹的 markdown code block", () => {
    const result = parseTravelogueOutput('```json\n{"title": "测试", "narrative": "正文"}\n```');
    expect(result).not.toBeNull();
    expect(result!.title).toBe("测试");
  });

  it("处理 ``` 无 json 标注的 code block", () => {
    const result = parseTravelogueOutput('```\n{"title": "测试", "narrative": "正文"}\n```');
    expect(result).not.toBeNull();
    expect(result!.title).toBe("测试");
  });

  it("无效 JSON 返回 null", () => {
    const result = parseTravelogueOutput("not json at all");
    expect(result).toBeNull();
  });

  it("缺少 title 字段返回 null", () => {
    const result = parseTravelogueOutput(JSON.stringify({ narrative: "只有正文" }));
    expect(result).toBeNull();
  });

  it("缺少 narrative 字段返回 null", () => {
    const result = parseTravelogueOutput(JSON.stringify({ title: "只有标题" }));
    expect(result).toBeNull();
  });

  it("narrative 为空字符串时仍接受", () => {
    const result = parseTravelogueOutput(JSON.stringify({ title: "轻量日", narrative: "" }));
    expect(result).not.toBeNull();
    expect(result!.title).toBe("轻量日");
    expect(result!.narrative).toBe("");
  });

  it("多余字段不影响解析", () => {
    const result = parseTravelogueOutput(
      JSON.stringify({ title: "标题", narrative: "正文", extra: "多余" }),
    );
    expect(result).not.toBeNull();
    expect(result!.title).toBe("标题");
    expect(result!.narrative).toBe("正文");
  });
});

// ============================================================
// generateTravelogueEntry
// ============================================================

function mockAdapter(responseText: string) {
  return {
    chat: vi.fn().mockResolvedValue({ text: responseText }),
    generate: vi.fn(),
  } as unknown as import("../llm/adapter.ts").LLMAdapter;
}

describe("generateTravelogueEntry — 生成完整 entry", () => {
  it("当日无事件时返回 null", async () => {
    const world = setupBaseWorld();
    const player = createPlayer("p1", "赵行舟", "market", world.contentPool);
    addEntity(world, player);

    const adapter = mockAdapter("{}");
    const result = await generateTravelogueEntry(world, "p1", adapter);
    expect(result).toBeNull();
  });

  it("LLM 成功返回 → TravelogueEntry 所有字段正确", async () => {
    const world = setupBaseWorld();
    const player = createPlayer("p1", "赵行舟", "market", world.contentPool);
    addEntity(world, player);
    logEvent(
      world,
      makeEvent({
        description: "到了集市",
        type: "move",
        data: { actorId: "p1", toRoomId: "market" },
      }),
    );

    const adapter = mockAdapter(
      JSON.stringify({ title: "第一回·初到边城", narrative: "话说那日，赵行舟来到边城..." }),
    );
    const result = await generateTravelogueEntry(world, "p1", adapter);

    expect(result).not.toBeNull();
    expect(result!.title).toBe("第一回·初到边城");
    expect(result!.narrative).toBe("话说那日，赵行舟来到边城...");
    expect(result!.day).toBe(world.time.day);
    expect(result!.month).toBe(world.time.month);
    expect(result!.year).toBe(world.time.year);
    expect(result!.location).toBe("market");
    expect(result!.locations).toContain("market");
    expect(result!.locationNames).toEqual(["集市"]);
    expect(result!.keyEvents.length).toBe(1);
  });

  it("LLM 返回无效 JSON → 返回 null，不抛异常", async () => {
    const world = setupBaseWorld();
    const player = createPlayer("p1", "赵行舟", "market", world.contentPool);
    addEntity(world, player);
    logEvent(world, makeEvent({ description: "到了集市", type: "move", data: { actorId: "p1" } }));

    const adapter = mockAdapter("这不是 JSON");
    const result = await generateTravelogueEntry(world, "p1", adapter);
    expect(result).toBeNull();
  });

  it("LLM 网络异常 → 返回 null，不抛异常", async () => {
    const world = setupBaseWorld();
    const player = createPlayer("p1", "赵行舟", "market", world.contentPool);
    addEntity(world, player);
    logEvent(world, makeEvent({ description: "到了集市", type: "move", data: { actorId: "p1" } }));

    const adapter = {
      chat: vi.fn().mockRejectedValue(new Error("Network error")),
      generate: vi.fn(),
    } as unknown as import("../llm/adapter.ts").LLMAdapter;

    const result = await generateTravelogueEntry(world, "p1", adapter);
    expect(result).toBeNull();
  });

  it("entry.location 为最后访问的地点", async () => {
    const world = setupBaseWorld();
    const tavern = createRoom("tavern", "酒馆", "test", "昏暗的酒馆");
    addRoom(world, tavern);
    const player = createPlayer("p1", "赵行舟", "market", world.contentPool);
    addEntity(world, player);

    logEvent(
      world,
      makeEvent({
        description: "到集市",
        type: "move",
        data: { actorId: "p1", toRoomId: "market" },
      }),
    );
    logEvent(
      world,
      makeEvent({
        description: "到酒馆",
        type: "move",
        data: { actorId: "p1", toRoomId: "tavern" },
      }),
    );

    const adapter = mockAdapter(JSON.stringify({ title: "第一回", narrative: "..." }));
    const result = await generateTravelogueEntry(world, "p1", adapter);

    expect(result).not.toBeNull();
    expect(result!.location).toBe("tavern");
  });

  it("entry.keyEvents 包含所有事件描述", async () => {
    const world = setupBaseWorld();
    const player = createPlayer("p1", "赵行舟", "market", world.contentPool);
    addEntity(world, player);
    logEvent(world, makeEvent({ description: "事件A", type: "move", data: { actorId: "p1" } }));
    logEvent(world, makeEvent({ description: "事件B", type: "talk", data: { actorId: "p1" } }));

    const adapter = mockAdapter(JSON.stringify({ title: "测试", narrative: "正文" }));
    const result = await generateTravelogueEntry(world, "p1", adapter);

    expect(result).not.toBeNull();
    expect(result!.keyEvents).toEqual(["事件A", "事件B"]);
  });

  it("entry.keyEvents 包含今日线索描述", async () => {
    const world = setupBaseWorld();
    const npc = createNPC("npc1", { name: "法显", roomId: "market" });
    addEntity(world, npc);
    const player = createPlayer("p1", "赵行舟", "market", world.contentPool);
    player.knownClues = [{ clueId: "cave_17_secret", sourceNpcId: "npc1", learnedAt: 5 }];
    world.contentPool.clueDefinitions = [
      { id: "cave_17_secret", description: "第十七窟不只是藏经洞", knownByNpcIds: ["npc1"] },
    ];
    addEntity(world, player);
    logEvent(world, makeEvent({ description: "到达集市", type: "move", data: { actorId: "p1" } }));

    const adapter = mockAdapter(JSON.stringify({ title: "测试", narrative: "正文" }));
    const result = await generateTravelogueEntry(world, "p1", adapter);

    expect(result).not.toBeNull();
    expect(result!.keyEvents).toContain("获悉线索：第十七窟不只是藏经洞");
  });

  it("非玩家 entity 返回 null", async () => {
    const world = setupBaseWorld();
    const npc = createNPC("npc1", { name: "老马", roomId: "market" });
    addEntity(world, npc);

    const adapter = mockAdapter("{}");
    const result = await generateTravelogueEntry(world, "npc1", adapter);
    expect(result).toBeNull();
  });

  it("不存在的 entity ID 返回 null", async () => {
    const world = setupBaseWorld();
    const adapter = mockAdapter("{}");
    const result = await generateTravelogueEntry(world, "nonexistent", adapter);
    expect(result).toBeNull();
  });

  it("ContentPool 模板随 prompt 变化", async () => {
    const world = setupBaseWorld();
    const player = createPlayer("p1", "赵行舟", "market", world.contentPool);
    addEntity(world, player);
    logEvent(world, makeEvent({ description: "事件", type: "move", data: { actorId: "p1" } }));

    world.contentPool.narrativeTemplates.traveloguePrompt = "自定义系统提示: 生成游记";

    const adapter = {
      chat: vi.fn().mockResolvedValue({
        text: JSON.stringify({ title: "标题", narrative: "正文" }),
      }),
      generate: vi.fn(),
    } as unknown as import("../llm/adapter.ts").LLMAdapter;

    await generateTravelogueEntry(world, "p1", adapter);

    const callArgs = (adapter.chat as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[0]).toBe("自定义系统提示: 生成游记");
  });
});
