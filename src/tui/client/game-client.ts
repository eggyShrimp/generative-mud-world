import { createSignal } from "solid-js";
import { logWrite } from "../../shared/log.ts";
import type {
  Capability,
  CommandEvent,
  DialogueOption,
  EntityState,
  RoomInfo,
  SaveSlotInfo,
  ServerMessage,
  StatusMessage,
  TradeOption,
  TravelogueDataMessage,
} from "../../shared/protocol.ts";
import {
  activeLayer,
  getLayerStack,
  hasLayer,
  type KeyLayer,
  popLayer,
  pushLayer,
} from "../key-layer/index.ts";

// ── Types ──

export interface LogEntry {
  id: number;
  type: string;
  description: string;
}

export type DialogueTab = "chat" | "trade";

export interface DialogueHistoryEntry {
  speaker: "player" | "npc";
  content: string;
}

export interface TradeItemDisplay {
  id: string;
  name: string;
  description: string;
  price: number;
  currencyName: string;
  mode: "buy" | "sell";
}

export interface DialogueTabList {
  options: DialogueOption[];
  loading: boolean;
}

export interface ChatTab extends DialogueTabList {
  history: DialogueHistoryEntry[];
}

export interface TradeTab {
  options: TradeOption[];
  loading: boolean;
  selected?: { option: TradeOption; detail?: string };
}

export interface DialogueState {
  npcId: string;
  npcName: string;
  activeTab: DialogueTab;
  availableTabs: DialogueTab[];
  npcDescription?: string;
  tabs: {
    chat: ChatTab;
    trade: TradeTab;
  };
}

export function shouldKeepPopupOpen(optionType: string): boolean {
  return optionType !== "close";
}

export function shouldExpectDialogueOptions(option: DialogueOption): boolean {
  return option.type.endsWith("_menu") || option.type === "idle_chat";
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
  return dialogueEvent?.description;
}

export function appendToHistory(
  state: DialogueState,
  speaker: "player" | "npc",
  content: string,
): DialogueHistoryEntry[] {
  return [...state.tabs.chat.history, { speaker, content }];
}

