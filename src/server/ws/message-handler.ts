import type { EventBus } from "../../core/event-bus.ts";
import type { PlayerEntity, WorldState } from "../../core/types.ts";
import { applyDelta, discoverRoom, initializePlayer } from "../../core/world.ts";
import { logWrite } from "../../shared/log.ts";
import { ClientMessageSchema } from "./message-schemas.ts";
import type { Session } from "./session-manager.ts";
import type {
  ChatOptionsHandler,
  CommandHandler,
  CreateSaveSlotHandler,
  DialogueOptionsHandler,
  FollowUpOptionsHandler,
  ManualSaveHandler,
  SaveSlotsHandler,
  TradeOptionsHandler,
} from "./types.ts";

export interface MessageHandlerDeps {
  world: WorldState;
  eventBus: EventBus;
  onCommandExecute?: CommandHandler;
  onDialogueOptions?: DialogueOptionsHandler;
  onChatOptions?: ChatOptionsHandler;
  onTradeOptions?: TradeOptionsHandler;
  onFollowUpOptions?: FollowUpOptionsHandler;
  onSaveSlots?: SaveSlotsHandler;
  onManualSave?: ManualSaveHandler;
  onCreateSaveSlot?: CreateSaveSlotHandler;
  send: (session: Session, data: unknown) => void;
  pushState: (session: Session) => void;
  handleDialogueOptionsRequest: (session: Session, npcId: string) => Promise<void>;
  handleChatOptionsRequest: (session: Session, npcId: string) => Promise<void>;
  handleTradeOptionsRequest: (session: Session, npcId: string) => Promise<void>;
}

