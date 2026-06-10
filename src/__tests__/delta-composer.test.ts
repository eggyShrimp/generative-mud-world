/**
 * Delta Composer 测试 — composeDeltas + isEmptyDelta
 *
 * 验证各字段的正确合并和空判断。
 */

import { describe, expect, it } from "vitest";
import type { SimulationDelta } from "../core/types.ts";
import { composeDeltas } from "../engine/delta-composer.ts";

// ============================================================
// composeDeltas — itemChanges
// ============================================================

describe("composeDeltas — itemChanges", () => {
  const removeA: SimulationDelta = {
    itemChanges: [
      { targetId: "npc1", templateId: "herb_01", operation: "remove", qty: 1, itemId: "herb_01" },
      {
        targetId: "p1",
        templateId: "herb_01",
        operation: "add",
        qty: 1,
        itemId: "herb_01",
        name: "草药",
      },
    ],
  };
  const removeB: SimulationDelta = {
    itemChanges: [
      { targetId: "npc2", templateId: "iron_ore", operation: "remove", qty: 1, itemId: "iron_02" },
      {
        targetId: "p1",
        templateId: "iron_ore",
        operation: "add",
        qty: 1,
        itemId: "iron_02",
        name: "铁矿石",
      },
    ],
  };

  it("两个 delta 都有 itemChanges → 数组合并", () => {
    const result = composeDeltas(removeA, removeB);
    expect(result.itemChanges).toHaveLength(4);
    expect(result.itemChanges![0].itemId).toBe("herb_01");
    expect(result.itemChanges![2].itemId).toBe("iron_02");
  });

  it("一个 delta 有 itemChanges, 另一个为空对象", () => {
    const result = composeDeltas(removeA, {});
    expect(result.itemChanges).toHaveLength(2);
  });

  it("itemChanges + needChanges 同时合并", () => {
    const result = composeDeltas(
      {
        itemChanges: [{ targetId: "p1", templateId: "herb_01", operation: "add", qty: 1 }],
        needChanges: [{ targetId: "p1", needType: "rest", delta: -3 }],
      },
      {
        itemChanges: [{ targetId: "npc1", templateId: "herb_01", operation: "remove", qty: 1 }],
      },
    );
    expect(result.itemChanges).toHaveLength(2);
    expect(result.needChanges).toHaveLength(1);
  });

  it("仅含 itemChanges 的 delta → composeDeltas 不返回空对象", () => {
    const result = composeDeltas(removeA);
    // 如果内部 isEmptyDelta 漏判 itemChanges，会返回 {} 导致此断言 fail
    expect(result.itemChanges).toBeDefined();
    expect(result.itemChanges).toHaveLength(2);
  });
});

// ============================================================
// composeDeltas — revealRooms
// ============================================================

describe("composeDeltas — revealRooms", () => {
  it("两个 delta 都有 revealRooms → 数组合并", () => {
    const result = composeDeltas(
      { revealRooms: [{ entityId: "p1", roomId: "cave" }] },
      { revealRooms: [{ entityId: "p1", roomId: "ruins" }] },
    );
    expect(result.revealRooms).toHaveLength(2);
    expect(result.revealRooms![0].roomId).toBe("cave");
    expect(result.revealRooms![1].roomId).toBe("ruins");
  });

  it("仅含 revealRooms 的 delta → 不因 isEmptyDelta 被判为空", () => {
    const result = composeDeltas({ revealRooms: [{ entityId: "p1", roomId: "cave" }] });
    expect(result.revealRooms).toBeDefined();
    expect(result.revealRooms).toHaveLength(1);
  });
});

// ============================================================
// composeDeltas — 全字段混合
// ============================================================

