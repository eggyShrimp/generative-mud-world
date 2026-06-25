import { WebSocket, WebSocketServer } from "ws";
import type { EventBus } from "../core/event-bus.ts";
import type { DailyReport, EntityId, PlayerEntity, WorldState } from "../core/types.ts";
import { formatDate, initializePlayer } from "../core/world.ts";
import { logWrite } from "../shared/log.ts";
import {
  handleChatOptionsRequest,
  handleDialogueOptionsRequest,
  handleMessage,
  handleTradeOptionsRequest,
  type MessageHandlerDeps,
} from "./ws/message-handler.ts";
import { getConnectedPlayerIds, pruneClosedSessions, type Session } from "./ws/session-manager.ts";
import { pushState } from "./ws/state-pusher.ts";

export { type ClientMessage, ClientMessageSchema } from "./ws/message-schemas.ts";
export { enrichQuests } from "./ws/quest-utils.ts";
export type { Session } from "./ws/session-manager.ts";
export type {
  ChatOptionsHandler,
  CommandHandler,
  CommandResult,
  CreateSaveSlotHandler,
  DialogueOptionsHandler,
  FollowUpOptionsHandler,
  ManualSaveHandler,
  SaveSlotsHandler,
  TradeOptionsHandler,
} from "./ws/types.ts";

export class GameServer {
  private wss: WebSocketServer;
  private sessions = new Map<string, Session>();
  private world: WorldState;
  private eventBus: EventBus;
  private onCommandExecute?: import("./ws/types.ts").CommandHandler;
  private onDialogueOptions?: import("./ws/types.ts").DialogueOptionsHandler;
  private onChatOptions?: import("./ws/types.ts").ChatOptionsHandler;
  private onFollowUpOptions?: import("./ws/types.ts").FollowUpOptionsHandler;
  private onTradeOptions?: import("./ws/types.ts").TradeOptionsHandler;
  private onSaveSlots?: import("./ws/types.ts").SaveSlotsHandler;
  private onManualSave?: import("./ws/types.ts").ManualSaveHandler;
  private onCreateSaveSlot?: import("./ws/types.ts").CreateSaveSlotHandler;
  private llmReachable = false;

  constructor(port: number, world: WorldState, eventBus: EventBus) {
    this.world = world;
    this.eventBus = eventBus;
    this.wss = new WebSocketServer({ port });

    this.wss.on("connection", (ws) => {
      const session: Session = { id: crypto.randomUUID(), ws, lastPushedTick: 0 };
      this.sessions.set(session.id, session);
      this.pruneClosedSessions();

      const claimedIds = new Set(
        Array.from(this.sessions.values())
          .filter((s) => s.id !== session.id && s.ws.readyState === WebSocket.OPEN)
          .map((s) => s.controlledEntityId)
          .filter(Boolean),
      );
      const availableEntities = Array.from(world.entities.values())
        .filter((e) => e.type === "player" && !claimedIds.has(e.id))
        .map((e) => ({ id: e.id, name: e.name, type: e.type }));

      const playerEntities = Array.from(world.entities.values())
        .filter((e) => e.type === "player")
        .map((e) => ({ id: e.id, name: e.name, type: e.type }));
      const autoEntity =
        availableEntities[0] ?? (playerEntities.length === 1 ? playerEntities[0] : undefined);
      if (autoEntity) {
        session.controlledEntityId = autoEntity.id;
        session.playerId = autoEntity.id;
        this.eventBus.registerAOI(autoEntity.id, undefined, undefined);
        const player = this.world.entities.get(autoEntity.id);
        if (player?.type === "player") {
          initializePlayer(this.world, player as PlayerEntity);
        }
      }

      this.send(session, {
        type: "init",
        boundEntityId: autoEntity?.id ?? null,
        boundEntityName:
          autoEntity?.name ?? this.world.contentPool.narrativeTemplates.spectatorFallbackName,
        availableEntities,
      });
      if (autoEntity) this.pushState(session);
      this.sendStatus(session);

      logWrite(
        "srv",
        "info",
        `Player connected: ${session.id.slice(0, 8)} → ${autoEntity?.name ?? this.world.contentPool.narrativeTemplates.spectatorFallbackName}`,
      );

      ws.on("message", (data) => this.handleMessage(session, data.toString()));
      ws.on("close", () => {
        this.sessions.delete(session.id);
        logWrite("srv", "info", `Player disconnected: ${session.id.slice(0, 8)}`);
      });
    });

    logWrite("srv", "info", `WebSocket server running on ws://localhost:${port}`);
  }

  close(): void {
    this.wss.close();
  }

  setCommandHandler(handler: import("./ws/types.ts").CommandHandler): void {
    this.onCommandExecute = handler;
  }

  setDialogueOptionsHandler(handler: import("./ws/types.ts").DialogueOptionsHandler): void {
    this.onDialogueOptions = handler;
  }

