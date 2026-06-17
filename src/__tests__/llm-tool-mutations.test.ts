import { describe, expect, it, vi } from "vitest";
import { addRegion, addRoom, createRoom, createWorld } from "../core/world.ts";
import type { LLMAdapter } from "../llm/adapter.ts";
import { generateRoom } from "../llm/room-generator.ts";
import {
  contentPoolMutationFromToolCalls,
  worldMutationFromToolCalls,
} from "../llm/tool-mutations.ts";
import { CONTENT_POOL_EVOLVE_TOOLS } from "../llm/tools/content-pool-evolve.ts";

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

function timeEnvironmentArgs() {
  return {
    dayNightConfig: {
      periods: [
        { id: "dawn", startHour: 5, label: "清晨", visibilityModifier: 0.7 },
        { id: "morning", startHour: 7, label: "上午", visibilityModifier: 1 },
      ],
    },
    seasonConfig: {
      seasons: [
        {
          id: "spring",
          name: "春",
          months: [1, 2, 3],
          label: "春",
          comfortTemp: 18,
          needDecayMultiplier: 1,
          narrativePrefix: "春风拂面",
        },
      ],
    },
    weatherConfig: {
      weatherTypes: [
        {
          id: "clear",
          label: "晴朗",
          movementMultiplier: 1,
          visibilityMultiplier: 1,
          narrativeDesc: "阳光明媚",
          availableInSeasons: ["spring"],
          weight: 10,
        },
      ],
    },
    warmthComfortConfig: {
      baselineTemp: 25,
      maxIdealWarmth: 30,
      minIdealWarmth: 0,
      penaltyPerWarmthPoint: 0.015,
    },
  };
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

  it("builds ContentPoolMutation from book content tool calls", () => {
    const mutation = contentPoolMutationFromToolCalls([
      {
        id: "call_1",
        function: {
          name: "add_book_content",
          arguments: JSON.stringify({
            id: "sutra_copy",
            itemTemplateId: "sutra_copy",
            title: "佛经抄本",
            pages: ["第一页", "第二页"],
          }),
        },
      },
    ]);

    expect(mutation?.addBookContents).toEqual([
      {
        id: "sutra_copy",
        itemTemplateId: "sutra_copy",
        title: "佛经抄本",
        pages: ["第一页", "第二页"],
      },
    ]);
  });

  it("exposes time environment replacement tools", () => {
    const toolNames = CONTENT_POOL_EVOLVE_TOOLS.map((tool) => tool.function.name);
    expect(toolNames).toContain("replace_day_night_config");
    expect(toolNames).toContain("replace_season_config");
    expect(toolNames).toContain("replace_weather_config");
    expect(toolNames).toContain("replace_warmth_comfort_config");
  });

  it("builds ContentPoolMutation from time environment replacement tool calls", () => {
    const args = timeEnvironmentArgs();
    const mutation = contentPoolMutationFromToolCalls([
      {
        id: "call_1",
        function: {
          name: "replace_day_night_config",
          arguments: JSON.stringify(args.dayNightConfig),
        },
      },
      {
        id: "call_2",
        function: {
          name: "replace_season_config",
          arguments: JSON.stringify(args.seasonConfig),
        },
      },
      {
        id: "call_3",
        function: {
          name: "replace_weather_config",
          arguments: JSON.stringify(args.weatherConfig),
        },
      },
      {
        id: "call_4",
        function: {
          name: "replace_warmth_comfort_config",
          arguments: JSON.stringify(args.warmthComfortConfig),
        },
      },
    ]);

    expect(mutation?.replaceDayNightConfig?.periods[0].label).toBe("清晨");
    expect(mutation?.replaceSeasonConfig?.seasons[0].id).toBe("spring");
    expect(mutation?.replaceWeatherConfig?.weatherTypes[0].id).toBe("clear");
    expect(mutation?.replaceWarmthComfortConfig?.baselineTemp).toBe(25);
  });

  it("rejects invalid time environment replacement tool calls", () => {
    const mutation = contentPoolMutationFromToolCalls([
      {
        id: "call_1",
        function: {
          name: "replace_weather_config",
          arguments: JSON.stringify({
            weatherTypes: [
              {
                id: "bad_weather",
                label: "坏天气",
                movementMultiplier: 1,
                visibilityMultiplier: 1,
                narrativeDesc: "错误",
                availableInSeasons: ["spring"],
                weight: -1,
              },
            ],
          }),
        },
      },
    ]);

    expect(mutation).toBeNull();
  });
});