export function computeContentHeight(bodyHeight: number, interactionHeight: number): number {
  return Math.max(1, bodyHeight - interactionHeight);
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

function tradeOptionDetail(option: TradeOption): string | undefined {
  const description = option.meta?.itemDescription;
  const properties = option.meta?.itemPropertiesText;
  const lines = [
    typeof description === "string" ? description : "",
    typeof properties === "string" && properties.length > 0 ? `属性：${properties}` : "",
  ].filter(Boolean);
  return lines.length > 0 ? lines.join("\n") : undefined;
}

export interface ActiveRequest {
  onCommandResult?: (msg: ServerMessage & { type: "command_result" }) => void;
  onDialogueOptions?: (msg: ServerMessage & { type: "dialogue_options" }) => void;
  onChatOptions?: (msg: ServerMessage & { type: "chat_options" }) => void;
  onTradeOptions?: (msg: ServerMessage & { type: "trade_options" }) => void;
  onError?: () => void;
}

export interface CombatLogEntry {
  round: number;
  type: string;
  description: string;
}

export interface TravelogueEntry {
  day: number;
  month: number;
  year: number;
  date: string;
  title: string;
  location: string | null;
  locations: string[];
  narrative: string;
  keyEvents: string[];
  createdAt: number;
}

export const MAP_GRANULARITIES = ["world", "region"] as const;
export type MapGranularity = (typeof MAP_GRANULARITIES)[number];

export interface MapCursor {
  x: number;
  y: number;
  regionId?: string;
}

export interface SavePanelState {
  slots: SaveSlotInfo[];
  selectedIndex: number | null;
  loading: boolean;
  message: string | null;
}

// ── GameClient interface ──
// 62 个成员：22 个信号读取器、5 个计算属性、5 个 setter、30 个动作方法。
// 面板通过 props.client 接收此接口，不应直接导入 createGameClient。

export interface GameClient {
  connectionState: () => string;
  entity: () => EntityState | null;
  room: () => RoomInfo | null;
  capabilities: () => Capability[];
  events: () => LogEntry[];
  dialogue: () => DialogueState | null;
  hasActiveRequest: () => boolean;
  status: () => StatusMessage | null;
  selectedEntityId: () => string | null;
  selectedInventoryItemId: () => string | null;
  selectedQuestIndex: () => number | null;
  setSelectedQuestIndex: (index: number | null) => void;
  mapGranularity: () => MapGranularity;
  mapCursor: () => MapCursor;
  isLayerActive: (id: string) => boolean;
  activeLayer: () => KeyLayer;
  layerStack: () => KeyLayer[];
  setSelectedEntityId: (id: string | null) => void;
  openInventory: () => void;
  closeInventory: () => void;
  openQuests: () => void;
  closeQuests: () => void;
  openStatus: () => void;
  closeStatus: () => void;
  toggleStatus: () => void;
  toggleMinimap: () => void;
  cycleMapGranularity: () => void;
  setMapCursor: (cursor: MapCursor) => void;
  setSelectedInventoryItemId: (id: string | null) => void;
  connect: () => void;
  disconnect: () => void;
  execute: (action: string, params?: Record<string, unknown>) => void;
  requestDialogueOptions: (npcId: string) => void;
  chooseDialogueOption: (option: DialogueOption) => void;
  chooseTradeOption: (option: TradeOption) => void;
  clearTradeSelection: () => void;
  closeDialogue: () => void;
  switchDialogueTab: (direction: -1 | 1) => void;
  requestTradeOptions: (npcId: string) => void;
  startCombat: (targetId: string, targetName: string) => void;
  endCombat: () => void;
  trackedQuestIds: () => Set<string>;
  toggleTrackQuest: (templateId: string) => void;
  isTrackingQuest: (templateId: string) => boolean;
  questNotification: () => { type: string; title: string } | null;
  showQuestNotification: (notif: { type: string; title: string }) => void;
  dismissQuestNotification: () => void;
  itemChangeNotification: () => {
    gains: Array<{ name: string; qty: number }>;
    losses: Array<{ name: string; qty: number }>;
  } | null;
  showItemChangeNotification: (data: {
    gains: Array<{ name: string; qty: number }>;
    losses: Array<{ name: string; qty: number }>;
  }) => void;
  dismissItemChangeNotification: () => void;
  combatLog: () => CombatLogEntry[];
  combatRound: () => number;
  settlementPending: () => boolean;
  groundRestRecovery: () => number;
  itemPropertyLabels: () => Record<string, string>;
  endDayOptions: () => RestOption[];
  requestEndDay: () => void;
  confirmEndDay: (option: RestOption) => void;
  cancelEndDay: () => void;
  travelogue: () => TravelogueEntry[];
  selectedTravelogueIndex: () => number | null;
  setSelectedTravelogueIndex: (index: number | null) => void;
  openTravelogue: () => void;
  closeTravelogue: () => void;
  saveSlots: () => SaveSlotInfo[];
  selectedSaveSlotIndex: () => number | null;
  setSelectedSaveSlotIndex: (index: number | null) => void;
  savePanelLoading: () => boolean;
  savePanelMessage: () => string | null;
  openSavePanel: () => void;
  closeSavePanel: () => void;
  requestSaveSlots: () => void;
  manualSave: () => void;
  createSaveSlot: () => void;
}

export interface RestOption {
  type: "room" | "item" | "ground";
  label: string;
  restRecovery: number;
  actionId?: string;
  itemId?: string;
  durability?: number;
}

// ── createGameClient ──
// 内部维护 24 个 Solid.js 信号（22 公开、2 内部）。
// ws / eventId / combatTimer 为模块级可变状态，不暴露给外部。

export function createGameClient(url: string): GameClient {
  const [connectionState, setConnectionState] = createSignal("disconnected");
  const [entity, setEntity] = createSignal<EntityState | null>(null);
  const [room, setRoom] = createSignal<RoomInfo | null>(null);
  const [capabilities, setCapabilities] = createSignal<Capability[]>([]);
  const [events, setEvents] = createSignal<LogEntry[]>([]);
  const [dialogue, setDialogue] = createSignal<DialogueState | null>(null);
  const showDialogue = (state: DialogueState) => {
    setDialogue(state);
    pushLayer("dialogue");
  };
  const [activeRequest, setActiveRequest] = createSignal<ActiveRequest | null>(null);

  const hasActiveRequest = (): boolean => activeRequest() !== null;

  const sendRequest = (
    msg: Record<string, unknown>,
    build: (req: ActiveRequest) => void,
  ): boolean => {
    if (hasActiveRequest()) {
      pushBlockedEvent();
      return false;
    }
    if (!send(msg)) return false;
    const req: ActiveRequest = {};
    build(req);
    setActiveRequest(req);
    return true;
  };

  const [pendingDialogueRequest, setPendingDialogueRequest] = createSignal<{
    npcId: string;
    targetTab: DialogueTab;
  } | null>(null);

  const completeActiveRequest = (): void => {
    setActiveRequest(null);
    const pending = pendingDialogueRequest();
    if (!pending) return;
    setPendingDialogueRequest(null);
    queueMicrotask(() => {
      const current = dialogue();
      if (!shouldRunPendingDialogueRequest(current, pending)) return;
      if (pending.targetTab === "trade") requestTradeOptions(pending.npcId);
    });
  };

  const buildTalkHandlers = (
    req: ActiveRequest,
    expectOptions: boolean,
    responseTab: DialogueTab,
  ): void => {
    req.onCommandResult = (msg) => {
      if (responseTab === "trade") return;
      const npcReplyText = extractNpcReply(msg.events);
      if (npcReplyText) {
        setDialogue((prev) => {
          if (!prev) return prev;
          return applyNpcReply(prev, npcReplyText);
        });
      }
    };
    if (expectOptions) {
      req.onChatOptions = (msg) => {
        logWrite(
          "cli",
          "dbg",
          `[DIAG] onChatOptions msg.options=${msg.options?.length} prev?=${!!dialogue()}`,
        );
        setDialogue((prev) => {
          if (!prev) {
            return createDialogueState({
              npcId: msg.npcId,
              npcName: msg.npcName,
              chatOptions: msg.options,
              activeTab: responseTab,
              availableTabs: ["chat", "trade"] as DialogueTab[],
            });
          }
          return applyDialogueOptionsToTab(prev, "chat", msg.options, {
            id: msg.npcId,
            name: msg.npcName,
          });
        });
      };
    }
  };
  const [status, setStatus] = createSignal<StatusMessage | null>(null);
  const [selectedEntityId, setSelectedEntityId] = createSignal<string | null>(null);
  const hideDialogue = () => {
    setDialogue(null);
    setSelectedEntityId(null);
    popLayer("dialogue");
  };
  const [selectedQuestIndex, setSelectedQuestIndex] = createSignal<number | null>(null);
  const [mapGranularity, setMapGranularity] = createSignal<MapGranularity>("world");
  const [mapCursor, setMapCursor] = createSignal<MapCursor>({ x: 0, y: 0 });
  const [selectedInventoryItemId, setSelectedInventoryItemId] = createSignal<string | null>(null);
  const [trackedQuestIds, setTrackedQuestIds] = createSignal<Set<string>>(new Set());
  const [questNotification, setQuestNotification] = createSignal<{
    type: string;
    title: string;
  } | null>(null);
  const [itemChangeNotification, setItemChangeNotification] = createSignal<{
    gains: Array<{ name: string; qty: number }>;
    losses: Array<{ name: string; qty: number }>;
  } | null>(null);
  const showItemChangeNotification = (data: {
    gains: Array<{ name: string; qty: number }>;
    losses: Array<{ name: string; qty: number }>;
  }) => {
    setItemChangeNotification(data);
    pushLayer("item-change-notification");
  };
  const dismissItemChangeNotification = () => {
    setItemChangeNotification(null);
    popLayer("item-change-notification");
  };
  const [combatLog, setCombatLog] = createSignal<CombatLogEntry[]>([]);
  const [combatRound, setCombatRound] = createSignal(0);
  const [settlementPending, setSettlementPending] = createSignal(false);
  const [groundRestRecovery, setGroundRestRecovery] = createSignal(20);
  const [itemPropertyLabels, setItemPropertyLabels] = createSignal<Record<string, string>>({});
  const [endDayOptions, setEndDayOptions] = createSignal<RestOption[]>([]);
  const [travelogue, setTravelogue] = createSignal<TravelogueEntry[]>([]);
  const [selectedTravelogueIndex, setSelectedTravelogueIndex] = createSignal<number | null>(null);
  const [savePanel, setSavePanel] = createSignal<SavePanelState>({
    slots: [],
    selectedIndex: null,
    loading: false,
    message: null,
  });

  let combatTargetId: string | null = null;
  let _combatTargetName: string | null = null;
  let combatTimer: ReturnType<typeof setInterval> | null = null;

  let ws: WebSocket | null = null;
  let eventId = 0;

  const pushEvents = (next: CommandEvent[]) => {
    if (next.length === 0) return;
    setEvents((prev) =>
      [
        ...prev,
        ...next.map((event) => ({
          id: ++eventId,
          type: event.type,
          description: event.description,
        })),
      ].slice(-80),
    );
  };

  const pushCombatLog = (events: CommandEvent[], round: number) => {
    const entries = events
      .filter((e) => e.type && (e.type.startsWith("combat_") || e.type === "defend"))
      .map((e) => ({ round, type: e.type, description: e.description }));
    if (entries.length > 0) {
      setCombatLog((prev) => [...prev, ...entries]);
    }
  };

  const endCombat = () => {
    combatTargetId = null;
    _combatTargetName = null;
    popLayer("combat");
    if (combatTimer) {
      clearInterval(combatTimer);
      combatTimer = null;
    }
  };

  const startCombat = (targetId: string, targetName: string) => {
    combatTargetId = targetId;
    _combatTargetName = targetName;
    setCombatLog([]);
    setCombatRound(0);
    setSelectedEntityId(null);
    pushLayer("combat");
    pushEvents([{ type: "system", description: `\u2694 进入战斗！对手：${targetName}` }]);
    ensureCombatTimer();
  };

  const checkCombatEnd = () => {
    const ent = entity();
    if (!ent?.combatState) return;
    if (ent.combatState.isIncapacitated) {
      pushEvents([{ type: "combat_defeat", description: "你倒下了……" }]);
      endCombat();
      return;
    }
    if (!ent.combatState.combatTarget) {
      pushEvents([{ type: "combat_victory", description: "战斗结束！" }]);
      endCombat();
      return;
    }
  };

  const ensureCombatTimer = () => {
    if (combatTimer) clearInterval(combatTimer);
    combatTimer = setInterval(sendAutoAttack, 1200);
  };

  const sendAutoAttack = () => {
    if (!combatTargetId || hasActiveRequest()) return;
    const ent = entity();
    if (!ent?.combatState) return;
    if (ent.combatState.isIncapacitated || !ent.combatState.combatTarget) {
      endCombat();
      return;
    }
    setCombatRound((r) => r + 1);
    execute("attack", { targetId: combatTargetId });
  };

  const pushBlockedEvent = () => {
    if (!hasActiveRequest()) return;
    pushEvents([{ type: "system", description: "正在处理操作，请稍候。" }]);
  };

  const send = (data: unknown): boolean => {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      pushEvents([{ type: "error", description: "尚未连接服务器。" }]);
      return false;
    }
    ws.send(JSON.stringify(data));
    return true;
  };

  const selectDefaultSaveSlot = (slots: SaveSlotInfo[]): number | null => {
    if (slots.length === 0) return null;
    const current = slots.findIndex((slot) => slot.isCurrent);
    return current >= 0 ? current : 0;
  };

  const makeSlotId = (): string => {
    const date = new Date();
    const pad = (value: number) => String(value).padStart(2, "0");
    return `slot_${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  };

  const requestSaveSlots = () => {
    setSavePanel((prev) => ({ ...prev, loading: true, message: null }));
    if (!send({ type: "request_save_slots" })) {
      setSavePanel((prev) => ({ ...prev, loading: false }));
    }
  };

  const manualSave = () => {
    const panel = savePanel();
    const slot = panel.selectedIndex !== null ? panel.slots[panel.selectedIndex] : null;
    const slotId = slot?.slotId;
    setSavePanel((prev) => ({
      ...prev,
      loading: true,
      message: slotId ? `正在保存到 ${slotId}...` : "正在保存...",
    }));
    if (!send({ type: "manual_save", slotId })) {
      setSavePanel((prev) => ({ ...prev, loading: false }));
    }
  };

  const createSaveSlot = () => {
    const slotId = makeSlotId();
    setSavePanel((prev) => ({ ...prev, loading: true, message: `正在创建 ${slotId}...` }));
    if (!send({ type: "create_save_slot", slotId })) {
      setSavePanel((prev) => ({ ...prev, loading: false }));
    }
  };

  const handleMessage = (message: ServerMessage) => {
    switch (message.type) {
      case "init":
        pushEvents([{ type: "system", description: `已进入世界：${message.boundEntityName}` }]);
        break;
      case "bound":
        pushEvents([{ type: "system", description: `当前角色：${message.entityName}` }]);
        break;
      case "state_update":
        setEntity(message.entity);
        setRoom(message.room);
        setCapabilities(message.capabilities);
        setItemPropertyLabels(message.itemPropertyLabels ?? {});
        setGroundRestRecovery(message.groundRestRecovery);
        if (hasLayer("combat")) {
          checkCombatEnd();
          if (hasLayer("combat")) {
            ensureCombatTimer();
          }
        }
        break;
      case "command_result": {
        pushEvents(message.events);
        if (hasLayer("combat")) {
          pushCombatLog(message.events, combatRound());
        }
        if (message.delta?.itemChanges?.length) {
          const playerId = entity()?.id;
          if (playerId) {
            const playerChanges = message.delta.itemChanges.filter((c) => c.targetId === playerId);
            if (playerChanges.length > 0) {
              const gains = playerChanges
                .filter((c) => c.operation === "add")
                .map((c) => ({ name: c.name ?? c.templateId, qty: c.qty }));
              const losses = playerChanges
                .filter((c) => c.operation === "remove")
                .map((c) => ({ name: c.name ?? c.templateId, qty: c.qty }));
              if (gains.length > 0 || losses.length > 0) {
                showItemChangeNotification({ gains, losses });
              }
            }
          }
        }
        if (message.ended) {
          pushEvents([{ type: "system", description: "今天已经结束，等待结算。" }]);
          setSettlementPending(true);
        }
        const req = activeRequest();
        req?.onCommandResult?.(message);
        if (req && !req.onDialogueOptions && !req.onChatOptions && !req.onTradeOptions) {
          completeActiveRequest();
        }
        break;
      }
      case "dialogue_options": {
        const req = activeRequest();
        logWrite(
          "cli",
          "dbg",
          `[DIAG] recv dialogue_options options=${message.options?.length} hasCallback=${!!req?.onDialogueOptions} activeTab=${dialogue()?.activeTab}`,
        );
        if (req?.onDialogueOptions) {
          req.onDialogueOptions(message);
          completeActiveRequest();
        }
        break;
      }
      case "chat_options": {
        const req = activeRequest();
        logWrite(
          "cli",
          "dbg",
          `[DIAG] recv chat_options options=${message.options?.length} hasCallback=${!!req?.onChatOptions} activeTab=${dialogue()?.activeTab}`,
        );
        if (req?.onChatOptions) {
          req.onChatOptions(message);
          completeActiveRequest();
        }
        break;
      }
      case "trade_options": {
        const req = activeRequest();
        logWrite(
          "cli",
          "dbg",
          `[DIAG] recv trade_options options=${message.options?.length} hasCallback=${!!req?.onTradeOptions} activeTab=${dialogue()?.activeTab}`,
        );
        if (req?.onTradeOptions) {
          req.onTradeOptions(message);
          completeActiveRequest();
        }
        break;
      }
      case "daily_report":
        setSettlementPending(false);
        pushEvents([{ type: "daily_report", description: message.report.summary }]);
        if (message.report.travelogue) {
          const existing = travelogue();
          if (!existing.some((e) => e.date === message.report.travelogue?.date)) {
            setTravelogue([...existing, message.report.travelogue]);
          }
        }
        break;
      case "settlement_started":
        setSettlementPending(true);
        break;
      case "travelogue_data": {
        const msg = message as TravelogueDataMessage;
        setTravelogue(msg.entries);
        break;
      }
      case "save_slots": {
        setSavePanel((prev) => {
          const selectedIndex =
            prev.selectedIndex !== null && prev.selectedIndex < message.slots.length
              ? prev.selectedIndex
              : selectDefaultSaveSlot(message.slots);
          return {
            ...prev,
            slots: message.slots,
            selectedIndex,
            loading: false,
          };
        });
        break;
      }
      case "save_result": {
        setSavePanel((prev) => ({
          ...prev,
          loading: false,
          message: message.ok
            ? `已保存到 ${message.slot?.slotId ?? "当前存档"}`
            : (message.error ?? "存档操作失败"),
        }));
        pushEvents([
          {
            type: message.ok ? "system" : "error",
            description: message.ok
              ? `存档已保存：${message.slot?.slotId ?? "当前存档"}`
              : (message.error ?? "存档操作失败"),
          },
        ]);
        break;
      }
      case "status":
        setStatus(message);
        break;
      case "error": {
        pushEvents([{ type: "error", description: message.message }]);
        activeRequest()?.onError?.();
        completeActiveRequest();
        break;
      }
    }
  };

  const connect = () => {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

    setConnectionState("connecting");
    ws = new WebSocket(url);

    ws.addEventListener("open", () => {
      setConnectionState("connected");
      pushEvents([{ type: "system", description: `已连接 ${url}` }]);
    });

    ws.addEventListener("message", (event) => {
      try {
        handleMessage(JSON.parse(String(event.data)) as ServerMessage);
      } catch {
        pushEvents([{ type: "error", description: "收到无法解析的服务器消息。" }]);
      }
    });

    ws.addEventListener("close", () => {
      setConnectionState("disconnected");
      pushEvents([{ type: "system", description: "服务器连接已断开。" }]);
      endCombat();
    });

    ws.addEventListener("error", () => {
      setConnectionState("error");
      pushEvents([{ type: "error", description: "无法连接服务器。" }]);
    });
  };

  const execute = (action: string, params: Record<string, unknown> = {}) => {
    sendRequest({ type: "execute", action, params }, (req) => {
      req.onCommandResult = () => "complete";
    });
  };

  const handleTradeSelection = (option: TradeOption) => {
    const current = dialogue();
    if (!current) return;
    const itemName = (option.meta?.itemName as string) ?? option.label;
    const detail = tradeOptionDetail(option);
    setDialogue({
      ...current,
      tabs: {
        ...current.tabs,
        trade: {
          ...current.tabs.trade,
          selected: { option, detail },
        },
      },
    });
    if (detail) return;
    sendRequest({ type: "execute", action: "look", params: { target: itemName } }, (req) => {
      req.onCommandResult = (msg) => {
        const detail = msg.events
          .map((e) => e.description)
          .filter(Boolean)
          .join("\n");
        setDialogue((prev) =>
          prev?.tabs.trade.selected?.option.id === option.id
            ? {
                ...prev,
                tabs: {
                  ...prev.tabs,
                  trade: {
                    ...prev.tabs.trade,
                    selected: { ...prev.tabs.trade.selected, detail },
                  },
                },
              }
            : prev,
        );
      };
    });
  };

  const clearTradeSelection = () => {
    setDialogue((prev) => {
      if (!prev?.tabs.trade.selected) return prev;
      return {
        ...prev,
        tabs: {
          ...prev.tabs,
          trade: {
            ...prev.tabs.trade,
            selected: undefined,
          },
        },
      };
    });
  };

  const requestDialogueOptions = (npcId: string) => {
    hideDialogue();
    sendRequest({ type: "request_chat_options", npcId }, (req) => {
      req.onChatOptions = (msg) => {
        showDialogue(
          createDialogueState({
            npcId: msg.npcId,
            npcName: msg.npcName,
            chatOptions: msg.options,
            activeTab: "chat",
            availableTabs: ["chat", "trade"],
          }),
        );
      };
    });
  };

  const chooseDialogueOption = (option: DialogueOption) => {
    const current = dialogue();
    if (!current) return;

    const expectOptions = shouldExpectDialogueOptions(option);
    const responseTab = responseTabForOptionType(option.type);

    pushEvents([{ type: "say", description: `你：${option.label}` }]);
    if (shouldKeepPopupOpen(option.type)) {
      const activeState =
        responseTab === current.activeTab ? current : { ...current, activeTab: responseTab };
      const withPlayerEntry = {
        ...activeState,
        tabs: {
          ...activeState.tabs,
          chat: {
            ...activeState.tabs.chat,
            history: appendToHistory(activeState, "player", option.label),
          },
        },
      };
      setDialogue(
        expectOptions ? buildLoadingDialogueState(withPlayerEntry, responseTab) : withPlayerEntry,
      );
    } else {
      hideDialogue();
    }
    sendRequest(
      {
        type: "talk",
        npcId: current.npcId,
        optionId: option.id,
        label: option.label,
        optionType: option.type,
      },
      (req) => buildTalkHandlers(req, expectOptions, responseTab),
    );
  };

  const chooseTradeOption = (option: TradeOption) => {
    const current = dialogue();
    if (!current) return;

    if (option.action === "sell_menu") {
      requestSellOptions(current.npcId);
      return;
    }

    if (!current.tabs.trade.selected) {
      handleTradeSelection(option);
      return;
    }

    if (hasActiveRequest()) return;

    sendTradeAction(current.npcId, option.action as "buy" | "sell", option.meta?.itemId ?? "");
  };

  const sendTradeAction = (npcId: string, action: "buy" | "sell", itemId: string) => {
    sendRequest({ type: "trade", npcId, action, itemId }, (req) => {
      req.onCommandResult = (_msg) => {
        clearTradeSelection();
      };
    });
  };

  const switchDialogueTab = (direction: -1 | 1) => {
    setDialogue((prev) => {
      if (!prev) return prev;
      return computeTabSwitch(prev, direction);
    });
    const dlg = dialogue();
    if (
      dlg?.activeTab === "trade" &&
      dlg.tabs.trade.options.length === 0 &&
      !dlg.tabs.trade.loading
    ) {
      requestTradeOptions(dlg.npcId);
    }
  };

  const requestTradeOptions = (npcId: string) => {
    if (hasActiveRequest()) {
      setPendingDialogueRequest({ npcId, targetTab: "trade" });
      logWrite("cli", "dbg", "[DIAG] requestTradeOptions QUEUED hasActiveRequest=true");
      return;
    }
    setDialogue((prev) => {
      if (!prev || prev.npcId !== npcId) return prev;
      return buildLoadingDialogueState(prev, "trade");
    });
    logWrite("cli", "dbg", `[DIAG] requestTradeOptions npc=${npcId}`);
    sendRequest({ type: "request_trade_options", npcId }, (req) => {
      req.onTradeOptions = (msg) => {
        setDialogue((prev) => {
          if (!prev) return prev;
          return applyTradeOptionsToTab(prev, msg.options, {
            id: msg.npcId,
            name: msg.npcName,
          });
        });
      };
    });
  };

  const requestSellOptions = (npcId: string) => {
    if (hasActiveRequest()) return;
    setDialogue((prev) => {
      if (!prev || prev.npcId !== npcId) return prev;
      return buildLoadingDialogueState(prev, "trade");
    });
    sendRequest({ type: "request_trade_options", npcId }, (req) => {
      req.onTradeOptions = (msg) => {
        setDialogue((prev) => {
          if (!prev) return prev;
          return applyTradeOptionsToTab(prev, msg.options, {
            id: msg.npcId,
            name: msg.npcName,
          });
        });
      };
    });
  };

  return {
    connectionState,
    entity,
    room,
    capabilities,
    events,
    dialogue,
    hasActiveRequest,
    status,
    selectedEntityId,
    selectedQuestIndex,
    setSelectedQuestIndex,
    mapGranularity,
    mapCursor,
    selectedInventoryItemId,
    isLayerActive: (id: string) => hasLayer(id),
    activeLayer: () => activeLayer(),
    layerStack: () => getLayerStack(),
    setSelectedEntityId: (id: string | null) => {
      setSelectedEntityId(id);
      if (id !== null) {
        const targetEntity = room()?.entities?.find((e) => e.id === id);
        const hasTalk = capabilities().some(
          (c) => c.action === "talk" && (c.params?.values ?? []).includes(id),
        );
        if (targetEntity?.type === "npc" && hasTalk) {
          const npcName = targetEntity.name;
          showDialogue(
            createDialogueState({
              npcId: id,
              npcName,
              activeTab: "chat",
              availableTabs: ["chat", "trade"],
              npcDescription: targetEntity.description ?? targetEntity.typeLabel ?? "人物",
              chatLoading: true,
            }),
          );
          sendRequest({ type: "request_chat_options", npcId: id }, (req) => {
            req.onChatOptions = (msg) => {
              setDialogue((prev) =>
                prev
                  ? applyDialogueOptionsToTab(prev, "chat", msg.options, {
                      id: msg.npcId,
                      name: msg.npcName,
                    })
                  : createDialogueState({
                      npcId: msg.npcId,
                      npcName: msg.npcName,
                      chatOptions: msg.options,
                      activeTab: "chat",
                      availableTabs: ["chat", "trade"],
                    }),
              );
            };
          });
        } else {
          pushLayer("entity-selected");
        }
      } else {
        if (hasLayer("entity-selected")) popLayer("entity-selected");
      }
    },
    openInventory: () => {
      setSelectedEntityId(null);
      pushLayer("inventory");
    },
    closeInventory: () => {
      setSelectedInventoryItemId(null);
      popLayer("inventory");
    },
    openQuests: () => {
      setSelectedEntityId(null);
      setSelectedQuestIndex(null);
      pushLayer("quests");
    },
    closeQuests: () => {
      setSelectedQuestIndex(null);
      popLayer("quests");
    },
    openStatus: () => {
      setSelectedEntityId(null);
      pushLayer("status");
    },
    closeStatus: () => {
      popLayer("status");
    },
    toggleStatus: () => {
      if (hasLayer("status")) {
        popLayer("status");
      } else {
        setSelectedEntityId(null);
        pushLayer("status");
      }
    },
    toggleMinimap: () => {
      if (hasLayer("map")) {
        popLayer("map");
      } else {
        setSelectedEntityId(null);
        setSelectedInventoryItemId(null);
        hideDialogue();
        setMapGranularity("region" as MapGranularity);
        setMapCursor({ x: Number.NEGATIVE_INFINITY, y: Number.NEGATIVE_INFINITY });
        pushLayer("map");
      }
    },
    cycleMapGranularity: () => {
      const current = mapGranularity();
      const idx = MAP_GRANULARITIES.indexOf(current);
      setMapGranularity(MAP_GRANULARITIES[(idx + 1) % MAP_GRANULARITIES.length]);
    },
    setMapCursor,
    setSelectedInventoryItemId,
    connect,
    disconnect: () => {
      if (ws) {
        ws.close();
        ws = null;
      }
      setConnectionState("disconnected");
      endCombat();
    },
    execute,
    requestDialogueOptions,
    chooseDialogueOption,
    chooseTradeOption,
    clearTradeSelection,
    closeDialogue: () => hideDialogue(),
    switchDialogueTab,
    requestTradeOptions,
    trackedQuestIds,
    toggleTrackQuest: (templateId: string) => {
      setTrackedQuestIds((prev) => {
        const next = new Set(prev);
        if (next.has(templateId)) next.delete(templateId);
        else next.add(templateId);
        return next;
      });
    },
    isTrackingQuest: (templateId: string) => trackedQuestIds().has(templateId),
    startCombat,
    endCombat,
    questNotification,
    showQuestNotification: (notif: { type: string; title: string }) => {
      setQuestNotification(notif);
      pushLayer("quest-notification");
    },
    dismissQuestNotification: () => {
      setQuestNotification(null);
      popLayer("quest-notification");
    },
    itemChangeNotification,
    showItemChangeNotification,
    dismissItemChangeNotification,
    combatLog,
    combatRound,
    settlementPending,
    groundRestRecovery,
    itemPropertyLabels,
    endDayOptions,
    requestEndDay: () => {
      const currentRoom = room();
      const currentEntity = entity();
      if (!currentRoom || !currentEntity) return;

      const options: RestOption[] = [];

      for (const action of currentRoom.roomActions ?? []) {
        if (action.endsDay && action.restRecovery) {
          options.push({
            type: "room",
            actionId: action.id,
            label: action.label,
            restRecovery: action.restRecovery,
          });
        }
      }

      for (const item of currentEntity.inventory ?? []) {
        if (item.properties.restItem) {
          options.push({
            type: "item",
            itemId: item.id,
            label: `使用${item.name}`,
            restRecovery: Number(item.properties.restRecovery ?? 0),
            durability: item.properties.durability as number | undefined,
          });
        }
      }

      options.push({
        type: "ground",
        label: "原地休息",
        restRecovery: groundRestRecovery(),
      });

      options.sort((a, b) => b.restRecovery - a.restRecovery);

      setEndDayOptions(options);
      pushLayer("confirm-end-day");
    },
    confirmEndDay: (option: RestOption) => {
      setEndDayOptions([]);
      popLayer("confirm-end-day");

      if (option.type === "ground") {
        execute("end_day");
      } else if (option.type === "item") {
        execute("end_day", { context: "item", itemId: option.itemId });
      } else if (option.type === "room" && option.actionId) {
        execute(option.actionId);
      }
    },
    cancelEndDay: () => {
      setEndDayOptions([]);
      popLayer("confirm-end-day");
    },
    travelogue,
    selectedTravelogueIndex,
    setSelectedTravelogueIndex,
    openTravelogue: () => {
      setSelectedEntityId(null);
      setSelectedTravelogueIndex(null);
      send({ type: "request_travelogue" });
      pushLayer("travelogue");
    },
    closeTravelogue: () => {
      setSelectedTravelogueIndex(null);
      popLayer("travelogue");
    },
    saveSlots: () => savePanel().slots,
    selectedSaveSlotIndex: () => savePanel().selectedIndex,
    setSelectedSaveSlotIndex: (index: number | null) => {
      setSavePanel((prev) => ({ ...prev, selectedIndex: index }));
    },
    savePanelLoading: () => savePanel().loading,
    savePanelMessage: () => savePanel().message,
    openSavePanel: () => {
      setSelectedEntityId(null);
      setSelectedInventoryItemId(null);
      hideDialogue();
      pushLayer("save");
      requestSaveSlots();
    },
    closeSavePanel: () => {
      setSavePanel((prev) => ({ ...prev, loading: false }));
      popLayer("save");
    },
    requestSaveSlots,
    manualSave,
    createSaveSlot,
  };
}
