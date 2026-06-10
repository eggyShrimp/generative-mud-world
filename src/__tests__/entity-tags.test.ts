import { describe, expect, it } from "vitest";
import type { NPCEntity } from "../core/types.ts";
import {
  addEntity,
  addRegion,
  addRoom,
  createItem,
  createNPC,
  createPlayer,
  createRoom,
  createWorld,
} from "../core/world.ts";

describe("Entity tags — NPCEntity", () => {
  it("createNPC stores tags from overrides", () => {
    const npc = createNPC("n1", { roomId: "r1", tags: ["tavern_keeper"] });
    expect(npc.tags).toEqual(["tavern_keeper"]);
  });

  it("createNPC defaults tags to undefined", () => {
    const npc = createNPC("n1", { roomId: "r1" });
    expect(npc.tags).toBeUndefined();
  });

  it("tags do not affect other NPC fields", () => {
    const npc = createNPC("n1", {
      roomId: "r1",
      tags: ["blacksmith"],
      personality: "固执",
      mood: 30,
    });
    expect(npc.personality).toBe("固执");
    expect(npc.mood).toBe(30);
    expect(npc.tags).toEqual(["blacksmith"]);
    expect(npc.type).toBe("npc");
  });
});

describe("Entity tags — ItemEntity", () => {
  it("createItem stores tags", () => {
    const item = createItem("i1", "锻炉", "test_item", {}, "r1", ["forge", "crafting_station"]);
    expect(item.tags).toEqual(["forge", "crafting_station"]);
  });

  it("createItem defaults tags to undefined", () => {
    const item = createItem("i1", "面包", "test_item", { edible: true }, "r1");
    expect(item.tags).toBeUndefined();
  });
});

describe("Entity tags — world-loader propagation", () => {
  it("NPC with role gets tags from role", () => {
    const world = createWorld();
    addRegion(world, {
      id: "test",
      name: "test",
      dominantCulture: "test",
      prosperity: 50,
      threatLevel: 10,
    });
    const room = createRoom("tavern", "酒馆", "test", "昏暗的酒馆");
    addRoom(world, room);
    const player = createPlayer("p1", "赵行舟", "tavern", world.contentPool);
    addEntity(world, player);

    const npc = createNPC("npc1", {
      name: "老马",
      roomId: "tavern",
      npcTier: "core",
      personality: "热情",
      tags: ["tavern_keeper"],
    });
    addEntity(world, npc);

    expect((world.entities.get("npc1") as NPCEntity).tags).toEqual(["tavern_keeper"]);
  });

  it("NPC without role has undefined tags", () => {
    const npc = createNPC("n1", { roomId: "r1" });
    expect(npc.tags).toBeUndefined();
  });
});
