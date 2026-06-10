import { describe, expect, it } from "vitest";
import {
  addEntity,
  addRegion,
  addRoom,
  createNPC,
  createRoom,
  createWorld,
} from "../core/world.ts";
import { materialize } from "../simulation/materializer.ts";

describe("Materializer", () => {
  it("should create new rooms", () => {
    const world = createWorld();
    addRegion(world, {
      id: "west",
      name: "西境",
      dominantCulture: "农耕",
      prosperity: 50,
      threatLevel: 10,
    });
    addRoom(world, createRoom("tavern", "酒馆", "west", "old tavern"));

    const log = materialize(world, {
      newRooms: [
        {
          name: "新磨坊",
          regionId: "west",
          description: "一座新盖的磨坊",
          terrain: "plain",
          exits: {
            北: { to: "tavern", direction: "北", distance: 1, hidden: false, bidirectional: true },
          },
        },
      ],
    });

    expect(world.rooms.size).toBe(2);
    const room = world.rooms.get("room_新磨坊");
    expect(room).toBeDefined();
    expect(room?.exits.get("北")?.to).toBe("tavern");
    const tavern = world.rooms.get("tavern");
    expect(tavern).toBeDefined();
    expect(tavern?.exits.get("南")?.to).toBe("room_新磨坊"); // bidirectional
    expect(log).toContain("新地点: 新磨坊");
  });

  it("should create new NPCs", () => {
    const world = createWorld();
    addRoom(world, createRoom("tavern", "酒馆", "west", ""));

    materialize(world, {
      newNPCs: [
        {
          name: "王二",
          roomId: "tavern",
          personality: "勤劳",
          npcTier: "regional",
          role: "farmer",
          needs: { hunger: 70, rest: 80 },
        },
      ],
    });

    expect(world.entities.size).toBe(1);
    const npc = world.entities.get("npc_王二");
    expect(npc).toBeDefined();
    expect(npc?.name).toBe("王二");
    expect(npc?.type).toBe("npc");
  });

  it("should create new faction", () => {
    const world = createWorld();
    addRoom(world, createRoom("tavern", "酒馆", "west", ""));
    const npc = createNPC("npc_leader", { name: "首领", roomId: "tavern", npcTier: "core" });
    addEntity(world, npc);

    materialize(world, {
      newFactions: [
        {
          name: "农民互助会",
          leaderNPCId: "npc_leader",
          memberNPCIds: ["npc_leader"],
          goal: "互助自救",
          governanceForm: "民主",
        },
      ],
    });

    const faction = Array.from(world.entities.values()).find((e) => e.type === "faction");
    expect(faction).toBeDefined();
    expect(faction?.name).toBe("农民互助会");
  });

  it("should handle empty mutation", () => {
    const world = createWorld();
    const log = materialize(world, {});
    expect(log).toHaveLength(0);
  });

  it("should create room with terrain", () => {
    const world = createWorld();
    addRegion(world, {
      id: "mountain",
      name: "雪山",
      dominantCulture: "诺德",
      prosperity: 30,
      threatLevel: 80,
    });

    materialize(world, {
      newRooms: [
        {
          name: "峰顶",
          regionId: "mountain",
          description: "白雪覆盖的山峰",
          terrain: "mountain",
          exits: {},
        },
      ],
    });

    const room = world.rooms.get("room_峰顶");
    expect(room).toBeDefined();
    expect(room?.terrain).toBe("mountain");
  });

  it("should preserve exit properties (distance, terrain, hidden)", () => {
    const world = createWorld();
    addRegion(world, {
      id: "test",
      name: "test",
      dominantCulture: "test",
      prosperity: 50,
      threatLevel: 10,
    });
    addRoom(world, createRoom("tavern", "酒馆", "test", ""));

    materialize(world, {
      newRooms: [
        {
          name: "山洞",
          regionId: "test",
          description: "阴暗的山洞",
          terrain: "cave",
          exits: {
            北: {
              to: "tavern",
              direction: "北",
              distance: 5,
              terrain: "cave",
              hidden: false,
              bidirectional: true,
            },
          },
        },
      ],
    });

    const exit = world.rooms.get("room_山洞")?.exits.get("北");
    expect(exit).toBeDefined();
    expect(exit?.to).toBe("tavern");
    expect(exit?.distance).toBe(5);
    expect(exit?.terrain).toBe("cave");
  });

  it("should not create reverse edge for bidirectional=false", () => {
    const world = createWorld();
    addRegion(world, {
      id: "test",
      name: "test",
      dominantCulture: "test",
      prosperity: 50,
      threatLevel: 10,
    });
    addRoom(world, createRoom("cliff", "悬崖", "test", ""));
    addRoom(world, createRoom("valley", "谷底", "test", ""));

    materialize(world, {
      newRooms: [
        {
          name: "崖边",
          regionId: "test",
          description: "悬崖边缘",
          terrain: "mountain",
          exits: {
            下: {
              to: "valley",
              direction: "下",
              distance: 3,
              hidden: false,
              bidirectional: false,
              description: "纵身跳下",
            },
          },
        },
      ],
    });

    const room = world.rooms.get("room_崖边");
    expect(room).toBeDefined();
    expect(room?.exits.has("下")).toBe(true);
    expect(room?.exits.get("下")?.description).toBe("纵身跳下");
    // 反向边不应生成
    expect(world.rooms.get("valley")?.exits.has("上")).toBe(false);
  });
});
