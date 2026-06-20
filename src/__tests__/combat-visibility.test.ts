import { describe, expect, it } from "vitest";
import { checkHit } from "../combat/formulas.ts";

describe("combat visibility modifiers", () => {
  it("normal visibility (period=1.0, weather=1.0) always hits", () => {
    // random=0.49 < 1.0*1.0=1.0 → hit
    expect(checkHit(1.0, 1.0, () => 0.49)).toBe(true);
  });

  it("night visibility (period=0.5, weather=1.0) reduces hit chance", () => {
    // random=0.49 < 0.5*1.0=0.5 → hit
    expect(checkHit(0.5, 1.0, () => 0.49)).toBe(true);
    // random=0.51 < 0.5 → miss
    expect(checkHit(0.5, 1.0, () => 0.51)).toBe(false);
  });

  it("combined night + weather (period=0.5, weather=0.6) compounds penalty", () => {
    // effective = 0.5 * 0.6 = 0.3
    expect(checkHit(0.5, 0.6, () => 0.29)).toBe(true);
    expect(checkHit(0.5, 0.6, () => 0.31)).toBe(false);
  });

  it("dawn visibility (period=0.7) slightly reduces hit chance", () => {
    // effective = 0.7
    expect(checkHit(0.7, 1.0, () => 0.69)).toBe(true);
    expect(checkHit(0.7, 1.0, () => 0.71)).toBe(false);
  });
});
