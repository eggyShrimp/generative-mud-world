import type { ToolDefinition } from "../adapter.ts";

export const CREATE_ROOM_TOOL: ToolDefinition = {
  type: "function",
  function: {
    name: "create_room",
    description: "创建一个新地点，包含出口连接信息。每个出口需要指定目标房间、方向、距离和地形。",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "地点名称" },
        regionId: { type: "string", description: "所属区域 ID" },
        description: { type: "string", description: "地点描述" },
        terrain: {
          type: "string",
          enum: [
            "road",
            "trail",
            "plain",
            "forest",
            "hills",
            "mountain",
            "desert",
            "swamp",
            "river",
            "lake",
            "ocean",
            "bridge",
            "tunnel",
            "cave",
            "portal",
            "stairs_up",
            "stairs_down",
          ],
          description: "默认地形类型",
        },
        exits: {
          type: "object",
          description: "出口映射，key 为方向(北/南/东/西/上/下)，value 为出口详情",
          additionalProperties: {
            type: "object",
            properties: {
              to: { type: "string", description: "目标房间 ID" },
              direction: { type: "string", description: "方向" },
              distance: { type: "number", minimum: 0, description: "路径长度，影响移动消耗" },
              terrain: {
                type: "string",
                enum: [
                  "road",
                  "trail",
                  "plain",
                  "forest",
                  "hills",
                  "mountain",
                  "desert",
                  "swamp",
                  "river",
                  "lake",
                  "ocean",
                  "bridge",
                  "tunnel",
                  "cave",
                  "portal",
                  "stairs_up",
                  "stairs_down",
                ],
                description: "路径地形，覆盖房间默认地形",
              },
              hidden: { type: "boolean", description: "是否为隐藏出口" },
              bidirectional: { type: "boolean", description: "是否自动生成反向出口(默认 true)" },
              description: { type: "string", description: "移动时的叙事文本" },
            },
            required: ["to", "direction"],
          },
        },
      },
      required: ["name", "regionId", "description", "exits"],
    },
  },
};

export const ADD_NPC_TOOL: ToolDefinition = {
  type: "function",
  function: {
    name: "add_npc",
    description: "在指定地点添加一个 NPC 角色",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "角色名称" },
        roomId: { type: "string", description: "所在房间 ID" },
        personality: { type: "string", description: "人格描述" },
        npcTier: {
          type: "string",
          enum: ["core", "regional", "background"],
          description: "NPC 层级",
        },
        role: {
          type: "string",
          enum: [
            "blacksmith",
            "guard",
            "farmer",
            "tavern_keeper",
            "merchant",
            "noble",
            "priest",
            "scholar",
            "hunter",
            "bandit",
          ],
          description: "角色职业",
        },
        needs: {
          type: "object",
          description: "需求初始值 (0-100)",
          properties: {
            hunger: { type: "number" },
            safety: { type: "number" },
            social: { type: "number" },
            rest: { type: "number" },
            wealth: { type: "number" },
          },
        },
        items: {
          type: "array",
          description: "随身物品列表",
          items: {
            type: "object",
            properties: {
              templateId: {
                type: "string",
                enum: [
                  "copper_coin",
                  "iron_ore",
                  "tent",
                  "bedroll",
                  "silk_bolt",
                  "jade_rough",
                  "tea_brick",
                  "waterskin",
                  "sutra_copy",
                  "camel_bell",
                  "naan_bread",
                  "grap_wine",
                  "tang_dao",
                  "torch",
                ],
                description: "物品模板ID",
              },
              quantity: { type: "number", description: "数量，默认1" },
            },
            required: ["templateId"],
          },
        },
      },
      required: ["name", "roomId", "personality", "npcTier"],
    },
  },
};

export const ROOM_GENERATION_TOOLS: ToolDefinition[] = [CREATE_ROOM_TOOL, ADD_NPC_TOOL];
