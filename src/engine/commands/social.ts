/**
 * 社交命令执行器 (talk, say, wait)
 */

import { renderTemplate } from "../../core/template.ts";
import type { EntityId, WorldState } from "../../core/types.ts";
import { getEntity } from "../../core/world.ts";
import { buildDelta, commandMessages, fail } from "./helpers.ts";

export function executeTalk(
  world: WorldState,
  entityId: EntityId,
  params: Record<string, unknown>,
): ReturnType<typeof fail> {
  const entity = getEntity(world, entityId);
  if (!entity) return fail("找不到自己");

  const room = entity.roomId ? world.rooms.get(entity.roomId) : null;
  if (!room) return fail("不在任何房间内");

  const npcId = params.npcId as string;
  if (!npcId) return fail("不知道要和谁说话");

  const npc = world.entities.get(npcId);
  if (npc?.type !== "npc") return fail(`${npcId} 不在这里`);
  if (npc.roomId !== entity.roomId) return fail(`${npc.name} 不在这里`);

  if (typeof params.optionId === "string" && params.optionId.length > 0) {
    return {
      events: [],
      delta: {
        ...buildDelta(world, entityId, "talk"),
        questObjectiveEvents: [
          {
            type: "player_talked_to_npc",
            tick: world.tick,
            actorId: entityId,
            data: {
              npcId,
              optionId: params.optionId,
              optionType: params.optionType,
            },
          },
        ],
      },
      ended: false,
    };
  }

  return {
    events: [],
    delta: buildDelta(world, entityId, "talk"),
    ended: false,
    needsDialogueOptions: { npcId: npc.id, npcName: npc.name },
  };
}

export function executeSay(
  world: WorldState,
  entityId: EntityId,
  params: Record<string, unknown>,
): ReturnType<typeof fail> {
  const entity = getEntity(world, entityId);
  if (!entity) return fail("找不到自己");

  const message = (params.message ?? "") as string;
  if (!message) return fail("没有说话内容");

  return {
    events: [
      {
        type: "say",
        description: renderTemplate(commandMessages(world).say, {
          actor: entity.name,
          message,
        }),
      },
    ],
    delta: buildDelta(world, entityId, "say"),
    ended: false,
  };
}

export function executeWait(
  world: WorldState,
  entityId: EntityId,
  params: Record<string, unknown>,
): ReturnType<typeof fail> {
  const entity = getEntity(world, entityId);
  const t = world.contentPool.narrativeTemplates;
  const name = entity?.name ?? t.spectatorFallbackName;

  const raw = (params.raw ?? "") as string;
  const desc =
    raw.length > 0 && raw.length < 30
      ? `${name}: ${raw}`
      : t.waitNarrative.replace(/\{actor\}/g, name);

  return {
    events: [{ type: "wait", description: desc }],
    delta: buildDelta(world, entityId, "wait"),
    ended: false,
  };
}
