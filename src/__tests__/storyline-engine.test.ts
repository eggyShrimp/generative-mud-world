import { describe, expect, it } from "vitest";
import { collectSubQuestIds, resolveQuestAccept } from "../core/quest-utils.ts";
import type { PlayerEntity, QuestTemplate, WorldState } from "../core/types.ts";
import {
  addEntity,
  addRoom,
  applyDelta,
  createNPC,
  createPlayer,
  createRoom,
  createWorld,
} from "../core/world.ts";
import { checkQuestProgress } from "../engine/quest-tracker.ts";
import { checkStageCompletion, checkTrigger } from "../simulation/storyline-engine.ts";

// ─── Fixtures ─────────────────────────────────────────────

function createTestWorld(quests: QuestTemplate[] = []): WorldState {
  const world = createWorld();
  world.contentPool.questTemplates = quests;
  addRoom(world, createRoom("room_tavern", "酒馆", "region_01", "一家小酒馆"));
  addRoom(world, createRoom("room_camp", "猎人营地", "region_01", "霜狼猎人营地"));
  // Add NPCs referenced by quest objectives so isObjectiveReachable returns true
  addEntity(world, createNPC("npc_hunter", { name: "猎人", roomId: "room_camp" }));
  addEntity(world, createNPC("npc_lao_ma", { name: "老马", roomId: "room_tavern" }));
  addEntity(world, createPlayer("player", "旅人", "room_tavern", world.contentPool));
  return world;
}

const QUEST_A: QuestTemplate = {
  id: "quest_a",
  title: "任务A",
  description: "子任务A",
  giverNpcId: null,
  objectives: [
    {
      groupId: 0,
      condition: { type: "player_talked_to_npc", target: { kind: "npc", id: "npc_hunter" } },
      count: 1,
      description: "与猎人交谈",
    },
  ],
  rewards: {},
  repeatable: false,
  deadlineDays: null,
};

const QUEST_B: QuestTemplate = {
  id: "quest_b",
  title: "任务B",
  description: "子任务B",
  giverNpcId: null,
  objectives: [
    {
      groupId: 0,
      condition: { type: "player_talked_to_npc", target: { kind: "npc", id: "npc_lao_ma" } },
      count: 1,
      description: "与老马交谈",
    },
  ],
  rewards: { narrative: "剧情完结" },
  repeatable: false,
  deadlineDays: null,
};

const STORYLINE_BASIC: QuestTemplate = {
  id: "story_basic",
  title: "测试剧情",
  description: "一个测试剧情",
  giverNpcId: null,
  objectives: [],
  rewards: { narrative: "完结" },
  repeatable: false,
  deadlineDays: null,
  autoTrigger: {
    type: "trait",
    conditions: [{ trait: "strength", operator: ">=", value: 10 }],
  },
  stages: [
    {
      id: "s1",
      title: "阶段一",
      questIds: ["quest_a"],
      completionCondition: "all",
      narrativeGuide: "进入阶段一",
    },
    {
      id: "s2",
      title: "阶段二",
      questIds: ["quest_b"],
      completionCondition: "all",
      narrativeGuide: "进入阶段二",
    },
  ],
};

const STORYLINE_TIME_TRIGGER: QuestTemplate = {
  id: "story_time",
  title: "时间触发剧情",
  description: "第3天触发",
  giverNpcId: null,
  objectives: [],
  rewards: {},
  repeatable: false,
  deadlineDays: null,
  autoTrigger: {
    type: "time",
    conditions: [{ day: 3, operator: ">=", value: 3 }],
  },
  stages: [
    {
      id: "s1",
      title: "阶段一",
      questIds: ["quest_a"],
      completionCondition: "all",
      narrativeGuide: "开始",
    },
  ],
};

const STORYLINE_SINGLE_STAGE: QuestTemplate = {
  id: "story_single",
  title: "单阶段剧情",
  description: "只有一个阶段",
  giverNpcId: null,
  objectives: [],
  rewards: { narrative: "完结" },
  repeatable: false,
  deadlineDays: null,
  autoTrigger: {
    type: "trait",
    conditions: [{ trait: "strength", operator: ">=", value: 5 }],
  },
  stages: [
    {
      id: "s1",
      title: "最终阶段",
      questIds: ["quest_a"],
      completionCondition: "all",
      narrativeGuide: "开始",
    },
  ],
};

