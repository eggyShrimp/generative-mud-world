import { describe, expect, it } from "vitest";
import type { DialogueOption, TradeOption } from "../shared/protocol.ts";
import type { DialogueState } from "../tui/client/game-client.ts";
import {
  appendToHistory,
  applyDialogueOptionsToTab,
  applyNpcReply,
  applyTradeOptionsToTab,
  buildLoadingDialogueState,
  computeContentHeight,
  computeTabSwitch,
  createDialogueState,
  extractNpcReply,
  getDialogueVisibleOptions,
  isDialogueTabLoading,
  responseTabForOptionType,
  shouldExpectDialogueOptions,
  shouldKeepPopupOpen,
  shouldRunPendingDialogueRequest,
} from "../tui/client/game-client.ts";

const chatOptions: DialogueOption[] = [
  { id: "c1", label: "你好", type: "idle_chat" },
  { id: "c2", label: "再见", type: "close" },
];

const tradeOptions: TradeOption[] = [
  { id: "trade:sword", label: "铁剑 10铜币", action: "buy", meta: { itemId: "sword" } },
  { id: "trade:bread", label: "面包 2铜币", action: "buy", meta: { itemId: "bread" } },
];

type DialogueStateOverrides = Partial<Omit<DialogueState, "tabs">> & {
  tabs?: {
    chat?: Partial<DialogueState["tabs"]["chat"]>;
    trade?: Partial<DialogueState["tabs"]["trade"]>;
  };
};

function makeDialogueState(overrides?: DialogueStateOverrides): DialogueState {
  const base = createDialogueState({
    npcId: "npc1",
    npcName: "老马",
    chatOptions,
    activeTab: "chat",
    availableTabs: ["chat", "trade"],
  });
  return {
    ...base,
    ...overrides,
    tabs: {
      ...base.tabs,
      ...overrides?.tabs,
      chat: { ...base.tabs.chat, ...overrides?.tabs?.chat },
      trade: { ...base.tabs.trade, ...overrides?.tabs?.trade },
    },
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
});

describe("shouldExpectDialogueOptions", () => {
  it("menu 和 idle_chat 会等待子选项", () => {
    expect(
      shouldExpectDialogueOptions({ id: "menu:chat", label: "聊聊", type: "functional_menu" }),
    ).toBe(true);
    expect(shouldExpectDialogueOptions({ id: "chat:1", label: "聊聊", type: "idle_chat" })).toBe(
      true,
    );
  });

  it("close 不等待子选项", () => {
    expect(shouldExpectDialogueOptions({ id: "close", label: "告别", type: "close" })).toBe(false);
  });
});

describe("buildLoadingDialogueState", () => {
  it("只清空目标 tab 的 options", () => {
    const state = makeDialogueState({
      activeTab: "trade",
      tabs: {
        chat: { options: chatOptions, loading: false, history: [] },
        trade: { options: tradeOptions, loading: false },
      },
    });

    const result = buildLoadingDialogueState(state, "trade");

    expect(result.tabs.chat.options).toEqual(chatOptions);
    expect(result.tabs.chat.loading).toBe(false);
    expect(result.tabs.trade.options).toEqual([]);
    expect(result.tabs.trade.loading).toBe(true);
  });

  it("保留聊天历史", () => {
    const history = [
      { speaker: "player" as const, content: "你好" },
      { speaker: "npc" as const, content: "你好旅人" },
    ];
    const state = makeDialogueState({
      tabs: { chat: { options: chatOptions, loading: false, history } },
    });
    const result = buildLoadingDialogueState(state, "chat");

    expect(result.tabs.chat.history).toEqual(history);
  });
});

describe("appendToHistory", () => {
  it("追加到 chat history", () => {
    const state = makeDialogueState();
    const result = appendToHistory(state, "player", "你好");

    expect(result).toEqual([{ speaker: "player", content: "你好" }]);
  });

  it("不修改原 state", () => {
    const state = makeDialogueState({
      tabs: {
        chat: {
          options: chatOptions,
          loading: false,
          history: [{ speaker: "player", content: "原始" }],
        },
      },
    });
    appendToHistory(state, "npc", "新消息");

    expect(state.tabs.chat.history).toHaveLength(1);
  });
});

describe("computeContentHeight", () => {
  it("标准计算", () => {
    expect(computeContentHeight(14, 5)).toBe(9);
  });

  it("最小值保护", () => {
    expect(computeContentHeight(3, 5)).toBe(1);
  });
});

describe("computeTabSwitch", () => {
  it("只切 activeTab，不复制或覆盖列表", () => {
    const state = makeDialogueState({
      activeTab: "chat",
      tabs: {
        chat: { options: chatOptions, loading: false, history: [] },
        trade: { options: tradeOptions, loading: false },
      },
    });

    const result = computeTabSwitch(state, 1);

    expect(result.activeTab).toBe("trade");
    expect(result.tabs.chat.options).toEqual(chatOptions);
    expect(result.tabs.trade.options).toEqual(tradeOptions);
  });

  it("只有2个tab时循环不越界", () => {
    let state = makeDialogueState({ activeTab: "trade" });
    state = computeTabSwitch(state, 1);
    expect(state.activeTab).toBe("chat");
    state = computeTabSwitch(state, -1);
    expect(state.activeTab).toBe("trade");
  });
});