describe("composeDeltas — 全字段混合合并", () => {
  it("8 个字段同时存在 → 全部保留", () => {
    const full: SimulationDelta = {
      traitModifiers: [{ targetId: "p1", trait: "courage", delta: 1 }],
      needChanges: [{ targetId: "p1", needType: "rest", delta: -2 }],
      relationChanges: [{ fromId: "p1", toId: "npc1", delta: 1 }],
      combatHpChanges: [{ targetId: "npc1", delta: -10 }],
      questChanges: [{ type: "progress", playerId: "p1", templateId: "q1", count: 1 }],
      itemChanges: [{ targetId: "p1", templateId: "herb", operation: "add", qty: 1 }],
      revealRooms: [{ entityId: "p1", roomId: "cave" }],
      worldEvents: [
        {
          id: "ev1",
          type: "test",
          title: "T",
          description: "D",
          scope: "global",
          tick: 0,
          source: "llm",
          data: {},
        },
      ],
      dialogues: [{ speakerId: "npc1", content: "你好", roomId: "tavern", tick: 0 }],
    };
    const result = composeDeltas(full);
    expect(result.traitModifiers).toHaveLength(1);
    expect(result.needChanges).toHaveLength(1);
    expect(result.relationChanges).toHaveLength(1);
    expect(result.combatHpChanges).toHaveLength(1);
    expect(result.questChanges).toHaveLength(1);
    expect(result.itemChanges).toHaveLength(1);
    expect(result.revealRooms).toHaveLength(1);
    expect(result.worldEvents).toHaveLength(1);
    expect(result.dialogues).toHaveLength(1);
  });
});

// ============================================================
// composeDeltas — combatHpChanges
// ============================================================

describe("composeDeltas — combatHpChanges", () => {
  it("两个 delta 都有 combatHpChanges → 数组合并", () => {
    const result = composeDeltas(
      { combatHpChanges: [{ targetId: "a", delta: -10 }] },
      { combatHpChanges: [{ targetId: "b", delta: -5 }] },
    );
    expect(result.combatHpChanges?.length).toBe(2);
    expect(result.combatHpChanges![0].targetId).toBe("a");
    expect(result.combatHpChanges![1].targetId).toBe("b");
  });

  it("一个 delta 有 combatHpChanges, 另一个为空", () => {
    const result = composeDeltas({ combatHpChanges: [{ targetId: "a", delta: -10 }] }, {});
    expect(result.combatHpChanges?.length).toBe(1);
    expect(result.combatHpChanges![0].targetId).toBe("a");
  });

  it("combatHpChanges 和 needChanges 同时合并", () => {
    const result = composeDeltas(
      {
        combatHpChanges: [{ targetId: "npc", delta: -10 }],
        needChanges: [{ targetId: "player", needType: "rest", delta: -3 }],
      },
      {
        combatHpChanges: [{ targetId: "player", delta: -5 }],
        needChanges: [{ targetId: "player", needType: "rest", delta: -2 }],
      },
    );
    expect(result.combatHpChanges?.length).toBe(2);
    expect(result.needChanges?.length).toBe(2);
  });

  it("combatHpChanges 为空数组时不被合并", () => {
    const result = composeDeltas(
      { combatHpChanges: [] },
      { combatHpChanges: [{ targetId: "a", delta: -10 }] },
    );
    expect(result.combatHpChanges?.length).toBe(1);
    expect(result.combatHpChanges![0].targetId).toBe("a");
  });

  it("combatHpChanges 为 undefined 时不崩溃", () => {
    const result = composeDeltas(
      {},
      { needChanges: [{ targetId: "a", needType: "rest", delta: 5 }] },
    );
    expect(result.needChanges?.length).toBe(1);
    expect(result.combatHpChanges).toBeUndefined();
  });

  it("仅 combatHpChanges 不为空时 composeDeltas 不应跳过", () => {
    const delta: SimulationDelta = {
      combatHpChanges: [{ targetId: "a", delta: -10 }],
    };
    const result = composeDeltas(delta);
    expect(result.combatHpChanges?.length).toBe(1);
    // 验证 isEmptyDelta 内部已经把 combatHpChanges 视为非空
    expect(result.combatHpChanges).toBeDefined();
  });
});
