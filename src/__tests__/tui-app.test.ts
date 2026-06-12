import { describe, expect, it } from "vitest";
import type { RoomEntity } from "../shared/protocol.ts";
import {
  buildEntityListRows,
  buildExitListRows,
  ENTITY_LIST_COLUMNS,
  truncateDisplayText,
} from "../tui/features/room/entity-list-layout.ts";
import { formatRelationText } from "../tui/features/room/relation-format.ts";
import {
  percentBar,
  percentToneColor,
  ratioBar,
  ratioToneColor,
  signedPercentBar,
  signedToneColor,
} from "../tui/theme/progress-format.ts";

describe("formatRelationText", () => {
  it("有关系标签时显示标签和数值", () => {
    expect(formatRelationText({ level: 55, label: "友好" })).toBe(" · 友好+55");
  });

  it("空关系标签只显示数值", () => {
    expect(formatRelationText({ level: -20, label: "" })).toBe(" · -20");
  });

  it("缺少关系标签不显示 undefined", () => {
    expect(formatRelationText({ level: 10 })).toBe(" · +10");
  });
});

describe("buildEntityListRows", () => {
  it("关系缺失时保留空关系列", () => {
    const entities: RoomEntity[] = [
      { id: "npc_without_relation", name: "老马", type: "npc", typeLabel: "人物" },
      { id: "npc_with_relation", name: "铁匠", type: "npc", typeLabel: "人物" },
    ];

    const rows = buildEntityListRows(entities, "npc_with_relation", [
      { targetId: "npc_with_relation", level: 35, label: "熟悉" },
    ]);

    expect(rows).toMatchObject([
      {
        indexLabel: "[1]",
        selected: false,
        typeLabel: "人物",
        relationText: "",
      },
      {
        indexLabel: "[2]",
        selected: true,
        typeLabel: "人物",
        relationText: " · 熟悉+35",
      },
    ]);
    expect(ENTITY_LIST_COLUMNS.relation).toBeGreaterThan(0);
  });

  it("长名字只影响名字列，不改变类型列", () => {
    const longName = "来自北境边塞的年轻铁匠学徒阿宁";
    const entities: RoomEntity[] = [
      { id: "npc_long_name", name: longName, type: "npc", typeLabel: "人物" },
    ];

    const rows = buildEntityListRows(entities);

    expect(rows[0].entity.name).toBe(longName);
    expect(rows[0].nameText).toBe(truncateDisplayText(longName, ENTITY_LIST_COLUMNS.name));
    expect(rows[0].nameText).not.toBe(longName);
    expect(rows[0].typeText).toBe(" · 人物");
  });

  it("非 NPC 不消费关系数据", () => {
    const entities: RoomEntity[] = [
      { id: "item_1", name: "短剑", type: "item", typeLabel: "物品" },
    ];

    const rows = buildEntityListRows(entities, undefined, [
      { targetId: "item_1", level: 60, label: "友好" },
    ]);

    expect(rows[0].typeLabel).toBe("物品");
    expect(rows[0].relation).toBeUndefined();
    expect(rows[0].relationText).toBe("");
  });
});

describe("buildExitListRows", () => {
  it("出口列表复用人物列表的主列宽", () => {
    const longDirectionLabel = "通往北境边塞集市的石板路";
    const rows = buildExitListRows(
      {
        n: {
          to: "northern_market",
          directionLabel: longDirectionLabel,
          distance: 3,
          terrainLabel: "山路",
          destinationName: "北境边塞集市",
        },
      },
      (direction) => direction,
    );

    expect(rows[0].keyText).toBe("[n]");
    expect(rows[0].directionText).toBe(
      truncateDisplayText(longDirectionLabel, ENTITY_LIST_COLUMNS.name),
    );
    expect(rows[0].typeText).toBe(truncateDisplayText(" · 山路 · 3格", ENTITY_LIST_COLUMNS.type));
    expect(rows[0].relationText).toBe(
      truncateDisplayText(" → 北境边塞集市", ENTITY_LIST_COLUMNS.relation),
    );
  });
});

describe("truncateDisplayText", () => {
  it("中文文本按显示宽度截断", () => {
    expect(truncateDisplayText("来自北境边塞", 8)).toBe("来自北…");
  });

  it("短文本不截断", () => {
    expect(truncateDisplayText("老马", ENTITY_LIST_COLUMNS.name)).toBe("老马");
  });
});

describe("shared TUI bars", () => {
  it("percentBar clamps values into a fixed width bar", () => {
    expect(percentBar(45)).toBe("█████░░░░░");
    expect(percentBar(-10)).toBe("░░░░░░░░░░");
    expect(percentBar(110)).toBe("██████████");
  });

  it("signedPercentBar keeps the sign and clamps magnitude", () => {
    expect(signedPercentBar(45)).toBe("+█████░░░░░");
    expect(signedPercentBar(-45)).toBe("-█████░░░░░");
    expect(signedPercentBar(120)).toBe("+██████████");
  });

  it("ratioBar renders combat style bars safely", () => {
    expect(ratioBar(5, 10, 4)).toBe("██░░");
    expect(ratioBar(20, 10, 4)).toBe("████");
    expect(ratioBar(5, 0, 4)).toBe("████");
  });
});

describe("shared TUI tone colors", () => {
  const colors = { high: "high", medium: "medium", low: "low" };

  it("percentToneColor matches status thresholds", () => {
    expect(percentToneColor(70, colors)).toBe("high");
    expect(percentToneColor(30, colors)).toBe("medium");
    expect(percentToneColor(29, colors)).toBe("low");
  });

  it("signedToneColor matches trait thresholds", () => {
    expect(signedToneColor(50, { ...colors, neutral: "neutral" })).toBe("high");
    expect(signedToneColor(0, { ...colors, neutral: "neutral" })).toBe("neutral");
    expect(signedToneColor(-50, { ...colors, neutral: "neutral" })).toBe("medium");
    expect(signedToneColor(-51, { ...colors, neutral: "neutral" })).toBe("low");
  });

  it("ratioToneColor matches combat thresholds", () => {
    expect(ratioToneColor(7, 10, colors)).toBe("high");
    expect(ratioToneColor(4, 10, colors)).toBe("medium");
    expect(ratioToneColor(3, 10, colors)).toBe("low");
  });
});
