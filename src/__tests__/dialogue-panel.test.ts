import { describe, expect, it } from "vitest";
import { getChatOptionListHeight } from "../tui/features/dialogue/layout.ts";

describe("ChatDialoguePanel layout", () => {
  it("reserves room for scrollable options without consuming the tab bar", () => {
    expect(getChatOptionListHeight(8)).toBe(6);
  });

  it("keeps a positive option area in narrow layouts", () => {
    expect(getChatOptionListHeight(1)).toBe(1);
  });
});
