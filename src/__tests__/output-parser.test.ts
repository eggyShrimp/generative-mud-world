import { describe, expect, it } from "vitest";
import { parseMemoryCompressionOutput, parseWorldEventOutput } from "../llm/output-parser.ts";

describe("parseWorldEventOutput", () => {
  it("should parse valid JSON with event", () => {
    const input = JSON.stringify({
      event: {
        type: "world_event",
        title: "旱灾来袭",
        description: "持续干旱影响了多个聚落",
        scope: "global",
        rumor_seed: "据说南边的河流干涸了",
        duration_days: 30,
        effects: [
          { target: "r1", need_change: { hunger: -10 } },
          { target: "r1", trait_modifier: { resilience: 2 } },
          { target: "r1", relation_change: { target: "r2", delta: -5 } },
        ],
      },
    });
    const result = parseWorldEventOutput(input);
    expect(result).not.toBeNull();
    expect(result?.worldEvents).toHaveLength(1);
    expect(result?.worldEvents?.[0].title).toBe("旱灾来袭");
    expect(result?.worldEvents?.[0].scope).toBe("global");
    expect(result?.worldEvents?.[0].source).toBe("llm");
    expect(result?.needChanges).toHaveLength(1);
    expect(result?.needChanges?.[0]).toEqual({ targetId: "r1", needType: "hunger", delta: -10 });
    expect(result?.traitModifiers).toHaveLength(1);
    expect(result?.traitModifiers?.[0]).toEqual({ targetId: "r1", trait: "resilience", delta: 2 });
    expect(result?.relationChanges).toHaveLength(1);
    expect(result?.relationChanges?.[0]).toEqual({ fromId: "r1", toId: "r2", delta: -5 });
  });

  it("should parse JSON wrapped in markdown code block", () => {
    const input =
      '```json\n{"event":{"type":"test","title":"测试","description":"test","scope":"global","effects":[]}}\n```';
    const result = parseWorldEventOutput(input);
    expect(result).not.toBeNull();
    expect(result?.worldEvents?.[0].title).toBe("测试");
  });

  it("should return null for no JSON match", () => {
    expect(parseWorldEventOutput("no json here")).toBeNull();
  });

  it("should return null for invalid JSON", () => {
    expect(parseWorldEventOutput("{invalid json}")).toBeNull();
  });

  it("should return null for JSON without event field", () => {
    expect(parseWorldEventOutput('{"foo":"bar"}')).toBeNull();
  });

  it("should handle event with no effects", () => {
    const input = JSON.stringify({
      event: { type: "test", title: "T", description: "D", scope: "global", effects: [] },
    });
    const result = parseWorldEventOutput(input);
    expect(result?.needChanges).toEqual([]);
    expect(result?.traitModifiers).toEqual([]);
    expect(result?.relationChanges).toEqual([]);
  });

  it("should use defaults for missing event fields", () => {
    const input = JSON.stringify({ event: { effects: [] } });
    const result = parseWorldEventOutput(input);
    expect(result?.worldEvents?.[0].type).toBe("world_event");
    expect(result?.worldEvents?.[0].title).toBe("");
    expect(result?.worldEvents?.[0].scope).toBe("global");
  });
});

describe("parseMemoryCompressionOutput", () => {
  it("should parse insights with trait modifiers", () => {
    const input = JSON.stringify({
      insights: [
        { summary: "NPC变得更强壮", effect: { trait_modifier: { strength: 3 } } },
        { summary: "NPC变得更谨慎", effect: { trait_modifier: { caution: 1 } } },
      ],
    });
    const result = parseMemoryCompressionOutput(input);
    expect(result).not.toBeNull();
    expect(result?.traitModifiers).toHaveLength(2);
    expect(result?.traitModifiers?.[0]).toEqual({ trait: "strength", delta: 3 });
    expect(result?.traitModifiers?.[1]).toEqual({ trait: "caution", delta: 1 });
  });

  it("should skip insights without trait_modifier", () => {
    const input = JSON.stringify({
      insights: [
        { summary: "没有效果", effect: {} },
        { summary: "有效果", effect: { trait_modifier: { wisdom: 2 } } },
      ],
    });
    const result = parseMemoryCompressionOutput(input);
    expect(result?.traitModifiers).toHaveLength(1);
  });

  it("should return null for no JSON match", () => {
    expect(parseMemoryCompressionOutput("no json")).toBeNull();
  });

  it("should return null for JSON without insights", () => {
    expect(parseMemoryCompressionOutput('{"foo":"bar"}')).toBeNull();
  });

  it("should return null for invalid JSON", () => {
    expect(parseMemoryCompressionOutput("{broken")).toBeNull();
  });
});
