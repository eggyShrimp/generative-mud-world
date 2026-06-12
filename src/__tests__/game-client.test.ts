import { describe, expect, it } from "vitest";
import type { DialogueState } from "../client-tui/game-client.ts";
import {
  appendToHistory,
  applyDialogueOptionsToTab,
  applyNpcReply,
  buildLoadingDialogueState,
  computeContentHeight,
  computeTabSwitch,
  extractNpcReply,
  responseTabForOptionType,
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
    history: [],
    activeTab: "chat",
    availableTabs: ["chat", "trade"],
    savedTabOptions: {},
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

  it("保留 history", () => {
    const state = makeDialogueState({
      history: [
        { speaker: "player", content: "你好" },
        { speaker: "npc", content: "你好旅人" },
      ],
    });
    const result = buildLoadingDialogueState(state);

    expect(result.history).toHaveLength(2);
    expect(result.history[0].speaker).toBe("player");
    expect(result.history[0].content).toBe("你好");
  });

  it("多轮 history 不被清空", () => {
    const state = makeDialogueState({
      history: [
        { speaker: "player", content: "你好" },
        { speaker: "npc", content: "你好旅人" },
        { speaker: "player", content: "有什么消息吗" },
        { speaker: "npc", content: "东山不太平" },
      ],
    });
    const result = buildLoadingDialogueState(state);

    expect(result.history).toHaveLength(4);
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

  it("保留 activeTab 和 availableTabs", () => {
    const state = makeDialogueState({
      activeTab: "trade",
      availableTabs: ["chat", "trade"],
    });
    const result = buildLoadingDialogueState(state);

    expect(result.activeTab).toBe("trade");
    expect(result.availableTabs).toEqual(["chat", "trade"]);
  });
});

describe("appendToHistory", () => {
  it("空历史追加 player", () => {
    const state = makeDialogueState();
    const result = appendToHistory(state, "player", "你好");

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ speaker: "player", content: "你好" });
  });

  it("空历史追加 npc", () => {
    const state = makeDialogueState();
    const result = appendToHistory(state, "npc", "你好旅人");

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ speaker: "npc", content: "你好旅人" });
  });

  it("多轮顺序正确", () => {
    let state = makeDialogueState();
    state = { ...state, history: appendToHistory(state, "player", "你好") };
    state = { ...state, history: appendToHistory(state, "npc", "你好旅人") };
    const result = appendToHistory(state, "player", "有什么消息吗");

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ speaker: "player", content: "你好" });
    expect(result[1]).toEqual({ speaker: "npc", content: "你好旅人" });
    expect(result[2]).toEqual({ speaker: "player", content: "有什么消息吗" });
  });

  it("空 content 仍追加", () => {
    const state = makeDialogueState();
    const result = appendToHistory(state, "player", "");

    expect(result).toHaveLength(1);
    expect(result[0].content).toBe("");
  });

  it("不修改原 state", () => {
    const state = makeDialogueState({
      history: [{ speaker: "player", content: "原始" }],
    });
    appendToHistory(state, "npc", "新消息");

    expect(state.history).toHaveLength(1);
  });
});

describe("computeContentHeight", () => {
  it("标准计算", () => {
    expect(computeContentHeight(14, 5)).toBe(9);
  });

  it("窄屏", () => {
    expect(computeContentHeight(8, 4)).toBe(4);
  });

  it("交互区=0", () => {
    expect(computeContentHeight(10, 0)).toBe(10);
  });

  it("最小值保护", () => {
    expect(computeContentHeight(3, 5)).toBe(1);
  });
});

describe("computeTabSwitch", () => {
  it("保存当前选项切到下一个tab", () => {
    const state = makeDialogueState({
      activeTab: "chat",
      options: [
        { id: "c1", label: "话题1", type: "idle_chat" },
        { id: "c2", label: "话题2", type: "idle_chat" },
      ],
    });
    const result = computeTabSwitch(state, 1);
    expect(result.activeTab).toBe("trade");
    expect(result.options).toEqual([]);
    expect(result.savedTabOptions).toEqual({ chat: state.options });
  });

  it("回到原tab恢复选项", () => {
    const chatOpts = [
      { id: "c1", label: "话题1", type: "idle_chat" as const },
      { id: "c2", label: "话题2", type: "idle_chat" as const },
    ];
    const tradeOpts = [{ id: "t1", label: "丝绸", type: "trade_select" as const }];
    const state = makeDialogueState({
      activeTab: "trade",
      options: tradeOpts,
      savedTabOptions: { chat: chatOpts },
    });
    const result = computeTabSwitch(state, -1);
    expect(result.activeTab).toBe("chat");
    expect(result.options).toEqual(chatOpts);
    expect(result.savedTabOptions).toEqual({ chat: chatOpts, trade: tradeOpts });
  });

  it("目标tab无缓存选项时返回空", () => {
    const chatOpts = [{ id: "c1", label: "话题", type: "idle_chat" as const }];
    const state = makeDialogueState({
      activeTab: "chat",
      options: chatOpts,
      savedTabOptions: {},
    });
    const result = computeTabSwitch(state, 1);
    expect(result.activeTab).toBe("trade");
    expect(result.options).toEqual([]);
    expect(result.savedTabOptions.chat).toEqual(chatOpts);
  });

  it("多次切换完整保留", () => {
    const chatOpts = [
      { id: "c1", label: "话题1", type: "idle_chat" as const },
      { id: "c2", label: "话题2", type: "idle_chat" as const },
    ];
    let state = makeDialogueState({ options: chatOpts });
    state = computeTabSwitch(state, 1);
    state = computeTabSwitch(state, -1);
    state = computeTabSwitch(state, 1);
    state = computeTabSwitch(state, -1);
    expect(state.activeTab).toBe("chat");
    expect(state.options).toEqual(chatOpts);
    expect(state.savedTabOptions.chat).toEqual(chatOpts);
  });

  it("只有2个tab时循环不越界", () => {
    let state = makeDialogueState({ activeTab: "trade", options: [] });
    state = computeTabSwitch(state, 1);
    expect(state.activeTab).toBe("chat");
    state = computeTabSwitch(state, -1);
    expect(state.activeTab).toBe("trade");
  });
});