const STORYLINE_ANY_CONDITION: QuestTemplate = {
  id: "story_any",
  title: "any条件剧情",
  description: "任一子任务完成即推进",
  giverNpcId: null,
  objectives: [],
  rewards: {},
  repeatable: false,
  deadlineDays: null,
  autoTrigger: {
    type: "trait",
    conditions: [{ trait: "strength", operator: ">=", value: 5 }],
  },
  stages: [
    {
      id: "s1",
      title: "阶段一",
      questIds: ["quest_a", "quest_b"],
      completionCondition: "any",
      narrativeGuide: "开始",
    },
  ],
};

const STORYLINE_REPEATABLE: QuestTemplate = {
  id: "story_repeat",
  title: "可重复剧情",
  description: "可以重复触发",
  giverNpcId: null,
  objectives: [],
  rewards: {},
  repeatable: true,
  deadlineDays: null,
  autoTrigger: {
    type: "trait",
    conditions: [{ trait: "strength", operator: ">=", value: 5 }],
  },
  stages: [
    {
      id: "s1",
      title: "阶段一",
      questIds: ["quest_a"],
      completionCondition: "all",
      narrativeGuide: "开始",
    },
  ],
};

const STORYLINE_PLAYER_ACTION: QuestTemplate = {
  id: "story_dialogue",
  title: "对话触发剧情",
  description: "由 dialogue 系统触发",
  giverNpcId: null,
  objectives: [],
  rewards: {},
  repeatable: false,
  deadlineDays: null,
  autoTrigger: {
    type: "player_action",
    conditions: [{ action: "talk", targetId: "npc_lao_ma", operator: "==", value: 1 }],
  },
  stages: [
    {
      id: "s1",
      title: "阶段一",
      questIds: ["quest_a"],
      completionCondition: "all",
      narrativeGuide: "开始",
    },
  ],
};

function addPlayer(
  world: WorldState,
  traits?: Array<{ name: string; value: number }>,
): PlayerEntity {
  const player = createPlayer(
    "p1",
    "测试玩家",
    "room_tavern",
    world.contentPool,
    undefined,
    traits,
  );
  addEntity(world, player);
  return player;
}

// ─── collectSubQuestIds ──────────────────────────────────

describe("collectSubQuestIds", () => {
  it("收集 storyline 子 quest ID", () => {
    const pool = {
      questTemplates: [QUEST_A, QUEST_B, STORYLINE_BASIC],
    } as WorldState["contentPool"];
    const ids = collectSubQuestIds(pool);
    expect(ids.has("quest_a")).toBe(true);
    expect(ids.has("quest_b")).toBe(true);
    expect(ids.has("story_basic")).toBe(false);
  });

  it("无 storyline 时返回空集", () => {
    const pool = { questTemplates: [QUEST_A, QUEST_B] } as WorldState["contentPool"];
    const ids = collectSubQuestIds(pool);
    expect(ids.size).toBe(0);
  });
});

// ─── resolveQuestAccept ──────────────────────────────────

