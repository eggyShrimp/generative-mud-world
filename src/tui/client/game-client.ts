import { createSignal } from "solid-js";
import { logWrite } from "../../shared/log.ts";
import type {
  BookDisplay,
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
import { activeLayer, getLayerStack, hasLayer, popLayer, pushLayer } from "../key-layer/index.ts";
import {
  appendToHistory,
  applyDialogueOptionsToTab,
  applyFollowUpOptions,
  applyNpcReply,
  applyTradeOptionsToTab,
  buildFollowUpLoadingState,
  buildLoadingDialogueState,
  clearFollowUpContext,
  computeTabSwitch,
  createDialogueState,
  extractNpcReply,
  getDialogueOptionBehavior,
  hasVisibleQuestNegotiation,
  responseTabForOptionType,
  shouldRunPendingDialogueRequest,
  tradeOptionDetail,
} from "./dialogue-state.ts";
import type {
  ActiveRequest,
  BookReaderState,
  CombatLogEntry,
  DialogueState,
  DialogueTab,
  GameClient,
  LogEntry,
  MapCursor,
  MapGranularity,
  RestOption,
  SavePanelState,
  TravelogueEntry,
} from "./types.ts";
import { MAP_GRANULARITIES } from "./types.ts";

export * from "./dialogue-state.ts";
export * from "./types.ts";

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

  // 追问：临时选中文本槽位 + 待处理元数据
  let followUpSelectionStash: string | null = null;
  let pendingFollowUp: {
    npcId: string;
    context: string;
    previousChatOptions: DialogueOption[];
  } | null = null;

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
  const stashFollowUpSelection = (text: string) => {
    followUpSelectionStash = text;
  };

  const popFollowUpSelection = (): string | null => {
    const text = followUpSelectionStash;
    followUpSelectionStash = null;
    return text;
  };

  const showFollowUpSelectionRequired = () => {
    pushEvents([{ type: "system", description: "请先选中一句 NPC 的话。" }]);
  };

  const sendDialogueCleanupIfNeeded = (current: DialogueState | null) => {
    if (!current || hasActiveRequest() || !hasVisibleQuestNegotiation(current)) return;
    send({
      type: "talk",
      npcId: current.npcId,
      optionId: "chat:goodbye",
      label: "告别",
      optionType: "close",
    });
  };

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
  const [bookReader, setBookReader] = createSignal<BookReaderState | null>(null);
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

  const openBookReader = (book: BookDisplay) => {
    setBookReader({ title: book.title, pages: book.pages, pageIndex: 0, scrollTop: 0 });
    pushLayer("book-reader");
  };

  const closeBookReader = () => {
    setBookReader(null);
    popLayer("book-reader");
  };

  const nextBookPage = () => {
    setBookReader((prev) =>
      prev
        ? { ...prev, pageIndex: Math.min(prev.pages.length - 1, prev.pageIndex + 1), scrollTop: 0 }
        : prev,
    );
  };

  const prevBookPage = () => {
    setBookReader((prev) =>
      prev ? { ...prev, pageIndex: Math.max(0, prev.pageIndex - 1), scrollTop: 0 } : prev,
    );
  };

  const scrollBookReader = (delta: number) => {
    setBookReader((prev) =>
      prev ? { ...prev, scrollTop: Math.max(0, prev.scrollTop + delta) } : prev,
    );
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
        logWrite("cli", "dbg", `[DIAG] state_update recv, caps=${message.capabilities?.length}`);
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
        if (message.bookDisplay) {
          openBookReader(message.bookDisplay);
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
      case "follow_up_options": {
        const req = activeRequest();
        if (req?.onFollowUpOptions) {
          req.onFollowUpOptions(message);
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
      pushEvents([{ type: "system", description: `连接建立 ${url}` }]);
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

    const behavior = getDialogueOptionBehavior(option);
    const expectOptions = behavior.kind === "continue" && behavior.expects === "chat_options";
    const responseTab = responseTabForOptionType(option.type);

    pushEvents([{ type: "say", description: `你：${option.label}` }]);
    if (behavior.kind === "close") {
      hideDialogue();
    } else {
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

  const selectEntity = (id: string | null) => {
    setSelectedEntityId(id);
    if (id !== null) {
      pushLayer("entity-selected");
    } else {
      if (hasLayer("entity-selected")) popLayer("entity-selected");
    }
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
    setSelectedEntityId: selectEntity,
    interactWithEntity: (id: string) => {
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
        selectEntity(id);
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
    closeDialogue: () => {
      const current = dialogue();
      sendDialogueCleanupIfNeeded(current);
      hideDialogue();
    },
    switchDialogueTab,
    requestTradeOptions,
    stashFollowUpSelection,
    popFollowUpSelection,
    requestFollowUpOptions: (context: string) => {
      const current = dialogue();
      if (!current) return;

      const trimmedContext = context.trim();
      if (!trimmedContext) {
        showFollowUpSelectionRequired();
        return;
      }

      if (hasActiveRequest()) {
        pushEvents([{ type: "system", description: "正在处理操作，请稍候。" }]);
        return;
      }

      const nextPendingFollowUp = {
        npcId: current.npcId,
        context: trimmedContext,
        previousChatOptions: [...current.tabs.chat.options],
      };

      const restoreFollowUpOptions = () => {
        const pending = pendingFollowUp ?? nextPendingFollowUp;
        setDialogue((prev) => {
          if (!prev) return prev;
          return {
            ...clearFollowUpContext(prev),
            tabs: {
              ...prev.tabs,
              chat: {
                ...prev.tabs.chat,
                options: pending.previousChatOptions,
                loading: false,
              },
            },
          };
        });
        pendingFollowUp = null;
      };

      const sent = sendRequest(
        { type: "request_follow_up_options", npcId: current.npcId, context: trimmedContext },
        (req) => {
          pendingFollowUp = nextPendingFollowUp;
          setDialogue((prev) => {
            if (!prev) return prev;
            return buildFollowUpLoadingState(prev);
          });
          req.onError = restoreFollowUpOptions;
          req.onFollowUpOptions = (msg) => {
            const dlg = dialogue();
            if (!dlg || dlg.npcId !== msg.npcId || pendingFollowUp?.context !== msg.context) {
              pendingFollowUp = null;
              completeActiveRequest();
              return;
            }

            if (msg.options.length === 0) {
              restoreFollowUpOptions();
              pushEvents([{ type: "system", description: "没有合适的追问方向。" }]);
              completeActiveRequest();
              return;
            }

            setDialogue((prev) => {
              if (!prev) return prev;
              return applyFollowUpOptions(prev, msg.options, msg.context);
            });
            pendingFollowUp = null;
            completeActiveRequest();
          };
        },
      );
      if (!sent) {
        restoreFollowUpOptions();
      }
    },
    showFollowUpSelectionRequired,
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
    bookReader,
    openBookReader,
    closeBookReader,
    nextBookPage,
    prevBookPage,
    scrollBookReader,
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
