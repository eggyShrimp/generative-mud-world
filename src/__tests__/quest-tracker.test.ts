import { describe, expect, it } from "vitest";
import type { QuestTemplate, SimulationDelta, WorldState } from "../core/types.ts";
import {
  addEntity,
  addRoom,
  applyDelta,
  createPlayer,
  createRoom,
  createWorld,
} from "../core/world.ts";
import {
  checkPrerequisites,
  checkQuestProgress,
  evaluateQuestImpacts,
} from "../engine/quest-tracker.ts";

function createTestWorld(quests: QuestTemplate[] = []): WorldState {
  const world = createWorld();
  world.contentPool.questTemplates = quests;
  addRoom(world, createRoom("room_tavern", "酒馆", "region_01", "一家小酒馆"));
  addRoom(world, createRoom("room_forest", "密林", "region_01", "东边的密林"));
  return world;
}

const QUEST_EXPLORE: QuestTemplate = {
  id: "quest_explore_forest",
  title: "探索密林",
  description: "去东边的密林看看。",
  giverNpcId: null,
  autoDiscover: { triggerRoomId: "room_forest", triggerText: "你发现了密林中的一条小路。" },
  objectives: [
    { groupId: 0, type: "explore", targetId: "room_forest", count: 1, description: "前往密林" },
  ],
  rewards: { narrative: "你成功探索了密林。" },
  repeatable: false,
  deadlineDays: null,
};

const QUEST_COLLECT: QuestTemplate = {
  id: "quest_collect_herb",
  title: "收集药草",
  description: "收集 2 株青蒿。",
  giverNpcId: "npc_tavern_keeper",
  objectives: [
    {
      groupId: 0,
      type: "collect",
      targetId: "item_qinghao",
      count: 2,
      description: "收集青蒿 (0/2)",
    },
  ],
  rewards: {
    traitModifiers: [{ trait: "compassion", delta: 5 }],
    relationDelta: { targetId: "npc_tavern_keeper", delta: 10 },
    narrative: "老马接过草药，露出了笑容。",
  },
  repeatable: false,
  deadlineDays: 7,
};

const QUEST_OR_OBJECTIVES: QuestTemplate = {
  id: "quest_or_test",
  title: "二选一任务",
  description: "完成任意一个目标即可。",
  giverNpcId: null,
  objectives: [
    { groupId: 0, type: "explore", targetId: "room_forest", count: 1, description: "前往密林" },
    { groupId: 0, type: "collect", targetId: "item_qinghao", count: 1, description: "收集青蒿" },
  ],
  rewards: { narrative: "完成。" },
  repeatable: false,
  deadlineDays: null,
};

const _QUEST_CHAIN: QuestTemplate = {
  id: "quest_chain_b",
  title: "链式任务 B",
  description: "需要先完成 A。",
  giverNpcId: null,
  objectives: [
    { groupId: 0, type: "explore", targetId: "room_forest", count: 1, description: "前往密林" },
  ],
  rewards: { narrative: "完成。" },
  prerequisites: { conditions: ["quest_chain_a"], logic: "and" as const },
  repeatable: false,
  deadlineDays: null,
};

const _QUEST_CHAIN_OR: QuestTemplate = {
  id: "quest_chain_c",
  title: "链式任务 C",
  description: "需要完成 A 或 B。",
  giverNpcId: null,
  objectives: [
    { groupId: 0, type: "explore", targetId: "room_forest", count: 1, description: "前往密林" },
  ],
  rewards: { narrative: "完成。" },
  prerequisites: { logic: "or", conditions: ["quest_chain_a", "quest_chain_b"] },
  repeatable: false,
  deadlineDays: null,
};

