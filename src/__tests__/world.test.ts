import { describe, expect, it } from "vitest";
import {
  addEntity,
  addRoom,
  applyDelta,
  createNPC,
  createPlayer,
  createRoom,
  createWorld,
  initializePlayer,
  moveEntity,
} from "../core/world";
import { applyDeltaFields } from "../engine/delta-registry.ts";

describe("WorldState", () => {
  it("should create an empty world with ContentPool", () => {
    const world = createWorld();
    expect(world.entities.size).toBe(0);
    expect(world.rooms.size).toBe(0);
    expect(world.round).toBe(0);
    expect(world.contentPool.needDefinitions.length).toBeGreaterThan(0);
    expect(world.contentPool.actionEffects.length).toBeGreaterThan(0);
  });

  it("should add and retrieve entities", () => {
    const world = createWorld();
    const room = createRoom("room_01", "测试房间", "test", "一个测试房间");
    addRoom(world, room);
    const npc = createNPC("npc_01", { name: "测试NPC", roomId: "room_01" });
    addEntity(world, npc);
    expect(world.entities.size).toBe(1);
    const room1 = world.rooms.get("room_01");
    expect(room1).toBeDefined();
    expect(room1?.entities.has("npc_01")).toBe(true);
  });

  it("should move entity between rooms", () => {
    const world = createWorld();
    addRoom(world, createRoom("room_a", "A", "test", ""));
    addRoom(world, createRoom("room_b", "B", "test", ""));
    const npc = createNPC("npc_01", { roomId: "room_a" });
    addEntity(world, npc);
    moveEntity(world, "npc_01", "room_b");
    expect(npc.roomId).toBe("room_b");
    const roomA = world.rooms.get("room_a");
    const roomB = world.rooms.get("room_b");
    expect(roomA).toBeDefined();
    expect(roomB).toBeDefined();
    expect(roomA?.entities.has("npc_01")).toBe(false);
    expect(roomB?.entities.has("npc_01")).toBe(true);
  });

  it("should apply SimulationDelta to NPC needs", () => {
    const world = createWorld();
    const npc = createNPC("npc_01", {
      needs: [{ type: "hunger", value: 50, baseUrgency: 0.5, decayRate: 5 }],
    });
    addEntity(world, npc);
    applyDelta(world, {
      needChanges: [{ targetId: "npc_01", needType: "hunger", delta: 30 }],
    });
    expect(npc.needs[0].value).toBe(80);
  });

  it("should apply SimulationDelta to NPC traits", () => {
    const world = createWorld();
    const npc = createNPC("npc_01", {
      traits: [{ name: "brave", value: 30 }],
    });
    addEntity(world, npc);
    applyDelta(world, {
      traitModifiers: [{ targetId: "npc_01", trait: "brave", delta: 15 }],
    });
    expect(npc.traits[0].value).toBe(45);
  });

  it("should apply SimulationDelta to relations", () => {
    const world = createWorld();
    const npc = createNPC("npc_01", { relations: [] });
    addEntity(world, npc);
    applyDelta(world, {
      relationChanges: [{ fromId: "npc_01", toId: "npc_02", delta: 20, newLabel: "朋友" }],
    });
    expect(npc.relations).toHaveLength(1);
    expect(npc.relations[0].level).toBe(20);
    expect(npc.relations[0].label).toBe("朋友");
  });

  it("should fill missing relation label from ContentPool", () => {
    const world = createWorld();
    const npc = createNPC("npc_01", { relations: [] });
    addEntity(world, npc);
    applyDelta(world, {
      relationChanges: [{ fromId: "npc_01", toId: "npc_02", delta: 40 }],
    });
    expect(npc.relations[0].label).toBe("普通");
  });

  it("should repair empty relation label when relation changes", () => {
    const world = createWorld();
    const npc = createNPC("npc_01", {
      relations: [{ targetId: "npc_02", level: 20, label: "", lastInteractionTick: 0 }],
    });
    addEntity(world, npc);
    applyDelta(world, {
      relationChanges: [{ fromId: "npc_01", toId: "npc_02", delta: 20 }],
    });
    expect(npc.relations[0].label).toBe("普通");
  });

  it("should fill relation labels through delta registry", () => {
    const world = createWorld();
    const npc = createNPC("npc_01", { relations: [] });
    const target = createNPC("npc_02", { relations: [] });
    addEntity(world, npc);
    addEntity(world, target);
    applyDeltaFields(world, {
      relationChanges: [{ fromId: "npc_01", toId: "npc_02", delta: 60 }],
    });
    expect(npc.relations[0].label).toBe("友好");
  });

  it("should discover starting room on initializePlayer", () => {
    const world = createWorld();
    addRoom(world, createRoom("room_01", "大厅", "test", "描述"));
    addRoom(world, createRoom("room_02", "营地", "test", "描述"));
    const player = createPlayer("p1", "玩家", "room_01");
    addEntity(world, player);
    expect(player.knownRooms).toHaveLength(0);
    initializePlayer(world, player);
    expect(player.knownRooms).toContain("room_01");
    expect(player.knownRooms).toHaveLength(1);
  });

  it("should apply SimulationDelta to player traits", () => {
    const world = createWorld();
    const player = createPlayer("p1", "玩家", "", undefined, undefined, [
      { name: "brave", value: 30 },
    ]);
    addEntity(world, player);
    applyDelta(world, {
      traitModifiers: [{ targetId: "p1", trait: "brave", delta: 15 }],
    });
    expect(player.traits[0].value).toBe(45);
  });

  it("should create new trait on player via traitModifiers", () => {
    const world = createWorld();
    const player = createPlayer("p1", "玩家", "");
    addEntity(world, player);
    expect(player.traits).toHaveLength(0);
    applyDelta(world, {
      traitModifiers: [{ targetId: "p1", trait: "国王", delta: 50 }],
    });
    expect(player.traits).toHaveLength(1);
    expect(player.traits[0].name).toBe("国王");
    expect(player.traits[0].value).toBe(50);
  });

  it("should create player with empty traits by default", () => {
    const player = createPlayer("p1", "玩家", "");
    expect(player.traits).toEqual([]);
  });

  it("should create player with specified traits", () => {
    const player = createPlayer("p1", "玩家", "", undefined, undefined, [
      { name: "国王", value: 80 },
      { name: "勇敢", value: 60 },
    ]);
    expect(player.traits).toHaveLength(2);
    expect(player.traits[0].name).toBe("国王");
    expect(player.traits[1].name).toBe("勇敢");
  });
});
