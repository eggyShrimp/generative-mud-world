import { createSignal } from "solid-js";
import type {
  Capability,
  CommandEvent,
  DialogueOption,
  EntityState,
  RoomInfo,
  ServerMessage,
  StatusMessage,
  TravelogueDataMessage,
} from "../shared/protocol.ts";
import {
  activeLayer,
  getLayerStack,
  hasLayer,
  type KeyLayer,
  popLayer,
  pushLayer,
} from "./key-layer.ts";

export interface LogEntry {
  id: number;
  type: string;
  description: string;
}

export interface DialogueState {
  npcId: string;
  npcName: string;
  options: DialogueOption[];
  lastNpcReply?: string;
}

export function shouldKeepPopupOpen(optionType: string): boolean {
  return optionType !== "close";
}

export function buildLoadingDialogueState(current: DialogueState): DialogueState {
  return { npcId: current.npcId, npcName: current.npcName, options: [] };
}

export function extractNpcReply(events: CommandEvent[]): string | undefined {
  const dialogueEvent = events.find((e) => e.type === "dialogue");
  return dialogueEvent?.description;
}

export interface PendingInteraction {
  kind: "dialogue_options" | "dialogue_reply" | "command" | "entity_dialogue_options";
  description: string;
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

export interface GameClient {
  connectionState: () => string;
  entity: () => EntityState | null;
  room: () => RoomInfo | null;
  capabilities: () => Capability[];
  events: () => LogEntry[];
  dialogue: () => DialogueState | null;
  entityDialogueOptions: () => DialogueOption[] | null;
  pending: () => PendingInteraction | null;
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
  closeDialogue: () => void;
  startDialogueDirect: (npcId: string, option: DialogueOption) => void;
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

export function createGameClient(url: string): GameClient {
  const [connectionState, setConnectionState] = createSignal("disconnected");
  const [entity, setEntity] = createSignal<EntityState | null>(null);
  const [room, setRoom] = createSignal<RoomInfo | null>(null);
  const [capabilities, setCapabilities] = createSignal<Capability[]>([]);
  const [events, setEvents] = createSignal<LogEntry[]>([]);
  const [dialogue, setDialogue] = createSignal<DialogueState | null>(null);
  const [entityDialogueOptions, setEntityDialogueOptions] = createSignal<DialogueOption[] | null>(
    null,
  );
  const showDialogue = (state: DialogueState) => {
    setDialogue(state);
    pushLayer("dialogue");
  };
  const hideDialogue = () => {
    setDialogue(null);
    popLayer("dialogue");
  };
  const [pending, setPending] = createSignal<PendingInteraction | null>(null);
  const [status, setStatus] = createSignal<StatusMessage | null>(null);
  const [selectedEntityId, setSelectedEntityId] = createSignal<string | null>(null);
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
    if (!combatTargetId || pending()) return;
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
    const current = pending();
    if (!current) return;
    pushEvents([{ type: "system", description: `${current.description}，请稍候。` }]);
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
      case "command_result":
        if (pending()?.kind === "dialogue_reply") {
          const npcReplyText = extractNpcReply(message.events);
          if (npcReplyText) {
            const dlg = dialogue();
            if (dlg) {
              setDialogue({
                npcId: dlg.npcId,
                npcName: dlg.npcName,
                options: [],
                lastNpcReply: npcReplyText,
              });
            }
          }
        }
        setPending(null);
        pushEvents(message.events);
        if (hasLayer("combat")) {
          pushCombatLog(message.events, combatRound());
        }
        // 检测物品变动 → 弹窗通知
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
        break;
      case "dialogue_options": {
        const wasEntityFetch = pending()?.kind === "entity_dialogue_options";
        setPending(null);
        if (wasEntityFetch) {
          if (message.npcId === selectedEntityId()) {
            setEntityDialogueOptions(message.options);
            pushLayer("entity-selected");
          }
        } else {
          const dlg = dialogue();
          showDialogue({
            npcId: message.npcId,
            npcName: message.npcName,
            options: message.options,
            lastNpcReply: dlg?.lastNpcReply,
          });
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
        const wasEntityFetch = pending()?.kind === "entity_dialogue_options";
        setPending(null);
        pushEvents([{ type: "error", description: message.message }]);
        if (wasEntityFetch) {
          pushLayer("entity-selected");
        }
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
    if (pending()) {
      pushBlockedEvent();
      return;
    }
    if (send({ type: "execute", action, params })) {
      setPending({ kind: "command", description: "正在处理操作" });
    }
  };

  const requestDialogueOptions = (npcId: string) => {
    if (pending()) {
      pushBlockedEvent();
      return;
    }
    hideDialogue();
    if (send({ type: "request_dialogue_options", npcId })) {
      setPending({ kind: "dialogue_options", description: "正在等待对话选项" });
    }
  };

  const chooseDialogueOption = (option: DialogueOption) => {
    if (pending()) {
      pushBlockedEvent();
      return;
    }
    const current = dialogue();
    if (!current) return;
    pushEvents([{ type: "say", description: `你：${option.label}` }]);
    if (
      send({
        type: "talk",
        npcId: current.npcId,
        optionId: option.id,
        label: option.label,
        optionType: option.type,
      })
    ) {
      if (shouldKeepPopupOpen(option.type)) {
        setDialogue(buildLoadingDialogueState(current));
      } else {
        hideDialogue();
      }
      setPending({ kind: "dialogue_reply", description: "正在等待 NPC 回复" });
    }
  };

  const startDialogueDirect = (npcId: string, option: DialogueOption) => {
    if (pending()) {
      pushBlockedEvent();
      return;
    }
    pushEvents([{ type: "say", description: `你：${option.label}` }]);
    if (
      send({
        type: "talk",
        npcId,
        optionId: option.id,
        label: option.label,
        optionType: option.type,
      })
    ) {
      setPending({ kind: "dialogue_reply", description: "正在等待 NPC 回复" });
    }
  };

  return {
    connectionState,
    entity,
    room,
    capabilities,
    events,
    dialogue,
    entityDialogueOptions,
    pending,
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
          if (send({ type: "request_dialogue_options", npcId: id })) {
            setPending({ kind: "entity_dialogue_options", description: "正在加载对话选项" });
          } else {
            pushLayer("entity-selected");
          }
        } else {
          pushLayer("entity-selected");
        }
      } else {
        if (hasLayer("entity-selected")) popLayer("entity-selected");
        setEntityDialogueOptions(null);
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
    closeDialogue: () => hideDialogue(),
    startDialogueDirect,
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

      // 1. 房间操作：过滤 roomActions 中 endsDay === true 的
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

      // 2. 背包物品：过滤 restItem 属性
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

      // 3. 原地休息：始终可用
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
