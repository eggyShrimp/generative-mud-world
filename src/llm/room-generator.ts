import type { RegionId, RoomId, WorldMutation, WorldState } from "../core/types.ts";
import { getReverseDirection } from "../shared/directions.ts";
import type { LLMAdapter, ToolDefinition } from "./adapter.ts";
import { worldMutationFromToolCalls } from "./tool-mutations.ts";

export async function generateRoom(
  adapter: LLMAdapter,
  world: WorldState,
  params: {
    fromRoomId: RoomId;
    direction: string;
    regionId: RegionId;
  },
): Promise<WorldMutation | null> {
  const fromRoom = world.rooms.get(params.fromRoomId);
  if (!fromRoom) return null;
  const region = world.regions.get(params.regionId);
  const _reverseDir = getReverseDirection(params.direction) ?? "南";

  const tools: ToolDefinition[] = [
    {
      type: "function",
      function: {
        name: "create_room",
        description: "Create a new room/location",
        parameters: {
          type: "object",
          properties: {
            name: { type: "string", description: "2-4 character Chinese location name" },
            regionId: { type: "string", description: "Region ID" },
            description: { type: "string", description: "1-2 sentence Chinese description" },
            exits: { type: "object", description: "Exit map" },
          },
          required: ["name", "regionId", "description", "exits"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "add_npc",
        description: "Add an NPC to a room",
        parameters: {
          type: "object",
          properties: {
            name: { type: "string", description: "NPC name" },
            roomId: { type: "string", description: "Room name or ID" },
            personality: { type: "string", description: "Short personality description" },
            npcTier: { type: "string", enum: ["core", "regional", "background"] },
            role: { type: "string", description: "NPC role" },
            needs: { type: "object", description: "Need values" },
            items: {
              type: "array",
              description: "随身物品列表",
              items: {
                type: "object",
                properties: {
                  templateId: { type: "string", description: "物品模板ID" },
                  quantity: { type: "number", description: "数量，默认1" },
                },
                required: ["templateId"],
              },
            },
          },
          required: ["name", "roomId", "personality"],
        },
      },
    },
  ];

  const prompt = {
    system: `你是世界生成引擎。一个探索者从"${fromRoom.name}"往${params.direction}方向探索，发现了一个新地点。

使用 create_room 和 add_npc 工具来创建新地点和居民。

规则:
- 地点名2-4字中文，符合${region?.dominantCulture ?? ""}风格
- 描述具体生动，不要套话
- 1-2个NPC，角色合理
- 出口必须包含返回原房间的反向路径`,

    user: `从${fromRoom.name}往${params.direction}探索。当前区域: ${region?.name ?? "未知"}(${region?.dominantCulture ?? ""})`,
  };

  try {
    const response = await adapter.chat(
      prompt.system,
      prompt.user,
      tools,
      "required",
      "room-generation",
    );
    if (!response.toolCalls || response.toolCalls.length === 0) return null;
    return worldMutationFromToolCalls(response.toolCalls, world);
  } catch {
    return null;
  }
}

/** Template fallback — reads from ContentPool, never hardcoded */
export function getFallbackRoom(
  world: WorldState,
  params: { fromRoomId: RoomId; direction: string; regionId: RegionId },
): WorldMutation {
  const region = world.regions.get(params.regionId);
  const culture = region?.dominantCulture ?? "农耕";
  const pool = world.contentPool.roomTemplates;
  const templates = pool.find((t) => t.culture === culture) ?? pool[0];

  if (!templates) throw new Error("No room templates available");

  const roomTemplate = pick(templates.rooms);
  const roomName: string = roomTemplate.name;
  const reverseDir = getReverseDirection(params.direction) ?? "南";

  return {
    newRooms: [
      {
        name: roomName,
        regionId: params.regionId,
        description: roomTemplate.desc,
        terrain: "plain",
        exits: {
          [reverseDir]: {
            to: params.fromRoomId,
            direction: reverseDir,
            distance: 1,
            hidden: false,
            bidirectional: true,
          },
        },
      },
    ],
    newNPCs: [
      {
        name: pick(templates.names),
        roomId: roomName,
        personality: pick(templates.personalities),
        npcTier: "regional" as const,
        role: pick(["farmer", "hunter", "hermit"]),
        needs: { hunger: 60, rest: 70, safety: 50 },
      },
    ],
    narrativeContext: `探索者发现了${roomName}`,
  };
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
