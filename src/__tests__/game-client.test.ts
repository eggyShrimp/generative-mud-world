import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
  createGameClient,
  extractNpcReply,
  getDialogueOptionBehavior,
  getDialogueVisibleOptions,
  isDialogueTabLoading,
  responseTabForOptionType,
  shouldExpectDialogueOptions,
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

const originalWebSocket = globalThis.WebSocket;

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];

  readyState = MockWebSocket.CONNECTING;
  sent: string[] = [];
  private listeners: Record<string, Array<(event: { data?: string }) => void>> = {};

  constructor(readonly url: string) {
    MockWebSocket.instances.push(this);
  }

  addEventListener(type: string, listener: (event: { data?: string }) => void) {
    this.listeners[type] = [...(this.listeners[type] ?? []), listener];
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.emit("close", {});
  }

  open() {
    this.readyState = MockWebSocket.OPEN;
    this.emit("open", {});
  }

  receive(message: unknown) {
    this.emit("message", { data: JSON.stringify(message) });
  }

  private emit(type: string, event: { data?: string }) {
    for (const listener of this.listeners[type] ?? []) {
      listener(event);
    }
  }
}

function installMockWebSocket() {
  MockWebSocket.instances = [];
  globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
}

function restoreWebSocket() {
  globalThis.WebSocket = originalWebSocket;
}

function setupClientWithDialogue(options: DialogueOption[] = chatOptions) {
  const client = createGameClient("ws://test");
  client.connect();
  const socket = MockWebSocket.instances[0];
  socket.open();
  socket.receive({
    type: "state_update",
    entity: {
      id: "p1",
      name: "赵行舟",
      type: "player",
      roomId: "market",
      needs: [],
    },
    room: {
      id: "market",
      name: "集市",
      description: "热闹的市场",
      exits: {},
      entities: [{ id: "npc1", name: "老马", type: "npc", description: "酒馆老板" }],
    },
    capabilities: [
      { action: "talk", label: "交谈", params: { type: "npc_select", values: ["npc1"] } },
    ],
    itemPropertyLabels: {},
    groundRestRecovery: 20,
  });
  client.interactWithEntity("npc1");
  socket.receive({ type: "chat_options", npcId: "npc1", npcName: "老马", options });
  return { client, socket };
}

function lastSent(socket: MockWebSocket) {
  return JSON.parse(socket.sent[socket.sent.length - 1]) as Record<string, unknown>;
}

beforeEach(() => {
  installMockWebSocket();
});

afterEach(() => {
  restoreWebSocket();
});

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