describe("resolveQuestAccept", () => {
  it("激活普通 quest（无 stages）→ delta 含 1 条 accept", () => {
    const world = createTestWorld([QUEST_A]);
    addPlayer(world);

    const result = resolveQuestAccept(world, "p1", "quest_a");
    expect(result.success).toBe(true);
    expect(result.delta).not.toBeNull();
    expect(result.delta?.questChanges).toHaveLength(1);
    expect(result.delta?.questChanges?.[0]).toEqual({
      type: "accept",
      playerId: "p1",
      templateId: "quest_a",
    });
  });

  it("激活 storyline（有 stages）→ delta 含 stage0 子 quest accept + StorylineState", () => {
    const world = createTestWorld([QUEST_A, QUEST_B, STORYLINE_BASIC]);
    const player = addPlayer(world, [{ name: "strength", value: 15 }]);

    const result = resolveQuestAccept(world, "p1", "story_basic");
    expect(result.success).toBe(true);
    expect(result.delta).not.toBeNull();
    expect(result.delta?.questChanges).toHaveLength(1);
    expect(result.delta?.questChanges?.[0]).toEqual({
      type: "accept",
      playerId: "p1",
      templateId: "quest_a",
    });
    expect(player.activeStorylines).toHaveLength(1);
    expect(player.activeStorylines[0].storylineId).toBe("story_basic");
    expect(player.activeStorylines[0].currentStage).toBe(0);
  });

  it("templateId 不存在 → success=false", () => {
    const world = createTestWorld([]);
    addPlayer(world);

    const result = resolveQuestAccept(world, "p1", "nonexistent");
    expect(result.success).toBe(false);
  });

  it("playerId 不存在 → success=false", () => {
    const world = createTestWorld([QUEST_A]);

    const result = resolveQuestAccept(world, "nonexistent", "quest_a");
    expect(result.success).toBe(false);
  });

  it("已激活的剧情 → success=true, delta=null（去重）", () => {
    const world = createTestWorld([QUEST_A, QUEST_B, STORYLINE_BASIC]);
    const _player = addPlayer(world, [{ name: "strength", value: 15 }]);

    const r1 = resolveQuestAccept(world, "p1", "story_basic");
    expect(r1.success).toBe(true);
    expect(r1.delta).not.toBeNull();

    const r2 = resolveQuestAccept(world, "p1", "story_basic");
    expect(r2.success).toBe(true);
    expect(r2.delta).toBeNull();
  });

  it("已完成的剧情（非 repeatable）→ success=true, delta=null", () => {
    const world = createTestWorld([QUEST_A, QUEST_B, STORYLINE_BASIC]);
    const _player = addPlayer(world, [{ name: "strength", value: 15 }]);
    world.completedStorylines.push("story_basic");

    const result = resolveQuestAccept(world, "p1", "story_basic");
    expect(result.success).toBe(true);
    expect(result.delta).toBeNull();
  });

  it("可重复剧情 → 已完成后可以再激活", () => {
    const world = createTestWorld([QUEST_A, STORYLINE_REPEATABLE]);
    const _player = addPlayer(world, [{ name: "strength", value: 15 }]);
    world.completedStorylines.push("story_repeat");

    const result = resolveQuestAccept(world, "p1", "story_repeat");
    expect(result.success).toBe(true);
    expect(result.delta).not.toBeNull();
  });

  it("子 quest 的 NPC 不存在 → 该 quest 被跳过 + warning", () => {
    // Create a world without the npc_hunter entity
    const world = createWorld();
    world.contentPool.questTemplates = [QUEST_A, STORYLINE_BASIC];
    addRoom(world, createRoom("room_tavern", "酒馆", "region_01", "一家小酒馆"));
    // npc_hunter 不存在于 world.entities
    addPlayer(world, [{ name: "strength", value: 15 }]);

    const result = resolveQuestAccept(world, "p1", "story_basic");
    expect(result.success).toBe(true);
    expect(result.delta).toBeNull(); // stage0 的 quest 全被跳过
    expect(result.warnings.length).toBeGreaterThan(0);
  });
});

// ─── checkTrigger（自动触发：time/trait/relation/world_event）──

