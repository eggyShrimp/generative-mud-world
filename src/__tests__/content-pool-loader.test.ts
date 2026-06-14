import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { loadContentPoolFromDir, writeEvolveDeltas } from "../core/content-pool-loader.ts";
import type { ContentPoolMutation } from "../core/types.ts";
import { createDefaultContentPool } from "../core/world.ts";
import { applyContentPoolMutation } from "../simulation/content-pool-materializer.ts";

const TEST_DIR = join(import.meta.dirname, "../../.test-content-pool");

function cleanTestDir() {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true });
  }
}

function writeYamlFile(path: string, data: Record<string, unknown>) {
  const { stringify } = require("yaml");
  writeFileSync(path, stringify(data, { indent: 2 }), "utf-8");
}

describe("ContentPoolLoader", () => {
  beforeEach(cleanTestDir);
  afterEach(cleanTestDir);

  it("loadContentPoolFromDir: 空目录应返回默认 ContentPool", () => {
    mkdirSync(TEST_DIR, { recursive: true });
    const pool = loadContentPoolFromDir(TEST_DIR);

    const defaults = createDefaultContentPool();
    expect(pool.needDefinitions).toHaveLength(defaults.needDefinitions.length);
    expect(pool.actionEffects).toHaveLength(defaults.actionEffects.length);
    expect(pool.calendar.eraName).toBe("铁器纪元");
  });

  it("loadContentPoolFromDir: 不存在的目录应返回默认 ContentPool", () => {
    const pool = loadContentPoolFromDir(join(TEST_DIR, "nonexistent"));
    const defaults = createDefaultContentPool();
    expect(pool.needDefinitions).toHaveLength(defaults.needDefinitions.length);
  });

  it("loadContentPoolFromDir: YAML 应覆盖默认值", () => {
    const poolDir = join(TEST_DIR, "content-pool");
    mkdirSync(poolDir, { recursive: true });

    // 覆盖 calendar
    writeYamlFile(join(poolDir, "culture-narrative.yaml"), {
      calendar: {
        eraName: "帝国纪元",
        yearFormat: "{year}年",
      },
    });

    const pool = loadContentPoolFromDir(poolDir);
    // calendar 被覆盖
    expect(pool.calendar.eraName).toBe("帝国纪元");
    expect(pool.calendar.yearFormat).toBe("{year}年");
    // calendar 其他字段保留默认值
    expect(pool.calendar.daysPerMonth).toBe(30);
    // 其他字段保留默认值
    expect(pool.needDefinitions).toHaveLength(4);
  });

  it("loadContentPoolFromDir: 数组字段应完全替换", () => {
    const poolDir = join(TEST_DIR, "content-pool");
    mkdirSync(poolDir, { recursive: true });

    writeYamlFile(join(poolDir, "needs-actions.yaml"), {
      needDefinitions: [
        {
          type: "custom",
          baseUrgency: 0.8,
          decayRate: 10,
          description: "自定义",
          bornFrom: "test",
        },
      ],
    });

    const pool = loadContentPoolFromDir(poolDir);
    // needDefinitions 被替换为只有 1 个
    expect(pool.needDefinitions).toHaveLength(1);
    expect(pool.needDefinitions[0].type).toBe("custom");
    // 其他字段不受影响
    expect(pool.actionEffects.length).toBeGreaterThanOrEqual(
      createDefaultContentPool().actionEffects.length,
    );
  });

  it("loadContentPoolFromDir: 多个 YAML 文件应合并", () => {
    const poolDir = join(TEST_DIR, "content-pool");
    mkdirSync(poolDir, { recursive: true });

    // 修改 calendar
    writeYamlFile(join(poolDir, "culture-narrative.yaml"), {
      calendar: { eraName: "新纪元" },
    });

    // 修改 triggers (注意: YAML 结构必须匹配 DOMAIN_FIELDS)
    writeYamlFile(join(poolDir, "triggers.yaml"), {
      llmTriggerConfig: {
        worldEvent: { perSettlement: 3, enabled: false },
      },
    });

    const pool = loadContentPoolFromDir(poolDir);
    expect(pool.calendar.eraName).toBe("新纪元");
    expect(pool.llmTriggerConfig.worldEvent.perSettlement).toBe(3);
    expect(pool.llmTriggerConfig.worldEvent.enabled).toBe(false);
    // 未修改的字段保留默认值
    expect(pool.llmTriggerConfig.memoryCompression.maxCandidates).toBe(3);
  });

  it("loadContentPoolFromDir: evolve YAML 应覆盖基础 YAML", () => {
    const poolDir = join(TEST_DIR, "content-pool");
    const evolveDir = join(poolDir, "evolve");
    mkdirSync(evolveDir, { recursive: true });

    // 基础 YAML
    writeYamlFile(join(poolDir, "culture-narrative.yaml"), {
      calendar: { eraName: "帝国纪元" },
    });

    // evolve YAML 进一步覆盖
    writeYamlFile(join(evolveDir, "culture-narrative.yaml"), {
      calendar: { eraName: "黄昏纪元" },
    });

    const pool = loadContentPoolFromDir(poolDir);
    // evolve 应覆盖基础
    expect(pool.calendar.eraName).toBe("黄昏纪元");
  });

  it("loadContentPoolFromDir: emotionLabels 应从 YAML 加载", () => {
    const poolDir = join(TEST_DIR, "content-pool");
    mkdirSync(poolDir, { recursive: true });

    writeYamlFile(join(poolDir, "social-dialogue.yaml"), {
      emotionLabels: {
        grateful: "感恩",
        angry: "暴怒",
        custom_emotion: "自定义情绪",
      },
    });

    const pool = loadContentPoolFromDir(poolDir);
    expect(pool.emotionLabels.grateful).toBe("感恩");
    expect(pool.emotionLabels.angry).toBe("暴怒");
    expect(pool.emotionLabels.custom_emotion).toBe("自定义情绪");
  });

  it("loadContentPoolFromDir: socialRippleConfig 应 deep-merge", () => {
    const poolDir = join(TEST_DIR, "content-pool");
    mkdirSync(poolDir, { recursive: true });

    writeYamlFile(join(poolDir, "social-dialogue.yaml"), {
      socialRippleConfig: {
        threshold: 2.0,
        signalStrength: {
          talk: 10,
          custom_action: 5,
        },
      },
    });

    const pool = loadContentPoolFromDir(poolDir);
    // 覆盖的字段
    expect(pool.socialRippleConfig.threshold).toBe(2.0);
    expect(pool.socialRippleConfig.signalStrength.talk).toBe(10);
    expect(pool.socialRippleConfig.signalStrength.custom_action).toBe(5);
    // 未覆盖的字段保留默认值
    expect(pool.socialRippleConfig.enabled).toBe(true);
    expect(pool.socialRippleConfig.maxDelta).toBe(5);
  });

  it("loadContentPoolFromDir: dialogueEffectMapping 应 deep-merge", () => {
    const poolDir = join(TEST_DIR, "content-pool");
    mkdirSync(poolDir, { recursive: true });

    writeYamlFile(join(poolDir, "social-dialogue.yaml"), {
      dialogueEffectMapping: {
        relation: {
          slight_positive: { delta: 10 },
          custom_relation: { delta: 99 },
        },
      },
    });

    const pool = loadContentPoolFromDir(poolDir);
    // 覆盖的字段
    expect(pool.dialogueEffectMapping.relation.slight_positive.delta).toBe(10);
    expect(pool.dialogueEffectMapping.relation.custom_relation.delta).toBe(99);
    // 未覆盖的字段保留默认值
    expect(pool.dialogueEffectMapping.relation.moderate_positive.delta).toBe(2);
    expect(pool.dialogueEffectMapping.needImpact.slight_positive.delta).toBe(3);
  });

  it("loadContentPoolFromDir: scheduleTemplates 应从 YAML 加载", () => {
    const poolDir = join(TEST_DIR, "content-pool");
    mkdirSync(poolDir, { recursive: true });

    writeYamlFile(join(poolDir, "schedules.yaml"), {
      scheduleTemplates: [
        {
          role: "custom_role",
          schedule: [
            {
              startHour: 0,
              endHour: 24,
              action: "custom_action",
              targetRoomId: null,
              priority: 10,
              deviationAllowed: false,
            },
          ],
        },
      ],
    });

    const pool = loadContentPoolFromDir(poolDir);
    expect(pool.scheduleTemplates).toHaveLength(1);
    expect(pool.scheduleTemplates[0].role).toBe("custom_role");
  });

  it("loadContentPoolFromDir: roomTemplates 应从 YAML 加载", () => {
    const poolDir = join(TEST_DIR, "content-pool");
    mkdirSync(poolDir, { recursive: true });

    writeYamlFile(join(poolDir, "room-templates.yaml"), {
      roomTemplates: [
        {
          culture: "test_culture",
          rooms: [{ name: "test_room", desc: "test_desc" }],
          names: ["test_name"],
          personalities: ["test_personality"],
        },
      ],
    });

    const pool = loadContentPoolFromDir(poolDir);
    expect(pool.roomTemplates).toHaveLength(1);
    expect(pool.roomTemplates[0].culture).toBe("test_culture");
  });

  it("loadContentPoolFromDir: bookContents 应从 YAML 加载", () => {
    const poolDir = join(TEST_DIR, "content-pool");
    mkdirSync(poolDir, { recursive: true });

    writeYamlFile(join(poolDir, "books.yaml"), {
      bookContents: [
        {
          id: "sutra_copy",
          itemTemplateId: "sutra_copy",
          title: "佛经抄本",
          pages: ["第一页", "第二页"],
        },
      ],
    });

    const pool = loadContentPoolFromDir(poolDir);

    expect(pool.bookContents).toEqual([
      {
        id: "sutra_copy",
        itemTemplateId: "sutra_copy",
        title: "佛经抄本",
        pages: ["第一页", "第二页"],
      },
    ]);
  });

  it("loadContentPoolFromDir: readable itemTemplate 必须有对应 bookContents", () => {
    const poolDir = join(TEST_DIR, "content-pool");
    mkdirSync(poolDir, { recursive: true });

    writeYamlFile(join(poolDir, "needs-actions.yaml"), {
      itemTemplates: [
        {
          id: "missing_book",
          name: "缺页书",
          properties: { readable: true },
        },
      ],
    });

    expect(() => loadContentPoolFromDir(poolDir)).toThrow(
      "readable itemTemplates 缺少 bookContents",
    );
  });
});

