import { describe, expect, it } from "vitest";
import type { ActiveQuest, QuestTemplate } from "../core/types.ts";
import { enrichQuests } from "../server/ws-server.ts";

const TPL_HERB: QuestTemplate = {
  id: "quest_herb_delivery",
  title: "药草收集",
  description: "老马需要几种稀有药草来配制解毒剂。",
  giverNpcId: "npc_tavern_keeper",
  objectives: [
    { groupId: 0, type: "collect", targetId: "item_qinghao", count: 1, description: "收集青蒿" },
    { groupId: 0, type: "collect", targetId: "item_fuling", count: 1, description: "收集茯苓" },
  ],
  rewards: {
    traitModifiers: [{ trait: "compassion", delta: 5 }],
    narrative: "老马接过草药，露出了感激的笑容。",
  },
  repeatable: false,
  deadlineDays: 7,
};

const TPL_EXPLORE: QuestTemplate = {
  id: "quest_explore_ruins",
  title: "废弃哨塔",
  description: "有人在废弃哨塔附近看到了奇怪的灯光。",
  giverNpcId: null,
  objectives: [
    { groupId: 0, type: "explore", targetId: "room_ruins", count: 1, description: "前往废弃哨塔" },
  ],
  rewards: { narrative: "你在废墟中找到了一盏还在燃烧的油灯。" },
  repeatable: false,
  deadlineDays: null,
};

const TPL_MULTI_GROUP: QuestTemplate = {
  id: "quest_lost_sword",
  title: "铁匠的烦恼",
  description: "铁匠老陈说他的一把好剑被偷了。",
  giverNpcId: "npc_blacksmith",
  objectives: [
    {
      groupId: 0,
      type: "collect",
      targetId: "item_missing_sword",
      count: 1,
      description: "找到铁匠丢失的剑",
    },
    {
      groupId: 1,
      type: "talk",
      targetId: "npc_blacksmith",
      count: 1,
      description: "回去和铁匠老陈谈谈",
    },
  ],
  rewards: {
    narrative: "铁匠接过剑，仔细检查了一番。",
    items: [{ itemId: "reward_iron_ring", name: "铁指环", quantity: 1 }],
  },
  repeatable: false,
  deadlineDays: null,
};

