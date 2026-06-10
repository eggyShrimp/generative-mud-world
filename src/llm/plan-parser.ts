/**
 * LLM-based plan parser.
 * Converts natural language player plans into structured Actions.
 * Falls back to keyword parser if LLM is unreachable.
 */
import type { Action, EntityId, WorldState } from "../core/types.ts";
import type { LLMAdapter } from "./adapter.ts";

export async function parsePlanWithLLM(
  adapter: LLMAdapter,
  world: WorldState,
  playerId: EntityId,
  rawText: string,
  tick: number,
): Promise<Action[]> {
  const entity = world.entities.get(playerId);
  if (!entity) return [];

  const currentRoom = entity.roomId ? world.rooms.get(entity.roomId) : null;
  const exits = currentRoom ? Object.fromEntries(currentRoom.exits) : {};

  const prompt = {
    system: `你是命令解析引擎。将玩家的自然语言输入解析为结构化动作。

规则:
- 输出 JSON 数组，每个动作一个对象
- 支持的 action 类型: move, wait, talk
- move: {"type":"move","targetRoomId":"房间ID"}
- wait: {"type":"wait"}
- talk: {"type":"talk","targetId":"NPC的ID"}

当前环境:
  ${entity.name} 在 "${currentRoom?.name ?? "未知"}" (${entity.roomId})
  可用出口: ${JSON.stringify(exits)}
  房间内实体: ${JSON.stringify(
    currentRoom
      ? Array.from(currentRoom.entities)
          .map((eid) => {
            const e = world.entities.get(eid);
            return e ? { id: e.id, name: e.name, type: e.type } : null;
          })
          .filter(Boolean)
      : [],
  )}

只输出 JSON 数组，不要任何额外文本。`,
    user: rawText,
  };

  try {
    const response = await adapter.chat(
      prompt.system,
      prompt.user,
      undefined,
      undefined,
      "plan-parser",
    );
    const json = response.text.trim();
    // Extract JSON from possible markdown wrapper
    const match = json.match(/```json\n?([\s\S]*?)\n?```/) ?? json.match(/(\[[\s\S]*\])/);
    if (!match) return [];

    const parsed = JSON.parse(match[1] ?? match[0]) as Array<{
      type: string;
      targetRoomId?: string;
      targetId?: string;
    }>;
    return parsed
      .filter((a) => a.type === "move" || a.type === "wait" || a.type === "talk")
      .map((a) => ({
        id: `${playerId}_llm_${Date.now()}`,
        type: a.type,
        actorId: playerId,
        targetRoomId: a.targetRoomId ?? undefined,
        targetId: a.targetId ?? undefined,
        payload: { raw: rawText },
        tick,
      }));
  } catch {
    return [];
  }
}
