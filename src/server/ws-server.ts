import { WebSocket, WebSocketServer } from "ws";
import { z } from "zod";
import type { EventBus } from "../core/event-bus.ts";
import type {
  ActiveQuest,
  DailyReport,
  EntityId,
  ItemEntity,
  NPCEntity,
  PlayerEntity,
  QuestTemplate,
  RoomId,
  SimulationDelta,
  WorldState,
} from "../core/types.ts";
import { applyDelta, discoverRoom, formatDate, initializePlayer } from "../core/world.ts";
import { deriveCapabilities, getRoomEntitiesInfo } from "../engine/capability-provider.ts";
import { logWrite } from "../shared/log.ts";
import type {
  BookDisplay,
  CrossRegionExit,
  EntityBrief,
  MinimapData,
  MinimapTile,
  QuestInfo,
  SaveSlotInfo,
} from "../shared/protocol.ts";

export function enrichQuests(quests: ActiveQuest[], templates: QuestTemplate[]): QuestInfo[] {
  return quests.map((aq) => {
    const tpl = templates.find((t) => t.id === aq.templateId);
    if (!tpl) {
      return {
        templateId: aq.templateId,
        title: aq.templateId,
        description: "",
        status: aq.status,
        acceptedDay: aq.acceptedDay,
        deadlineDay: aq.deadlineDay,
        objectives: [],
      };
    }
    return {
      templateId: tpl.id,
      title: tpl.title,
      description: tpl.description,
      status: aq.status,
      acceptedDay: aq.acceptedDay,
      deadlineDay: aq.deadlineDay,
      objectives: tpl.objectives.map((obj, i) => ({
        groupId: obj.groupId,
        type: obj.type,
        count: obj.count,
        current: aq.objectiveProgress[i] ?? 0,
        description: obj.description,
        completed: aq.groupCompleted[obj.groupId] ?? false,
      })),
      giverNpcId: tpl.giverNpcId ?? undefined,
      narrative: aq.status === "completed" ? tpl.rewards.narrative : undefined,
    };
  });
}

const BindEntitySchema = z.object({
  type: z.literal("bind_entity"),
  entityId: z.string().min(1),
});

const ExecuteSchema = z.object({
  type: z.literal("execute"),
  action: z.string().optional(),
  params: z.record(z.string(), z.unknown()).optional(),
  text: z.string().optional(),
});

const RequestDialogueOptionsSchema = z.object({
  type: z.literal("request_dialogue_options"),
  npcId: z.string().min(1),
});

const RequestChatOptionsSchema = z.object({
  type: z.literal("request_chat_options"),
  npcId: z.string().min(1),
});

const RequestTradeOptionsSchema = z.object({
  type: z.literal("request_trade_options"),
  npcId: z.string().min(1),
});

const TalkSchema = z.object({
  type: z.literal("talk"),
  npcId: z.string().min(1),
  optionId: z.string().optional(),
  label: z.string().optional(),
  optionType: z.string().optional(),
});

const TradeSchema = z.object({
  type: z.literal("trade"),
  npcId: z.string().min(1),
  action: z.enum(["buy", "sell"]),
  itemId: z.string().min(1),
});

const RequestFollowUpOptionsSchema = z.object({
  type: z.literal("request_follow_up_options"),
  npcId: z.string().min(1),
  context: z.string().trim().min(1),
});

const EncounterResponseSchema = z
  .object({
    type: z.literal("encounter_response"),
  })
  .passthrough();

const RequestTravelogueSchema = z.object({
  type: z.literal("request_travelogue"),
});

const RequestSaveSlotsSchema = z.object({
  type: z.literal("request_save_slots"),
});

const ManualSaveSchema = z.object({
  type: z.literal("manual_save"),
  slotId: z.string().min(1).optional(),
});

const CreateSaveSlotSchema = z.object({
  type: z.literal("create_save_slot"),
  slotId: z.string().min(1),
});

