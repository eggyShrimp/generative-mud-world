import { createSignal } from "solid-js";
import { logWrite } from "../../shared/log.ts";
import type {
  Capability,
  CommandEvent,
  DialogueOption,
  EntityState,
  RoomInfo,
  ServerMessage,
  StatusMessage,
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

export interface DialogueState {
  npcId: string;
  npcName: string;
  options: DialogueOption[];
  history: DialogueHistoryEntry[];
  activeTab: DialogueTab;
  availableTabs: DialogueTab[];
  savedTabOptions: Record<string, DialogueOption[]>;
  npcDescription?: string;
  tradeSelection?: { option: DialogueOption; detail?: string; fullOptions: DialogueOption[] };
}

export function shouldKeepPopupOpen(optionType: string): boolean {
  return optionType !== "close";
}

export function buildLoadingDialogueState(current: DialogueState): DialogueState {
  return {
    npcId: current.npcId,
    npcName: current.npcName,
    options: [],
    history: current.history,
    activeTab: current.activeTab,
    availableTabs: current.availableTabs,
    savedTabOptions: current.savedTabOptions,
    npcDescription: current.npcDescription,
    tradeSelection: current.tradeSelection,
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
  return [...state.history, { speaker, content }];
}

export function computeContentHeight(bodyHeight: number, interactionHeight: number): number {
  return Math.max(1, bodyHeight - interactionHeight);
}

export function computeTabSwitch(state: DialogueState, direction: -1 | 1): DialogueState {
  const saved = { ...state.savedTabOptions, [state.activeTab]: state.options };
  const tabs = state.availableTabs;
  const idx = tabs.indexOf(state.activeTab);
  const nextIdx = (idx + direction + tabs.length) % tabs.length;
  const nextTab = tabs[nextIdx];
  return {
    ...state,
    activeTab: nextTab,
    options: saved[nextTab] ?? [],
    savedTabOptions: saved,
  };
}

export function applyNpcReply(state: DialogueState, npcReplyText: string): DialogueState {
  return {
    ...state,
    history: [...state.history, { speaker: "npc" as const, content: npcReplyText }],
  };
}

export function applyDialogueOptionsToTab(
  state: DialogueState,
  tab: DialogueTab,
  options: DialogueOption[],
  npc: { id: string; name: string },
): DialogueState {
  const savedTabOptions = { ...state.savedTabOptions };
  if (state.activeTab !== tab) {
    savedTabOptions[tab] = options;
  }

  return {
    ...state,
    npcId: npc.id,
    npcName: npc.name,
    options: state.activeTab === tab ? options : state.options,
    savedTabOptions,
  };
}

export function responseTabForOptionType(optionType: string): DialogueTab {
  return optionType.startsWith("trade_") ? "trade" : "chat";
}

export interface ActiveRequest {
  onCommandResult?: (msg: ServerMessage & { type: "command_result" }) => void;
  onDialogueOptions?: (msg: ServerMessage & { type: "dialogue_options" }) => void;
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
  clearTradeSelection: () => void;
  closeDialogue: () => void;
  switchDialogueTab: (direction: -1 | 1) => void;
  requestTrade: (npcId: string) => void;
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
  endDayOptions: () => RestOption[];
  requestEndDay: () => void;
  confirmEndDay: (option: RestOption) => void;
  cancelEndDay: () => void;
  travelogue: () => TravelogueEntry[];
  selectedTravelogueIndex: () => number | null;
  setSelectedTravelogueIndex: (index: number | null) => void;
  openTravelogue: () => void;
  closeTravelogue: () => void;
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

  const [pendingTradeNpcId, setPendingTradeNpcId] = createSignal<string | null>(null);

  const completeActiveRequest = (): void => {
    setActiveRequest(null);
    const npcId = pendingTradeNpcId();
    if (!npcId) return;
    setPendingTradeNpcId(null);
    queueMicrotask(() => requestTrade(npcId));
  };

  const buildTalkHandlers = (
    req: ActiveRequest,
    expectOptions: boolean,
    responseTab: DialogueTab,
  ): void => {
    req.onCommandResult = (msg) => {
      const npcReplyText = extractNpcReply(msg.events);
      if (npcReplyText) {
        setDialogue((prev) => {
          if (!prev) return prev;
          return applyNpcReply(prev, npcReplyText);
        });
      }
    };
    if (expectOptions) {
      req.onDialogueOptions = (msg) => {
        logWrite(
          "cli",
          "dbg",
          `[DIAG] onDialogueOptions msg.options=${msg.options?.length} prev?=${!!dialogue()}`,
        );
        setDialogue((prev) => {
          if (!prev) {
            return {
              npcId: msg.npcId,
              npcName: msg.npcName,
              options: msg.options,
              history: [],
              activeTab: responseTab,
              availableTabs: ["chat", "trade"] as DialogueTab[],
              savedTabOptions: {},
            };
          }
          return applyDialogueOptionsToTab(prev, responseTab, msg.options, {
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
  const [endDayOptions, setEndDayOptions] = createSignal<RestOption[]>([]);
  const [travelogue, setTravelogue] = createSignal<TravelogueEntry[]>([]);
  const [selectedTravelogueIndex, setSelectedTravelogueIndex] = createSignal<number | null>(null);

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
        if (req && !req.onDialogueOptions) {
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
          logWrite(
            "cli",
            "dbg",
            `[DIAG] onDialogueOptions done options=${dialogue()?.options?.length}`,
          );
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

  const handleTradeSelection = (option: DialogueOption) => {
    const current = dialogue();
    if (!current) return;
    const itemName = (option.meta?.itemName as string) ?? option.label;
    setDialogue({
      ...current,
      tradeSelection: { option, fullOptions: current.options },
      options: [{ id: option.id, label: "购买", type: "trade_select" as const }],
    });
    sendRequest({ type: "execute", action: "look", params: { target: itemName } }, (req) => {
      req.onCommandResult = (msg) => {
        const detail = msg.events
          .map((e) => e.description)
          .filter(Boolean)
          .join("\n");
        setDialogue((prev) =>
          prev?.tradeSelection
            ? { ...prev, tradeSelection: { ...prev.tradeSelection, detail } }
            : prev,
        );
      };
    });
  };

  const clearTradeSelection = () => {
    setDialogue((prev) => {
      if (!prev?.tradeSelection) return prev;
      return {
        ...prev,
        tradeSelection: undefined,
        options: prev.tradeSelection.fullOptions,
      };
    });
  };

  const requestDialogueOptions = (npcId: string) => {
    hideDialogue();
    sendRequest({ type: "request_dialogue_options", npcId }, (req) => {
      req.onDialogueOptions = (msg) => {
        showDialogue({
          npcId: msg.npcId,
          npcName: msg.npcName,
          options: msg.options,
          history: [],
          activeTab: "chat",
          availableTabs: ["chat", "trade"],
          savedTabOptions: {},
        });
      };
    });
  };

  const chooseDialogueOption = (option: DialogueOption) => {
    const current = dialogue();
    if (!current) return;

    if (
      current.activeTab === "trade" &&
      option.type === "trade_select" &&
      !current.tradeSelection
    ) {
      handleTradeSelection(option);
      return;
    }

    if (current.activeTab === "trade" && option.type === "trade_select" && current.tradeSelection) {
      if (hasActiveRequest()) return;
      clearTradeSelection();
      handleTradeSelection(option);
      return;
    }

    pushEvents([{ type: "say", description: `你：${option.label}` }]);
    const responseTab = responseTabForOptionType(option.type);
    if (shouldKeepPopupOpen(option.type)) {
      const activeState =
        responseTab === current.activeTab
          ? current
          : {
              ...current,
              activeTab: responseTab,
              options: current.savedTabOptions[responseTab] ?? [],
              savedTabOptions: {
                ...current.savedTabOptions,
                [current.activeTab]: current.options,
              },
            };
      const withPlayerEntry = {
        ...activeState,
        history: appendToHistory(activeState, "player", option.label),
        tradeSelection: undefined,
      };
      setDialogue(buildLoadingDialogueState(withPlayerEntry));
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
      (req) => buildTalkHandlers(req, shouldKeepPopupOpen(option.type), responseTab),
    );
  };

  const switchDialogueTab = (direction: -1 | 1) => {
    setDialogue((prev) => {
      if (!prev) return prev;
      return computeTabSwitch(prev, direction);
    });
    setTimeout(() => {
      const dlg = dialogue();
      if (dlg?.activeTab === "trade" && (dlg.savedTabOptions.trade?.length ?? 0) === 0) {
        requestTrade(dlg.npcId);
      }
    }, 50);
  };

  const requestTrade = (npcId: string) => {
    if (hasActiveRequest()) {
      setPendingTradeNpcId(npcId);
      logWrite("cli", "dbg", "[DIAG] requestTrade QUEUED hasActiveRequest=true");
      return;
    }
    logWrite("cli", "dbg", `[DIAG] requestTrade npc=${npcId}`);
    sendRequest(
      {
        type: "talk",
        npcId,
        optionId: "menu:trade",
        optionType: "trade_menu",
        label: "交易",
      },
      (req) => buildTalkHandlers(req, true, "trade"),
    );
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
          showDialogue({
            npcId: id,
            npcName,
            options: [],
            history: [],
            activeTab: "chat",
            availableTabs: ["chat", "trade"],
            savedTabOptions: {},
            npcDescription: targetEntity.typeLabel ?? "人物",
          });
          sendRequest(
            {
              type: "talk",
              npcId: id,
              optionId: "menu:chat",
              optionType: "idle_chat",
              label: "闲聊",
            },
            (req) => buildTalkHandlers(req, true, "chat"),
          );
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
    clearTradeSelection,
    closeDialogue: () => hideDialogue(),
    switchDialogueTab,
    requestTrade,
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
  };
}
