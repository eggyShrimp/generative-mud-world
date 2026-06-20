import type {
  BookDisplay,
  Capability,
  DialogueOption,
  EntityState,
  RoomInfo,
  SaveSlotInfo,
  ServerMessage,
  StatusMessage,
  TradeOption,
} from "../../shared/protocol.ts";
import type { KeyLayer } from "../key-layer/types.ts";

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
  followUpContext?: string;
  tabs: {
    chat: ChatTab;
    trade: TradeTab;
  };
}

export interface ActiveRequest {
  onCommandResult?: (msg: ServerMessage & { type: "command_result" }) => void;
  onDialogueOptions?: (msg: ServerMessage & { type: "dialogue_options" }) => void;
  onChatOptions?: (msg: ServerMessage & { type: "chat_options" }) => void;
  onFollowUpOptions?: (msg: ServerMessage & { type: "follow_up_options" }) => void;
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
  locationNames: string[];
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

export interface BookReaderState {
  title: string;
  pages: string[];
  pageIndex: number;
  scrollTop: number;
}

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
  interactWithEntity: (id: string) => void;
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
  selectInventoryItem: (id: string) => void;
  clearInventorySelection: () => void;
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
  stashFollowUpSelection: (text: string) => void;
  popFollowUpSelection: () => string | null;
  requestFollowUpOptions: (context: string) => void;
  showFollowUpSelectionRequired: () => void;
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
  bookReader: () => BookReaderState | null;
  openBookReader: (book: BookDisplay) => void;
  closeBookReader: () => void;
  nextBookPage: () => void;
  prevBookPage: () => void;
  scrollBookReader: (delta: number) => void;
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
