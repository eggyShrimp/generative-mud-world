import type {
  CommandEvent,
  DialogueOption,
  DialogueOptionBehavior,
  TradeOption,
} from "../../shared/protocol.ts";
import type { DialogueHistoryEntry, DialogueState, DialogueTab } from "./types.ts";

export function getDialogueOptionBehavior(option: DialogueOption): DialogueOptionBehavior {
  if (!option.behavior) {
    throw new Error(`DialogueOption missing behavior field: id=${option.id} type=${option.type}`);
  }
  return option.behavior;
}

export function shouldExpectDialogueOptions(option: DialogueOption): boolean {
  const behavior = getDialogueOptionBehavior(option);
  return behavior.kind === "continue" && behavior.expects === "chat_options";
}

export function hasVisibleQuestNegotiation(state: DialogueState): boolean {
  return state.tabs.chat.options.some(
    (option) =>
      option.id.startsWith("quest_defer:") ||
      (option.id.startsWith("quest_trigger:") &&
        getDialogueOptionBehavior(option).kind !== "close"),
  );
}

export function createDialogueState(input: {
  npcId: string;
  npcName: string;
  chatOptions?: DialogueOption[];
  tradeOptions?: TradeOption[];
  history?: DialogueHistoryEntry[];
  activeTab?: DialogueTab;
  availableTabs?: DialogueTab[];
  npcDescription?: string;
  chatLoading?: boolean;
  tradeLoading?: boolean;
}): DialogueState {
  return {
    npcId: input.npcId,
    npcName: input.npcName,
    activeTab: input.activeTab ?? "chat",
    availableTabs: input.availableTabs ?? ["chat", "trade"],
    npcDescription: input.npcDescription,
    tabs: {
      chat: {
        options: input.chatOptions ?? [],
        loading: input.chatLoading ?? false,
        history: input.history ?? [],
      },
      trade: {
        options: input.tradeOptions ?? [],
        loading: input.tradeLoading ?? false,
      },
    },
  };
}

export function getDialogueVisibleOptions(state: DialogueState): DialogueOption[] {
  if (state.activeTab === "trade") return [];
  return state.tabs[state.activeTab].options;
}

export function isDialogueTabLoading(state: DialogueState): boolean {
  return state.tabs[state.activeTab].loading;
}

export function buildLoadingDialogueState(
  current: DialogueState,
  targetTab: DialogueTab = current.activeTab,
): DialogueState {
  const tab = current.tabs[targetTab];
  return {
    ...current,
    tabs: {
      ...current.tabs,
      [targetTab]: {
        ...tab,
        options: [],
        loading: true,
      },
    },
  };
}

export function extractNpcReply(events: CommandEvent[]): string | undefined {
  const dialogueEvent = events.find((e) => e.type === "dialogue");
  return dialogueEvent?.content ?? dialogueEvent?.description;
}

export function appendToHistory(
  state: DialogueState,
  speaker: "player" | "npc",
  content: string,
): DialogueHistoryEntry[] {
  return [...state.tabs.chat.history, { speaker, content }];
}

export function computeTabSwitch(state: DialogueState, direction: -1 | 1): DialogueState {
  const tabs = state.availableTabs;
  const idx = tabs.indexOf(state.activeTab);
  const nextIdx = (idx + direction + tabs.length) % tabs.length;
  const nextTab = tabs[nextIdx];
  return {
    ...state,
    activeTab: nextTab,
  };
}

export function applyNpcReply(state: DialogueState, npcReplyText: string): DialogueState {
  return {
    ...state,
    tabs: {
      ...state.tabs,
      chat: {
        ...state.tabs.chat,
        history: [...state.tabs.chat.history, { speaker: "npc" as const, content: npcReplyText }],
      },
    },
  };
}

export function applyDialogueOptionsToTab(
  state: DialogueState,
  tab: DialogueTab,
  options: DialogueOption[],
  npc: { id: string; name: string },
): DialogueState {
  const currentTab = state.tabs[tab];
  return {
    ...state,
    npcId: npc.id,
    npcName: npc.name,
    tabs: {
      ...state.tabs,
      [tab]: {
        ...currentTab,
        options,
        loading: false,
      },
    },
  };
}

export function applyTradeOptionsToTab(
  state: DialogueState,
  options: TradeOption[],
  npc: { id: string; name: string },
): DialogueState {
  return {
    ...state,
    npcId: npc.id,
    npcName: npc.name,
    tabs: {
      ...state.tabs,
      trade: {
        ...state.tabs.trade,
        options,
        loading: false,
        selected: undefined,
      },
    },
  };
}

export function responseTabForOptionType(optionType: string): DialogueTab {
  return optionType.startsWith("trade_") ? "trade" : "chat";
}

export function shouldRunPendingDialogueRequest(
  current: DialogueState | null,
  pending: { npcId: string; targetTab: DialogueTab } | null,
): boolean {
  return Boolean(current && pending && current.npcId === pending.npcId);
}

export function tradeOptionDetail(option: TradeOption): string | undefined {
  const description = option.meta?.itemDescription;
  const properties = option.meta?.itemPropertiesText;
  const lines = [
    typeof description === "string" ? description : "",
    typeof properties === "string" && properties.length > 0 ? `属性：${properties}` : "",
  ].filter(Boolean);
  return lines.length > 0 ? lines.join("\n") : undefined;
}

export function buildFollowUpLoadingState(state: DialogueState): DialogueState {
  return {
    ...state,
    tabs: {
      ...state.tabs,
      chat: {
        ...state.tabs.chat,
        options: [],
        loading: true,
      },
    },
  };
}

export function applyFollowUpOptions(
  state: DialogueState,
  options: DialogueOption[],
  context: string,
): DialogueState {
  return {
    ...state,
    followUpContext: context,
    tabs: {
      ...state.tabs,
      chat: {
        ...state.tabs.chat,
        options,
        loading: false,
      },
    },
  };
}

export function clearFollowUpContext(state: DialogueState): DialogueState {
  return {
    ...state,
    followUpContext: undefined,
  };
}
