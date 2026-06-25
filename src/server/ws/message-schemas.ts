import { z } from "zod";

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

export const ClientMessageSchema = z.discriminatedUnion("type", [
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