  setChatOptionsHandler(handler: import("./ws/types.ts").ChatOptionsHandler): void {
    this.onChatOptions = handler;
  }

  setTradeOptionsHandler(handler: import("./ws/types.ts").TradeOptionsHandler): void {
    this.onTradeOptions = handler;
  }

  setFollowUpOptionsHandler(handler: import("./ws/types.ts").FollowUpOptionsHandler): void {
    this.onFollowUpOptions = handler;
  }

  setSaveHandlers(handlers: {
    listSlots: import("./ws/types.ts").SaveSlotsHandler;
    manualSave: import("./ws/types.ts").ManualSaveHandler;
    createSlot: import("./ws/types.ts").CreateSaveSlotHandler;
  }): void {
    this.onSaveSlots = handlers.listSlots;
    this.onManualSave = handlers.manualSave;
    this.onCreateSaveSlot = handlers.createSlot;
  }

  getConnectedPlayerIds(): EntityId[] {
    return getConnectedPlayerIds(this.sessions);
  }

  private pruneClosedSessions(): void {
    pruneClosedSessions(this.sessions);
  }

  private getMessageDeps(): MessageHandlerDeps {
    return {
      world: this.world,
      eventBus: this.eventBus,
      onCommandExecute: this.onCommandExecute,
      onDialogueOptions: this.onDialogueOptions,
      onChatOptions: this.onChatOptions,
      onTradeOptions: this.onTradeOptions,
      onFollowUpOptions: this.onFollowUpOptions,
      onSaveSlots: this.onSaveSlots,
      onManualSave: this.onManualSave,
      onCreateSaveSlot: this.onCreateSaveSlot,
      send: this.send.bind(this),
      pushState: this.pushState.bind(this),
      handleDialogueOptionsRequest: this.handleDialogueOptionsRequest.bind(this),
      handleChatOptionsRequest: this.handleChatOptionsRequest.bind(this),
      handleTradeOptionsRequest: this.handleTradeOptionsRequest.bind(this),
    };
  }

  private pushState(session: Session): void {
    pushState(this.world, session, this.send.bind(this));
  }

  private async handleMessage(session: Session, raw: string): Promise<void> {
    await handleMessage(this.getMessageDeps(), session, raw);
  }

  private async handleDialogueOptionsRequest(session: Session, npcId: string): Promise<void> {
    await handleDialogueOptionsRequest(this.getMessageDeps(), session, npcId);
  }

  private async handleChatOptionsRequest(session: Session, npcId: string): Promise<void> {
    await handleChatOptionsRequest(this.getMessageDeps(), session, npcId);
  }

  private async handleTradeOptionsRequest(session: Session, npcId: string): Promise<void> {
    await handleTradeOptionsRequest(this.getMessageDeps(), session, npcId);
  }

  broadcastStatus(llmReachable: boolean): void {
    this.llmReachable = llmReachable;
    for (const session of this.sessions.values()) {
      this.sendStatus(session);
    }
  }

  broadcastSettlementStarted(): void {
    for (const session of this.sessions.values()) {
      this.send(session, { type: "settlement_started" });
    }
  }

  private sendStatus(session: Session): void {
    const w = this.world;
    const periodDef = w.contentPool.dayNightConfig.periods.find((p) => p.id === w.time.period);
    const seasonDef = w.contentPool.seasonConfig.seasons.find((s) => s.id === w.time.season);

    let weatherLabel = "";
    if (session.playerId) {
      const player = w.entities.get(session.playerId);
      if (player && "roomId" in player && player.roomId) {
        const room = w.rooms.get(player.roomId);
        if (room) {
          const weather = w.weatherByRegion.get(room.regionId);
          if (weather) weatherLabel = weather.label;
        }
      }
    }
    if (!weatherLabel) {
      const firstWeather = w.weatherByRegion.values().next().value;
      if (firstWeather) weatherLabel = firstWeather.label;
    }

    this.send(session, {
      type: "status",
      llmReachable: this.llmReachable,
      round: w.round,
      date: formatDate(w.time, { calendar: w.contentPool.calendar }),
      entityCount: w.entities.size,
      connectedPlayers: this.sessions.size,
      period: periodDef?.label ?? w.time.period,
      season: seasonDef?.label ?? w.time.season,
      weatherLabel,
    });
  }

  broadcastReport(reports: Map<EntityId, DailyReport>): void {
    for (const [playerId, report] of reports) {
      for (const session of this.sessions.values()) {
        if (session.playerId === playerId) {
          this.pushState(session);
          this.send(session, { type: "daily_report", report });
        }
      }
    }
  }

  pushEncounter(playerId: EntityId, encounter: unknown): void {
    for (const session of this.sessions.values()) {
      if (session.playerId === playerId) {
        this.send(session, { type: "encounter", encounter });
      }
    }
  }

  private send(session: Session, data: unknown): void {
    if (session.ws.readyState === WebSocket.OPEN) {
      session.ws.send(JSON.stringify(data));
    }
  }
}
