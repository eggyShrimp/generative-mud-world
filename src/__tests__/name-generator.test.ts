import { describe, expect, it } from "vitest";
import type { NamePool } from "../core/types.ts";
import { findNamePool, generateEpithet, generateName } from "../simulation/name-generator.ts";

const testPool: NamePool = {
  culture: "test",
  surnames: ["赵", "钱", "孙"],
  maleGiven: ["行舟", "大山", "勇"],
  femaleGiven: ["秀", "兰", "春芽"],
  neutralGiven: ["石头", "小河"],
  epithetPatterns: ["老{char}", "{surname}铁匠"],
};

describe("NameGenerator", () => {
  it("should generate male name with surname + given", () => {
    const name = generateName(testPool, "male");
    expect(name.length).toBeGreaterThan(1);
    expect(testPool.surnames.some((s) => name.startsWith(s))).toBe(true);
  });

  it("should generate female name", () => {
    const name = generateName(testPool, "female");
    expect(testPool.surnames.some((s) => name.startsWith(s))).toBe(true);
  });

  it("should generate neutral name", () => {
    const name = generateName(testPool, "neutral");
    expect(testPool.surnames.some((s) => name.startsWith(s))).toBe(true);
  });

  it("should generate epithet", () => {
    const epithet = generateEpithet(testPool, "smith", "老铁");
    expect(epithet.length).toBeGreaterThan(0);
  });

  it("should generate different names (randomness)", () => {
    const names = new Set<string>();
    for (let i = 0; i < 20; i++) {
      names.add(generateName(testPool, "male"));
    }
    // At least 3 different names generated out of 20
    expect(names.size).toBeGreaterThanOrEqual(3);
  });

  it("findNamePool should return default if culture not found", () => {
    const pool = findNamePool([testPool], "nonexistent");
    expect(pool).toBe(testPool);
  });
});
