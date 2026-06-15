/**
 * Travelogue Generator — 游记生成器
 *
 * 在每日结算时，基于玩家当天的事件日志，调用 LLM 生成第三人称章回体游记。
 * 生成的游记篇章追加到 PlayerEntity.travelogue 数组中持久化。
 */

import type {
  EntityId,
  PlayerEntity,
  TravelogueEntry,
  WorldEvent,
  WorldState,
} from "../core/types.ts";
import { formatDate, getEntity } from "../core/world.ts";
import type { LLMAdapter } from "./adapter.ts";

/**
 * 收集玩家今日可见的事件列表。
 * 过滤规则与日报生成一致：global 事件、玩家所在房间事件、玩家作为 actor 的事件。
 */
export function collectPlayerEvents(world: WorldState, playerId: EntityId): WorldEvent[] {
  const entity = getEntity(world, playerId);
  if (!entity) return [];

  return world.eventLog.filter(
    (e) => e.scope === "global" || e.scope === entity.roomId || e.data?.actorId === playerId,
  );
}

/**
 * 从事件列表中提取玩家当天途经的地点（按首次出现顺序排序）。
 */
export function extractLocationsVisited(events: WorldEvent[], world: WorldState): EntityId[] {
  const locations: EntityId[] = [];
  const seen = new Set<EntityId>();

  for (const event of events) {
    const data = event.data ?? {};

    const roomIds: string[] = [];
    if (data.fromRoomId) roomIds.push(data.fromRoomId as string);
    if (data.toRoomId) roomIds.push(data.toRoomId as string);
    if (data.roomId) roomIds.push(data.roomId as string);
    if (
      typeof event.scope === "string" &&
      event.scope !== "global" &&
      world.rooms.has(event.scope)
    ) {
      roomIds.push(event.scope);
    }

    for (const roomId of roomIds) {
      if (!seen.has(roomId)) {
        seen.add(roomId);
        locations.push(roomId);
      }
    }
  }

  return locations;
}

/**
 * 提取玩家自上一条游记之后获得的线索。
 * 边界：上一条游记.createdAt < learnedAt（不包含旧游记已收录的线索）。
 */
export function extractTodayClues(
  player: PlayerEntity,
  world: WorldState,
): Array<{ description: string; sourceNpcName?: string }> {
  const lastTick = player.travelogue.at(-1)?.createdAt;
  const todayClues =
    lastTick !== undefined
      ? player.knownClues.filter((c) => c.learnedAt > lastTick)
      : player.knownClues;

  const results: Array<{ description: string; sourceNpcName?: string }> = [];
  for (const clue of todayClues) {
    const def = world.contentPool.clueDefinitions.find((d) => d.id === clue.clueId);
    if (!def) continue;
    const sourceNpc = world.entities.get(clue.sourceNpcId);
    results.push({
      description: def.description,
      sourceNpcName: sourceNpc?.name,
    });
  }
  return results;
}

/**
 * 构建旅行者 prompt：系统消息来自 ContentPool 模板，用户消息包含日期/事件/地点/NPC/上下文。
 */
export function buildTraveloguePrompt(
  events: WorldEvent[],
  locations: EntityId[],
  player: PlayerEntity,
  world: WorldState,
): { system: string; user: string } {
  const pool = world.contentPool;
  const systemPrompt = pool.narrativeTemplates.traveloguePrompt || getFallbackTraveloguePrompt();

  const dateStr = formatDate(world.time, { calendar: pool.calendar });
  const roomNames = locations.map((id) => world.rooms.get(id)?.name ?? id).filter(Boolean);

  const npcEncounters = extractNpcEncounters(events, world);

  const lines: string[] = [];

  lines.push(`玩家: ${player.name}`);
  lines.push(`日期: ${dateStr}`);

  if (roomNames.length > 0) {
    lines.push(`途经地点: ${roomNames.join(" → ")}`);
  }

  if (npcEncounters.length > 0) {
    lines.push(`遭遇人物: ${npcEncounters.join("、")}`);
  }

  if (player.traits.length > 0) {
    const traitText = player.traits
      .map((t) => `${pool.traitLabels[t.name] ?? t.name}(${t.value})`)
      .join(" ");
    lines.push(`角色特质: ${traitText}`);
  }

  // 前几日的游记上下文（最近 2 篇，用于叙事连贯性）
  const prevEntries = player.travelogue.slice(-2);
  if (prevEntries.length > 0) {
    lines.push("前情回顾:");
    for (const entry of prevEntries) {
      lines.push(`  [${entry.date}] ${entry.title}`);
    }
  }

  const todayClues = extractTodayClues(player, world);
  if (todayClues.length > 0) {
    lines.push("");
    lines.push("今日获悉的线索:");
    for (const clue of todayClues) {
      const source = clue.sourceNpcName ? `（来源：${clue.sourceNpcName}）` : "";
      lines.push(`- ${clue.description}${source}`);
    }
  }

  lines.push("");
  lines.push("今日事件:");
  for (let i = 0; i < events.length; i++) {
    lines.push(`${i + 1}. ${events[i].description}`);
  }

  return { system: systemPrompt, user: lines.join("\n") };
}