const ClientMessageSchema = z.discriminatedUnion("type", [
  BindEntitySchema,
  ExecuteSchema,
  RequestDialogueOptionsSchema,
  RequestChatOptionsSchema,
  RequestTradeOptionsSchema,
  TalkSchema,
  RequestFollowUpOptionsSchema,
  TradeSchema,
  EncounterResponseSchema,
  RequestTravelogueSchema,
  RequestSaveSlotsSchema,
  ManualSaveSchema,
  CreateSaveSlotSchema,
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;

export interface Session {
  id: string;
  ws: WebSocket;
  playerId?: EntityId;
  controlledEntityId?: EntityId;
  lastPushedTick: number;
}

export interface CommandResult {
  events: Array<{ type: string; description: string }>;
  delta?: SimulationDelta;
  ended: boolean;
  needsDialogueOptions?: { npcId: string; npcName: string };
  dialogueOptions?: import("../shared/protocol.ts").DialogueOption[];
  needsChatOptions?: { npcId: string; npcName: string };
  chatSubOptions?: import("../shared/protocol.ts").DialogueOption[];
  needsTradeOptions?: { npcId: string; npcName: string };
  tradeSubOptions?: import("../shared/protocol.ts").TradeOption[];
  operateOptions?: Array<{ actionId: string; label: string }>;
  bookDisplay?: BookDisplay;
}

interface EntityWithNeeds {
  needs?: Array<{ type: string; value: number }>;
  inventory?: ItemEntity[];
  relations?: Array<{ targetId: string; level: number; label: string }>;
}

export type CommandHandler = (
  playerId: EntityId,
  action: string,
  params: Record<string, unknown>,
) => Promise<CommandResult>;
export type DialogueOptionsHandler = (
  playerId: EntityId,
  npcId: string,
) => Promise<Array<{ id: string; label: string }>>;
export type ChatOptionsHandler = (
  playerId: EntityId,
  npcId: string,
) => Promise<import("../shared/protocol.ts").DialogueOption[]>;
export type TradeOptionsHandler = (
  playerId: EntityId,
  npcId: string,
) => Promise<import("../shared/protocol.ts").TradeOption[]>;
export type FollowUpOptionsHandler = (
  playerId: EntityId,
  npcId: string,
  context: string,
) => Promise<import("../shared/protocol.ts").DialogueOption[]>;
export type SaveSlotsHandler = () => SaveSlotInfo[];
export type ManualSaveHandler = (slotId?: string) => SaveSlotInfo;
export type CreateSaveSlotHandler = (slotId: string) => SaveSlotInfo;

export class GameServer {
  private wss: WebSocketServer;
  private sessions = new Map<string, Session>();
  private world: WorldState;
  private eventBus: EventBus;
  private onCommandExecute?: CommandHandler;
  private onDialogueOptions?: DialogueOptionsHandler;
  private onChatOptions?: ChatOptionsHandler;
  private onFollowUpOptions?: FollowUpOptionsHandler;
  private onTradeOptions?: TradeOptionsHandler;
  private onSaveSlots?: SaveSlotsHandler;
  private onManualSave?: ManualSaveHandler;
  private onCreateSaveSlot?: CreateSaveSlotHandler;
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

  setCommandHandler(handler: CommandHandler): void {
    this.onCommandExecute = handler;
  }

  setDialogueOptionsHandler(handler: DialogueOptionsHandler): void {
    this.onDialogueOptions = handler;
  }

  setChatOptionsHandler(handler: ChatOptionsHandler): void {
    this.onChatOptions = handler;
  }

  setTradeOptionsHandler(handler: TradeOptionsHandler): void {
    this.onTradeOptions = handler;
  }

  setFollowUpOptionsHandler(handler: FollowUpOptionsHandler): void {
    this.onFollowUpOptions = handler;
  }

  setSaveHandlers(handlers: {
    listSlots: SaveSlotsHandler;
    manualSave: ManualSaveHandler;
    createSlot: CreateSaveSlotHandler;
  }): void {
    this.onSaveSlots = handlers.listSlots;
    this.onManualSave = handlers.manualSave;
    this.onCreateSaveSlot = handlers.createSlot;
  }

  getConnectedPlayerIds(): EntityId[] {
    const ids: EntityId[] = [];
    this.pruneClosedSessions();
    for (const session of this.sessions.values()) {
      if (session.playerId) ids.push(session.playerId);
    }
    return ids;
  }

  private pruneClosedSessions(): void {
    for (const [id, session] of this.sessions.entries()) {
      if (
        session.ws.readyState === WebSocket.CLOSED ||
        session.ws.readyState === WebSocket.CLOSING
      ) {
        this.sessions.delete(id);
      }
    }
  }

  private pushState(session: Session): void {
    const entityId = session.controlledEntityId;
    if (!entityId) return;

    const entity = this.world.entities.get(entityId);
    if (!entity) return;
    const room = entity.roomId ? this.world.rooms.get(entity.roomId) : null;
    const player = entity.type === "player" ? (entity as PlayerEntity) : null;

    const rawInventory = (entity as EntityWithNeeds).inventory ?? [];
    const mappedInventory = rawInventory.map((item) => ({
      id: item.id,
      name: item.name,
      type: "item" as const,
      description: item.description,
      templateId: item.templateId,
      properties: item.properties,
    }));

    if (rawInventory.length > 0) {
      logWrite(
        "srv",
        "dbg",
        `pushState ${entityId} type=${entity.type} inventory=[${rawInventory.map((i) => i.id).join(",")}]`,
      );
    }

    const relations = ((entity as EntityWithNeeds).relations ?? []).map((rel) => {
      if (rel.label == null || String(rel.label).includes("undefined")) {
        logWrite(
          "srv",
          "warn",
          `[pushState] bad relation label targetId=${rel.targetId} label=${JSON.stringify(rel.label)}`,
        );
      }
      return {
        targetId: rel.targetId,
        targetName: this.world.entities.get(rel.targetId)?.name ?? rel.targetId,
        level: Math.round(rel.level),
        label: rel.label,
      };
    });

    // 计算房间动作 (基于 room tags + ContentPool.entityActionsByTag)
    const roomActions: Array<{
      id: string;
      label: string;
      endsDay?: boolean;
      restRecovery?: number;
    }> = [];
    if (room?.tags) {
      for (const tag of room.tags) {
        const actionIds = this.world.contentPool.entityActionsByTag[tag] ?? [];
        for (const actionId of actionIds) {
          if (!roomActions.some((a) => a.id === actionId)) {
            const effect = this.world.contentPool.actionEffects.find((a) => a.action === actionId);
            roomActions.push({
              id: actionId,
              label: this.world.contentPool.entityActionLabels[actionId] ?? actionId,
              endsDay: effect?.endsDay ?? undefined,
              restRecovery:
                effect?.endsDay && effect.needDeltas.rest
                  ? Number(effect.needDeltas.rest)
                  : undefined,
            });
          }
        }
      }
    }

    // 地面休息恢复值 (来自 ContentPool end_day actionEffect)
    const groundEffect = this.world.contentPool.actionEffects.find((a) => a.action === "end_day");
    const groundRestRecovery = Number(groundEffect?.needDeltas.rest ?? 20);

    this.send(session, {
      type: "state_update",
      entity: {
        id: entity.id,
        name: entity.name,
        type: entity.type,
        roomId: entity.roomId,
        needs: ((entity as EntityWithNeeds).needs ?? []).map((need) => ({
          type: need.type,
          label: this.world.contentPool.needLabels[need.type] ?? need.type,
          value: Math.round(need.value),
        })),
        traits: "traits" in entity ? entity.traits : [],
        inventory: mappedInventory,
        relations,
        activeQuests:
          "activeQuests" in entity ? this.buildEnrichedQuests(entity as PlayerEntity) : [],
        combatState:
          "combatState" in entity
            ? {
                hp: (entity as NPCEntity | PlayerEntity).combatState.hp,
                maxHp: (entity as NPCEntity | PlayerEntity).combatState.maxHp,
                combatTarget: (entity as NPCEntity | PlayerEntity).combatState.combatTarget,
                isDefending: (entity as NPCEntity | PlayerEntity).combatState.isDefending,
                isIncapacitated: (entity as NPCEntity | PlayerEntity).combatState.isIncapacitated,
              }
            : undefined,
        equipment:
          entity.type === "player"
            ? {
                weapon: (entity as PlayerEntity).equipment.weapon?.name
                  ? { name: (entity as PlayerEntity).equipment.weapon?.name ?? "" }
                  : undefined,
                armor: (entity as PlayerEntity).equipment.armor?.name
                  ? { name: (entity as PlayerEntity).equipment.armor?.name ?? "" }
                  : undefined,
              }
            : undefined,
      },
      room: room
        ? {
            id: room.id,
            name: room.name,
            description: room.description,
            exits: Object.fromEntries(
              Array.from(room.exits.entries())
                .filter(([, exit]) => {
                  if (!exit.hidden) return true;
                  if (!exit.conditions || !player) return false;
                  return exit.conditions.some(
                    (cond) =>
                      cond.type === "clue" &&
                      player.knownClues.some((c) => c.clueId === cond.value),
                  );
                })
                .map(([dir, exit]) => [
                  dir,
                  {
                    to: exit.to,
                    directionLabel: getDirectionLabel(
                      this.world.contentPool.narrativeTemplates.directionNames,
                      dir,
                    ),
                    distance: exit.distance,
                    terrain: exit.terrain,
                    terrainLabel: getTerrainLabel(this.world, exit.terrain),
                    destinationName: player?.knownRooms.includes(exit.to)
                      ? this.world.rooms.get(exit.to)?.name
                      : undefined,
                  },
                ]),
            ),
            entities: getRoomEntitiesInfo(this.world, room.id, entityId),
            minimap: player ? buildMinimap(this.world, player) : undefined,
            roomActions,
          }
        : null,
      capabilities: deriveCapabilities(this.world, entityId),
      itemPropertyLabels: this.world.contentPool.itemPropertyLabels,
      groundRestRecovery,
    });
  }

  private buildEnrichedQuests(player: PlayerEntity): QuestInfo[] {
    return enrichQuests(player.activeQuests, this.world.contentPool.questTemplates);
  }

  private async handleMessage(session: Session, raw: string): Promise<void> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.send(session, { type: "error", code: "invalid_json", message: "Invalid JSON" });
      return;
    }

    const result = ClientMessageSchema.safeParse(parsed);
    if (!result.success) {
      const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      this.send(session, {
        type: "error",
        code: "invalid_message",
        message: `Invalid message: ${issues}`,
      });
      return;
    }

    const msg = result.data;

    switch (msg.type) {
      case "bind_entity": {
        session.controlledEntityId = msg.entityId;
        session.playerId = msg.entityId;
        this.eventBus.registerAOI(msg.entityId, undefined, undefined);
        const entity = this.world.entities.get(msg.entityId);
        if (entity?.type === "player") {
          initializePlayer(this.world, entity as PlayerEntity);
        }
        this.send(session, {
          type: "bound",
          entityId: msg.entityId,
          entityName: entity?.name ?? msg.entityId,
        });
        this.pushState(session);
        break;
      }

      case "execute": {
        if (session.playerId && this.onCommandExecute) {
          const action = msg.action ?? this.legacyParseAction(msg.text ?? "");
          const params = msg.params ?? { raw: msg.text };
          const player = this.world.entities.get(session.playerId);
          const beforeRoomId = player?.roomId;
          const result = await this.onCommandExecute(session.playerId, action, params);
          // 应用 delta 到世界状态
          if (result.delta) {
            applyDelta(this.world, result.delta);
          }
          const afterPlayer = this.world.entities.get(session.playerId);
          if (
            afterPlayer?.type === "player" &&
            afterPlayer.roomId &&
            afterPlayer.roomId !== beforeRoomId
          ) {
            discoverRoom(afterPlayer, afterPlayer.roomId);
          }
          this.send(session, { type: "command_result", ...result });
          logWrite("srv", "ws", `send command_result ${action} events=${result.events.length}`);
          if (result.needsDialogueOptions) {
            await this.handleDialogueOptionsRequest(session, result.needsDialogueOptions.npcId);
          }
          this.pushState(session);
        }
        break;
      }

      case "request_dialogue_options": {
        logWrite("srv", "ws", `recv request_dialogue_options npc=${msg.npcId}`);
        if (session.playerId) {
          await this.handleDialogueOptionsRequest(session, msg.npcId);
          logWrite("srv", "ws", `send dialogue_options npc=${msg.npcId}`);
        }
        break;
      }

      case "request_chat_options": {
        logWrite("srv", "ws", `recv request_chat_options npc=${msg.npcId}`);
        if (session.playerId) {
          await this.handleChatOptionsRequest(session, msg.npcId);
          logWrite("srv", "ws", `send chat_options npc=${msg.npcId}`);
        }
        break;
      }

      case "request_trade_options": {
        logWrite("srv", "ws", `recv request_trade_options npc=${msg.npcId}`);
        if (session.playerId) {
          await this.handleTradeOptionsRequest(session, msg.npcId);
          logWrite("srv", "ws", `send trade_options npc=${msg.npcId}`);
        }
        break;
      }

      case "request_follow_up_options": {
        logWrite(
          "srv",
          "ws",
          `recv request_follow_up_options npc=${msg.npcId} ctx_len=${msg.context.length}`,
        );
        if (session.playerId) {
          await this.handleFollowUpOptionsRequest(session, msg.npcId, msg.context);
        }
        break;
      }

      case "talk": {
        if (session.playerId && this.onCommandExecute) {
          logWrite("srv", "ws", `recv talk npc=${msg.npcId} opt=${msg.optionId ?? "initial"}`);
          const result = await this.onCommandExecute(session.playerId, "talk", {
            npcId: msg.npcId,
            optionId: msg.optionId,
            optionType: msg.optionType,
            optionLabel: msg.label,
          });
          this.send(session, { type: "command_result", ...result });
          if (result.needsChatOptions) {
            if (result.chatSubOptions) {
              const npc = this.world.entities.get(msg.npcId);
              this.send(session, {
                type: "chat_options",
                npcId: msg.npcId,
                npcName: npc?.name ?? "",
                options: result.chatSubOptions,
              });
            } else {
              await this.handleChatOptionsRequest(session, result.needsChatOptions.npcId);
            }
          }
          this.pushState(session);
        }
        break;
      }

      case "trade": {
        if (session.playerId && this.onCommandExecute) {
          logWrite(
            "srv",
            "ws",
            `recv trade npc=${msg.npcId} action=${msg.action} item=${msg.itemId}`,
          );
          const result = await this.onCommandExecute(session.playerId, "trade", {
            npcId: msg.npcId,
            action: msg.action,
            itemId: msg.itemId,
          });
          this.send(session, { type: "command_result", ...result });
          if (result.needsTradeOptions) {
            if (result.tradeSubOptions) {
              const npc = this.world.entities.get(msg.npcId);
              this.send(session, {
                type: "trade_options",
                npcId: msg.npcId,
                npcName: npc?.name ?? "",
                options: result.tradeSubOptions,
              });
            } else {
              await this.handleTradeOptionsRequest(session, result.needsTradeOptions.npcId);
            }
          }
          this.pushState(session);
        }
        break;
      }

      case "encounter_response":
        break;

      case "request_travelogue": {
        if (session.playerId) {
          const playerEntity = this.world.entities.get(session.playerId);
          if (playerEntity?.type === "player") {
            this.send(session, {
              type: "travelogue_data",
              entries: (playerEntity as PlayerEntity).travelogue,
            });
          }
        }
        break;
      }

      case "request_save_slots": {
        if (!this.onSaveSlots) {
          this.send(session, {
            type: "save_result",
            ok: false,
            error: "存档服务不可用",
          });
          break;
        }
        this.send(session, { type: "save_slots", slots: this.onSaveSlots() });
        break;
      }

      case "manual_save": {
        if (!this.onManualSave) {
          this.send(session, {
            type: "save_result",
            ok: false,
            error: "存档服务不可用",
          });
          break;
        }
        try {
          const slot = this.onManualSave(msg.slotId);
          this.send(session, { type: "save_result", ok: true, slot });
          this.send(session, { type: "save_slots", slots: this.onSaveSlots?.() ?? [slot] });
        } catch (err) {
          this.send(session, {
            type: "save_result",
            ok: false,
            error: `保存失败: ${String(err)}`,
          });
        }
        break;
      }

      case "create_save_slot": {
        if (!this.onCreateSaveSlot) {
          this.send(session, {
            type: "save_result",
            ok: false,
            error: "存档服务不可用",
          });
          break;
        }
        try {
          const slot = this.onCreateSaveSlot(msg.slotId);
          this.send(session, { type: "save_result", ok: true, slot });
          this.send(session, { type: "save_slots", slots: this.onSaveSlots?.() ?? [slot] });
        } catch (err) {
          this.send(session, {
            type: "save_result",
            ok: false,
            error: `创建存档失败: ${String(err)}`,
          });
        }
        break;
      }
    }
  }

  private async handleDialogueOptionsRequest(session: Session, npcId: string): Promise<void> {
    if (!this.onDialogueOptions || !session.playerId) return;
    try {
      const options = await this.onDialogueOptions(session.playerId, npcId);
      const npc = this.world.entities.get(npcId);
      this.send(session, {
        type: "dialogue_options",
        npcId,
        npcName: npc?.name ?? npcId,
        options,
      });
    } catch (_err) {
      this.send(session, { type: "error", code: "dialogue_failed", message: "无法生成对话选项" });
    }
  }

  private async handleChatOptionsRequest(session: Session, npcId: string): Promise<void> {
    if (!this.onChatOptions || !session.playerId) return;
    try {
      const options = await this.onChatOptions(session.playerId, npcId);
      const npc = this.world.entities.get(npcId);
      this.send(session, {
        type: "chat_options",
        npcId,
        npcName: npc?.name ?? npcId,
        options,
      });
    } catch (_err) {
      this.send(session, {
        type: "error",
        code: "chat_options_failed",
        message: "无法生成对话选项",
      });
    }
  }

  private async handleTradeOptionsRequest(session: Session, npcId: string): Promise<void> {
    if (!this.onTradeOptions || !session.playerId) return;
    try {
      const options = await this.onTradeOptions(session.playerId, npcId);
      const npc = this.world.entities.get(npcId);
      this.send(session, {
        type: "trade_options",
        npcId,
        npcName: npc?.name ?? npcId,
        options,
      });
    } catch (_err) {
      this.send(session, {
        type: "error",
        code: "trade_options_failed",
        message: "无法生成交易选项",
      });
    }
  }

  private async handleFollowUpOptionsRequest(
    session: Session,
    npcId: string,
    context: string,
  ): Promise<void> {
    if (!this.onFollowUpOptions || !session.playerId) return;
    const npc = this.world.entities.get(npcId);
    if (!npc) {
      this.send(session, {
        type: "error",
        code: "invalid_npc",
        message: "NPC 不存在",
      });
      return;
    }
    try {
      const options = await this.onFollowUpOptions(session.playerId, npcId, context);
      this.send(session, {
        type: "follow_up_options",
        npcId,
        npcName: npc.name,
        context,
        options,
      });
    } catch (_err) {
      this.send(session, {
        type: "error",
        code: "follow_up_options_failed",
        message: "无法生成追问选项",
      });
    }
  }

  private legacyParseAction(text: string): string {
    if (!text) return "wait";
    const t = this.world.contentPool.narrativeTemplates;
    if (t.endingCommands.some((cmd) => text.includes(cmd))) return "end_day";
    if (new RegExp(t.chatPattern).test(text)) return "talk";
    for (const dir of Object.keys(t.directionNames)) {
      if (text.includes(`往${dir}`) || text.includes(`去${dir}`)) return "move";
    }
    if (text.startsWith("找") || text.startsWith("问")) return "talk";
    return "wait";
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
    this.send(session, {
      type: "status",
      llmReachable: this.llmReachable,
      round: this.world.round,
      date: formatDate(this.world.time, { calendar: this.world.contentPool.calendar }),
      entityCount: this.world.entities.size,
      connectedPlayers: this.sessions.size,
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

function buildMinimap(world: WorldState, player: PlayerEntity): MinimapData | undefined {
  if (!world.graph || !player.roomId) return undefined;

  const graph = world.graph;
  const current = graph.nodes.get(player.roomId);
  if (!current) return undefined;

  const { bounds, regionBounds, regionLinks } = graph;
  const { minX, minY, maxX, maxY } = bounds;
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;

  const nodesByCoord = new Map<string, typeof current>();
  for (const node of graph.nodes.values()) {
    nodesByCoord.set(`${node.x},${node.y}`, node);
  }

  const tiles: MinimapTile[] = [];
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const node = nodesByCoord.get(`${x},${y}`);

      if (!node) {
        tiles.push({ x, y, char: " ", known: false, isCurrent: false, hasExit: 0 });
        continue;
      }

      const room = world.rooms.get(node.roomId);
      const known = player.knownRooms.includes(node.roomId);
      const isCurrent = node.roomId === player.roomId;
      const name = room?.name ?? "";

      tiles.push({
        x,
        y,
        char: isCurrent ? "@" : known ? (name[0] ?? "?") : "?",
        roomName: known ? room?.name : undefined,
        known,
        isCurrent,
        hasExit: room
          ? getExitMask(room.exits, world.contentPool.narrativeTemplates.directionNames)
          : 0,
        regionId: node.regionId,
        ...(known && room
          ? {
              description: room.description,
              terrain: room.terrain ?? "plain",
              terrainLabel: getTerrainLabel(world, room.terrain ?? "plain"),
              exitLabels: getExitLabels(
                room.exits,
                world.contentPool.narrativeTemplates.directionNames,
              ),
              entityBriefs: Array.from(room.entities.values())
                .filter((eid) => eid !== player.id)
                .map((eid) => {
                  const ent = world.entities.get(eid);
                  return ent ? { name: ent.name, type: ent.type } : null;
                })
                .filter(Boolean) as EntityBrief[],
              crossRegionExits: Array.from(room.exits.entries())
                .filter(([, exit]) => {
                  const target = world.rooms.get(exit.to);
                  return target && target.regionId !== node.regionId;
                })
                .map(([dir, exit]) => {
                  const target = world.rooms.get(exit.to);
                  const region = target ? world.regions.get(target.regionId) : undefined;
                  return {
                    direction: dir,
                    directionLabel: getDirectionLabel(
                      world.contentPool.narrativeTemplates.directionNames,
                      dir,
                    ),
                    targetRegionName: region?.name ?? target?.regionId ?? "未知",
                  } as CrossRegionExit;
                }),
            }
          : {}),
      });
    }
  }

  // 区域节点：质心坐标，已探索状态
  const playerRegionId = current.regionId;
  const regionNodes = Array.from(regionBounds.entries()).map(([regionId, rb]) => {
    const region = world.regions.get(regionId);
    const explored = Array.from(graph.nodes.values()).some(
      (n) => n.regionId === regionId && player.knownRooms.includes(n.roomId),
    );
    return {
      regionId,
      name: region?.name ?? regionId,
      explored,
      isCurrent: regionId === playerRegionId,
      x: Math.round((rb.minX + rb.maxX) / 2),
      y: Math.round((rb.minY + rb.maxY) / 2),
    };
  });

  const regionLinksMapped = regionLinks.map((rl) => ({
    from: rl.fromRegion,
    to: rl.toRegion,
    direction: rl.direction,
    directionLabel: getDirectionLabel(
      world.contentPool.narrativeTemplates.directionNames,
      rl.direction,
    ),
    distance: rl.distance,
    terrain: rl.terrain,
    terrainLabel: getTerrainLabel(world, rl.terrain),
  }));

  logWrite(
    "srv",
    "dbg",
    `buildMinimap: ${tiles.length} tiles, ${regionNodes.length} regions, playerRegion=${playerRegionId}`,
  );

  return {
    width,
    height,
    minX,
    minY,
    centerX: current.x,
    centerY: current.y,
    tiles,
    playerRegionId,
    regionNodes,
    regionLinks: regionLinksMapped,
  };
}

function getDirectionLabel(directionNames: Record<string, string>, direction: string): string {
  if (direction in directionNames) return direction;
  return Object.entries(directionNames).find(([, value]) => value === direction)?.[0] ?? direction;
}

function getExitLabels(
  exits: Map<string, { to: RoomId }>,
  directionNames: Record<string, string>,
): string[] {
  return Array.from(exits.keys()).map((dir) => getDirectionLabel(directionNames, dir));
}

function getTerrainLabel(world: WorldState, terrain?: string): string | undefined {
  if (!terrain) return undefined;
  return (
    world.contentPool.terrainConfig.find((entry) => entry.terrain === terrain)?.label ?? terrain
  );
}

function getExitMask(
  exits: Map<string, { to: RoomId }>,
  directionNames: Record<string, string>,
): number {
  let mask = 0;
  const dirs = Object.keys(directionNames);
  if (exits.has(dirs[0]) || exits.has(directionNames[dirs[0]])) mask |= 0b0001;
  if (exits.has(dirs[2]) || exits.has(directionNames[dirs[2]])) mask |= 0b0010;
  if (exits.has(dirs[1]) || exits.has(directionNames[dirs[1]])) mask |= 0b0100;
  if (exits.has(dirs[3]) || exits.has(directionNames[dirs[3]])) mask |= 0b1000;
  return mask;
}
