import { describe, expect, it } from "vitest";
import type { NPCEntity } from "../core/types.ts";
import { addEntity, addRegion, addRoom, createRoom, createWorld } from "../core/world.ts";
import {
  computeActionWeights,
  decayNeeds,
  defaultNeedValues,
  executeSchedule,
  getNeedDefinition,
  getScheduleForRole,
} from "../simulation/index.ts";

function setupWorld() {
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

  const npc: NPCEntity = {
    id: "npc1",
    name: "老马",
    type: "npc",
    roomId: "tavern",
    description: "勤劳的铁匠",
    npcTier: "core",
    personality: "勤劳",
    mood: 0,
    memories: [],
    needs: [
      { type: "hunger", value: 50, baseUrgency: 5, decayRate: 2 },
      { type: "safety", value: 80, baseUrgency: 3, decayRate: 1 },
    ],
    traits: [{ name: "strength", value: 5 }],
    schedule: [
      {
        startHour: 6,
        endHour: 12,
        action: "work_at_smithy",
        targetRoomId: null,
        priority: 8,
        deviationAllowed: true,
      },
      {
        startHour: 12,
        endHour: 13,
        action: "eat_at_tavern",
        targetRoomId: null,
        priority: 9,
        deviationAllowed: false,
      },
      {
        startHour: 18,
        endHour: 22,
        action: "rest",
        targetRoomId: null,
        priority: 5,
        deviationAllowed: true,
      },
    ],
    relations: [],
    availableActions: [],
    inventory: [],
    combatState: {
      hp: 50,
      maxHp: 50,
      combatTarget: null,
      threatTable: {},
      lastAttackTick: 0,
      isDefending: false,
      isIncapacitated: false,
      incapacitatedUntil: 0,
    },
    equipment: { weapon: null, armor: null },
  };
  addEntity(world, npc);
  return world;
}

describe("executeSchedule", () => {
  it("should apply need deltas for matching schedule entry", () => {
    const world = setupWorld();
    const npc = world.entities.get("npc1") as NPCEntity;
    const delta = executeSchedule(world, npc, 8); // 8am → work_at_smithy
    expect(delta.needChanges).toBeDefined();
    expect(delta.needChanges?.length).toBeGreaterThan(0);
  });

  it("should return empty changes for non-matching hour", () => {
    const world = setupWorld();
    const npc = world.entities.get("npc1") as NPCEntity;
    const delta = executeSchedule(world, npc, 3); // 3am → no schedule
    expect(delta.needChanges).toHaveLength(0);
  });

  it("should handle NPC with no schedule", () => {
    const world = setupWorld();
    const npc = { id: "npc1", schedule: undefined, roomId: "tavern" };
    const delta = executeSchedule(world, npc, 10);
    expect(delta.needChanges).toHaveLength(0);
  });

  it("should apply multiple effects for overlapping schedules", () => {
    const world = setupWorld();
    const npc = world.entities.get("npc1") as NPCEntity;
    // Add overlapping schedule entry in same time range
    npc.schedule?.push({
      startHour: 6,
      endHour: 14,
      action: "eat_at_tavern",
      targetRoomId: null,
      priority: 9,
      deviationAllowed: false,
    });
    const delta = executeSchedule(world, npc, 10); // 10am → work_at_smithy + eat_at_tavern
    expect(delta.needChanges?.length).toBeGreaterThan(1);
  });
});

describe("decayNeeds", () => {
  it("should apply decay rate as negative delta", () => {
    const delta = decayNeeds("npc1", {
      needs: [
        { type: "hunger", value: 50, decayRate: 2 },
        { type: "safety", value: 80, decayRate: 1 },
      ],
    });
    expect(delta.needChanges).toHaveLength(2);
    expect(delta.needChanges?.[0]).toEqual({ targetId: "npc1", needType: "hunger", delta: -2 });
    expect(delta.needChanges?.[1]).toEqual({ targetId: "npc1", needType: "safety", delta: -1 });
  });

  it("should handle empty needs", () => {
    const delta = decayNeeds("npc1", { needs: [] });
    expect(delta.needChanges).toHaveLength(0);
  });
});

describe("computeActionWeights", () => {
  it("should compute base weight + trait bonus", () => {
    const world = setupWorld();
    const npc = world.entities.get("npc1") as NPCEntity;
    const result = computeActionWeights(
      npc,
      [{ type: "work_at_smithy", weight: 10 }],
      world.contentPool,
    );
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("work_at_smithy");
    expect(result[0].finalWeight).toBeGreaterThanOrEqual(10);
  });

  it("should boost weight for urgent needs", () => {
    const world = setupWorld();
    const npc = world.entities.get("npc1") as NPCEntity;
    npc.needs[0].value = 10; // very hungry
    const result = computeActionWeights(
      npc,
      [{ type: "eat_at_tavern", weight: 5 }],
      world.contentPool,
    );
    // urgency = 1 - 10/100 = 0.9, boost = 0.9 * 20 = 18
    expect(result[0].finalWeight).toBeGreaterThan(5);
  });

  it("should not produce negative weights", () => {
    const world = setupWorld();
    const npc = world.entities.get("npc1") as NPCEntity;
    npc.traits = [{ name: "weakness", value: -1000 }];
    const result = computeActionWeights(
      npc,
      [{ type: "work_at_smithy", weight: 1 }],
      world.contentPool,
    );
    expect(result[0].finalWeight).toBe(0);
  });
});

describe("ContentPool query tools", () => {
  it("getScheduleForRole should return schedule for known role", () => {
    const world = setupWorld();
    const pool = world.contentPool;
    if (pool.scheduleTemplates.length > 0) {
      const role = pool.scheduleTemplates[0].role;
      const schedule = getScheduleForRole(pool, role);
      expect(Array.isArray(schedule)).toBe(true);
    }
  });

  it("getScheduleForRole should return empty for unknown role", () => {
    const world = setupWorld();
    const schedule = getScheduleForRole(world.contentPool, "nonexistent");
    expect(schedule).toEqual([]);
  });

  it("getNeedDefinition should find existing need", () => {
    const world = setupWorld();
    const pool = world.contentPool;
    if (pool.needDefinitions.length > 0) {
      const def = getNeedDefinition(pool, pool.needDefinitions[0].type);
      expect(def).toBeDefined();
    }
  });

  it("getNeedDefinition should return undefined for unknown need", () => {
    const world = setupWorld();
    const def = getNeedDefinition(world.contentPool, "nonexistent");
    expect(def).toBeUndefined();
  });

  it("defaultNeedValues should return 70 for all needs", () => {
    const world = setupWorld();
    const defaults = defaultNeedValues(world.contentPool);
    for (const def of world.contentPool.needDefinitions) {
      expect(defaults[def.type]).toBe(70);
    }
  });
});
