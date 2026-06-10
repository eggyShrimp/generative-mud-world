import { describe, expect, it } from "vitest";
import type { NPCEntity } from "../core/types.ts";
import { buildWorld } from "../core/world-loader";

const miniConfig = {
  name: "test",
  seed: "test seed",
  era: "stone",
  regions: [
    {
      id: "test_region" as const,
      name: "测试区",
      dominantCulture: "test",
      prosperity: 50,
      threatLevel: 10,
    },
  ],
  rooms: [
    {
      id: "room_01" as const,
      name: "测试房间",
      regionId: "test_region" as const,
      description: "desc",
    },
  ],
  exits: { room_01: {} },
  npcs: [
    {
      id: "npc_01",
      name: "测试NPC",
      roomId: "room_01" as const,
      personality: "测试人格",
      npcTier: "core" as const,
      role: "blacksmith",
      needs: { hunger: 70, safety: 60 },
    },
  ],
  players: [{ id: "player_01", name: "玩家", roomId: "room_01" as const }],
};

describe("WorldLoader", () => {
  it("should build world from config", () => {
    const world = buildWorld(miniConfig);
    expect(world.rooms.size).toBe(1);
    expect(world.entities.size).toBeGreaterThanOrEqual(2); // NPC + player + optional items
    expect(world.regions.size).toBe(1);
  });

  it("should apply NPC schedule from role", () => {
    const world = buildWorld(miniConfig);
    const npc = world.entities.get("npc_01");
    expect(npc).toBeDefined();
    if (!npc) return;

    expect((npc as NPCEntity).schedule.length).toBeGreaterThan(0);
    expect((npc as NPCEntity).needs.length).toBeGreaterThan(0);
  });

  it("should connect room exits", () => {
    const config = {
      ...miniConfig,
      rooms: [
        ...miniConfig.rooms,
        {
          id: "room_02" as const,
          name: "另一房间",
          regionId: "test_region" as const,
          description: "desc2",
        },
      ],
      exits: { room_01: { 东: "room_02" as const }, room_02: { 西: "room_01" as const } },
    };
    const world = buildWorld(config);
    expect(world.rooms.get("room_01")?.exits.get("东")?.to).toBe("room_02");
    expect(world.rooms.get("room_02")?.exits.get("西")?.to).toBe("room_01");
  });

  it("should auto-connect rooms via graph layout", () => {
    const config = {
      ...miniConfig,
      rooms: [
        { id: "r1" as const, name: "A", regionId: "test_region" as const, description: "" },
        { id: "r2" as const, name: "B", regionId: "test_region" as const, description: "" },
        { id: "r3" as const, name: "C", regionId: "test_region" as const, description: "" },
        { id: "r4" as const, name: "D", regionId: "test_region" as const, description: "" },
      ],
      graph: {
        layout: {
          test_region: {
            rows: 2,
            cols: 2,
            rooms: ["r1", "r2", "r3", "r4"],
            defaultDistance: 1,
            defaultTerrain: "mountain" as const,
          },
        },
      },
    };
    const world = buildWorld(config);
    // 2×2 grid:
    // r1 -东→ r2
    // |       |
    // 南      南
    // ↓       ↓
    // r3 -东→ r4
    const r1 = world.rooms.get("r1");
    const r2 = world.rooms.get("r2");
    const r3 = world.rooms.get("r3");
    const r4 = world.rooms.get("r4");

    expect(r1).toBeDefined();
    expect(r2).toBeDefined();
    expect(r3).toBeDefined();
    expect(r4).toBeDefined();

    expect(r1?.exits.get("东")?.to).toBe("r2");
    expect(r1?.exits.get("东")?.terrain).toBe("mountain");
    expect(r1?.exits.get("南")?.to).toBe("r3");
    expect(r2?.exits.get("西")?.to).toBe("r1");
    expect(r2?.exits.get("南")?.to).toBe("r4");
    expect(r3?.exits.get("北")?.to).toBe("r1");
    expect(r3?.exits.get("东")?.to).toBe("r4");
    expect(r4?.exits.get("西")?.to).toBe("r3");
    expect(r4?.exits.get("北")?.to).toBe("r2");
    expect(world.graph?.nodes.get("r1")).toMatchObject({ x: 0, y: 0, regionId: "test_region" });
    expect(world.graph?.nodes.get("r2")).toMatchObject({ x: 1, y: 0 });
    expect(world.graph?.nodes.get("r3")).toMatchObject({ x: 0, y: 1 });
    expect(world.graph?.nodes.get("r4")).toMatchObject({ x: 1, y: 1 });
    expect(world.graph?.bounds).toEqual({ minX: 0, maxX: 1, minY: 0, maxY: 1 });
  });

  it("should stack layout regions without overlap", () => {
    const config = {
      ...miniConfig,
      regions: [
        { id: "r_a" as const, name: "A区", dominantCulture: "a", prosperity: 50, threatLevel: 10 },
        { id: "r_b" as const, name: "B区", dominantCulture: "b", prosperity: 50, threatLevel: 10 },
      ],
      rooms: [
        { id: "a1" as const, name: "A1", regionId: "r_a" as const, description: "" },
        { id: "a2" as const, name: "A2", regionId: "r_a" as const, description: "" },
        { id: "b1" as const, name: "B1", regionId: "r_b" as const, description: "" },
        { id: "b2" as const, name: "B2", regionId: "r_b" as const, description: "" },
      ],
      graph: {
        layout: {
          r_a: { rows: 1, cols: 2, rooms: ["a1", "a2"], defaultDistance: 1 },
          r_b: { rows: 1, cols: 2, rooms: ["b1", "b2"], defaultDistance: 1 },
        },
      },
    };

    const world = buildWorld(config);
    expect(world.graph?.nodes.get("a1")).toMatchObject({ x: 0, y: 0 });
    expect(world.graph?.nodes.get("a2")).toMatchObject({ x: 1, y: 0 });
    expect(world.graph?.nodes.get("b1")).toMatchObject({ x: 0, y: 3 });
    expect(world.graph?.nodes.get("b2")).toMatchObject({ x: 1, y: 3 });
    expect(world.graph?.regionBounds.get("r_a")).toEqual({ minX: 0, maxX: 1, minY: 0, maxY: 0 });
    expect(world.graph?.regionBounds.get("r_b")).toEqual({ minX: 0, maxX: 1, minY: 3, maxY: 3 });
  });

  it("should honor manual world offsets in graph layout", () => {
    const config = {
      ...miniConfig,
      rooms: [
        { id: "r1" as const, name: "A", regionId: "test_region" as const, description: "" },
        { id: "r2" as const, name: "B", regionId: "test_region" as const, description: "" },
      ],
      graph: {
        layout: {
          test_region: {
            rows: 1,
            cols: 2,
            rooms: ["r1", "r2"],
            defaultDistance: 1,
            worldOffsetX: 10,
            worldOffsetY: -4,
          },
        },
      },
    };

    const world = buildWorld(config);
    expect(world.graph?.nodes.get("r1")).toMatchObject({ x: 10, y: -4 });
    expect(world.graph?.nodes.get("r2")).toMatchObject({ x: 11, y: -4 });
    expect(world.graph?.bounds).toEqual({ minX: 10, maxX: 11, minY: -4, maxY: -4 });
  });

  it("should connect regions via regionLinks", () => {
    const config = {
      ...miniConfig,
      regions: [
        { id: "r_a" as const, name: "A区", dominantCulture: "a", prosperity: 50, threatLevel: 10 },
        { id: "r_b" as const, name: "B区", dominantCulture: "b", prosperity: 50, threatLevel: 10 },
      ],
      rooms: [
        { id: "a1" as const, name: "A1", regionId: "r_a" as const, description: "" },
        { id: "a2" as const, name: "A2", regionId: "r_a" as const, description: "" },
        { id: "b1" as const, name: "B1", regionId: "r_b" as const, description: "" },
        { id: "b2" as const, name: "B2", regionId: "r_b" as const, description: "" },
      ],
      graph: {
        layout: {
          r_a: {
            rows: 1,
            cols: 2,
            rooms: ["a1", "a2"],
            defaultDistance: 1,
            defaultTerrain: "plain" as const,
          },
          r_b: {
            rows: 1,
            cols: 2,
            rooms: ["b1", "b2"],
            defaultDistance: 1,
            defaultTerrain: "forest" as const,
          },
        },
        regionLinks: [
          {
            fromRegion: "r_a",
            toRegion: "r_b",
            direction: "东",
            distance: 3,
            terrain: "mountain" as const,
          },
        ],
      },
    };
    const world = buildWorld(config);
    // r_a 右边界(a2) 东 → r_b 左边界(b1)
    expect(world.rooms.get("a2")?.exits.get("东")?.to).toBe("b1");
    expect(world.rooms.get("a2")?.exits.get("东")?.distance).toBe(3);
    expect(world.rooms.get("a2")?.exits.get("东")?.terrain).toBe("mountain");
    expect(world.rooms.get("b1")?.exits.get("西")?.to).toBe("a2");
  });

  it("should support manual edges that override layout", () => {
    const config = {
      ...miniConfig,
      rooms: [
        { id: "r1" as const, name: "A", regionId: "test_region" as const, description: "" },
        { id: "r2" as const, name: "B", regionId: "test_region" as const, description: "" },
      ],
      graph: {
        edges: [
          {
            from: "r1",
            to: "r2",
            direction: "下",
            distance: 5,
            terrain: "cave" as const,
            hidden: true,
            bidirectional: false,
            description: "钻进幽深洞穴",
          },
        ],
      },
    };
    const world = buildWorld(config);
    const exit = world.rooms.get("r1")?.exits.get("下");
    expect(exit).toBeDefined();
    expect(exit?.to).toBe("r2");
    expect(exit?.distance).toBe(5);
    expect(exit?.terrain).toBe("cave");
    expect(exit?.hidden).toBe(true);
    expect(exit?.bidirectional).toBe(false);
    expect(exit?.description).toBe("钻进幽深洞穴");
    // bidirectional=false 不应生成反向边
    expect(world.rooms.get("r2")?.exits.has("上")).toBe(false);
  });

  it("should set room terrain from config", () => {
    const config = {
      ...miniConfig,
      rooms: [
        {
          id: "r1" as const,
          name: "雪山",
          regionId: "test_region" as const,
          description: "",
          terrain: "mountain" as const,
        },
      ],
    };
    const world = buildWorld(config);
    const room = world.rooms.get("r1");
    expect(room).toBeDefined();
    expect(room?.terrain).toBe("mountain");
  });

  it("should create NPC with initial memories from config", () => {
    const config = {
      ...miniConfig,
      npcs: [
        {
          ...miniConfig.npcs[0],
          memories: [
            { content: "记得北狄老巢在乱石岗", importance: 0.8 },
            { content: "酒馆老板是老朋友", importance: 0.5, type: "conversation" as const },
          ],
        },
      ],
    };
    const world = buildWorld(config);
    const npc = world.entities.get("npc_01") as NPCEntity;
    expect(npc).toBeDefined();
    expect(npc.memories).toHaveLength(2);
    expect(npc.memories[0].content).toBe("记得北狄老巢在乱石岗");
    expect(npc.memories[0].importance).toBe(0.8);
    expect(npc.memories[0].tick).toBe(0);
    expect(npc.memories[1].type).toBe("conversation");
  });

  it("should default memory type to observation when not specified", () => {
    const config = {
      ...miniConfig,
      npcs: [
        {
          ...miniConfig.npcs[0],
          memories: [{ content: "测试", importance: 0.5 }],
        },
      ],
    };
    const world = buildWorld(config);
    const npc = world.entities.get("npc_01") as NPCEntity;
    expect(npc.memories[0].type).toBe("observation");
  });

  it("should handle empty memories array", () => {
    const config = {
      ...miniConfig,
      npcs: [{ ...miniConfig.npcs[0], memories: [] }],
    };
    const world = buildWorld(config);
    const npc = world.entities.get("npc_01") as NPCEntity;
    expect(npc.memories).toHaveLength(0);
  });

  it("should handle missing memories field (backward compatible)", () => {
    const config = {
      ...miniConfig,
      npcs: [{ ...miniConfig.npcs[0] }],
    };
    // 不设置 memories 字段
    const world = buildWorld(config);
    const npc = world.entities.get("npc_01") as NPCEntity;
    expect(npc.memories).toHaveLength(0);
  });

  it("should preserve room tags from config", () => {
    const config = {
      ...miniConfig,
      rooms: [{ ...miniConfig.rooms[0], tags: ["tavern", "inn"] }],
    };
    const world = buildWorld(config);
    const room = world.rooms.get("room_01");
    expect(room?.tags).toEqual(["tavern", "inn"]);
  });

  it("should default room tags to undefined when not specified", () => {
    const config = { ...miniConfig };
    const world = buildWorld(config);
    const room = world.rooms.get("room_01");
    expect(room?.tags).toBeUndefined();
  });

  it("should create NPC items from config", () => {
    const config = {
      ...miniConfig,
      npcs: [
        {
          ...miniConfig.npcs[0],
          items: [
            { name: "草药", properties: { usable: true } },
            { name: "铜币", properties: { wealth: true } },
          ],
        },
      ],
    };
    const world = buildWorld(config);
    const npc = world.entities.get("npc_01") as NPCEntity;
    expect(npc.inventory).toHaveLength(2);
    expect(npc.inventory[0].name).toBe("草药");
    expect(npc.inventory[0].properties).toEqual({ usable: true });
    expect(npc.inventory[1].name).toBe("铜币");
  });

  it("should default NPC inventory to empty when no items specified", () => {
    const config = { ...miniConfig };
    const world = buildWorld(config);
    const npc = world.entities.get("npc_01") as NPCEntity;
    expect(npc.inventory).toHaveLength(0);
  });
});
