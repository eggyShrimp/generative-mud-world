import type { EntityId, SimulationDelta } from "../../core/types.ts";
import type { BookDisplay, SaveSlotInfo } from "../../shared/protocol.ts";

export interface CommandResult {
  events: Array<{ type: string; description: string }>;
  delta?: SimulationDelta;
  ended: boolean;
  needsDialogueOptions?: { npcId: string; npcName: string };
  dialogueOptions?: import("../../shared/protocol.ts").DialogueOption[];
  needsChatOptions?: { npcId: string; npcName: string };
  chatSubOptions?: import("../../shared/protocol.ts").DialogueOption[];
  needsTradeOptions?: { npcId: string; npcName: string };
  tradeSubOptions?: import("../../shared/protocol.ts").TradeOption[];
  operateOptions?: Array<{ actionId: string; label: string }>;
  bookDisplay?: BookDisplay;
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
) => Promise<import("../../shared/protocol.ts").DialogueOption[]>;

export type TradeOptionsHandler = (
  playerId: EntityId,
  npcId: string,
) => Promise<import("../../shared/protocol.ts").TradeOption[]>;

export type FollowUpOptionsHandler = (
  playerId: EntityId,
  npcId: string,
  context: string,
) => Promise<import("../../shared/protocol.ts").DialogueOption[]>;

export type SaveSlotsHandler = () => SaveSlotInfo[];
export type ManualSaveHandler = (slotId?: string) => SaveSlotInfo;
export type CreateSaveSlotHandler = (slotId: string) => SaveSlotInfo;