export async function handleMessage(
  deps: MessageHandlerDeps,
  session: Session,
  raw: string,
): Promise<void> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    deps.send(session, { type: "error", code: "invalid_json", message: "Invalid JSON" });
    return;
  }

  const result = ClientMessageSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    deps.send(session, {
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
      deps.eventBus.registerAOI(msg.entityId, undefined, undefined);
      const entity = deps.world.entities.get(msg.entityId);
      if (entity?.type === "player") {
        initializePlayer(deps.world, entity as PlayerEntity);
      }
      deps.send(session, {
        type: "bound",
        entityId: msg.entityId,
        entityName: entity?.name ?? msg.entityId,
      });
      deps.pushState(session);
      break;
    }

    case "execute": {
      if (session.playerId && deps.onCommandExecute) {
        const action = msg.action ?? legacyParseAction(deps.world, msg.text ?? "");
        const params = msg.params ?? { raw: msg.text };
        const player = deps.world.entities.get(session.playerId);
        const beforeRoomId = player?.roomId;
        const result = await deps.onCommandExecute(session.playerId, action, params);
        if (result.delta) {
          applyDelta(deps.world, result.delta);
        }
        const afterPlayer = deps.world.entities.get(session.playerId);
        if (
          afterPlayer?.type === "player" &&
          afterPlayer.roomId &&
          afterPlayer.roomId !== beforeRoomId
        ) {
          discoverRoom(afterPlayer, afterPlayer.roomId);
        }
        deps.send(session, { type: "command_result", ...result });
        logWrite("srv", "ws", `send command_result ${action} events=${result.events.length}`);
        if (result.needsDialogueOptions) {
          await deps.handleDialogueOptionsRequest(session, result.needsDialogueOptions.npcId);
        }
        deps.pushState(session);
      }
      break;
    }

    case "request_dialogue_options": {
      logWrite("srv", "ws", `recv request_dialogue_options npc=${msg.npcId}`);
      if (session.playerId) {
        await deps.handleDialogueOptionsRequest(session, msg.npcId);
        logWrite("srv", "ws", `send dialogue_options npc=${msg.npcId}`);
      }
      break;
    }

    case "request_chat_options": {
      logWrite("srv", "ws", `recv request_chat_options npc=${msg.npcId}`);
      if (session.playerId) {
        await deps.handleChatOptionsRequest(session, msg.npcId);
        logWrite("srv", "ws", `send chat_options npc=${msg.npcId}`);
      }
      break;
    }

    case "request_trade_options": {
      logWrite("srv", "ws", `recv request_trade_options npc=${msg.npcId}`);
      if (session.playerId) {
        await deps.handleTradeOptionsRequest(session, msg.npcId);
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
        await handleFollowUpOptionsRequest(deps, session, msg.npcId, msg.context);
      }
      break;
    }

    case "talk": {
      if (session.playerId && deps.onCommandExecute) {
        logWrite("srv", "ws", `recv talk npc=${msg.npcId} opt=${msg.optionId ?? "initial"}`);
        const result = await deps.onCommandExecute(session.playerId, "talk", {
          npcId: msg.npcId,
          optionId: msg.optionId,
          optionType: msg.optionType,
          optionLabel: msg.label,
        });
        deps.send(session, { type: "command_result", ...result });
        if (result.needsChatOptions) {
          if (result.chatSubOptions) {
            const npc = deps.world.entities.get(msg.npcId);
            deps.send(session, {
              type: "chat_options",
              npcId: msg.npcId,
              npcName: npc?.name ?? "",
              options: result.chatSubOptions,
            });
          } else {
            await deps.handleChatOptionsRequest(session, result.needsChatOptions.npcId);
          }
        }
        deps.pushState(session);
      }
      break;
    }

    case "trade": {
      if (session.playerId && deps.onCommandExecute) {
        logWrite(
          "srv",
          "ws",
          `recv trade npc=${msg.npcId} action=${msg.action} item=${msg.itemId}`,
        );
        const result = await deps.onCommandExecute(session.playerId, "trade", {
          npcId: msg.npcId,
          action: msg.action,
          itemId: msg.itemId,
        });
        deps.send(session, { type: "command_result", ...result });
        if (result.needsTradeOptions) {
          if (result.tradeSubOptions) {
            const npc = deps.world.entities.get(msg.npcId);
            deps.send(session, {
              type: "trade_options",
              npcId: msg.npcId,
              npcName: npc?.name ?? "",
              options: result.tradeSubOptions,
            });
          } else {
            await deps.handleTradeOptionsRequest(session, result.needsTradeOptions.npcId);
          }
        }
        deps.pushState(session);
      }
      break;
    }

    case "encounter_response":
      break;

    case "request_travelogue": {
      if (session.playerId) {
        const playerEntity = deps.world.entities.get(session.playerId);
        if (playerEntity?.type === "player") {
          deps.send(session, {
            type: "travelogue_data",
            entries: (playerEntity as PlayerEntity).travelogue,
          });
        }
      }
      break;
    }

    case "request_save_slots": {
      if (!deps.onSaveSlots) {
        deps.send(session, {
          type: "save_result",
          ok: false,
          error: "存档服务不可用",
        });
        break;
      }
      deps.send(session, { type: "save_slots", slots: deps.onSaveSlots() });
      break;
    }

    case "manual_save": {
      if (!deps.onManualSave) {
        deps.send(session, {
          type: "save_result",
          ok: false,
          error: "存档服务不可用",
        });
        break;
      }
      try {
        const slot = deps.onManualSave(msg.slotId);
        deps.send(session, { type: "save_result", ok: true, slot });
        deps.send(session, { type: "save_slots", slots: deps.onSaveSlots?.() ?? [slot] });
      } catch (err) {
        deps.send(session, {
          type: "save_result",
          ok: false,
          error: `保存失败: ${String(err)}`,
        });
      }
      break;
    }

    case "create_save_slot": {
      if (!deps.onCreateSaveSlot) {
        deps.send(session, {
          type: "save_result",
          ok: false,
          error: "存档服务不可用",
        });
        break;
      }
      try {
        const slot = deps.onCreateSaveSlot(msg.slotId);
        deps.send(session, { type: "save_result", ok: true, slot });
        deps.send(session, { type: "save_slots", slots: deps.onSaveSlots?.() ?? [slot] });
      } catch (err) {
        deps.send(session, {
          type: "save_result",
          ok: false,
          error: `创建存档失败: ${String(err)}`,
        });
      }
      break;
    }
  }
}

