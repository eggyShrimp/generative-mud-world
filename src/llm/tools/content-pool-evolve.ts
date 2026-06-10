import type { ToolDefinition } from "../adapter.ts";
import { ADD_NPC_TOOL, CREATE_ROOM_TOOL } from "./room-mutation.ts";

export const SETTLEMENT_GROWTH_TOOLS: ToolDefinition[] = [CREATE_ROOM_TOOL, ADD_NPC_TOOL];

export const ADD_ACTION_TOOL: ToolDefinition = {
  type: "function",
  function: {
    name: "add_action",
    description: "向内容池添加一种新的行为效果",
    parameters: {
      type: "object",
      properties: {
        action: { type: "string", description: "行为标识" },
        needDeltas: {
          type: "object",
          description: "对各需求的影响值",
          additionalProperties: { type: "number" },
        },
      },
      required: ["action", "needDeltas"],
    },
  },
};

export const ADD_SCHEDULE_TOOL: ToolDefinition = {
  type: "function",
  function: {
    name: "add_schedule",
    description: "向内容池添加一种新的角色日程模板",
    parameters: {
      type: "object",
      properties: {
        role: { type: "string", description: "角色标识" },
        schedule: {
          type: "array",
          items: {
            type: "object",
            properties: {
              startHour: { type: "number", minimum: 0, maximum: 23 },
              endHour: { type: "number", minimum: 0, maximum: 23 },
              action: { type: "string" },
              priority: { type: "number", minimum: 0 },
              deviationAllowed: { type: "boolean" },
            },
            required: ["startHour", "endHour", "action", "priority", "deviationAllowed"],
          },
        },
      },
      required: ["role", "schedule"],
    },
  },
};

export const CONTENT_POOL_EVOLVE_TOOLS: ToolDefinition[] = [ADD_ACTION_TOOL, ADD_SCHEDULE_TOOL];
