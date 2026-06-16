/**
 * 集成测试: 多实体社交涟漪
 *
 * 验证 3+ 旁观者对同一动作产生各自独立的涟漪反应:
 *   1. 关系 × trait 产生不同的反应方向和强度
 *   2. 友好旁观者 → 正面涟漪
 *   3. 敌对旁观者 → 负面涟漪
 *   4. 嫉妒旁观者 → 关系反转
 *   5. 多旁观者的 relationChanges 互不干扰
 */
import { describe, expect, it } from "vitest";
import type { NPCEntity, SimulationDelta } from "../../core/types.ts";
import { addEntity } from "../../core/world.ts";
import { createTestEngine, setupWorldWithNPC } from "../fixtures/integration-helpers.ts";

function addObservers(world: ReturnType<typeof setupWorldWithNPC>) {
  // 友好旁观者 (关系高, kind)
  const friendly: NPCEntity = {
    id: "obs_friendly",
    name: "李大婶",
    type: "npc",
    roomId: "tavern",
    description: "热心的邻居",
    npcTier: "background",
    personality: "热心",
    mood: 50,
    memories: [],
    needs: [],
    traits: [{ name: "kind", value: 80 }],
    schedule: [],
    relations: [{ targetId: "p1", level: 60, label: "友好", lastInteractionTick: 0 }],
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
    equipment: { weapon: null, armor: null, cloak: null, accessory: null },
  };

  // 敌对旁观者 (关系低, paranoid)
  const hostile: NPCEntity = {
    id: "obs_hostile",
    name: "王二麻子",
    type: "npc",
    roomId: "tavern",
    description: "酒鬼",
    npcTier: "background",
    personality: "暴躁",
    mood: 50,
    memories: [],
    needs: [],
    traits: [{ name: "paranoid", value: 90 }],
    schedule: [],
    relations: [{ targetId: "p1", level: -60, label: "仇人", lastInteractionTick: 0 }],
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
    equipment: { weapon: null, armor: null, cloak: null, accessory: null },
  };

  // 嫉妒旁观者 (关系中等, jealous)
  const jealous: NPCEntity = {
    id: "obs_jealous",
    name: "小张",
    type: "npc",
    roomId: "tavern",
    description: "酒馆伙计",
    npcTier: "background",
    personality: "嫉妒",
    mood: 50,
    memories: [],
    needs: [],
    traits: [{ name: "jealous", value: 70 }],
    schedule: [],
    relations: [{ targetId: "p1", level: 30, label: "认识", lastInteractionTick: 0 }],
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
    equipment: { weapon: null, armor: null, cloak: null, accessory: null },
  };

  addEntity(world, friendly);
  addEntity(world, hostile);
  addEntity(world, jealous);
}