describe("enrichQuests", () => {
  it("enriches active quests with template title, description, and objectives", () => {
    const activeQuests: ActiveQuest[] = [
      {
        templateId: "quest_herb_delivery",
        status: "active",
        acceptedDay: 1,
        deadlineDay: 8,
        groupCompleted: [false],
        objectiveProgress: [1, 0],
      },
    ];

    const result = enrichQuests(activeQuests, [TPL_HERB]);

    expect(result).toHaveLength(1);
    expect(result[0].templateId).toBe("quest_herb_delivery");
    expect(result[0].title).toBe("药草收集");
    expect(result[0].description).toBe("老马需要几种稀有药草来配制解毒剂。");
    expect(result[0].status).toBe("active");
    expect(result[0].acceptedDay).toBe(1);
    expect(result[0].deadlineDay).toBe(8);
    expect(result[0].giverNpcId).toBe("npc_tavern_keeper");
    expect(result[0].narrative).toBeUndefined();
  });

  it("maps objective progress and completion correctly", () => {
    const activeQuests: ActiveQuest[] = [
      {
        templateId: "quest_herb_delivery",
        status: "active",
        acceptedDay: 1,
        deadlineDay: 8,
        groupCompleted: [false],
        objectiveProgress: [1, 0],
      },
    ];

    const result = enrichQuests(activeQuests, [TPL_HERB]);
    const objectives = result[0].objectives;

    expect(objectives).toHaveLength(2);
    expect(objectives[0]).toEqual({
      groupId: 0,
      type: "collect",
      count: 1,
      current: 1,
      description: "收集青蒿",
      completed: false,
    });
    expect(objectives[1]).toEqual({
      groupId: 0,
      type: "collect",
      count: 1,
      current: 0,
      description: "收集茯苓",
      completed: false,
    });
  });

  it("marks group as completed when groupCompleted is true", () => {
    const activeQuests: ActiveQuest[] = [
      {
        templateId: "quest_herb_delivery",
        status: "active",
        acceptedDay: 1,
        deadlineDay: 8,
        groupCompleted: [true],
        objectiveProgress: [1, 1],
      },
    ];

    const result = enrichQuests(activeQuests, [TPL_HERB]);

    expect(result[0].objectives[0].completed).toBe(true);
    expect(result[0].objectives[1].completed).toBe(true);
  });

  it("shows narrative for completed quests", () => {
    const activeQuests: ActiveQuest[] = [
      {
        templateId: "quest_herb_delivery",
        status: "completed",
        acceptedDay: 1,
        deadlineDay: 8,
        groupCompleted: [true],
        objectiveProgress: [1, 1],
      },
    ];

    const result = enrichQuests(activeQuests, [TPL_HERB]);

    expect(result[0].status).toBe("completed");
    expect(result[0].narrative).toBe("老马接过草药，露出了感激的笑容。");
  });

  it("does not show narrative for active quests", () => {
    const activeQuests: ActiveQuest[] = [
      {
        templateId: "quest_herb_delivery",
        status: "active",
        acceptedDay: 1,
        deadlineDay: 8,
        groupCompleted: [false],
        objectiveProgress: [0, 0],
      },
    ];

    const result = enrichQuests(activeQuests, [TPL_HERB]);

    expect(result[0].narrative).toBeUndefined();
  });

  it("handles quests with null deadlineDay", () => {
    const activeQuests: ActiveQuest[] = [
      {
        templateId: "quest_explore_ruins",
        status: "active",
        acceptedDay: 3,
        deadlineDay: null,
        groupCompleted: [false],
        objectiveProgress: [0],
      },
    ];

    const result = enrichQuests(activeQuests, [TPL_EXPLORE]);

    expect(result[0].title).toBe("废弃哨塔");
    expect(result[0].deadlineDay).toBeNull();
    expect(result[0].giverNpcId).toBeUndefined();
  });

  it("handles multi-group objectives (group 0 + group 1)", () => {
    const activeQuests: ActiveQuest[] = [
      {
        templateId: "quest_lost_sword",
        status: "active",
        acceptedDay: 1,
        deadlineDay: null,
        groupCompleted: [true, false],
        objectiveProgress: [1, 0],
      },
    ];

    const result = enrichQuests(activeQuests, [TPL_MULTI_GROUP]);
    const objectives = result[0].objectives;

    expect(objectives).toHaveLength(2);
    expect(objectives[0].completed).toBe(true);
    expect(objectives[0].current).toBe(1);
    expect(objectives[1].completed).toBe(false);
    expect(objectives[1].current).toBe(0);
  });

  it("handles template not found gracefully", () => {
    const activeQuests: ActiveQuest[] = [
      {
        templateId: "quest_nonexistent",
        status: "active",
        acceptedDay: 1,
        deadlineDay: null,
        groupCompleted: [],
        objectiveProgress: [],
      },
    ];

    const result = enrichQuests(activeQuests, [TPL_HERB]);

    expect(result).toHaveLength(1);
    expect(result[0].templateId).toBe("quest_nonexistent");
    expect(result[0].title).toBe("quest_nonexistent");
    expect(result[0].description).toBe("");
    expect(result[0].objectives).toHaveLength(0);
  });

  it("handles empty active quests", () => {
    const result = enrichQuests([], [TPL_HERB]);
    expect(result).toHaveLength(0);
  });

  it("handles empty templates list", () => {
    const activeQuests: ActiveQuest[] = [
      {
        templateId: "quest_herb_delivery",
        status: "active",
        acceptedDay: 1,
        deadlineDay: null,
        groupCompleted: [false],
        objectiveProgress: [0, 0],
      },
    ];

    const result = enrichQuests(activeQuests, []);

    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("quest_herb_delivery");
    expect(result[0].objectives).toHaveLength(0);
  });

  it("enriches multiple quests from different templates", () => {
    const activeQuests: ActiveQuest[] = [
      {
        templateId: "quest_herb_delivery",
        status: "active",
        acceptedDay: 1,
        deadlineDay: 8,
        groupCompleted: [false],
        objectiveProgress: [1, 0],
      },
      {
        templateId: "quest_explore_ruins",
        status: "active",
        acceptedDay: 3,
        deadlineDay: null,
        groupCompleted: [false],
        objectiveProgress: [0],
      },
    ];

    const result = enrichQuests(activeQuests, [TPL_HERB, TPL_EXPLORE]);

    expect(result).toHaveLength(2);
    expect(result[0].title).toBe("药草收集");
    expect(result[1].title).toBe("废弃哨塔");
  });

  it("handles objectiveProgress shorter than objectives array", () => {
    const activeQuests: ActiveQuest[] = [
      {
        templateId: "quest_herb_delivery",
        status: "active",
        acceptedDay: 1,
        deadlineDay: 8,
        groupCompleted: [false],
        objectiveProgress: [1],
      },
    ];

    const result = enrichQuests(activeQuests, [TPL_HERB]);

    expect(result[0].objectives[0].current).toBe(1);
    expect(result[0].objectives[1].current).toBe(0);
  });
});