export async function handleDialogueOptionsRequest(
  deps: Pick<MessageHandlerDeps, "onDialogueOptions" | "world" | "send">,
  session: Session,
  npcId: string,
): Promise<void> {
  if (!deps.onDialogueOptions || !session.playerId) return;
  try {
    const options = await deps.onDialogueOptions(session.playerId, npcId);
    const npc = deps.world.entities.get(npcId);
    deps.send(session, {
      type: "dialogue_options",
      npcId,
      npcName: npc?.name ?? npcId,
      options,
    });
  } catch (_err) {
    deps.send(session, {
      type: "error",
      code: "dialogue_failed",
      message: "无法生成对话选项",
    });
  }
}

export async function handleChatOptionsRequest(
  deps: Pick<MessageHandlerDeps, "onChatOptions" | "world" | "send">,
  session: Session,
  npcId: string,
): Promise<void> {
  if (!deps.onChatOptions || !session.playerId) return;
  try {
    const options = await deps.onChatOptions(session.playerId, npcId);
    const npc = deps.world.entities.get(npcId);
    deps.send(session, {
      type: "chat_options",
      npcId,
      npcName: npc?.name ?? npcId,
      options,
    });
  } catch (_err) {
    deps.send(session, {
      type: "error",
      code: "chat_options_failed",
      message: "无法生成对话选项",
    });
  }
}

export async function handleTradeOptionsRequest(
  deps: Pick<MessageHandlerDeps, "onTradeOptions" | "world" | "send">,
  session: Session,
  npcId: string,
): Promise<void> {
  if (!deps.onTradeOptions || !session.playerId) return;
  try {
    const options = await deps.onTradeOptions(session.playerId, npcId);
    const npc = deps.world.entities.get(npcId);
    deps.send(session, {
      type: "trade_options",
      npcId,
      npcName: npc?.name ?? npcId,
      options,
    });
  } catch (_err) {
    deps.send(session, {
      type: "error",
      code: "trade_options_failed",
      message: "无法生成交易选项",
    });
  }
}

export async function handleFollowUpOptionsRequest(
  deps: Pick<MessageHandlerDeps, "onFollowUpOptions" | "world" | "send">,
  session: Session,
  npcId: string,
  context: string,
): Promise<void> {
  if (!deps.onFollowUpOptions || !session.playerId) return;
  const npc = deps.world.entities.get(npcId);
  if (!npc) {
    deps.send(session, {
      type: "error",
      code: "invalid_npc",
      message: "NPC 不存在",
    });
    return;
  }
  try {
    const options = await deps.onFollowUpOptions(session.playerId, npcId, context);
    deps.send(session, {
      type: "follow_up_options",
      npcId,
      npcName: npc.name,
      context,
      options,
    });
  } catch (_err) {
    deps.send(session, {
      type: "error",
      code: "follow_up_options_failed",
      message: "无法生成追问选项",
    });
  }
}

function legacyParseAction(world: WorldState, text: string): string {
  if (!text) return "wait";
  const t = world.contentPool.narrativeTemplates;
  if (t.endingCommands.some((cmd) => text.includes(cmd))) return "end_day";
  if (new RegExp(t.chatPattern).test(text)) return "talk";
  for (const dir of Object.keys(t.directionNames)) {
    if (text.includes(`往${dir}`) || text.includes(`去${dir}`)) return "move";
  }
  if (text.startsWith("找") || text.startsWith("问")) return "talk";
  return "wait";
}
