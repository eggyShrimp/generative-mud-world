import { describe, expect, it, vi } from "vitest";
import { addRegion, addRoom, createRoom, createWorld } from "../core/world.ts";
import type { LLMAdapter } from "../llm/adapter.ts";
import { generateRoom } from "../llm/room-generator.ts";
import {
  contentPoolMutationFromToolCalls,
  worldMutationFromToolCalls,
} from "../llm/tool-mutations.ts";

function setupWorld() {
  const world = createWorld();
  addRegion(world, {
    id: "west",
    name: "西境",
    dominantCulture: "农耕",
    prosperity: 50,
    threatLevel: 10,
  });
  addRoom(world, createRoom("tavern", "酒馆", "west", ""));
  return world;
}

describe("LLM tool mutation parsing", () => {
  it("builds WorldMutation from valid room and NPC tool calls", () => {
    const world = setupWorld();
    const mutation = worldMutationFromToolCalls(
      [
        {
          id: "call_1",
          function: {
            name: "create_room",
            arguments: JSON.stringify({
              name: "新磨坊",
              regionId: "west",
              description: "河边新起的磨坊。",
              exits: {
                南: { to: "tavern", direction: "南", distance: 1 },
              },
            }),
          },
        },
        {
          id: "call_2",
          function: {
            name: "add_npc",
            arguments: JSON.stringify({
              name: "王二",
              roomId: "新磨坊",
              personality: "勤劳",
              npcTier: "regional",
            }),
          },
        },
      ],
      world,
    );

    expect(mutation?.newRooms).toHaveLength(1);
    expect(mutation?.newNPCs).toHaveLength(1);
    expect(mutation?.newNPCs?.[0].roomId).toBe("新磨坊");
  });

  it("rejects NPC tool calls that reference unknown rooms", () => {
    const world = setupWorld();
    const mutation = worldMutationFromToolCalls(
      [
        {
          id: "call_1",
          function: {
            name: "add_npc",
            arguments: JSON.stringify({
              name: "虚空人",
              roomId: "ghost_room",
              personality: "勤劳",
              npcTier: "regional",
            }),
          },
        },
      ],
      world,
    );

    expect(mutation).toBeNull();
  });

  it("generateRoom ignores text JSON when no tool call is returned", async () => {
    const world = setupWorld();
    const adapter = {
      chat: vi.fn().mockResolvedValue({
        text: JSON.stringify({
          newRooms: [
            {
              name: "纸面地点",
              regionId: "west",
              description: "不应落地。",
              exits: { 南: { to: "tavern", direction: "南", distance: 1 } },
            },
          ],
        }),
      }),
      generate: vi.fn(),
    } as unknown as LLMAdapter;

    const mutation = await generateRoom(adapter, world, {
      fromRoomId: "tavern",
      direction: "北",
      regionId: "west",
    });

    expect(mutation).toBeNull();
    expect(adapter.chat).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(Array),
      "required",
      "room-generation",
    );
  });

  it("builds ContentPoolMutation from template and name pool tool calls", () => {
    const mutation = contentPoolMutationFromToolCalls([
      {
        id: "call_1",
        function: {
          name: "add_room_template",
          arguments: JSON.stringify({
            culture: "山民",
            rooms: [{ name: "石屋", desc: "低矮坚固的石屋。" }],
            names: ["阿岩"],
            personalities: ["谨慎"],
          }),
        },
      },
      {
        id: "call_2",
        function: {
          name: "add_name_pool",
          arguments: JSON.stringify({
            culture: "山民",
            surnames: ["岩"],
            maleGiven: ["峰"],
            femaleGiven: ["溪"],
            neutralGiven: ["石"],
            epithetPatterns: ["{surname}{given}"],
          }),
        },
      },
    ]);

    expect(mutation?.addRoomTemplates).toHaveLength(1);
    expect(mutation?.addNamePools).toHaveLength(1);
  });
});
