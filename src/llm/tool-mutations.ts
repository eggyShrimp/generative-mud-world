import {
  ActionEffectSchema,
  BookContentSchema,
  ClueDefinitionSchema,
  NamePoolSchema,
  NewNPCDefSchema,
  NewRoomDefSchema,
  QuestTemplateSchema,
  RoleScheduleTemplateSchema,
  RoomTemplatePoolSchema,
} from "../core/schemas/index.ts";
import type {
  ContentPoolMutation,
  NewNPCDef,
  NewRoomDef,
  RoleScheduleTemplate,
  WorldMutation,
  WorldState,
} from "../core/types.ts";
import { logWrite } from "../shared/log.ts";
import type { ToolCallResult } from "./adapter.ts";

export function worldMutationFromToolCalls(
  toolCalls: ToolCallResult[] | undefined,
  world: WorldState,
): WorldMutation | null {
  const mutation: WorldMutation = {};
  const knownRoomRefs = new Set<string>([
    ...world.rooms.keys(),
    ...Array.from(world.rooms.values()).map((room) => room.name),
  ]);
  const createdRoomNames = new Set<string>();

  for (const call of toolCalls ?? []) {
    const args = parseToolArgs(call);
    if (!args) continue;

    if (call.function.name === "create_room") {
      const result = NewRoomDefSchema.safeParse(args);
      if (!result.success) {
        logWrite("srv", "warn", `[LLMTool] invalid create_room ignored: ${result.error.message}`);
        continue;
      }
      const room = result.data as NewRoomDef;
      if (!world.regions.has(room.regionId)) {
        logWrite("srv", "warn", `[LLMTool] create_room ignored, unknown region: ${room.regionId}`);
        continue;
      }
      const invalidExit = Object.values(room.exits).find((exit) => !knownRoomRefs.has(exit.to));
      if (invalidExit) {
        logWrite(
          "srv",
          "warn",
          `[LLMTool] create_room ignored, unknown exit target: ${invalidExit.to}`,
        );
        continue;
      }
      mutation.newRooms = mutation.newRooms ?? [];
      mutation.newRooms.push(room);
      knownRoomRefs.add(room.name);
      createdRoomNames.add(room.name);
      continue;
    }

    if (call.function.name === "add_npc") {
      const result = NewNPCDefSchema.safeParse(args);
      if (!result.success) {
        logWrite("srv", "warn", `[LLMTool] invalid add_npc ignored: ${result.error.message}`);
        continue;
      }
      const npc = result.data as NewNPCDef;
      if (!knownRoomRefs.has(npc.roomId) && !createdRoomNames.has(npc.roomId)) {
        logWrite("srv", "warn", `[LLMTool] add_npc ignored, unknown room: ${npc.roomId}`);
        continue;
      }
      mutation.newNPCs = mutation.newNPCs ?? [];
      mutation.newNPCs.push(npc);
    }
  }

  return hasMutation(mutation) ? mutation : null;
}

export function contentPoolMutationFromToolCalls(
  toolCalls: ToolCallResult[] | undefined,
): ContentPoolMutation | null {
  const mutation: ContentPoolMutation = {};

  for (const call of toolCalls ?? []) {
    const args = parseToolArgs(call);
    if (!args) continue;

    switch (call.function.name) {
      case "add_action": {
        const result = ActionEffectSchema.safeParse(args);
        if (!result.success) {
          logWrite("srv", "warn", `[LLMTool] invalid add_action ignored: ${result.error.message}`);
          break;
        }
        mutation.addActionEffects = mutation.addActionEffects ?? [];
        mutation.addActionEffects.push(result.data);
        break;
      }
      case "add_schedule": {
        const result = RoleScheduleTemplateSchema.safeParse(args);
        if (!result.success) {
          logWrite(
            "srv",
            "warn",
            `[LLMTool] invalid add_schedule ignored: ${result.error.message}`,
          );
          break;
        }
        const scheduleTemplate: RoleScheduleTemplate = {
          role: result.data.role,
          schedule: result.data.schedule.map((entry) => ({
            ...entry,
            targetRoomId: entry.targetRoomId ?? null,
          })),
        };
        mutation.addScheduleTemplates = mutation.addScheduleTemplates ?? [];
        mutation.addScheduleTemplates.push(scheduleTemplate);
        break;
      }
      case "add_book_content": {
        const result = BookContentSchema.safeParse(args);
        if (!result.success) {
          logWrite(
            "srv",
            "warn",
            `[LLMTool] invalid add_book_content ignored: ${result.error.message}`,
          );
          break;
        }
        mutation.addBookContents = mutation.addBookContents ?? [];
        mutation.addBookContents.push(result.data);
        break;
      }
      case "add_room_template": {
        const result = RoomTemplatePoolSchema.safeParse(args);
        if (!result.success) {
          logWrite(
            "srv",
            "warn",
            `[LLMTool] invalid add_room_template ignored: ${result.error.message}`,
          );
          break;
        }
        mutation.addRoomTemplates = mutation.addRoomTemplates ?? [];
        mutation.addRoomTemplates.push(result.data);
        break;
      }
      case "add_name_pool": {
        const result = NamePoolSchema.safeParse(args);
        if (!result.success) {
          logWrite(
            "srv",
            "warn",
            `[LLMTool] invalid add_name_pool ignored: ${result.error.message}`,
          );
          break;
        }
        mutation.addNamePools = mutation.addNamePools ?? [];
        mutation.addNamePools.push(result.data);
        break;
      }
      case "add_quest_template": {
        const result = QuestTemplateSchema.safeParse(args);
        if (!result.success) {
          logWrite(
            "srv",
            "warn",
            `[LLMTool] invalid add_quest_template ignored: ${result.error.message}`,
          );
          break;
        }
        mutation.addQuestTemplates = mutation.addQuestTemplates ?? [];
        mutation.addQuestTemplates.push(result.data);
        break;
      }
      case "add_clue_definition": {
        const result = ClueDefinitionSchema.safeParse(args);
        if (!result.success) {
          logWrite(
            "srv",
            "warn",
            `[LLMTool] invalid add_clue_definition ignored: ${result.error.message}`,
          );
          break;
        }
        mutation.addClueDefinitions = mutation.addClueDefinitions ?? [];
        mutation.addClueDefinitions.push(result.data);
        break;
      }
    }
  }

  return hasMutation(mutation) ? mutation : null;
}

function parseToolArgs(call: ToolCallResult): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(call.function.arguments);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch (err) {
    logWrite(
      "srv",
      "warn",
      `[LLMTool] invalid arguments for ${call.function.name}: ${String(err)}`,
    );
  }
  return null;
}

function hasMutation(mutation: WorldMutation | ContentPoolMutation): boolean {
  return Object.values(mutation).some((value) =>
    Array.isArray(value) ? value.length > 0 : value !== undefined,
  );
}
