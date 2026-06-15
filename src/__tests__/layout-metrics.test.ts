import { describe, expect, it } from "vitest";
import { clamp, computeContentHeight, getLayoutMetrics } from "../tui/layout/metrics.ts";

describe("clamp", () => {
  it("returns value when within range", () => {
    expect(clamp(20, 16, 24)).toBe(20);
  });

  it("clamps to min when below", () => {
    expect(clamp(10, 16, 24)).toBe(16);
  });

  it("clamps to max when above", () => {
    expect(clamp(30, 16, 24)).toBe(24);
  });
});

describe("computeContentHeight", () => {
  it("subtracts interaction height from body", () => {
    expect(computeContentHeight(20, 5)).toBe(15);
  });

  it("returns at least 1", () => {
    expect(computeContentHeight(5, 10)).toBe(1);
  });
});

describe("getLayoutMetrics", () => {
  it("returns sidebarWidth=52", () => {
    const m = getLayoutMetrics(40);
    expect(m.sidebarWidth).toBe(52);
  });

  it("returns bottomBarHeight=2", () => {
    const m = getLayoutMetrics(40);
    expect(m.bottomBarHeight).toBe(2);
  });

  it("eventLogHeight equals roomHeight (same row)", () => {
    const m = getLayoutMetrics(40);
    expect(m.eventLogHeight).toBe(m.roomHeight);
  });

  it("room height accounts for status bar and bottom bar overhead", () => {
    // 40 rows: 40 - rootPadding(2) - statusHeight(4) - bottomBar(2) = 32 avail
    // roomHeight = clamp(32, 16, 24) = 24
    const m = getLayoutMetrics(40);
    expect(m.roomHeight).toBe(24);
    expect(m.eventLogHeight).toBe(24);
  });

  it("room height for 30-row terminal", () => {
    // 30 - 2 - 4 - 2 = 22 avail, roomHeight = clamp(22, 16, 24) = 22
    const m = getLayoutMetrics(30);
    expect(m.roomHeight).toBe(22);
  });

  it("room height for 24-row terminal (hits minimum)", () => {
    // 24 - 2 - 4 - 2 = 16 avail, roomHeight = clamp(16, 16, 24) = 16
    const m = getLayoutMetrics(24);
    expect(m.roomHeight).toBe(16);
  });

  it("room height for 20-row terminal (sub-minimum enforced)", () => {
    // 20 - 2 - 4 - 2 = 12 avail, max(16, 12) = 16, clamp(16, 16, 24) = 16
    const m = getLayoutMetrics(20);
    expect(m.roomHeight).toBe(16);
  });

  it("returns all 4 LayoutMetrics fields", () => {
    const m = getLayoutMetrics(40);
    expect(m).toHaveProperty("roomHeight");
    expect(m).toHaveProperty("eventLogHeight");
    expect(m).toHaveProperty("bottomBarHeight");
    expect(m).toHaveProperty("sidebarWidth");
  });
});
