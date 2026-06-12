import { describe, expect, it } from "vitest";
import { formatItemProperties } from "../shared/item-format.ts";

describe("formatItemProperties", () => {
  it("uses content-pool labels and skips unlabeled internal keys", () => {
    const text = formatItemProperties(
      { value: 4, material: true, templateId: "iron_ore", hiddenKey: "raw" },
      { value: "价值", material: "材料" },
    );

    expect(text).toBe("价值：4，材料");
    expect(text).not.toContain("templateId");
    expect(text).not.toContain("hiddenKey");
  });
});
