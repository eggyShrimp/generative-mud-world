import { describe, expect, it } from "vitest";
import { findPath, findWeightedPath, reachableRooms } from "../core/pathfinding.ts";
import { buildWorld } from "../core/world-loader.ts";

const config = {
  name: "path-test",
  seed: "seed",
  era: "stone",
  regions: [
    {
      id: "r" as const,
      name: "测试区",
      dominantCulture: "test",
      prosperity: 50,
      threatLevel: 10,
    },
  ],
  rooms: [
    { id: "a" as const, name: "A", regionId: "r" as const, description: "" },
    { id: "b" as const, name: "B", regionId: "r" as const, description: "" },
    { id: "c" as const, name: "C", regionId: "r" as const, description: "" },
    { id: "d" as const, name: "D", regionId: "r" as const, description: "" },
  ],
  graph: {
    layout: {
      r: {
        rows: 2,
        cols: 2,
        rooms: ["a", "b", "c", "d"],
        defaultDistance: 1,
        defaultTerrain: "plain" as const,
      },
    },
    edges: [
      {
        from: "a",
        to: "d",
        direction: "下",
        distance: 1,
        terrain: "mountain" as const,
        bidirectional: false,
      },
    ],
  },
  players: [{ id: "p1", name: "玩家", roomId: "a" as const }],
};

describe("pathfinding", () => {
  it("should find shortest unweighted path", () => {
    const world = buildWorld(config);
    expect(world.graph).toBeDefined();
    if (!world.graph) return;

    const exits = new Map(Array.from(world.rooms.entries()).map(([id, room]) => [id, room.exits]));
    expect(findPath(world.graph, exits, "a", "d")).toEqual(["a", "d"]);
    expect(findPath(world.graph, exits, "a", "missing")).toBeNull();
  });

  it("should prefer lower terrain cost when weighted", () => {
    const world = buildWorld(config);
    expect(world.graph).toBeDefined();
    if (!world.graph) return;

    const exits = new Map(Array.from(world.rooms.entries()).map(([id, room]) => [id, room.exits]));
    expect(findWeightedPath(world.graph, exits, { plain: 1, mountain: 10 }, "a", "d")).toEqual([
      "a",
      "b",
      "d",
    ]);
  });

  it("should list reachable rooms within max distance", () => {
    const world = buildWorld(config);
    expect(world.graph).toBeDefined();
    if (!world.graph) return;

    const exits = new Map(Array.from(world.rooms.entries()).map(([id, room]) => [id, room.exits]));
    expect(Array.from(reachableRooms(world.graph, exits, "a", 1).entries())).toEqual([
      ["a", 0],
      ["b", 1],
      ["c", 1],
      ["d", 1],
    ]);
  });
});