describe("shouldExpectDialogueOptions", () => {
  it("显式 behavior 优先于 type 推断", () => {
    const closeByBehavior: DialogueOption = {
      id: "chat:1",
      label: "只是停留",
      type: "idle_chat",
      behavior: { kind: "close" },
    };
    const continueByBehavior: DialogueOption = {
      id: "close",
      label: "继续",
      type: "close",
      behavior: { kind: "continue", expects: "chat_options" },
    };

    expect(getDialogueOptionBehavior(closeByBehavior)).toEqual({ kind: "close" });
    expect(shouldExpectDialogueOptions(closeByBehavior)).toBe(false);
    expect(shouldExpectDialogueOptions(continueByBehavior)).toBe(true);
  });

  it("menu、select 和 idle_chat 会等待子选项", () => {
    const mk = (id: string, label: string, type: DialogueOption["type"]) => ({
      id,
      label,
      type,
      behavior: { kind: "continue", expects: "chat_options" } as const,
    });
    expect(shouldExpectDialogueOptions(mk("menu:chat", "聊聊", "functional_menu"))).toBe(true);
    expect(
      shouldExpectDialogueOptions(
        mk("quest_trigger:q_faxian_cipher", "接受", "quest_trigger_select"),
      ),
    ).toBe(true);
    expect(
      shouldExpectDialogueOptions(
        mk("quest_deliver:q_faxian_cipher", "交付", "quest_deliver_select"),
      ),
    ).toBe(true);
    expect(shouldExpectDialogueOptions(mk("functional:rest", "休息", "functional_select"))).toBe(
      true,
    );
    expect(shouldExpectDialogueOptions(mk("chat:1", "聊聊", "idle_chat"))).toBe(true);
  });

  it("close 不等待子选项", () => {
    expect(
      shouldExpectDialogueOptions({
        id: "close",
        label: "告别",
        type: "close",
        behavior: { kind: "close" },
      }),
    ).toBe(false);
  });

  it("stay 保持弹窗且不等待子选项", () => {
    const option: DialogueOption = {
      id: "hint",
      label: "再看看",
      type: "idle_chat",
      behavior: { kind: "stay" },
    };

    expect(shouldExpectDialogueOptions(option)).toBe(false);
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

describe("follow-up request lifecycle", () => {
  it("发送追问请求时会 trim context，并用返回选项更新聊天列表", () => {
    const { client, socket } = setupClientWithDialogue();

    client.requestFollowUpOptions("  山里有宝藏  ");

    expect(client.dialogue()?.tabs.chat.loading).toBe(true);
    expect(lastSent(socket)).toEqual({
      type: "request_follow_up_options",
      npcId: "npc1",
      context: "山里有宝藏",
    });

    const options: DialogueOption[] = [
      { id: "followup:0", label: "是什么宝藏？", type: "idle_chat" },
      { id: "followup:1", label: "山在哪边？", type: "idle_chat" },
    ];
    socket.receive({
      type: "follow_up_options",
      npcId: "npc1",
      npcName: "老马",
      context: "山里有宝藏",
      options,
    });

    expect(client.dialogue()?.tabs.chat.loading).toBe(false);
    expect(client.dialogue()?.tabs.chat.options).toEqual(options);
    expect(client.dialogue()?.followUpContext).toBe("山里有宝藏");
  });

  it("空白追问文本不会发送请求，并保留原选项", () => {
    const { client, socket } = setupClientWithDialogue();
    const sentBefore = socket.sent.length;

    client.requestFollowUpOptions("   ");

    expect(socket.sent).toHaveLength(sentBefore);
    expect(client.dialogue()?.tabs.chat.options).toEqual(chatOptions);
    expect(client.dialogue()?.tabs.chat.loading).toBe(false);
    expect(client.events().at(-1)?.description).toBe("请先选中一句 NPC 的话。");
  });

  it("服务端返回空追问选项时恢复旧选项并提示", () => {
    const { client, socket } = setupClientWithDialogue();

    client.requestFollowUpOptions("山里有宝藏");
    expect(client.dialogue()?.tabs.chat.options).toEqual([]);

    socket.receive({
      type: "follow_up_options",
      npcId: "npc1",
      npcName: "老马",
      context: "山里有宝藏",
      options: [],
    });

    expect(client.dialogue()?.tabs.chat.loading).toBe(false);
    expect(client.dialogue()?.tabs.chat.options).toEqual(chatOptions);
    expect(client.dialogue()?.followUpContext).toBeUndefined();
    expect(client.events().at(-1)?.description).toBe("没有合适的追问方向。");
  });

  it("追问请求失败时恢复旧选项并退出 loading", () => {
    const { client, socket } = setupClientWithDialogue();

    client.requestFollowUpOptions("山里有宝藏");
    expect(client.dialogue()?.tabs.chat.loading).toBe(true);

    socket.receive({
      type: "error",
      code: "follow_up_options_failed",
      message: "无法生成追问选项",
    });

    expect(client.dialogue()?.tabs.chat.loading).toBe(false);
    expect(client.dialogue()?.tabs.chat.options).toEqual(chatOptions);
    expect(client.dialogue()?.followUpContext).toBeUndefined();
  });

  it("追问请求发送失败时保留旧选项", () => {
    const { client, socket } = setupClientWithDialogue();
    socket.close();
    const sentBefore = socket.sent.length;

    client.requestFollowUpOptions("山里有宝藏");

    expect(socket.sent).toHaveLength(sentBefore);
    expect(client.dialogue()?.tabs.chat.loading).toBe(false);
    expect(client.dialogue()?.tabs.chat.options).toEqual(chatOptions);
    expect(client.events().at(-1)?.description).toBe("尚未连接服务器。");
  });
});

describe("quest negotiation client behavior", () => {
  const questOptions: DialogueOption[] = [
    {
      id: "quest_trigger:q_faxian_cipher",
      label: "我去查清这枚铜符。",
      type: "quest_trigger_select",
      tag: "quest",
      behavior: { kind: "continue", expects: "chat_options" },
    },
    {
      id: "quest_background:q_faxian_cipher:0",
      label: "铜符是什么来历？",
      type: "idle_chat",
      behavior: { kind: "continue", expects: "chat_options" },
    },
    {
      id: "quest_defer:q_faxian_cipher",
      label: "我先想想。",
      type: "quest_defer",
      tag: "quest",
      behavior: { kind: "close" },
    },
    {
      id: "chat:goodbye",
      label: "告别",
      type: "close",
      behavior: { kind: "close" },
    },
  ];

  function setupClientWithQuestNegotiation() {
    return setupClientWithDialogue(questOptions);
  }

  it("selecting quest_defer sends talk and closes popup", () => {
    const { client, socket } = setupClientWithQuestNegotiation();

    client.chooseDialogueOption(questOptions[2]);

    expect(lastSent(socket)).toEqual({
      type: "talk",
      npcId: "npc1",
      optionId: "quest_defer:q_faxian_cipher",
      label: "我先想想。",
      optionType: "quest_defer",
    });
    expect(client.dialogue()).toBeNull();
  });

  it("selecting quest accept waits for returned chat options", () => {
    const { client, socket } = setupClientWithQuestNegotiation();
    const postAcceptOptions: DialogueOption[] = [
      { id: "chat:goodbye", label: "告别", type: "close", behavior: { kind: "close" } },
    ];

    client.chooseDialogueOption(questOptions[0]);

    expect(lastSent(socket)).toEqual({
      type: "talk",
      npcId: "npc1",
      optionId: "quest_trigger:q_faxian_cipher",
      label: "我去查清这枚铜符。",
      optionType: "quest_trigger_select",
    });
    expect(client.dialogue()?.tabs.chat.loading).toBe(true);
    expect(client.dialogue()?.tabs.chat.options).toEqual([]);

    socket.receive({
      type: "command_result",
      events: [{ type: "dialogue", description: "法显：就拜托你了。" }],
      ended: false,
    });
    socket.receive({
      type: "chat_options",
      npcId: "npc1",
      npcName: "老马",
      options: postAcceptOptions,
    });

    expect(client.dialogue()?.tabs.chat.loading).toBe(false);
    expect(client.dialogue()?.tabs.chat.options).toEqual(postAcceptOptions);
    expect(client.dialogue()?.tabs.chat.history).toEqual([
      { speaker: "player", content: "我去查清这枚铜符。" },
      { speaker: "npc", content: "法显：就拜托你了。" },
    ]);
  });

  it("explicit behavior controls popup behavior instead of type name", () => {
    const option: DialogueOption = {
      id: "legacy-looking-close",
      label: "继续聊",
      type: "close",
      behavior: { kind: "continue", expects: "chat_options" },
    };
    const { client, socket } = setupClientWithDialogue([option]);

    client.chooseDialogueOption(option);

    expect(lastSent(socket)).toMatchObject({
      type: "talk",
      optionId: "legacy-looking-close",
      optionType: "close",
    });
    expect(client.dialogue()?.tabs.chat.loading).toBe(true);
    expect(client.dialogue()?.tabs.chat.options).toEqual([]);
  });

  it("stay behavior keeps current options without loading", () => {
    const option: DialogueOption = {
      id: "stay:hint",
      label: "我再想想",
      type: "idle_chat",
      behavior: { kind: "stay" },
    };
    const { client, socket } = setupClientWithDialogue([option]);

    client.chooseDialogueOption(option);

    expect(lastSent(socket)).toMatchObject({
      type: "talk",
      optionId: "stay:hint",
      optionType: "idle_chat",
    });
    expect(client.dialogue()?.tabs.chat.loading).toBe(false);
    expect(client.dialogue()?.tabs.chat.options).toEqual([option]);
    expect(client.dialogue()?.tabs.chat.history).toEqual([
      { speaker: "player", content: "我再想想" },
    ]);
  });

  it("direct close during quest negotiation sends cleanup talk", () => {
    const { client, socket } = setupClientWithQuestNegotiation();

    client.closeDialogue();

    expect(lastSent(socket)).toMatchObject({
      type: "talk",
      npcId: "npc1",
    });
    const sent = lastSent(socket);
    expect(sent.optionType === "close" || sent.optionType === "quest_defer").toBe(true);
    expect(client.dialogue()).toBeNull();
  });

  it("normal local close does not send cleanup talk", () => {
    const { client, socket } = setupClientWithDialogue();
    const sentBefore = socket.sent.length;

    client.closeDialogue();

    expect(socket.sent).toHaveLength(sentBefore);
    expect(client.dialogue()).toBeNull();
  });
});
