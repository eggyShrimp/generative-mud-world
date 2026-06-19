/**
 * WebSocket 协议类型定义
 *
 * 所有 Client ↔ Server 消息的类型。
 * server 和 client-tui 共同依赖此文件。
 */

import type { EntityId, RoomId, SimulationDelta } from "../core/types.ts";

// ============================================================
// 基础类型
// ============================================================

export interface EntityOption {
  id: EntityId;
  name: string;
  type: string;
}

export interface QuestObjectiveInfo {
  groupId: number;
  type: string;
  count: number;
  current: number;
  description: string;
  completed: boolean;
}

export interface QuestInfo {
  templateId: string;
  title: string;
  description: string;
  status: "active" | "completed" | "failed";
  acceptedDay: number;
  deadlineDay: number | null;
  objectives: QuestObjectiveInfo[];
  giverNpcId?: string;
  narrative?: string;
}

export interface EntityState {
  id: EntityId;
  name: string;
  type: string;
  roomId: RoomId | null;
  needs: Array<{ type: string; label: string; value: number }>;
  traits?: Array<{ name: string; value: number }>;
  inventory?: InventoryItem[];
  relations?: Array<{ targetId: string; targetName: string; level: number; label: string }>;
  activeQuests?: QuestInfo[];
  equipment?: EntityEquipment;
  combatState?: EntityCombatState;
}

export interface EntityEquipment {
  weapon?: { name: string };
  armor?: { name: string };
  cloak?: { name: string };
  accessory?: { name: string };
}

export interface EntityCombatState {
  hp: number;
  maxHp: number;
  combatTarget?: string;
  isDefending: boolean;
  isIncapacitated: boolean;
}

export interface InventoryItem {
  id: EntityId;
  name: string;
  type: "item";
  description: string;
  templateId: string;
  properties: Record<string, unknown>;
}

export interface RoomEntity {
  id: EntityId;
  name: string;
  type: string;
  description?: string;
  typeLabel?: string;
  interactable?: boolean;
  takeable?: boolean;
  combatState?: EntityCombatState;
  properties?: Record<string, unknown>;
}

export interface RoomInfo {
  id: RoomId;
  name: string;
  description: string;
  exits: Record<
    string,
    {
      to: RoomId;
      directionLabel: string;
      distance: number;
      terrain?: string;
      terrainLabel?: string;
      hidden?: boolean;
      destinationName?: string;
    }
  >;
  entities: RoomEntity[];
  minimap?: MinimapData;
  roomActions?: Array<{ id: string; label: string; endsDay?: boolean; restRecovery?: number }>;
}

export interface EntityBrief {
  name: string;
  type: string;
}

export interface CrossRegionExit {
  direction: string;
  directionLabel: string;
  targetRegionName: string;
}

export interface MinimapTile {
  x: number;
  y: number;
  char: string;
  roomName?: string;
  known: boolean;
  isCurrent: boolean;
  hasExit: number;
  regionId?: string;
  description?: string;
  terrain?: string;
  terrainLabel?: string;
  exitLabels?: string[];
  entityBriefs?: EntityBrief[];
  crossRegionExits?: CrossRegionExit[];
}

export interface RegionMapNode {
  regionId: string;
  name: string;
  explored: boolean;
  isCurrent: boolean;
  x: number;
  y: number;
}

export interface RegionMapLink {
  from: string;
  to: string;
  direction: string;
  directionLabel: string;
  distance: number;
  terrain: string;
  terrainLabel?: string;
}

export interface MinimapData {
  width: number;
  height: number;
  minX: number;
  minY: number;
  centerX: number;
  centerY: number;
  tiles: MinimapTile[];
  playerRegionId: string;
  regionNodes: RegionMapNode[];
  regionLinks: RegionMapLink[];
}

export interface Capability {
  action: string;
  label: string;
  params?: {
    type: "direction" | "npc_select" | "item_select" | "optional_target";
    values: string[];
  };
}

/**
 * 服务端 talk 路由的 key。决定点击选项后引擎走哪个处理分支。
 *
 * 客户端不应根据 type 值推断 UI 行为 —— 弹窗行为由 {@link DialogueOption.behavior} 决定。
 */
export type DialogueOptionType =
  | "quest_trigger_menu"
  | "quest_trigger_select"
  | "quest_defer"
  | "quest_deliver_menu"
  | "quest_deliver_select"
  | "quest_talk_menu"
  | "functional_menu"
  | "functional_select"
  | "idle_chat"
  | "close";

/**
 * 客户端弹窗行为指令，由选项生成方（DialogueGenerator）在服务端设定。
 * 与 {@link DialogueOptionType} 解耦：同一个 close behavior 可以对多种 type 生效。
 */
export type DialogueOptionBehavior =
  /** 弹窗保持，等待服务端返回新 chat_options 后替换当前选项 */
  | { kind: "continue"; expects: "chat_options" }
  /** 选后立即关闭弹窗，不等待返回 */
  | { kind: "close" }
  /** 弹窗保持，不期待新选项（用于纯状态变更、无对话回复的场景） */
  | { kind: "stay"; expects?: "none" };

export interface DialogueOption {
  id: string;
  label: string;
  /** 服务端路由 key，决定 talk 请求走哪个处理分支 */
  type: DialogueOptionType;
  /**
   * 客户端弹窗行为指令。由服务端 DialogueGenerator 在生成选项时设定。
   * 与 `type` 解耦：TUI 根据此字段决定弹窗关/留/等待，不根据 `type` 推断。
   * 新生成的选项必须包含此字段。
   */
  behavior?: DialogueOptionBehavior;
  tag?: string;
  meta?: Record<string, unknown>;
  expectedEffects?: {
    relationDelta?: number;
    needDelta?: Record<string, number>;
    risk?: string;
  };
}