describe("checkTrigger", () => {
  describe("trait 触发", () => {
    it("特质值达标 → 触发", () => {
      const world = createTestWorld([QUEST_A, STORYLINE_BASIC]);
      const player = addPlayer(world, [{ name: "strength", value: 15 }]);

      const delta = checkTrigger(world, "p1");
      expect(delta).not.toBeNull();
      expect(player.activeStorylines).toHaveLength(1);
    });

    it("特质值未达标 → 不触发", () => {
      const world = createTestWorld([QUEST_A, STORYLINE_BASIC]);
      addPlayer(world, [{ name: "strength", value: 5 }]);

      const delta = checkTrigger(world, "p1");
      expect(delta).toBeNull();
    });

    it("特质不存在 → 不触发", () => {
      const world = createTestWorld([QUEST_A, STORYLINE_BASIC]);
      addPlayer(world);

      const delta = checkTrigger(world, "p1");
      expect(delta).toBeNull();
    });
  });

  describe("time 触发", () => {
    it("天数满足 → 触发", () => {
      const world = createTestWorld([QUEST_A, STORYLINE_TIME_TRIGGER]);
      const player = addPlayer(world);
      world.time.day = 3;

      const delta = checkTrigger(world, "p1");
      expect(delta).not.toBeNull();
      expect(player.activeStorylines).toHaveLength(1);
    });

    it("天数未满足 → 不触发", () => {
      const world = createTestWorld([QUEST_A, STORYLINE_TIME_TRIGGER]);
      addPlayer(world);
      world.time.day = 1;

      const delta = checkTrigger(world, "p1");
      expect(delta).toBeNull();
    });
  });

  describe("去重逻辑", () => {
    it("已激活的剧情 → 不重复触发", () => {
      const world = createTestWorld([QUEST_A, QUEST_B, STORYLINE_BASIC]);
      const player = addPlayer(world, [{ name: "strength", value: 15 }]);

      checkTrigger(world, "p1");
      expect(player.activeStorylines).toHaveLength(1);

      const delta2 = checkTrigger(world, "p1");
      expect(delta2).toBeNull();
      expect(player.activeStorylines).toHaveLength(1);
    });

    it("已完成的剧情 → 不再触发", () => {
      const world = createTestWorld([QUEST_A, QUEST_B, STORYLINE_BASIC]);
      const _player = addPlayer(world, [{ name: "strength", value: 15 }]);
      world.completedStorylines.push("story_basic");

      const delta = checkTrigger(world, "p1");
      expect(delta).toBeNull();
    });

    it("可重复的剧情 → 已完成后可以再触发", () => {
      const world = createTestWorld([QUEST_A, STORYLINE_REPEATABLE]);
      const player = addPlayer(world, [{ name: "strength", value: 15 }]);
      world.completedStorylines.push("story_repeat");

      const delta = checkTrigger(world, "p1");
      expect(delta).not.toBeNull();
      expect(player.activeStorylines).toHaveLength(1);
    });
  });

  describe("player_action 由 dialogue activate_quest 处理", () => {
    it("checkTrigger 跳过 player_action 类型（设计意图，由 dialogue activate_quest tool 负责）", () => {
      const world = createTestWorld([QUEST_A, STORYLINE_PLAYER_ACTION]);
      addPlayer(world);

      const delta = checkTrigger(world, "p1");
      expect(delta).toBeNull();
    });
  });

  describe("边界情况", () => {
    it("playerId 不存在 → 返回 null", () => {
      const world = createTestWorld([QUEST_A, STORYLINE_BASIC]);
      const delta = checkTrigger(world, "nonexistent");
      expect(delta).toBeNull();
    });
  });
});

// ─── checkStageCompletion ─────────────────────────────────

describe("checkStageCompletion", () => {
  it("all 条件 — 全部 quest 完成 → 阶段推进", () => {
    const world = createTestWorld([QUEST_A, QUEST_B, STORYLINE_BASIC]);
    const player = addPlayer(world, [{ name: "strength", value: 15 }]);

    checkTrigger(world, "p1");
    expect(player.activeStorylines[0].currentStage).toBe(0);

    player.completedQuests.push("quest_a");

    const delta = checkStageCompletion(world, "p1");
    expect(delta).not.toBeNull();
    expect(player.activeStorylines[0].currentStage).toBe(1);
    expect(delta?.questChanges).toEqual(
      expect.arrayContaining([{ type: "accept", playerId: "p1", templateId: "quest_b" }]),
    );
  });

  it("all 条件 — 部分 quest 完成 → 不推进", () => {
    const world = createTestWorld([QUEST_A, QUEST_B, STORYLINE_BASIC]);
    const player = addPlayer(world, [{ name: "strength", value: 15 }]);

    checkTrigger(world, "p1");

    const delta = checkStageCompletion(world, "p1");
    expect(delta).toBeNull();
    expect(player.activeStorylines[0].currentStage).toBe(0);
  });

  it("any 条件 — 任一 quest 完成 → 推进", () => {
    const world = createTestWorld([QUEST_A, QUEST_B, STORYLINE_ANY_CONDITION]);
    const player = addPlayer(world, [{ name: "strength", value: 15 }]);

    checkTrigger(world, "p1");
    player.completedQuests.push("quest_a");

    const delta = checkStageCompletion(world, "p1");
    expect(delta).not.toBeNull();
  });

  it("any 条件 — 无 quest 完成 → 不推进", () => {
    const world = createTestWorld([QUEST_A, QUEST_B, STORYLINE_ANY_CONDITION]);
    const _player = addPlayer(world, [{ name: "strength", value: 15 }]);

    checkTrigger(world, "p1");

    const delta = checkStageCompletion(world, "p1");
    expect(delta).toBeNull();
  });

  it("最后一阶段完成 → 剧情完结", () => {
    const world = createTestWorld([QUEST_A, STORYLINE_SINGLE_STAGE]);
    const player = addPlayer(world, [{ name: "strength", value: 15 }]);

    checkTrigger(world, "p1");
    expect(player.activeStorylines).toHaveLength(1);

    player.completedQuests.push("quest_a");

    const delta = checkStageCompletion(world, "p1");
    expect(delta).not.toBeNull();
    expect(player.activeStorylines).toHaveLength(0);
    expect(world.completedStorylines).toContain("story_single");
  });

  it("多阶段逐级推进 — 0→1→完结", () => {
    const world = createTestWorld([QUEST_A, QUEST_B, STORYLINE_BASIC]);
    const player = addPlayer(world, [{ name: "strength", value: 15 }]);

    checkTrigger(world, "p1");
    expect(player.activeStorylines[0].currentStage).toBe(0);

    player.completedQuests.push("quest_a");
    checkStageCompletion(world, "p1");
    expect(player.activeStorylines[0].currentStage).toBe(1);

    player.completedQuests.push("quest_b");
    checkStageCompletion(world, "p1");
    expect(player.activeStorylines).toHaveLength(0);
    expect(world.completedStorylines).toContain("story_basic");
  });

  it("无活跃剧情 → 返回 null", () => {
    const world = createTestWorld([QUEST_A, STORYLINE_BASIC]);
    addPlayer(world);

    const delta = checkStageCompletion(world, "p1");
    expect(delta).toBeNull();
  });
});

