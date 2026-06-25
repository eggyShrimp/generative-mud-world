import type { Setter } from "solid-js";
import { createSignal } from "solid-js";
import type {
  BookDisplay,
  Capability,
  EntityState,
  RoomInfo,
  StatusMessage,
} from "../../shared/protocol.ts";
import { hasLayer, popLayer, pushLayer } from "../key-layer/index.ts";
import type {
  ActiveRequest,
  BookReaderState,
  CombatLogEntry,
  DialogueState,
  DialogueTab,
  LogEntry,
  MapCursor,
  MapGranularity,
  RestOption,
  SavePanelState,
  TravelogueEntry,
} from "./types.ts";

export interface Signals {
  connectionState: () => string;
  setConnectionState: Setter<string>;
  entity: () => EntityState | null;
  setEntity: Setter<EntityState | null>;
  room: () => RoomInfo | null;
  setRoom: Setter<RoomInfo | null>;
  capabilities: () => Capability[];
  setCapabilities: Setter<Capability[]>;
  events: () => LogEntry[];
  setEvents: Setter<LogEntry[]>;
  dialogue: () => DialogueState | null;
  setDialogue: Setter<DialogueState | null>;
  activeRequest: () => ActiveRequest | null;
  setActiveRequest: Setter<ActiveRequest | null>;
  pendingDialogueRequest: () => { npcId: string; targetTab: DialogueTab } | null;
  setPendingDialogueRequest: Setter<{ npcId: string; targetTab: DialogueTab } | null>;
  status: () => StatusMessage | null;
  setStatus: Setter<StatusMessage | null>;
  selectedEntityId: () => string | null;
  setSelectedEntityId: Setter<string | null>;
  selectedQuestIndex: () => number | null;
  setSelectedQuestIndex: Setter<number | null>;
  mapGranularity: () => MapGranularity;
  setMapGranularity: Setter<MapGranularity>;
  mapCursor: () => MapCursor;
  setMapCursor: Setter<MapCursor>;
  selectedInventoryItemId: () => string | null;
  setSelectedInventoryItemId: Setter<string | null>;
  trackedQuestIds: () => Set<string>;
  setTrackedQuestIds: Setter<Set<string>>;
  questNotification: () => { type: string; title: string } | null;
  setQuestNotification: Setter<{ type: string; title: string } | null>;
  itemChangeNotification: () => {
    gains: Array<{ name: string; qty: number }>;
    losses: Array<{ name: string; qty: number }>;
  } | null;
  setItemChangeNotification: Setter<{
    gains: Array<{ name: string; qty: number }>;
    losses: Array<{ name: string; qty: number }>;
  } | null>;
  combatLog: () => CombatLogEntry[];
  setCombatLog: Setter<CombatLogEntry[]>;
  combatRound: () => number;
  setCombatRound: Setter<number>;
  settlementPending: () => boolean;
  setSettlementPending: Setter<boolean>;
  groundRestRecovery: () => number;
  setGroundRestRecovery: Setter<number>;
  itemPropertyLabels: () => Record<string, string>;
  setItemPropertyLabels: Setter<Record<string, string>>;
  endDayOptions: () => RestOption[];
  setEndDayOptions: Setter<RestOption[]>;
  travelogue: () => TravelogueEntry[];
  setTravelogue: Setter<TravelogueEntry[]>;
  selectedTravelogueIndex: () => number | null;
  setSelectedTravelogueIndex: Setter<number | null>;
  bookReader: () => BookReaderState | null;
  setBookReader: Setter<BookReaderState | null>;
  savePanel: () => SavePanelState;
  setSavePanel: Setter<SavePanelState>;
  hasActiveRequest: () => boolean;
  showDialogue: (state: DialogueState) => void;
  hideDialogue: () => void;
  showItemChangeNotification: (data: {
    gains: Array<{ name: string; qty: number }>;
    losses: Array<{ name: string; qty: number }>;
  }) => void;
  dismissItemChangeNotification: () => void;
  showQuestNotification: (notif: { type: string; title: string }) => void;
  dismissQuestNotification: () => void;
  openBookReader: (book: BookDisplay) => void;
  closeBookReader: () => void;
  nextBookPage: () => void;
  prevBookPage: () => void;
  scrollBookReader: (delta: number) => void;
  toggleTrackQuest: (templateId: string) => void;
  isTrackingQuest: (templateId: string) => boolean;
  selectEntity: (id: string | null) => void;
}

