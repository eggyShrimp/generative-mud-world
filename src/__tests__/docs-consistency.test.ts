import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("docs consistency", () => {
  it("ContentPool action docs use current entity action mutation names", () => {
    const docs = ["docs/06-content-pool.md", "docs/TODO.md", "docs/08-code-quality-review.md"];
    const staleNames = [
      "replaceRoomActionsByTag",
      "replaceRoomActionLabels",
      "replaceRoomTagLabels",
    ];

    const content = docs.map((path) => readFileSync(path, "utf8")).join("\n");

    for (const staleName of staleNames) {
      expect(content).not.toContain(staleName);
    }
  });
});