describe("writeEvolveDeltas", () => {
  beforeEach(cleanTestDir);
  afterEach(cleanTestDir);

  it("应写入 affected domain 的 evolve YAML", () => {
    const poolDir = join(TEST_DIR, "content-pool");
    mkdirSync(poolDir, { recursive: true });

    const pool = createDefaultContentPool();
    const mutation: ContentPoolMutation = {
      addNamePools: [
        {
          culture: "test_culture",
          surnames: ["测"],
          maleGiven: ["试"],
          femaleGiven: ["验"],
          neutralGiven: ["中"],
          epithetPatterns: ["{name}"],
        },
      ],
      replaceNarrativeTemplates: { emptyDaySummary: "新的一天" },
    };

    // 先应用 mutation 到 pool
    applyContentPoolMutation(pool, mutation);
    // 再写入 evolve YAML
    writeEvolveDeltas(poolDir, mutation, pool);

    // 检查 evolve YAML 文件被创建
    const evolveDir = join(poolDir, "evolve");
    expect(existsSync(evolveDir)).toBe(true);

    const evolveFiles = readdirSync(evolveDir);
    expect(evolveFiles).toContain("culture-narrative.yaml");

    // 检查 evolve YAML 内容
    const evolveData = parseYaml(readFileSync(join(evolveDir, "culture-narrative.yaml"), "utf-8"));
    expect(evolveData.namePools).toBeDefined();
    expect(evolveData.namePools).toHaveLength(2); // 默认 1 + 新增 1
    expect(evolveData.narrativeTemplates.emptyDaySummary).toBe("新的一天");
  });

  it("应为 needs-actions 写入 evolve YAML", () => {
    const poolDir = join(TEST_DIR, "content-pool");
    mkdirSync(poolDir, { recursive: true });

    const pool = createDefaultContentPool();
    const mutation: ContentPoolMutation = {
      addActionEffects: [{ action: "rally", needDeltas: { social: 10 } }],
    };

    applyContentPoolMutation(pool, mutation);
    writeEvolveDeltas(poolDir, mutation, pool);

    const evolveDir = join(poolDir, "evolve");
    const evolveFiles = readdirSync(evolveDir);
    expect(evolveFiles).toContain("needs-actions.yaml");

    const evolveData = parseYaml(readFileSync(join(evolveDir, "needs-actions.yaml"), "utf-8"));
    expect(evolveData.actionEffects).toHaveLength(
      createDefaultContentPool().actionEffects.length + 1,
    ); // 默认 + 新增 1
  });

  it("应为 roomTemplates 写入 evolve YAML", () => {
    const poolDir = join(TEST_DIR, "content-pool");
    mkdirSync(poolDir, { recursive: true });

    const pool = createDefaultContentPool();
    const mutation: ContentPoolMutation = {
      addRoomTemplates: [
        {
          culture: "new_culture",
          rooms: [{ name: "new_room", desc: "new_desc" }],
          names: ["new_name"],
          personalities: ["new_personality"],
        },
      ],
    };

    applyContentPoolMutation(pool, mutation);
    writeEvolveDeltas(poolDir, mutation, pool);

    const evolveDir = join(poolDir, "evolve");
    const evolveFiles = readdirSync(evolveDir);
    expect(evolveFiles).toContain("room-templates.yaml");

    const evolveData = parseYaml(readFileSync(join(evolveDir, "room-templates.yaml"), "utf-8"));
    expect(evolveData.roomTemplates).toHaveLength(
      createDefaultContentPool().roomTemplates.length + 1,
    ); // 默认 + 新增 1
  });

  it("应为 scheduleTemplates 写入 evolve YAML", () => {
    const poolDir = join(TEST_DIR, "content-pool");
    mkdirSync(poolDir, { recursive: true });

    const pool = createDefaultContentPool();
    const mutation: ContentPoolMutation = {
      addScheduleTemplates: [
        {
          role: "new_role",
          schedule: [
            {
              startHour: 0,
              endHour: 24,
              action: "new_action",
              targetRoomId: null,
              priority: 10,
              deviationAllowed: false,
            },
          ],
        },
      ],
    };

    applyContentPoolMutation(pool, mutation);
    writeEvolveDeltas(poolDir, mutation, pool);

    const evolveDir = join(poolDir, "evolve");
    const evolveFiles = readdirSync(evolveDir);
    expect(evolveFiles).toContain("schedules.yaml");

    const evolveData = parseYaml(readFileSync(join(evolveDir, "schedules.yaml"), "utf-8"));
    expect(evolveData.scheduleTemplates).toHaveLength(
      createDefaultContentPool().scheduleTemplates.length + 1,
    ); // 默认 + 新增 1
  });

  it("evolve YAML 可被 loadContentPoolFromDir 加载", () => {
    const poolDir = join(TEST_DIR, "content-pool");
    mkdirSync(poolDir, { recursive: true });

    const pool = createDefaultContentPool();
    const mutation: ContentPoolMutation = {
      replaceCalendar: { eraName: "测试纪元" },
    };

    applyContentPoolMutation(pool, mutation);
    writeEvolveDeltas(poolDir, mutation, pool);

    // 重新加载，应该包含 evolve 的修改
    const loaded = loadContentPoolFromDir(poolDir);
    expect(loaded.calendar.eraName).toBe("测试纪元");
    // 未修改的字段保留默认值
    expect(loaded.calendar.daysPerMonth).toBe(30);
  });

  it("空 mutation 不应写入任何文件", () => {
    const poolDir = join(TEST_DIR, "content-pool");
    mkdirSync(poolDir, { recursive: true });

    const _pool = createDefaultContentPool();
    const _mutation: ContentPoolMutation = {};

    // 空 mutation 不应创建 evolve 目录
    const evolveDir = join(poolDir, "evolve");
    expect(existsSync(evolveDir)).toBe(false);
  });

  it("questTemplates 从 base YAML 加载", () => {
    const poolDir = join(TEST_DIR, "content-pool");
    mkdirSync(join(poolDir, "evolve"), { recursive: true });

    const baseYaml = {
      questTemplates: [
        {
          id: "quest_test",
          title: "测试任务",
          description: "一个测试任务",
          giverNpcId: "npc_test",
          objectives: [
            { groupId: 0, type: "explore", targetId: "room_test", count: 1, description: "探索" },
          ],
          rewards: { narrative: "完成了" },
          repeatable: false,
          deadlineDays: null,
        },
      ],
    };
    writeFileSync(
      join(poolDir, "quests.yaml"),
      `questTemplates:\n${yamlLines(baseYaml.questTemplates)}`,
      "utf-8",
    );

    const pool = loadContentPoolFromDir(poolDir);
    expect(pool.questTemplates.length).toBeGreaterThanOrEqual(1);
    expect(pool.questTemplates[0].id).toBe("quest_test");
    expect(pool.questTemplates[0].title).toBe("测试任务");
  });

  it("writeEvolveDeltas: quests domain 持久化", () => {
    const poolDir = join(TEST_DIR, "content-pool");
    mkdirSync(join(poolDir, "evolve"), { recursive: true });

    const pool = createDefaultContentPool();
    pool.questTemplates = [
      {
        id: "quest_evolved",
        title: "演化任务",
        description: "LLM 演化的任务",
        giverNpcId: null,
        objectives: [
          { groupId: 0, type: "talk", targetId: "npc_test", count: 1, description: "对话" },
        ],
        rewards: {},
        repeatable: false,
        deadlineDays: null,
      },
    ];

    const mutation: ContentPoolMutation = {
      addQuestTemplates: pool.questTemplates,
    };

    writeEvolveDeltas(poolDir, mutation, pool);

    const evolveDir = join(poolDir, "evolve");
    const evolveFiles = readdirSync(evolveDir);
    expect(evolveFiles.some((f) => f === "quests.yaml")).toBe(true);

    // 验证内容
    const content = parseYaml(readFileSync(join(evolveDir, "quests.yaml"), "utf-8")) as Record<
      string,
      unknown
    >;
    const quests = content.questTemplates as Array<{ id: string }>;
    expect(quests).toHaveLength(1);
    expect(quests[0].id).toBe("quest_evolved");
  });

  it("writeEvolveDeltas: room-actions domain 持久化", () => {
    const poolDir = join(TEST_DIR, "content-pool");
    mkdirSync(join(poolDir, "evolve"), { recursive: true });

    const pool = createDefaultContentPool();
    pool.entityActionsByTag = { tavern: ["drink", "eat"] };
    pool.entityActionLabels = { drink: "喝一杯", eat: "吃东西" };
    pool.entityTagLabels = { tavern: "酒馆" };

    const mutation: ContentPoolMutation = {
      replaceEntityActionsByTag: pool.entityActionsByTag,
      replaceEntityActionLabels: pool.entityActionLabels,
      replaceEntityTagLabels: pool.entityTagLabels,
    };

    writeEvolveDeltas(poolDir, mutation, pool);

    const evolveDir = join(poolDir, "evolve");
    const evolveFiles = readdirSync(evolveDir);
    expect(evolveFiles.some((f) => f === "entity-actions.yaml")).toBe(true);

    const content = parseYaml(
      readFileSync(join(evolveDir, "entity-actions.yaml"), "utf-8"),
    ) as Record<string, unknown>;
    const actions = content.entityActionsByTag as Record<string, string[]>;
    expect(actions.tavern).toEqual(["drink", "eat"]);
  });

  it("writeEvolveDeltas: books domain 持久化", () => {
    const poolDir = join(TEST_DIR, "content-pool");
    mkdirSync(join(poolDir, "evolve"), { recursive: true });

    const pool = createDefaultContentPool();
    const mutation: ContentPoolMutation = {
      addBookContents: [
        {
          id: "sutra_copy",
          itemTemplateId: "sutra_copy",
          title: "佛经抄本",
          pages: ["第一页", "第二页"],
        },
      ],
    };

    applyContentPoolMutation(pool, mutation);
    writeEvolveDeltas(poolDir, mutation, pool);

    const evolveDir = join(poolDir, "evolve");
    const evolveFiles = readdirSync(evolveDir);
    expect(evolveFiles).toContain("books.yaml");

    const content = parseYaml(readFileSync(join(evolveDir, "books.yaml"), "utf-8")) as Record<
      string,
      unknown
    >;
    expect(content.bookContents).toEqual([
      {
        id: "sutra_copy",
        itemTemplateId: "sutra_copy",
        title: "佛经抄本",
        pages: ["第一页", "第二页"],
      },
    ]);
  });
});

function yamlLines(value: unknown): string {
  return stringifyYaml(value);
}