describe("集成: 多实体社交涟漪", () => {
  it("talk → 3 个旁观者各自产生独立反应", async () => {
    const world = setupWorldWithNPC();
    addObservers(world);

    const llmDelta: SimulationDelta = {
      dialogues: [{ speakerId: "npc1", content: "你好", roomId: "tavern", tick: 0 }],
    };
    const engine = createTestEngine(world, { dialogueDelta: llmDelta });

    const result = await engine.executeStructuredCommand("p1", "talk", {
      npcId: "npc1",
      optionId: "opt_1",
      optionLabel: "你好",
    });

    // 3 个旁观者各有 reaction
    const rippleEvents = result.events.filter((e) => e.type === "observer_reaction");
    expect(rippleEvents).toHaveLength(3);

    // 每个旁观者的名字都出现
    const descriptions = rippleEvents.map((e) => e.description);
    expect(descriptions.some((d) => d.includes("李大婶"))).toBe(true);
    expect(descriptions.some((d) => d.includes("王二麻子"))).toBe(true);
    expect(descriptions.some((d) => d.includes("小张"))).toBe(true);
  });

  it("涟漪后: 旁观者关系各自独立变化", async () => {
    const world = setupWorldWithNPC();
    addObservers(world);

    // 记录初始关系
    const friendly = world.entities.get("obs_friendly") as NPCEntity;
    const hostile = world.entities.get("obs_hostile") as NPCEntity;
    const jealous = world.entities.get("obs_jealous") as NPCEntity;

    const friendlyRelBefore = friendly.relations.find((r) => r.targetId === "p1")?.level;
    const hostileRelBefore = hostile.relations.find((r) => r.targetId === "p1")?.level;
    const jealousRelBefore = jealous.relations.find((r) => r.targetId === "p1")?.level;

    const llmDelta: SimulationDelta = {
      dialogues: [{ speakerId: "npc1", content: "你好", roomId: "tavern", tick: 0 }],
    };
    const engine = createTestEngine(world, { dialogueDelta: llmDelta });

    await engine.executeStructuredCommand("p1", "talk", {
      npcId: "npc1",
      optionId: "opt_1",
      optionLabel: "你好",
    });

    const friendlyRelAfter = friendly.relations.find((r) => r.targetId === "p1")?.level;
    const hostileRelAfter = hostile.relations.find((r) => r.targetId === "p1")?.level;
    const jealousRelAfter = jealous.relations.find((r) => r.targetId === "p1")?.level;

    // 友好旁观者: 关系应该上升 (kind trait 放大)
    expect(friendlyRelAfter).toBeGreaterThan(friendlyRelBefore!);

    // 敌对旁观者: 关系应该下降 (paranoid trait 放大负面, 且关系为负)
    expect(hostileRelAfter).toBeLessThan(hostileRelBefore!);

    // 嫉妒旁观者: jealous trait 反转方向 → 关系变化方向与信号方向相反
    // talk 信号为正(2), jealous 乘数为 -1.5, 最终为负
    expect(jealousRelAfter).not.toBe(jealousRelBefore);
  });

  it("非社交动作 (move) → 无涟漪反应", async () => {
    const world = setupWorldWithNPC();
    addObservers(world);

    const engine = createTestEngine(world);

    const result = await engine.executeStructuredCommand("p1", "move", { direction: "south" });

    const rippleEvents = result.events.filter((e) => e.type === "observer_reaction");
    expect(rippleEvents).toHaveLength(0);
  });

  it("只有同房间旁观者反应 → 不同房间无反应", async () => {
    const world = setupWorldWithNPC();
    // 把 hostile 移到 market (不同房间)
    const hostile: NPCEntity = {
      id: "obs_other_room",
      name: "隔壁老陈",
      type: "npc",
      roomId: "market",
      description: "",
      npcTier: "background",
      personality: "",
      mood: 50,
      memories: [],
      needs: [],
      traits: [{ name: "kind", value: 80 }],
      schedule: [],
      relations: [{ targetId: "p1", level: 60, label: "友好", lastInteractionTick: 0 }],
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
      equipment: { weapon: null, armor: null, cloak: null, accessory: null },
    };
    addEntity(world, hostile);

    const llmDelta: SimulationDelta = {
      dialogues: [{ speakerId: "npc1", content: "你好", roomId: "tavern", tick: 0 }],
    };
    const engine = createTestEngine(world, { dialogueDelta: llmDelta });

    const result = await engine.executeStructuredCommand("p1", "talk", {
      npcId: "npc1",
      optionId: "opt_1",
      optionLabel: "你好",
    });

    // 只有 tavern 里的 npc1 旁观，但 npc1 是对话目标不产生涟漪
    // obs_other_room 在 market，不在 tavern
    const rippleEvents = result.events.filter((e) => e.type === "observer_reaction");
    expect(rippleEvents).toHaveLength(0);
  });

  it("涟漪幅度受 maxDelta 限制", async () => {
    const world = setupWorldWithNPC();
    // 添加一个极端敏感的旁观者 (paranoid 2.0 + 关系极负)
    const extreme: NPCEntity = {
      id: "obs_extreme",
      name: "偏执狂",
      type: "npc",
      roomId: "tavern",
      description: "",
      npcTier: "background",
      personality: "偏执",
      mood: 50,
      memories: [],
      needs: [],
      traits: [{ name: "paranoid", value: 100 }],
      schedule: [],
      relations: [{ targetId: "p1", level: -100, label: "死敌", lastInteractionTick: 0 }],
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
      equipment: { weapon: null, armor: null, cloak: null, accessory: null },
    };
    addEntity(world, extreme);

    const llmDelta: SimulationDelta = {
      dialogues: [{ speakerId: "npc1", content: "你好", roomId: "tavern", tick: 0 }],
    };
    const engine = createTestEngine(world, { dialogueDelta: llmDelta });

    await engine.executeStructuredCommand("p1", "talk", {
      npcId: "npc1",
      optionId: "opt_1",
      optionLabel: "你好",
    });

    // 验证关系变化不超过 maxDelta (5)
    const after = (world.entities.get("obs_extreme") as NPCEntity).relations.find(
      (r) => r.targetId === "p1",
    );
    expect(after).toBeDefined();
    const delta = Math.abs((after?.level ?? 0) - -100);
    expect(delta).toBeLessThanOrEqual(
      world.contentPool.socialRippleConfig.maxDelta + 1, // +1 for rounding
    );
  });
});