// ─── 多剧情并行 ──────────────────────────────────────────

describe("多剧情并行", () => {
  it("两个剧情独立触发、独立推进", () => {
    const QUEST_X: QuestTemplate = {
      id: "quest_x",
      title: "任务X",
      description: "子任务X",
      giverNpcId: null,
      objectives: [
        {
          groupId: 0,
          condition: { type: "player_talked_to_npc", target: { kind: "npc", id: "npc_x" } },
          count: 1,
          description: "与X交谈",
        },
      ],
      rewards: {},
      repeatable: false,
      deadlineDays: null,
    };
    const storyline1: QuestTemplate = {
      ...STORYLINE_BASIC,
      id: "story_1",
      autoTrigger: {
        type: "trait",
        conditions: [{ trait: "strength", operator: ">=", value: 10 }],
      },
      stages: [
        {
          id: "s1",
          title: "阶段一",
          questIds: ["quest_a"],
          completionCondition: "all",
          narrativeGuide: "开始",
        },
        {
          id: "s2",
          title: "阶段二",
          questIds: ["quest_b"],
          completionCondition: "all",
          narrativeGuide: "进入",
        },
      ],
    };
    const storyline2: QuestTemplate = {
      ...STORYLINE_BASIC,
      id: "story_2",
      autoTrigger: {
        type: "trait",
        conditions: [{ trait: "strength", operator: ">=", value: 10 }],
      },
      stages: [
        {
          id: "s1",
          title: "阶段一",
          questIds: ["quest_x"],
          completionCondition: "all",
          narrativeGuide: "开始",
        },
        {
          id: "s2",
          title: "阶段二",
          questIds: ["quest_b"],
          completionCondition: "all",
          narrativeGuide: "进入",
        },
      ],
    };
    const world = createTestWorld([QUEST_A, QUEST_B, QUEST_X, storyline1, storyline2]);
    const player = addPlayer(world, [{ name: "strength", value: 15 }]);

    checkTrigger(world, "p1");
    expect(player.activeStorylines).toHaveLength(2);

    // 完成 story_1 的 stage0 (quest_a)
    player.completedQuests.push("quest_a");
    checkStageCompletion(world, "p1");

    const s1 = player.activeStorylines.find((s) => s.storylineId === "story_1");
    const s2 = player.activeStorylines.find((s) => s.storylineId === "story_2");
    expect(s1?.currentStage).toBe(1);
    expect(s2?.currentStage).toBe(0);
  });
});

// ─── 集成：quest-tracker 联动 ────────────────────────────