function extractNpcEncounters(events: WorldEvent[], world: WorldState): string[] {
  const npcNames = new Set<string>();
  for (const event of events) {
    const data = event.data ?? {};
    if (data.targetId) {
      const target = world.entities.get(data.targetId as string);
      if (target && target.type === "npc") {
        npcNames.add(target.name);
      }
    }
  }
  return Array.from(npcNames);
}

/**
 * 解析 LLM 输出的游记 JSON。支持纯 JSON 和被 markdown 代码块包裹两种情况。
 */
export function parseTravelogueOutput(text: string): { title: string; narrative: string } | null {
  try {
    let jsonText = text.trim();

    const codeBlockMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
      jsonText = codeBlockMatch[1].trim();
    }

    const obj = JSON.parse(jsonText);
    if (
      typeof obj !== "object" ||
      obj === null ||
      typeof obj.title !== "string" ||
      typeof obj.narrative !== "string"
    ) {
      return null;
    }

    return { title: obj.title, narrative: obj.narrative };
  } catch {
    return null;
  }
}

/**
 * 为玩家生成当日的游记篇章。
 *
 * @returns TravelogueEntry 或 null（当日无事件或 LLM 调用失败时）
 */
export async function generateTravelogueEntry(
  world: WorldState,
  playerId: EntityId,
  adapter: LLMAdapter,
): Promise<TravelogueEntry | null> {
  const player = getEntity(world, playerId);
  if (player?.type !== "player") return null;

  const events = collectPlayerEvents(world, playerId);
  if (events.length === 0) return null;

  const locations = extractLocationsVisited(events, world);

  const { system, user } = buildTraveloguePrompt(events, locations, player as PlayerEntity, world);

  try {
    const response = await adapter.chat(system, user, undefined, undefined, "travelogue");
    const parsed = parseTravelogueOutput(response.text);

    if (!parsed) return null;

    const primaryLocation = locations.length > 0 ? locations[locations.length - 1] : player.roomId;

    const todayClues = extractTodayClues(player as PlayerEntity, world);
    const clueEvents = todayClues.map((c) => `获悉线索：${c.description}`);

    return {
      day: world.time.day,
      month: world.time.month,
      year: world.time.year,
      date: formatDate(world.time, { calendar: world.contentPool.calendar }),
      title: parsed.title,
      location: primaryLocation,
      locations,
      narrative: parsed.narrative,
      keyEvents: [...events.map((e) => e.description), ...clueEvents],
      createdAt: world.tick,
    };
  } catch {
    return null;
  }
}

export function getFallbackTraveloguePrompt(): string {
  return `你是游记作家。请根据玩家今日的经历，以第三人称章回体小说的风格撰写一篇游记。

写作要求:
- 使用第三人称叙事，以角色名为叙述主语
- 章回体风格: 标题用简洁的章回名（如"第三回·苍山城初遇奇人"），正文要展现角色在世界的经历
- 3-5段正文，每段4-6句话，生动刻画场景
- 以地点为线索组织叙事，每到一个新地点另起一段
- 融入诗意描写：景色、氛围、角色的细微感受
- 保留遭遇NPC的对话要点

输出格式为严格的JSON:
{"title": "章回标题", "narrative": "正文内容"}`;
}