export interface TradeOption {
  id: string;
  label: string;
  action: "buy" | "sell" | "sell_menu";
  meta?: {
    itemId?: string;
    itemName?: string;
    itemDescription?: string;
    itemPropertiesText?: string;
    price?: number;
    currencyName?: string;
  };
}

export interface CommandEvent {
  type: string;
  description: string;
}

export interface BookDisplay {
  title: string;
  pages: string[];
}

export interface SaveSlotInfo {
  slotId: string;
  worldId: string;
  savedAt: number;
  gameTick: number;
  round: number;
  version: number;
  isCurrent: boolean;
  summaryCount: number;
  valid: boolean;
}

// ============================================================
// Client → Server 消息
// ============================================================

export interface BindEntityMessage {
  type: "bind_entity";
  entityId: EntityId;
}

export interface ExecuteMessage {
  type: "execute";
  action: string;
  params: Record<string, unknown>;
}

export interface RequestDialogueOptionsMessage {
  type: "request_dialogue_options";
  npcId: EntityId;
}

export interface RequestChatOptionsMessage {
  type: "request_chat_options";
  npcId: EntityId;
}

export interface RequestTradeOptionsMessage {
  type: "request_trade_options";
  npcId: EntityId;
}

export interface TalkMessage {
  type: "talk";
  npcId: EntityId;
  optionId: string;
  label?: string;
  optionType?: DialogueOptionType;
}

export interface RequestFollowUpOptionsMessage {
  type: "request_follow_up_options";
  npcId: EntityId;
  context: string;
}

export interface TradeMessage {
  type: "trade";
  npcId: EntityId;
  action: "buy" | "sell";
  itemId: string;
}

export interface RequestTravelogueMessage {
  type: "request_travelogue";
}

export interface RequestSaveSlotsMessage {
  type: "request_save_slots";
}

export interface ManualSaveMessage {
  type: "manual_save";
  slotId?: string;
}

export interface CreateSaveSlotMessage {
  type: "create_save_slot";
  slotId: string;
}

export type ClientMessage =
  | BindEntityMessage
  | ExecuteMessage
  | RequestDialogueOptionsMessage
  | RequestChatOptionsMessage
  | RequestTradeOptionsMessage
  | TalkMessage
  | RequestFollowUpOptionsMessage
  | TradeMessage
  | RequestTravelogueMessage
  | RequestSaveSlotsMessage
  | ManualSaveMessage
  | CreateSaveSlotMessage;

// ============================================================
// Server → Client 消息
// ============================================================

export interface InitMessage {
  type: "init";
  boundEntityId: EntityId | null;
  boundEntityName: string;
  availableEntities: EntityOption[];
}

export interface BoundMessage {
  type: "bound";
  entityId: EntityId;
  entityName: string;
}

export interface StateUpdateMessage {
  type: "state_update";
  entity: EntityState;
  room: RoomInfo | null;
  capabilities: Capability[];
  itemPropertyLabels: Record<string, string>;
  groundRestRecovery: number;
}

export interface CommandResultMessage {
  type: "command_result";
  events: CommandEvent[];
  delta?: SimulationDelta;
  ended: boolean;
  bookDisplay?: BookDisplay;
}

export interface DialogueOptionsMessage {
  type: "dialogue_options";
  npcId: EntityId;
  npcName: string;
  options: DialogueOption[];
}

export interface ChatOptionsMessage {
  type: "chat_options";
  npcId: EntityId;
  npcName: string;
  options: DialogueOption[];
}

export interface TradeOptionsMessage {
  type: "trade_options";
  npcId: EntityId;
  npcName: string;
  options: TradeOption[];
}

export interface FollowUpOptionsMessage {
  type: "follow_up_options";
  npcId: EntityId;
  npcName: string;
  context: string;
  options: DialogueOption[];
}

export interface DailyReportMessage {
  type: "daily_report";
  report: {
    playerId: EntityId;
    round: number;
    date: string;
    summary: string;
    statusChanges: Array<{ needType: string; delta: number }>;
    encounters: Array<{ id: string; type: string; npcName: string; trigger: string }>;
    worldNews: string[];
    availableLocations: string[];
    travelogue?: {
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
    };
  };
}

export interface SettlementStartedMessage {
  type: "settlement_started";
}

export interface StatusMessage {
  type: "status";
  llmReachable: boolean;
  round: number;
  date: string;
  entityCount: number;
  connectedPlayers: number;
  period: string;
  season: string;
  weatherLabel: string;
}

export interface ErrorMessage {
  type: "error";
  code: string;
  message: string;
  suggestion?: string;
}

export interface TravelogueDataMessage {
  type: "travelogue_data";
  entries: Array<{
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
  }>;
}

export interface SaveSlotsMessage {
  type: "save_slots";
  slots: SaveSlotInfo[];
}

export interface SaveResultMessage {
  type: "save_result";
  ok: boolean;
  slot?: SaveSlotInfo;
  error?: string;
}

export type ServerMessage =
  | InitMessage
  | BoundMessage
  | StateUpdateMessage
  | CommandResultMessage
  | DialogueOptionsMessage
  | ChatOptionsMessage
  | TradeOptionsMessage
  | FollowUpOptionsMessage
  | DailyReportMessage
  | SettlementStartedMessage
  | StatusMessage
  | ErrorMessage
  | TravelogueDataMessage
  | SaveSlotsMessage
  | SaveResultMessage;

// ============================================================
// 联合类型
// ============================================================

export type WsMessage = ClientMessage | ServerMessage;
