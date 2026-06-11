import { describe, expect, it } from "vitest";
import type { DialogueState } from "../client-tui/game-client.ts";
import {
  buildLoadingDialogueState,
  extractNpcReply,
  shouldKeepPopupOpen,
} from "../client-tui/game-client.ts";

function makeDialogueState(overrides?: Partial<DialogueState>): DialogueState {
  return {
    npcId: "npc1",
    npcName: "老马",
    options: [
      { id: "opt1", label: "你好", type: "idle_chat" },
      { id: "opt2", label: "再见", type: "close" },
    ],
    ...overrides,
  };
}

describe("shouldKeepPopupOpen", () => {
  it("close → false", () => {
    expect(shouldKeepPopupOpen("close")).toBe(false);
  });

  it("idle_chat → true", () => {
    expect(shouldKeepPopupOpen("idle_chat")).toBe(true);
  });

  it("trade_menu → true", () => {
    expect(shouldKeepPopupOpen("trade_menu")).toBe(true);
  });

  it("quest_trigger_menu → true", () => {
    expect(shouldKeepPopupOpen("quest_trigger_menu")).toBe(true);
  });
});

describe("buildLoadingDialogueState", () => {
  it("保留 npcId/npcName，清空 options", () => {
    const state = makeDialogueState();
    const result = buildLoadingDialogueState(state);

    expect(result.npcId).toBe("npc1");
    expect(result.npcName).toBe("老马");
    expect(result.options).toEqual([]);
  });

  it("lastNpcReply 为 undefined", () => {
    const state = makeDialogueState({ lastNpcReply: "你好啊" });
    const result = buildLoadingDialogueState(state);

    expect(result.lastNpcReply).toBeUndefined();
  });

  it("已有 options 被清空", () => {
    const state = makeDialogueState({
      options: [
        { id: "a", label: "话题1", type: "idle_chat" },
        { id: "b", label: "话题2", type: "idle_chat" },
      ],
    });
    const result = buildLoadingDialogueState(state);

    expect(result.options).toEqual([]);
  });
});

describe("extractNpcReply", () => {
  it("事件中有 dialogue → 返回 description", () => {
    const events = [
      { type: "dialogue", description: "老马：今天酒馆很热闹。" },
      { type: "relation", description: "与老马的关系 +1" },
    ];
    expect(extractNpcReply(events)).toBe("老马：今天酒馆很热闹。");
  });

  it("无 dialogue → 返回 undefined", () => {
    const events = [{ type: "relation", description: "与老马的关系 +1" }];
    expect(extractNpcReply(events)).toBeUndefined();
  });

  it("空数组 → 返回 undefined", () => {
    expect(extractNpcReply([])).toBeUndefined();
  });

  it("多个 dialogue → 返回第一个", () => {
    const events = [
      { type: "dialogue", description: "第一句" },
      { type: "dialogue", description: "第二句" },
    ];
    expect(extractNpcReply(events)).toBe("第一句");
  });
});
