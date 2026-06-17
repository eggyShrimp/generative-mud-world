import { describe, expect, it } from "vitest";
import { formatKeyHintText, keyHintColor } from "../tui/components/key-hint.tsx";

describe("KeyHint", () => {
  it("formats quest tag as trailing badge separated from label punctuation", () => {
    const text = formatKeyHintText(1, "法显，壁画后那行暗码究竟指向哪里？", "quest");

    expect(text).toBe("[1] 法显，壁画后那行暗码究竟指向哪里？ [!]");
    expect(text).not.toContain("？！"); // Chinese punctuation pair should not be created.
    expect(text).not.toContain("?!");
  });

  it("uses quest accent color for quest tag", () => {
    expect(keyHintColor("quest", "#ffffff")).toBe("#e6a850");
    expect(keyHintColor(undefined, "#ffffff")).toBe("#ffffff");
  });
});
