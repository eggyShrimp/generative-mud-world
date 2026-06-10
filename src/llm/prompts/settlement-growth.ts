import type { WorldMutation } from "../../core/types.ts";

export function buildSettlementGrowthPrompt(context: {
  region: { id: string; name: string; population: number; prosperity: number };
  existingRooms: Array<{ id: string; name: string; exits: Record<string, string> }>;
  growthReason: string; // "人口增长" / "贸易繁荣" / "新移民到来"
  npcsToRelocate: Array<{ id: string; name: string; currentRoom: string }>;
}): { system: string; user: string } {
  return {
    system: `你是世界演化引擎。一个区域正在发生聚落生长——新的定居点、新居民、甚至新的派系正在形成。

生成 JSON，描述这个世界变化:

{
  "newRooms": [
    {"name": "新地点名", "regionId": "区域ID", "description": "环境描述",
     "exits": {"北": {"to": "已有房间ID", "direction": "北", "distance": 1},
      "南": {"to": "已有房间ID", "direction": "南", "distance": 1}}}
  ],
  "newNPCs": [
    {"name": "新居民名", "roomId": "新房间ID", "personality": "人格描述",
     "npcTier": "regional", "role": "farmer", "needs": {"hunger": 70}},
    {"name": "另一个居民", "roomId": "同上", "personality": "...",
     "npcTier": "background", "role": "blacksmith"}
  ],
  "newFactions": [
    {"name": "派系名", "goal": "成立目的", "leaderNPCId": "npc_id",
     "memberNPCIds": ["npc_id_1", "npc_id_2"], "governanceForm": "长老会"}
  ],
  "narrativeContext": "一句话描述这段演化的叙事意义"
}

规则:
- newRooms: 1-3个新地点，exits连接已有房间
- newNPCs: 2-8个新NPC，角色合理分布
- newFactions: 可选，仅在群体有共同目标时
- 所有内容使用中文
- 命名符合世界文化风格`,
    user: JSON.stringify(context, null, 2),
  };
}

export async function parseSettlementGrowthOutput(text: string): Promise<WorldMutation | null> {
  try {
    const match = text.match(/```json\n?([\s\S]*?)\n?```/) ?? text.match(/(\{[\s\S]*\})/);
    if (!match) return null;
    return JSON.parse(match[1] ?? match[0]) as WorldMutation;
  } catch {
    return null;
  }
}