describe("applyNpcReply", () => {
  it("state 含 options, NPC 回复追加时 options 不变", () => {
    const state = makeDialogueState({
      history: [{ speaker: "player", content: "你好" }],
      options: [
        { id: "c1", label: "话题1", type: "idle_chat" as const },
        { id: "c2", label: "话题2", type: "idle_chat" as const },
      ],
    });
    const result = applyNpcReply(state, "你好旅人");
    expect(result.history).toHaveLength(2);
    expect(result.history[1]).toEqual({ speaker: "npc", content: "你好旅人" });
    expect(result.options).toEqual(state.options);
  });

  it("state 无 options 时 options 仍为空", () => {
    const state = makeDialogueState({ options: [] });
    const result = applyNpcReply(state, "你好旅人");
    expect(result.history).toHaveLength(1);
    expect(result.options).toEqual([]);
  });

  it("保留 npcId, npcName, activeTab 等字段", () => {
    const state = makeDialogueState({
      activeTab: "chat",
      npcDescription: "商人",
    });
    const result = applyNpcReply(state, "你好旅人");
    expect(result.npcId).toBe("npc1");
    expect(result.npcName).toBe("老马");
    expect(result.activeTab).toBe("chat");
    expect(result.npcDescription).toBe("商人");
  });
});

describe("applyDialogueOptionsToTab", () => {
  it("聊天返回时，用户已在交易tab，不覆盖交易选项", () => {
    const tradeOptions = [{ id: "t1", label: "丝绸 10铜币", type: "trade_select" as const }];
    const chatOptions = [{ id: "c1", label: "聊聊近况", type: "idle_chat" as const }];
    const state = makeDialogueState({
      activeTab: "trade",
      options: tradeOptions,
      savedTabOptions: {},
    });

    const result = applyDialogueOptionsToTab(state, "chat", chatOptions, {
      id: "npc1",
      name: "老马",
    });

    expect(result.activeTab).toBe("trade");
    expect(result.options).toEqual(tradeOptions);
    expect(result.savedTabOptions.chat).toEqual(chatOptions);
  });

  it("交易返回时，用户已在聊天tab，不覆盖聊天选项", () => {
    const chatOptions = [{ id: "c1", label: "聊聊近况", type: "idle_chat" as const }];
    const tradeOptions = [{ id: "t1", label: "丝绸 10铜币", type: "trade_select" as const }];
    const state = makeDialogueState({
      activeTab: "chat",
      options: chatOptions,
      savedTabOptions: {},
    });

    const result = applyDialogueOptionsToTab(state, "trade", tradeOptions, {
      id: "npc1",
      name: "老马",
    });

    expect(result.activeTab).toBe("chat");
    expect(result.options).toEqual(chatOptions);
    expect(result.savedTabOptions.trade).toEqual(tradeOptions);
  });

  it("返回当前tab时直接更新当前选项", () => {
    const chatOptions = [{ id: "c1", label: "聊聊近况", type: "idle_chat" as const }];
    const state = makeDialogueState({ activeTab: "chat", options: [] });

    const result = applyDialogueOptionsToTab(state, "chat", chatOptions, {
      id: "npc1",
      name: "老马",
    });

    expect(result.options).toEqual(chatOptions);
    expect(result.savedTabOptions.chat).toBeUndefined();
  });
});

describe("responseTabForOptionType", () => {
  it("交易选项归属交易tab", () => {
    expect(responseTabForOptionType("trade_menu")).toBe("trade");
    expect(responseTabForOptionType("trade_select")).toBe("trade");
    expect(responseTabForOptionType("trade_sell_menu")).toBe("trade");
  });

  it("非交易选项归属聊天tab", () => {
    expect(responseTabForOptionType("idle_chat")).toBe("chat");
    expect(responseTabForOptionType("close")).toBe("chat");
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
