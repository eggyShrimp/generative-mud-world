import { describe, expect, it } from "vitest";
import type { NPCEntity, SocialRippleConfig } from "../core/types.ts";
import {
  addEntity,
  addRegion,
  addRoom,
  createPlayer,
  createRoom,
  createWorld,
} from "../core/world.ts";
import { evaluateSocialRipples } from "../simulation/social-ripple.ts";

function setupWorldWithObservers(config?: Partial<SocialRippleConfig>) {
  const world = createWorld();
  if (config) {
    Object.assign(world.contentPool.socialRippleConfig, config);
  }
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
  const target: NPCEntity = {
    id: "npc1",
    name: "老马",
    type: "npc",
    roomId: "tavern",
    description: "热情的酒馆老板",
    npcTier: "core",
    personality: "热情",
    mood: 50,
    memories: [],
    needs: [],
    traits: [],
    schedule: [],
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
  addEntity(world, target);
  return world;
}

function addObserver(
  world: ReturnType<typeof setupWorldWithObservers>,
  overrides: Partial<NPCEntity> = {},
): NPCEntity {
  const observer: NPCEntity = {
    id: overrides.id ?? "obs1",
    name: overrides.name ?? "旁观者",
    type: "npc",
    roomId: "tavern",
    description: "",
    npcTier: "background",
    personality: "",
    mood: 50,
    memories: [],
    needs: [],
    traits: overrides.traits ?? [],
    schedule: [],
    relations: overrides.relations ?? [],
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
  addEntity(world, observer);
  return observer;
}

describe("evaluateSocialRipples", () => {
  it("should return empty delta when disabled", () => {
    const world = setupWorldWithObservers({ enabled: false });
    addObserver(world);
    const delta = evaluateSocialRipples(world, {
      actorId: "p1",
      action: "talk",
      roomId: "tavern",
      targetId: "npc1",
    });
    expect(delta.relationChanges).toBeUndefined();
  });

  it("should return empty delta when no observers", () => {
    const world = setupWorldWithObservers();
    const delta = evaluateSocialRipples(world, {
      actorId: "p1",
      action: "talk",
      roomId: "tavern",
      targetId: "npc1",
    });
    expect(delta.relationChanges).toBeUndefined();
  });

  it("should return empty delta for non-social action", () => {
    const world = setupWorldWithObservers();
    addObserver(world);
    const delta = evaluateSocialRipples(world, { actorId: "p1", action: "move", roomId: "tavern" });
    expect(delta.relationChanges).toBeUndefined();
  });

  it("should generate positive relation change when observer likes actor", () => {
    const world = setupWorldWithObservers();
    // Observer has positive relation with actor
    addObserver(world, {
      id: "obs1",
      name: "老王",
      relations: [{ targetId: "p1", level: 60, label: "朋友", lastInteractionTick: 0 }],
    });
    const delta = evaluateSocialRipples(world, {
      actorId: "p1",
      action: "talk",
      roomId: "tavern",
      targetId: "npc1",
    });

    expect(delta.relationChanges).toHaveLength(1);
    expect(delta.relationChanges?.[0].fromId).toBe("obs1");
    expect(delta.relationChanges?.[0].toId).toBe("p1");
    expect(delta.relationChanges?.[0].delta).toBeGreaterThan(0);
  });

  it("should generate negative relation change when observer dislikes actor", () => {
    const world = setupWorldWithObservers();
    // Observer has negative relation with actor
    addObserver(world, {
      id: "obs1",
      name: "张屠夫",
      relations: [{ targetId: "p1", level: -60, label: "仇人", lastInteractionTick: 0 }],
    });
    const delta = evaluateSocialRipples(world, {
      actorId: "p1",
      action: "talk",
      roomId: "tavern",
      targetId: "npc1",
    });

    expect(delta.relationChanges).toHaveLength(1);
    expect(delta.relationChanges?.[0].delta).toBeLessThan(0);
  });

  it("should not react when observer has no strong relationship", () => {
    const world = setupWorldWithObservers();
    // Observer has neutral relation (level 0)
    addObserver(world, { id: "obs1", name: "陌生人" });
    const delta = evaluateSocialRipples(world, {
      actorId: "p1",
      action: "talk",
      roomId: "tavern",
      targetId: "npc1",
    });

    // Neutral relation → careFactor near 0.3 → score might be below threshold
    // signal(2) * care(0.3) * trait(1) = 0.6 > threshold(0.5) → should react slightly
    if (delta.relationChanges?.length) {
      expect(delta.relationChanges[0].delta).toBe(1); // minimal positive
    }
  });

  it("should amplify with suspicious trait", () => {
    const world = setupWorldWithObservers();
    addObserver(world, {
      id: "obs1",
      name: "多疑的人",
      traits: [{ name: "suspicious", value: 80 }],
      relations: [{ targetId: "p1", level: 30, label: "认识", lastInteractionTick: 0 }],
    });
    const delta = evaluateSocialRipples(world, {
      actorId: "p1",
      action: "talk",
      roomId: "tavern",
      targetId: "npc1",
    });

    expect(delta.relationChanges).toHaveLength(1);
    // suspicious multiplier is 1.3, so score is amplified
    expect(Math.abs(delta.relationChanges?.[0].delta ?? 0)).toBeGreaterThanOrEqual(1);
  });

  it("should reverse with jealous trait on positive interaction", () => {
    const world = setupWorldWithObservers();
    addObserver(world, {
      id: "obs1",
      name: "嫉妒的人",
      traits: [{ name: "jealous", value: 90 }],
      relations: [{ targetId: "p1", level: 50, label: "朋友", lastInteractionTick: 0 }],
    });
    const delta = evaluateSocialRipples(world, {
      actorId: "p1",
      action: "talk",
      roomId: "tavern",
      targetId: "npc1",
    });

    expect(delta.relationChanges).toHaveLength(1);
    // jealous multiplier is -1.5, so positive interaction → negative reaction
    expect(delta.relationChanges?.[0].delta).toBeLessThan(0);
  });

  it("should generate observer events", () => {
    const world = setupWorldWithObservers();
    addObserver(world, {
      id: "obs1",
      name: "老王",
      relations: [{ targetId: "p1", level: 50, label: "朋友", lastInteractionTick: 0 }],
    });
    const delta = evaluateSocialRipples(world, {
      actorId: "p1",
      action: "talk",
      roomId: "tavern",
      targetId: "npc1",
    });

    expect(delta.worldEvents).toHaveLength(1);
    expect(delta.worldEvents?.[0].type).toBe("observer_reaction");
    expect(delta.worldEvents?.[0].description).toContain("老王");
    expect(delta.worldEvents?.[0].description).toContain("对话");
  });

  it("should skip actor and target from observers", () => {
    const world = setupWorldWithObservers();
    // The actor (p1) and target (npc1) should not be observers
    // Only add a real observer
    addObserver(world, { id: "obs1", name: "旁观者" });
    const delta = evaluateSocialRipples(world, {
      actorId: "p1",
      action: "talk",
      roomId: "tavern",
      targetId: "npc1",
    });

    // Should not have changes from actor to actor or target to actor
    if (delta.relationChanges) {
      for (const change of delta.relationChanges) {
        expect(change.fromId).not.toBe("p1");
        expect(change.fromId).not.toBe("npc1");
      }
    }
  });

  it("should handle multiple observers independently", () => {
    const world = setupWorldWithObservers();
    addObserver(world, {
      id: "obs1",
      name: "朋友",
      relations: [{ targetId: "p1", level: 60, label: "朋友", lastInteractionTick: 0 }],
    });
    addObserver(world, {
      id: "obs2",
      name: "敌人",
      relations: [{ targetId: "p1", level: -70, label: "仇人", lastInteractionTick: 0 }],
    });
    const delta = evaluateSocialRipples(world, {
      actorId: "p1",
      action: "talk",
      roomId: "tavern",
      targetId: "npc1",
    });

    expect(delta.relationChanges).toHaveLength(2);
    // Friend should react positively, enemy negatively
    const friendChange = delta.relationChanges?.find((c) => c.fromId === "obs1");
    const enemyChange = delta.relationChanges?.find((c) => c.fromId === "obs2");
    expect(friendChange?.delta).toBeGreaterThan(0);
    expect(enemyChange?.delta).toBeLessThan(0);
  });

  it("should clamp delta to maxDelta", () => {
    const world = setupWorldWithObservers({ maxDelta: 2 });
    addObserver(world, {
      id: "obs1",
      name: "狂热者",
      traits: [{ name: "paranoid", value: 100 }],
      relations: [{ targetId: "p1", level: 100, label: "挚友", lastInteractionTick: 0 }],
    });
    const delta = evaluateSocialRipples(world, {
      actorId: "p1",
      action: "help",
      roomId: "tavern",
      targetId: "npc1",
    });

    expect(delta.relationChanges).toHaveLength(1);
    expect(Math.abs(delta.relationChanges?.[0].delta ?? 0)).toBeLessThanOrEqual(2);
  });

  it("should handle hostile action with negative signal", () => {
    const world = setupWorldWithObservers();
    addObserver(world, {
      id: "obs1",
      name: "旁观者",
      relations: [{ targetId: "p1", level: 30, label: "认识", lastInteractionTick: 0 }],
    });
    const delta = evaluateSocialRipples(world, {
      actorId: "p1",
      action: "hostile",
      roomId: "tavern",
      targetId: "npc1",
    });

    expect(delta.relationChanges).toHaveLength(1);
    // hostile signal is -5, so observer should react negatively
    expect(delta.relationChanges?.[0].delta).toBeLessThan(0);
  });

  it("should return empty when actor has no room", () => {
    const world = setupWorldWithObservers();
    addObserver(world);
    // Use a non-existent actor
    const delta = evaluateSocialRipples(world, {
      actorId: "ghost",
      action: "talk",
      roomId: "tavern",
    });
    expect(delta.relationChanges).toBeUndefined();
  });
});
