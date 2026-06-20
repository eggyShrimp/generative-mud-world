import type { Accessor, Setter } from "solid-js";
import type {
  BookDisplay,
  CommandEvent,
  EntityState,
  RoomInfo,
  SaveSlotInfo,
  ServerMessage,
  StatusMessage,
  TravelogueDataMessage,
} from "../../shared/protocol.ts";
import type { ActiveRequest, SavePanelState, TravelogueEntry } from "./game-client.ts";

export interface MessageHandlerDeps {
  entity: Accessor<EntityState | null>;
  room: Accessor<RoomInfo | null>;
  combatRound: Accessor<number>;
  activeRequest: Accessor<ActiveRequest | null>;
  travelogue: Accessor<TravelogueEntry[]>;
  setEntity: Setter<EntityState | null>;
  setRoom: Setter<RoomInfo | null>;
  setCapabilities: Setter<import("../../shared/protocol.ts").Capability[]>;
  setItemPropertyLabels: Setter<Record<string, string>>;
  setGroundRestRecovery: Setter<number>;
  setSettlementPending: Setter<boolean>;
  setStatus: Setter<StatusMessage | null>;
  setTravelogue: Setter<TravelogueEntry[]>;
  setSavePanel: Setter<SavePanelState>;
  pushEvents: (events: CommandEvent[]) => void;
  pushCombatLog: (events: CommandEvent[], round: number) => void;
  hasLayer: (id: string) => boolean;
  checkCombatEnd: () => void;
  ensureCombatTimer: () => void;
  completeActiveRequest: () => void;
  showItemChangeNotification: (data: {
    gains: Array<{ name: string; qty: number }>;
    losses: Array<{ name: string; qty: number }>;
  }) => void;
  openBookReader: (book: BookDisplay) => void;
  selectDefaultSaveSlot: (slots: SaveSlotInfo[]) => number | null;
}

export function handleMessage(message: ServerMessage, deps: MessageHandlerDeps): void {
  switch (message.type) {
    case "init":
      deps.pushEvents([{ type: "system", description: `已进入世界：${message.boundEntityName}` }]);
      break;
    case "bound":
      deps.pushEvents([{ type: "system", description: `当前角色：${message.entityName}` }]);
      break;
    case "state_update":
      deps.setEntity(message.entity);
      deps.setRoom(message.room);
      deps.setCapabilities(message.capabilities);
      deps.setItemPropertyLabels(message.itemPropertyLabels ?? {});
      deps.setGroundRestRecovery(message.groundRestRecovery);
      if (deps.hasLayer("combat")) {
        deps.checkCombatEnd();
        if (deps.hasLayer("combat")) {
          deps.ensureCombatTimer();
        }
      }
      break;
    case "command_result": {
      deps.pushEvents(message.events);
      if (deps.hasLayer("combat")) {
        deps.pushCombatLog(message.events, deps.combatRound());
      }
      if (message.delta?.itemChanges?.length) {
        const playerId = deps.entity()?.id;
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
              deps.showItemChangeNotification({ gains, losses });
            }
          }
        }
      }
      if (message.bookDisplay) {
        deps.openBookReader(message.bookDisplay);
      }
      if (message.ended) {
        deps.pushEvents([{ type: "system", description: "今天已经结束，等待结算。" }]);
        deps.setSettlementPending(true);
      }
      const req = deps.activeRequest();
      req?.onCommandResult?.(message);
      if (req && !req.onDialogueOptions && !req.onChatOptions && !req.onTradeOptions) {
        deps.completeActiveRequest();
      }
      break;
    }
    case "dialogue_options": {
      const req = deps.activeRequest();
      if (req?.onDialogueOptions) {
        req.onDialogueOptions(message);
        deps.completeActiveRequest();
      }
      break;
    }
    case "chat_options": {
      const req = deps.activeRequest();
      if (req?.onChatOptions) {
        req.onChatOptions(message);
        deps.completeActiveRequest();
      }
      break;
    }
    case "trade_options": {
      const req = deps.activeRequest();
      if (req?.onTradeOptions) {
        req.onTradeOptions(message);
        deps.completeActiveRequest();
      }
      break;
    }
    case "follow_up_options": {
      const req = deps.activeRequest();
      if (req?.onFollowUpOptions) {
        req.onFollowUpOptions(message);
      }
      break;
    }
    case "daily_report":
      deps.setSettlementPending(false);
      deps.pushEvents([{ type: "daily_report", description: message.report.summary }]);
      if (message.report.travelogue) {
        const existing = deps.travelogue();
        if (!existing.some((e) => e.date === message.report.travelogue?.date)) {
          deps.setTravelogue([...existing, message.report.travelogue]);
        }
      }
      break;
    case "settlement_started":
      deps.setSettlementPending(true);
      break;
    case "travelogue_data": {
      const msg = message as TravelogueDataMessage;
      deps.setTravelogue(msg.entries);
      break;
    }
    case "save_slots": {
      deps.setSavePanel((prev) => {
        const selectedIndex =
          prev.selectedIndex !== null && prev.selectedIndex < message.slots.length
            ? prev.selectedIndex
            : deps.selectDefaultSaveSlot(message.slots);
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
      deps.setSavePanel((prev) => ({
        ...prev,
        loading: false,
        message: message.ok
          ? `已保存到 ${message.slot?.slotId ?? "当前存档"}`
          : (message.error ?? "存档操作失败"),
      }));
      deps.pushEvents([
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
      deps.setStatus(message);
      break;
    case "error": {
      deps.pushEvents([{ type: "error", description: message.message }]);
      deps.activeRequest()?.onError?.();
      deps.completeActiveRequest();
      break;
    }
  }
}
