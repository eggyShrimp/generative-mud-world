import type {
  BookDisplay,
  CommandEvent,
  SaveSlotInfo,
  ServerMessage,
} from "../../shared/protocol.ts";
import { handleMessage } from "./message-handler.ts";
import type { Signals } from "./signals.ts";

export interface Transport {
  pushEvents: (next: CommandEvent[]) => void;
  pushBlockedEvent: () => void;
  send: (data: unknown) => boolean;
  connect: (ctx: ConnectDeps) => void;
  disconnect: (ctx: DisconnectDeps) => void;
}

export interface ConnectDeps {
  combat: {
    pushCombatLog: (events: CommandEvent[], round: number) => void;
    checkCombatEnd: () => void;
    ensureCombatTimer: () => void;
    endCombat: () => void;
  };
  saveSystem: { selectDefaultSaveSlot: (slots: SaveSlotInfo[]) => number | null };
  completeActiveRequest: () => void;
  hasLayer: (id: string) => boolean;
}

export interface DisconnectDeps {
  combat: { endCombat: () => void };
}

export function createTransport(url: string, sig: Signals): Transport {
  let ws: WebSocket | null = null;
  let eventId = 0;

  const pushEvents = (next: CommandEvent[]) => {
    if (next.length === 0) return;
    sig.setEvents((prev) =>
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

  const pushBlockedEvent = () => {
    if (!sig.hasActiveRequest()) return;
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

  const connect = (ctx: ConnectDeps) => {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

    sig.setConnectionState("connecting");
    ws = new WebSocket(url);

    ws.addEventListener("open", () => {
      sig.setConnectionState("connected");
      pushEvents([{ type: "system", description: `连接建立 ${url}` }]);
    });

    ws.addEventListener("message", (event) => {
      try {
        handleMessage(JSON.parse(String(event.data)) as ServerMessage, {
          entity: sig.entity,
          room: sig.room,
          combatRound: sig.combatRound,
          activeRequest: sig.activeRequest,
          travelogue: sig.travelogue,
          setEntity: sig.setEntity,
          setRoom: sig.setRoom,
          setCapabilities: sig.setCapabilities,
          setItemPropertyLabels: sig.setItemPropertyLabels,
          setGroundRestRecovery: sig.setGroundRestRecovery,
          setSettlementPending: sig.setSettlementPending,
          setStatus: sig.setStatus,
          setTravelogue: sig.setTravelogue,
          setSavePanel: sig.setSavePanel,
          pushEvents,
          pushCombatLog: ctx.combat.pushCombatLog,
          hasLayer: ctx.hasLayer,
          checkCombatEnd: ctx.combat.checkCombatEnd,
          ensureCombatTimer: ctx.combat.ensureCombatTimer,
          completeActiveRequest: ctx.completeActiveRequest,
          showItemChangeNotification: sig.showItemChangeNotification,
          openBookReader: (book: BookDisplay) => sig.openBookReader(book),
          selectDefaultSaveSlot: ctx.saveSystem.selectDefaultSaveSlot,
        });
      } catch {
        pushEvents([{ type: "error", description: "收到无法解析的服务器消息。" }]);
      }
    });

    ws.addEventListener("close", () => {
      sig.setConnectionState("disconnected");
      pushEvents([{ type: "system", description: "服务器连接已断开。" }]);
      ctx.combat.endCombat();
    });

    ws.addEventListener("error", () => {
      sig.setConnectionState("error");
      pushEvents([{ type: "error", description: "无法连接服务器。" }]);
    });
  };

  const disconnect = (ctx: DisconnectDeps) => {
    if (ws) {
      ws.close();
      ws = null;
    }
    sig.setConnectionState("disconnected");
    ctx.combat.endCombat();
  };

  return { pushEvents, pushBlockedEvent, send, connect, disconnect };
}