describe("applyNpcReply", () => {
  it("NPC 回复追加到 chat history，选项不变", () => {
    const state = makeDialogueState({
      tabs: {
        chat: {
          options: chatOptions,
          loading: false,
          history: [{ speaker: "player", content: "你好" }],
        },
      },
    });
    const result = applyNpcReply(state, "你好旅人");

    expect(result.tabs.chat.history).toEqual([
      { speaker: "player", content: "你好" },
      { speaker: "npc", content: "你好旅人" },
    ]);
    expect(result.tabs.chat.options).toEqual(chatOptions);
  });
});

describe("applyDialogueOptionsToTab", () => {
  it("聊天返回时，用户已在交易 tab，不覆盖交易列表", () => {
    const state = makeDialogueState({
      activeTab: "trade",
      tabs: {
        chat: { options: [], loading: true, history: [] },
        trade: { options: tradeOptions, loading: false },
      },
    });

    const result = applyDialogueOptionsToTab(state, "chat", chatOptions, {
      id: "npc1",
      name: "老马",
    });

    expect(result.activeTab).toBe("trade");
    expect(result.tabs.chat.options).toEqual(chatOptions);
    expect(result.tabs.chat.loading).toBe(false);
    expect(result.tabs.trade.options).toEqual(tradeOptions);
  });

  it("交易返回时，用户已在聊天 tab，不覆盖聊天列表", () => {
    const state = makeDialogueState({
      activeTab: "chat",
      tabs: {
        chat: { options: chatOptions, loading: false, history: [] },
        trade: { options: [], loading: true },
      },
    });

    const result = applyTradeOptionsToTab(state, tradeOptions, {
      id: "npc1",
      name: "老马",
    });

    expect(result.activeTab).toBe("chat");
    expect(result.tabs.chat.options).toEqual(chatOptions);
    expect(result.tabs.trade.options).toEqual(tradeOptions);
    expect(result.tabs.trade.loading).toBe(false);
  });

  it("交易列表返回时清掉旧 selected", () => {
    const state = makeDialogueState({
      tabs: { trade: { options: [], loading: true, selected: { option: tradeOptions[0] } } },
    });

    const result = applyTradeOptionsToTab(state, tradeOptions, {
      id: "npc1",
      name: "老马",
    });

    expect(result.tabs.trade.selected).toBeUndefined();
    expect(result.tabs.trade.options).toEqual(tradeOptions);
  });
});

describe("getDialogueVisibleOptions", () => {
  it("普通 tab 返回当前 tab 列表", () => {
    const state = makeDialogueState();
    expect(getDialogueVisibleOptions(state)).toEqual(chatOptions);
  });

  it("交易详情打开时返回空（trade tab 使用 TradeOption）", () => {
    const state = makeDialogueState({
      activeTab: "trade",
      tabs: {
        trade: { options: tradeOptions, loading: false, selected: { option: tradeOptions[0] } },
      },
    });

    expect(getDialogueVisibleOptions(state)).toEqual([]);
    expect(state.tabs.trade.options).toEqual(tradeOptions);
  });
});

describe("isDialogueTabLoading", () => {
  it("读取当前 tab 的 loading", () => {
    const state = makeDialogueState({
      activeTab: "trade",
      tabs: { trade: { options: [], loading: true } },
    });
    expect(isDialogueTabLoading(state)).toBe(true);
  });
});

describe("responseTabForOptionType", () => {
  it("非交易选项归属聊天tab", () => {
    expect(responseTabForOptionType("idle_chat")).toBe("chat");
    expect(responseTabForOptionType("close")).toBe("chat");
    expect(responseTabForOptionType("functional_menu")).toBe("chat");
    expect(responseTabForOptionType("quest_trigger_menu")).toBe("chat");
    expect(responseTabForOptionType("quest_deliver_menu")).toBe("chat");
  });
});

describe("shouldRunPendingDialogueRequest", () => {
  it("同一个 NPC 的待发请求可以继续", () => {
    const state = makeDialogueState({ npcId: "npc1" });

    expect(shouldRunPendingDialogueRequest(state, { npcId: "npc1", targetTab: "trade" })).toBe(
      true,
    );
  });

  it("弹窗关闭后丢弃待发请求", () => {
    expect(shouldRunPendingDialogueRequest(null, { npcId: "npc1", targetTab: "trade" })).toBe(
      false,
    );
  });

  it("切到另一个 NPC 后丢弃旧待发请求", () => {
    const state = makeDialogueState({ npcId: "npc2" });

    expect(shouldRunPendingDialogueRequest(state, { npcId: "npc1", targetTab: "trade" })).toBe(
      false,
    );
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
});