export function createSignals(): Signals {
  const [connectionState, setConnectionState] = createSignal("disconnected");
  const [entity, setEntity] = createSignal<EntityState | null>(null);
  const [room, setRoom] = createSignal<RoomInfo | null>(null);
  const [capabilities, setCapabilities] = createSignal<Capability[]>([]);
  const [events, setEvents] = createSignal<LogEntry[]>([]);
  const [dialogue, setDialogue] = createSignal<DialogueState | null>(null);
  const [activeRequest, setActiveRequest] = createSignal<ActiveRequest | null>(null);
  const [pendingDialogueRequest, setPendingDialogueRequest] = createSignal<{
    npcId: string;
    targetTab: DialogueTab;
  } | null>(null);
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

  const hasActiveRequest = (): boolean => activeRequest() !== null;

  const showDialogue = (state: DialogueState) => {
    setDialogue(state);
    pushLayer("dialogue");
  };

  const hideDialogue = () => {
    setDialogue(null);
    setSelectedEntityId(null);
    popLayer("dialogue");
  };

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

  const showQuestNotification = (notif: { type: string; title: string }) => {
    setQuestNotification(notif);
    pushLayer("quest-notification");
  };

  const dismissQuestNotification = () => {
    setQuestNotification(null);
    popLayer("quest-notification");
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

  const isTrackingQuest = (templateId: string): boolean => trackedQuestIds().has(templateId);

  const toggleTrackQuest = (templateId: string) => {
    setTrackedQuestIds((prev) => {
      const next = new Set(prev);
      if (next.has(templateId)) next.delete(templateId);
      else next.add(templateId);
      return next;
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
    setConnectionState,
    entity,
    setEntity,
    room,
    setRoom,
    capabilities,
    setCapabilities,
    events,
    setEvents,
    dialogue,
    setDialogue,
    activeRequest,
    setActiveRequest,
    pendingDialogueRequest,
    setPendingDialogueRequest,
    status,
    setStatus,
    selectedEntityId,
    setSelectedEntityId,
    selectedQuestIndex,
    setSelectedQuestIndex,
    mapGranularity,
    setMapGranularity,
    mapCursor,
    setMapCursor,
    selectedInventoryItemId,
    setSelectedInventoryItemId,
    trackedQuestIds,
    setTrackedQuestIds,
    questNotification,
    setQuestNotification,
    itemChangeNotification,
    setItemChangeNotification,
    combatLog,
    setCombatLog,
    combatRound,
    setCombatRound,
    settlementPending,
    setSettlementPending,
    groundRestRecovery,
    setGroundRestRecovery,
    itemPropertyLabels,
    setItemPropertyLabels,
    endDayOptions,
    setEndDayOptions,
    travelogue,
    setTravelogue,
    selectedTravelogueIndex,
    setSelectedTravelogueIndex,
    bookReader,
    setBookReader,
    savePanel,
    setSavePanel,
    hasActiveRequest,
    showDialogue,
    hideDialogue,
    showItemChangeNotification,
    dismissItemChangeNotification,
    showQuestNotification,
    dismissQuestNotification,
    openBookReader,
    closeBookReader,
    nextBookPage,
    prevBookPage,
    scrollBookReader,
    toggleTrackQuest,
    isTrackingQuest,
    selectEntity,
  };
}