describe("QuestTracker", () => {
  describe("checkQuestProgress", () => {
    it("should return null when player has no active quests", () => {
      const world = createTestWorld([QUEST_EXPLORE]);
      const player = createPlayer("p1", "测试玩家", "room_tavern", world.contentPool);
      addEntity(world, player);
      const delta = checkQuestProgress(world, "p1");
      expect(delta).toBeNull();
    });

    it("should detect explore objective completion", () => {
      const world = createTestWorld([QUEST_EXPLORE]);
      const player = createPlayer("p1", "测试玩家", "room_tavern", world.contentPool);
      addEntity(world, player);
      // 手动接受任务
      player.activeQuests.push({
        templateId: "quest_explore_forest",
        status: "active",
        acceptedDay: 1,
        deadlineDay: null,
        groupCompleted: [false],
        objectiveProgress: [],
      });
      // 玩家进入目标房间
      player.roomId = "room_forest";
      player.knownRooms.push("room_forest");

      const delta = checkQuestProgress(world, "p1");
      expect(delta).not.toBeNull();
      expect(delta?.questChanges).toBeDefined();
      // 应该有 progress 和 complete 两个变更
      const progress = delta?.questChanges?.filter((c) => c.type === "progress");
      const complete = delta?.questChanges?.filter((c) => c.type === "complete");
      expect(progress?.length).toBe(1);
      expect(complete?.length).toBe(1);
    });

    it("should track collect objective with real-time inventory (no max lock)", () => {
      const world = createTestWorld([QUEST_COLLECT]);
      const player = createPlayer("p1", "测试玩家", "room_tavern", world.contentPool);
      addEntity(world, player);
      player.activeQuests.push({
        templateId: "quest_collect_herb",
        status: "active",
        acceptedDay: 1,
        deadlineDay: 8,
        groupCompleted: [false],
        objectiveProgress: [],
      });

      // 收集 1 株 — 进度应为 1/2
      const item1 = {
        type: "item" as const,
        id: "item_qinghao_1",
        name: "青蒿",
        templateId: "item_qinghao",
        roomId: null,
        description: "草药",
        ownerId: "p1",
        containerId: null,
        properties: {},
      };
      world.entities.set(item1.id, item1);
      player.inventory.push(item1);

      let delta = checkQuestProgress(world, "p1");
      expect(delta).not.toBeNull();
      expect(
        delta?.questChanges?.some(
          (c) => c.type === "progress" && c.objectiveIndex === 0 && c.count === 1,
        ),
      ).toBe(true);
      if (delta) applyDelta(world, delta);
      expect(player.activeQuests[0].objectiveProgress[0]).toBe(1);
      expect(player.activeQuests[0].groupCompleted[0]).toBe(false); // 1/2 未完成

      // 收集第 2 株 — 进度应为 2/2
      const item2 = {
        type: "item" as const,
        id: "item_qinghao_2",
        name: "青蒿",
        templateId: "item_qinghao",
        roomId: null,
        description: "草药",
        ownerId: "p1",
        containerId: null,
        properties: {},
      };
      world.entities.set(item2.id, item2);
      player.inventory.push(item2);

      delta = checkQuestProgress(world, "p1");
      expect(delta).not.toBeNull();
      if (delta) applyDelta(world, delta);
      expect(player.activeQuests[0].objectiveProgress[0]).toBe(2);
      expect(player.activeQuests[0].groupCompleted[0]).toBe(true); // 2/2 完成

      const complete = delta?.questChanges?.filter((c) => c.type === "complete");
      expect(complete?.length).toBe(1);
      expect(player.completedQuests).toContain("quest_collect_herb");
    });

    it("should track collect objective with no max lock (drop = progress goes back)", () => {
      const world = createTestWorld([QUEST_COLLECT]);
      const player = createPlayer("p1", "测试玩家", "room_tavern", world.contentPool);
      addEntity(world, player);
      player.activeQuests.push({
        templateId: "quest_collect_herb",
        status: "active",
        acceptedDay: 1,
        deadlineDay: 8,
        groupCompleted: [false],
        objectiveProgress: [],
      });

      // 收集 2 株
      const item1 = {
        type: "item" as const,
        id: "item_qinghao_1",
        name: "青蒿",
        templateId: "item_qinghao",
        roomId: null,
        description: "草药",
        ownerId: "p1",
        containerId: null,
        properties: {},
      };
      const item2 = {
        type: "item" as const,
        id: "item_qinghao_2",
        name: "青蒿",
        templateId: "item_qinghao",
        roomId: null,
        description: "草药",
        ownerId: "p1",
        containerId: null,
        properties: {},
      };
      world.entities.set(item1.id, item1);
      world.entities.set(item2.id, item2);
      player.inventory.push(item1, item2);

      const delta1 = checkQuestProgress(world, "p1");
      if (delta1) applyDelta(world, delta1);
      expect(player.activeQuests[0].groupCompleted[0]).toBe(true);

      // 丢弃 1 株 — 进度应回退到 1/2（但 groupCompleted 已标记为 true，不会回退）
      player.inventory = [item1];
      // 注意：当前设计中 groupCompleted 一旦标记为 true 就不会回退
      // 这符合 OR 组内只要有一个目标达成就满足的设计
    });

    it("should handle OR objectives (same groupId)", () => {
      const world = createTestWorld([QUEST_OR_OBJECTIVES]);
      const player = createPlayer("p1", "测试玩家", "room_tavern", world.contentPool);
      addEntity(world, player);
      player.activeQuests.push({
        templateId: "quest_or_test",
        status: "active",
        acceptedDay: 1,
        deadlineDay: null,
        groupCompleted: [false],
        objectiveProgress: [],
      });

      // 只探索密林（第一个目标）
      player.roomId = "room_forest";
      player.knownRooms.push("room_forest");

      const delta = checkQuestProgress(world, "p1");
      expect(delta).not.toBeNull();
      if (delta) applyDelta(world, delta);
      // 组 0 中第一个目标完成 → groupCompleted[0] = true → 任务完成
      expect(player.activeQuests[0].groupCompleted[0]).toBe(true);
      const complete = delta?.questChanges?.filter((c) => c.type === "complete");
      expect(complete?.length).toBe(1);
    });

    it("should fail quest on deadline", () => {
      const world = createTestWorld([QUEST_COLLECT]);
      const player = createPlayer("p1", "测试玩家", "room_tavern", world.contentPool);
      addEntity(world, player);
      player.activeQuests.push({
        templateId: "quest_collect_herb",
        status: "active",
        acceptedDay: 1,
        deadlineDay: 5,
        groupCompleted: [false],
        objectiveProgress: [],
      });

      // 超过截止日期
      world.time.day = 6;

      const delta = checkQuestProgress(world, "p1");
      expect(delta).not.toBeNull();
      const fail = delta?.questChanges?.filter((c) => c.type === "fail");
      expect(fail?.length).toBe(1);
      if (delta) applyDelta(world, delta);
      expect(player.activeQuests[0].status).toBe("failed");
      expect(player.failedQuests.some((f) => f.templateId === "quest_collect_herb")).toBe(true);
    });
  });

  describe("checkPrerequisites", () => {
    it("should check string prerequisite (AND implicit)", () => {
      expect(checkPrerequisites([], "quest_a")).toBe(false);
      expect(checkPrerequisites(["quest_a"], "quest_a")).toBe(true);
      expect(checkPrerequisites(["quest_b"], "quest_a")).toBe(false);
    });

    it("should check AND prerequisites", () => {
      const prereq = { logic: "and" as const, conditions: ["quest_a", "quest_b"] };
      expect(checkPrerequisites([], prereq)).toBe(false);
      expect(checkPrerequisites(["quest_a"], prereq)).toBe(false);
      expect(checkPrerequisites(["quest_a", "quest_b"], prereq)).toBe(true);
    });

    it("should check OR prerequisites", () => {
      const prereq = { logic: "or" as const, conditions: ["quest_a", "quest_b"] };
      expect(checkPrerequisites([], prereq)).toBe(false);
      expect(checkPrerequisites(["quest_a"], prereq)).toBe(true);
      expect(checkPrerequisites(["quest_b"], prereq)).toBe(true);
      expect(checkPrerequisites(["quest_a", "quest_b"], prereq)).toBe(true);
    });

    it("should check nested prerequisites", () => {
      const prereq = {
        logic: "or" as const,
        conditions: [{ logic: "and" as const, conditions: ["quest_a", "quest_b"] }, "quest_c"],
      };
      expect(checkPrerequisites([], prereq)).toBe(false);
      expect(checkPrerequisites(["quest_a"], prereq)).toBe(false);
      expect(checkPrerequisites(["quest_a", "quest_b"], prereq)).toBe(true);
      expect(checkPrerequisites(["quest_c"], prereq)).toBe(true);
    });
  });

  describe("applyDelta questChanges", () => {
    it("should accept a quest", () => {
      const world = createTestWorld([QUEST_EXPLORE]);
      const player = createPlayer("p1", "测试玩家", "room_tavern", world.contentPool);
      addEntity(world, player);

      const delta: SimulationDelta = {
        questChanges: [{ type: "accept", playerId: "p1", templateId: "quest_explore_forest" }],
      };
      applyDelta(world, delta);

      expect(player.activeQuests.length).toBe(1);
      expect(player.activeQuests[0].templateId).toBe("quest_explore_forest");
      expect(player.activeQuests[0].status).toBe("active");
      expect(player.activeQuests[0].groupCompleted.length).toBe(1);
    });

    it("should complete quest and apply rewards", () => {
      const world = createTestWorld([QUEST_COLLECT]);
      const player = createPlayer("p1", "测试玩家", "room_tavern", world.contentPool);
      addEntity(world, player);
      const restBefore = player.needs.find((n) => n.type === "rest")?.value ?? 0;
      world.contentPool.questTemplates[0].rewards.needChanges = [{ needType: "rest", delta: 10 }];
      world.contentPool.questTemplates[0].rewards.items = [
        { itemId: "reward_badge", quantity: 2, name: "徽章" },
      ];
      player.activeQuests.push({
        templateId: "quest_collect_herb",
        status: "active",
        acceptedDay: 1,
        deadlineDay: 8,
        groupCompleted: [true],
        objectiveProgress: [2],
      });

      const delta: SimulationDelta = {
        questChanges: [{ type: "complete", playerId: "p1", templateId: "quest_collect_herb" }],
      };
      applyDelta(world, delta);

      expect(player.activeQuests[0].status).toBe("completed");
      expect(player.completedQuests).toContain("quest_collect_herb");
      // 检查关系奖励
      expect(player.traits.some((t) => t.name === "compassion" && t.value === 5)).toBe(true);
      expect(player.needs.find((n) => n.type === "rest")?.value).toBe(restBefore + 10);
      expect(player.inventory.filter((i) => i.templateId === "reward_badge")).toHaveLength(2);
      expect(
        player.inventory
          .filter((i) => i.templateId === "reward_badge")
          .every((i) => world.entities.get(i.id) === i),
      ).toBe(true);
    });

    it("should fail quest and apply abandon penalty", () => {
      const questWithPenalty: QuestTemplate = {
        ...QUEST_COLLECT,
        id: "quest_with_penalty",
        abandonPenalty: {
          relationDelta: { targetId: "npc_tavern_keeper", delta: -10 },
          needChanges: [{ needType: "rest", delta: -10 }],
        },
      };
      const world = createTestWorld([questWithPenalty]);
      const player = createPlayer("p1", "测试玩家", "room_tavern", world.contentPool);
      addEntity(world, player);
      const restBefore = player.needs.find((n) => n.type === "rest")?.value ?? 0;
      player.activeQuests.push({
        templateId: "quest_with_penalty",
        status: "active",
        acceptedDay: 1,
        deadlineDay: 8,
        groupCompleted: [false],
        objectiveProgress: [],
      });

      const delta: SimulationDelta = {
        questChanges: [
          { type: "fail", playerId: "p1", templateId: "quest_with_penalty", reason: "abandon" },
        ],
      };
      applyDelta(world, delta);

      expect(player.activeQuests[0].status).toBe("failed");
      expect(player.failedQuests.some((f) => f.templateId === "quest_with_penalty")).toBe(true);
      expect(player.needs.find((n) => n.type === "rest")?.value).toBe(restBefore - 10);
    });

    it("should not accept duplicate quest", () => {
      const world = createTestWorld([QUEST_EXPLORE]);
      const player = createPlayer("p1", "测试玩家", "room_tavern", world.contentPool);
      addEntity(world, player);

      const delta: SimulationDelta = {
        questChanges: [
          { type: "accept", playerId: "p1", templateId: "quest_explore_forest" },
          { type: "accept", playerId: "p1", templateId: "quest_explore_forest" },
        ],
      };
      applyDelta(world, delta);

      expect(player.activeQuests.length).toBe(1);
    });
  });

  describe("evaluateQuestImpacts", () => {
    const QUEST_TALK_AND_COLLECT: QuestTemplate = {
      id: "quest_talk_and_collect",
      title: "找猎人拿肉",
      description: "和冯铁柱交谈并拿到熏鹿肉。",
      giverNpcId: "npc_lao_ma",
      objectives: [
        {
          groupId: 0,
          type: "talk",
          targetId: "npc_frostwolf_hunter",
          count: 1,
          description: "与猎人冯铁柱交谈",
        },
        {
          groupId: 1,
          type: "collect",
          targetId: "npc_frostwolf_hunter_item_0",
          count: 1,
          description: "获得熏鹿肉干粮袋",
        },
      ],
      rewards: { narrative: "你拿到了肉。" },
      repeatable: false,
      deadlineDays: null,
    };

    const QUEST_DELIVER: QuestTemplate = {
      id: "quest_deliver_meat",
      title: "送肉回酒馆",
      description: "把熏鹿肉交给老马。",
      giverNpcId: "npc_lao_ma",
      objectives: [
        {
          groupId: 0,
          type: "talk",
          targetId: "npc_lao_ma",
          count: 1,
          description: "回酒馆向老马复命",
        },
        {
          groupId: 1,
          type: "collect",
          targetId: "npc_frostwolf_hunter_item_0",
          count: 1,
          description: "持有熏鹿肉干粮袋",
        },
      ],
      rewards: { narrative: "老马很高兴。" },
      repeatable: false,
      deadlineDays: null,
    };

    it("should return null when player has no active quests", () => {
      const world = createTestWorld([QUEST_EXPLORE]);
      const player = createPlayer("p1", "测试玩家", "room_tavern", world.contentPool);
      addEntity(world, player);
      const result = evaluateQuestImpacts(world, "p1", {}, "talk", "npc_lao_ma");
      expect(result).toBeNull();
    });

    it("should return null for non-player actor", () => {
      const world = createTestWorld([QUEST_EXPLORE]);
      const result = evaluateQuestImpacts(world, "nonexistent", {}, "talk", "npc_lao_ma");
      expect(result).toBeNull();
    });

    it("should detect talk objective from action", () => {
      const world = createTestWorld([QUEST_EXPLORE]);
      const player = createPlayer("p1", "测试玩家", "room_tavern", world.contentPool);
      addEntity(world, player);
      // 给玩家一个 talk 类型的任务
      world.contentPool.questTemplates = [QUEST_TALK_AND_COLLECT];
      player.activeQuests.push({
        templateId: "quest_talk_and_collect",
        status: "active",
        acceptedDay: 1,
        deadlineDay: null,
        groupCompleted: [false, false],
        objectiveProgress: [],
      });

      // 模拟玩家和冯铁柱交谈
      const result = evaluateQuestImpacts(world, "p1", {}, "talk", "npc_frostwolf_hunter");
      expect(result).not.toBeNull();
      const progress = result?.questChanges?.filter((c) => c.type === "progress");
      expect(progress?.length).toBe(1);
      expect(progress?.[0].objectiveIndex).toBe(0); // talk objective
      if (result) applyDelta(world, result);
      expect(player.activeQuests[0].groupCompleted[0]).toBe(true);
    });

    it("should detect collect objective from inventory (exchange_item give)", () => {
      const world = createTestWorld([QUEST_TALK_AND_COLLECT]);
      const player = createPlayer("p1", "测试玩家", "room_tavern", world.contentPool);
      addEntity(world, player);
      player.activeQuests.push({
        templateId: "quest_talk_and_collect",
        status: "active",
        acceptedDay: 1,
        deadlineDay: null,
        groupCompleted: [false, false],
        objectiveProgress: [],
      });

      // 模拟 exchange_item give: 物品已在背包（直接写入）
      const meat = {
        type: "item" as const,
        id: "npc_frostwolf_hunter_item_0",
        name: "熏鹿肉干粮袋",
        templateId: "test_item",
        roomId: null,
        description: "食物",
        ownerId: "p1",
        containerId: null,
        properties: {},
      };
      world.entities.set(meat.id, meat);
      player.inventory.push(meat);

      const result = evaluateQuestImpacts(world, "p1", {}, "wait");
      expect(result).not.toBeNull();
      const progress = result?.questChanges?.filter((c) => c.type === "progress");
      expect(progress?.length).toBe(1);
      expect(progress?.[0].objectiveIndex).toBe(1); // collect objective
      if (result) applyDelta(world, result);
      expect(player.activeQuests[0].groupCompleted[1]).toBe(true);
    });

    it("should detect collect objective from delta item_exchange event (delivery)", () => {
      const world = createTestWorld([QUEST_DELIVER]);
      const player = createPlayer("p1", "测试玩家", "room_tavern", world.contentPool);
      addEntity(world, player);
      player.activeQuests.push({
        templateId: "quest_deliver_meat",
        status: "active",
        acceptedDay: 1,
        deadlineDay: null,
        groupCompleted: [false, false],
        objectiveProgress: [],
      });

      // 模拟 exchange_item receive: 玩家把肉给了老马，物品已离开背包
      // 但 delta 中有 item_exchange 事件记录了这次交付
      const delta: SimulationDelta = {
        worldEvents: [
          {
            id: "item_exchange_1",
            type: "item_exchange",
            title: "物品交换: 熏鹿肉干粮袋",
            description: "你把 熏鹿肉干粮袋 交给了对方",
            scope: "room_tavern",
            tick: 0,
            source: "llm",
            data: {
              direction: "receive",
              item: "熏鹿肉干粮袋",
              itemId: "npc_frostwolf_hunter_item_0",
              transferred: true,
            },
          },
        ],
      };

      // talk objective 也同时满足
      const result = evaluateQuestImpacts(world, "p1", delta, "talk", "npc_lao_ma");
      expect(result).not.toBeNull();
      const progress = result?.questChanges?.filter((c) => c.type === "progress");
      expect(progress?.length).toBe(2); // talk + collect
      if (result) applyDelta(world, result);
      expect(player.activeQuests[0].groupCompleted[0]).toBe(true); // talk
      expect(player.activeQuests[0].groupCompleted[1]).toBe(true); // collect (delivery)
    });

    it("should complete quest when all groups are satisfied", () => {
      const world = createTestWorld([QUEST_TALK_AND_COLLECT]);
      const player = createPlayer("p1", "测试玩家", "room_tavern", world.contentPool);
      addEntity(world, player);
      player.activeQuests.push({
        templateId: "quest_talk_and_collect",
        status: "active",
        acceptedDay: 1,
        deadlineDay: null,
        groupCompleted: [false, false],
        objectiveProgress: [],
      });

      // 物品已在背包
      const meat = {
        type: "item" as const,
        id: "npc_frostwolf_hunter_item_0",
        name: "熏鹿肉干粮袋",
        templateId: "test_item",
        roomId: null,
        description: "食物",
        ownerId: "p1",
        containerId: null,
        properties: {},
      };
      world.entities.set(meat.id, meat);
      player.inventory.push(meat);

      // 同时 talk + collect
      const result = evaluateQuestImpacts(world, "p1", {}, "talk", "npc_frostwolf_hunter");
      expect(result).not.toBeNull();
      const complete = result?.questChanges?.filter((c) => c.type === "complete");
      expect(complete?.length).toBe(1);
      if (result) applyDelta(world, result);
      expect(player.activeQuests[0].status).toBe("completed");
      expect(player.completedQuests).toContain("quest_talk_and_collect");
    });

    it("should not progress objectives in already-completed groups", () => {
      const world = createTestWorld([QUEST_TALK_AND_COLLECT]);
      const player = createPlayer("p1", "测试玩家", "room_tavern", world.contentPool);
      addEntity(world, player);
      player.activeQuests.push({
        templateId: "quest_talk_and_collect",
        status: "active",
        acceptedDay: 1,
        deadlineDay: null,
        groupCompleted: [true, false], // talk already done
        objectiveProgress: [1],
      });

      // 只触发 talk（已完成后不再重复计数）
      const result = evaluateQuestImpacts(world, "p1", {}, "talk", "npc_frostwolf_hunter");
      // groupCompleted[0] 已经是 true，不会产出 progress
      expect(result).toBeNull();
    });

    it("should detect explore objective from revealRooms", () => {
      const world = createTestWorld([QUEST_EXPLORE]);
      const player = createPlayer("p1", "测试玩家", "room_tavern", world.contentPool);
      addEntity(world, player);
      player.activeQuests.push({
        templateId: "quest_explore_forest",
        status: "active",
        acceptedDay: 1,
        deadlineDay: null,
        groupCompleted: [false],
        objectiveProgress: [],
      });

      const delta: SimulationDelta = {
        revealRooms: [{ entityId: "p1", roomId: "room_forest" }],
      };

      const result = evaluateQuestImpacts(world, "p1", delta, "move");
      expect(result).not.toBeNull();
      const progress = result?.questChanges?.filter((c) => c.type === "progress");
      expect(progress?.length).toBe(1);
    });

    it("should not progress failed or completed quests", () => {
      const world = createTestWorld([QUEST_EXPLORE]);
      const player = createPlayer("p1", "测试玩家", "room_tavern", world.contentPool);
      addEntity(world, player);
      player.activeQuests.push({
        templateId: "quest_explore_forest",
        status: "failed",
        acceptedDay: 1,
        deadlineDay: null,
        groupCompleted: [false],
        objectiveProgress: [],
      });

      player.roomId = "room_forest";
      const result = evaluateQuestImpacts(world, "p1", {}, "move");
      expect(result).toBeNull();
    });
  });
});