describe("集成：quest-tracker 联动", () => {
  it("resolveQuestAccept → applyDelta → checkQuestProgress → stage 推进", () => {
    const world = createTestWorld([QUEST_A, QUEST_B, STORYLINE_BASIC]);
    const player = addPlayer(world, [{ name: "strength", value: 15 }]);

    // 通过 resolveQuestAccept 激活剧情
    const result = resolveQuestAccept(world, "p1", "story_basic");
    expect(result.success).toBe(true);
    expect(result.delta).not.toBeNull();
    applyDelta(world, result.delta!);

    expect(player.activeStorylines).toHaveLength(1);
    expect(player.activeQuests).toHaveLength(1);
    expect(player.activeQuests[0].templateId).toBe("quest_a");

    // 模拟与 npc_hunter 对话
    player.memories.push({
      type: "conversation",
      content: "与猎人交谈",
      entityIds: ["npc_hunter"],
      importance: 0.5,
      tick: world.time.tick,
    });

    const questDelta = checkQuestProgress(world, "p1");
    expect(questDelta).not.toBeNull();
    expect(questDelta?.questChanges?.filter((c) => c.type === "complete")).toHaveLength(1);

    applyDelta(world, questDelta!);
    expect(player.completedQuests).toContain("quest_a");

    // stage completion
    const stageDelta = checkStageCompletion(world, "p1");
    expect(stageDelta).not.toBeNull();
    expect(player.activeStorylines[0].currentStage).toBe(1);
  });

  it("端到端：resolveQuestAccept → stage0 完成 → stage1 完成 → 剧情完结", () => {
    const world = createTestWorld([QUEST_A, QUEST_B, STORYLINE_BASIC]);
    const player = addPlayer(world, [{ name: "strength", value: 15 }]);

    const result = resolveQuestAccept(world, "p1", "story_basic");
    applyDelta(world, result.delta!);
    expect(player.activeStorylines).toHaveLength(1);

    player.completedQuests.push("quest_a");
    const s0 = checkStageCompletion(world, "p1");
    applyDelta(world, s0!);
    expect(player.activeStorylines[0].currentStage).toBe(1);

    player.completedQuests.push("quest_b");
    const s1 = checkStageCompletion(world, "p1");
    applyDelta(world, s1!);
    expect(player.activeStorylines).toHaveLength(0);
    expect(world.completedStorylines).toContain("story_basic");
  });
});

// ─── 集成：settleDay 联动 ────────────────────────────────

describe("集成：settleDay 联动", () => {
  it("settleDay 时 time 触发器自动触发", () => {
    const world = createTestWorld([QUEST_A, STORYLINE_TIME_TRIGGER]);
    const player = addPlayer(world);
    world.time.day = 3;

    const triggerDelta = checkTrigger(world, "p1");
    expect(triggerDelta).not.toBeNull();
    applyDelta(world, triggerDelta!);
    expect(player.activeStorylines).toHaveLength(1);
  });

  it("天数未满足时 settleDay 不触发", () => {
    const world = createTestWorld([QUEST_A, STORYLINE_TIME_TRIGGER]);
    const player = addPlayer(world);
    world.time.day = 1;

    const triggerDelta = checkTrigger(world, "p1");
    expect(triggerDelta).toBeNull();
    expect(player.activeStorylines).toHaveLength(0);
  });
});

// ─── 集成：ContentPool YAML 加载 ────────────────────────

describe("集成：ContentPool YAML 加载", () => {
  it("带 autoTrigger + stages 的 quest 模板可被 zod schema 解析", async () => {
    const { QuestTemplateSchema } = await import("../core/schemas/content-pool.ts");

    const data = {
      id: "story_test",
      title: "测试剧情",
      description: "测试",
      giverNpcId: null,
      objectives: [],
      rewards: { narrative: "完结" },
      repeatable: false,
      deadlineDays: null,
      autoTrigger: {
        type: "trait",
        conditions: [{ trait: "strength", operator: ">=", value: 10 }],
      },
      stages: [
        {
          id: "s1",
          title: "阶段一",
          questIds: ["quest_x"],
          completionCondition: "all",
          narrativeGuide: "开始",
        },
      ],
    };

    const result = QuestTemplateSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.autoTrigger?.type).toBe("trait");
      expect(result.data.stages).toHaveLength(1);
      expect(result.data.stages?.[0].questIds).toEqual(["quest_x"]);
    }
  });

  it("普通 quest 模板（无 stages）仍然正常解析", async () => {
    const { QuestTemplateSchema } = await import("../core/schemas/content-pool.ts");

    const data = {
      id: "quest_normal",
      title: "普通任务",
      description: "测试",
      giverNpcId: "npc_test",
      objectives: [
        {
          groupId: 0,
          condition: { type: "player_talked_to_npc", target: { kind: "npc", id: "npc_test" } },
          count: 1,
          description: "对话",
        },
      ],
      rewards: {},
      repeatable: false,
      deadlineDays: null,
    };

    const result = QuestTemplateSchema.safeParse(data);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.autoTrigger).toBeUndefined();
      expect(result.data.stages).toBeUndefined();
    }
  });

  it("空 objectives 数组的 storyline 模板可被解析", async () => {
    const { QuestTemplateSchema } = await import("../core/schemas/content-pool.ts");

    const data = {
      id: "story_empty",
      title: "空目标剧情",
      description: "测试",
      giverNpcId: null,
      objectives: [],
      rewards: {},
      repeatable: false,
      deadlineDays: null,
      autoTrigger: { type: "time", conditions: [{ day: 5, operator: ">=", value: 5 }] },
      stages: [
        {
          id: "s1",
          title: "阶段",
          questIds: ["q1"],
          completionCondition: "all",
          narrativeGuide: "引导",
        },
      ],
    };

    const result = QuestTemplateSchema.safeParse(data);
    expect(result.success).toBe(true);
  });
});

describe("matchTime with period and season triggers", () => {
  it("should trigger when period matches", () => {
    const world = createTestWorld();
    world.time.period = "night";
    world.time.day = 5;

    const storyline: QuestTemplate = {
      id: "story_night",
      title: "夜间剧情",
      description: "只在夜间触发",
      giverNpcId: null,
      objectives: [],
      rewards: {},
      repeatable: false,
      deadlineDays: null,
      autoTrigger: {
        type: "time",
        conditions: [{ period: "night" }],
      },
      stages: [
        {
          id: "s1",
          title: "夜间阶段",
          questIds: ["quest_a"],
          completionCondition: "all",
          narrativeGuide: "进入夜间",
        },
      ],
    };
    world.contentPool.questTemplates = [QUEST_A, storyline];

    const delta = checkTrigger(world, "player");
    expect(delta).not.toBeNull();
    expect(delta?.questChanges?.length).toBeGreaterThan(0);
  });

  it("should not trigger when season does not match", () => {
    const world = createTestWorld();
    world.time.season = "summer";
    world.time.day = 5;

    const storyline: QuestTemplate = {
      id: "story_winter",
      title: "冬季剧情",
      description: "只在冬季触发",
      giverNpcId: null,
      objectives: [],
      rewards: {},
      repeatable: false,
      deadlineDays: null,
      autoTrigger: {
        type: "time",
        conditions: [{ season: "winter" }],
      },
      stages: [
        {
          id: "s1",
          title: "冬季阶段",
          questIds: ["quest_a"],
          completionCondition: "all",
          narrativeGuide: "进入冬季",
        },
      ],
    };
    world.contentPool.questTemplates = [QUEST_A, storyline];

    const delta = checkTrigger(world, "player");
    expect(delta).toBeNull();
  });

  it("should trigger when season matches", () => {
    const world = createTestWorld();
    world.time.season = "winter";
    world.time.day = 5;

    const storyline: QuestTemplate = {
      id: "story_winter",
      title: "冬季剧情",
      description: "只在冬季触发",
      giverNpcId: null,
      objectives: [],
      rewards: {},
      repeatable: false,
      deadlineDays: null,
      autoTrigger: {
        type: "time",
        conditions: [{ season: "winter" }],
      },
      stages: [
        {
          id: "s1",
          title: "冬季阶段",
          questIds: ["quest_a"],
          completionCondition: "all",
          narrativeGuide: "进入冬季",
        },
      ],
    };
    world.contentPool.questTemplates = [QUEST_A, storyline];

    const delta = checkTrigger(world, "player");
    expect(delta).not.toBeNull();
    expect(delta?.questChanges?.length).toBeGreaterThan(0);
  });

  it("should not trigger when season does not match", () => {
    const world = createTestWorld();
    world.time.season = "summer";
    world.time.day = 5;

    const storyline: QuestTemplate = {
      id: "story_winter",
      title: "冬季剧情",
      description: "只在冬季触发",
      giverNpcId: null,
      objectives: [],
      rewards: {},
      repeatable: false,
      deadlineDays: null,
      autoTrigger: {
        type: "time",
        conditions: [{ season: "winter" }],
      },
      stages: [
        {
          id: "s1",
          title: "冬季阶段",
          questIds: ["quest_a"],
          completionCondition: "all",
          narrativeGuide: "进入冬季",
        },
      ],
    };
    world.contentPool.questTemplates = [storyline];

    const delta = checkTrigger(world, "player");
    expect(delta).toBeNull();
  });
});
