/**
 * P2 测试 — 战斗引擎
 *
 * 覆盖:
 *   1. 公式推导 (deriveAtk/Def/Spd)
 *   2. 伤害计算 (computeDamage)
 *   3. 逃跑判定 (checkFlee)
 *   4. 攻击结算 (resolveAttack)
 *   5. 战斗脉搏 (executeCombatPulse)
 *   6. NPC AI (selectCombatTarget, shouldFlee)
 *   7. 虚弱/死亡 (checkIncapacitation, applyIncapacitation, handleNpcDeath)
 */

import { describe, expect, it, vi } from "vitest";
import { selectCombatTarget, shouldFlee } from "../combat/ai.ts";
import {
  checkFlee,
  computeDamage,
  deriveAtk,
  deriveDef,
  deriveSpd,
  getArmorBonus,
  getWeaponBonus,
} from "../combat/formulas.ts";
import {
  applyIncapacitation,
  applyRecovery,
  checkIncapacitation,
  checkRecovery,
  handleNpcDeath,
} from "../combat/incapacitation.ts";
import { executeCombatPulse, resolveCombatConsequences, shouldPulse } from "../combat/pulse.ts";
import { resolveAttack } from "../combat/resolver.ts";
import type { NPCEntity, PlayerEntity } from "../core/types.ts";
import {
  addEntity,
  addRoom,
  createNPC,
  createPlayer,
  createRoom,
  createWorld,
} from "../core/world.ts";

const config = createWorld().contentPool.combatConfig;
const combatTemplates = createWorld().contentPool.narrativeTemplates.combatTemplates;

function makeCombatNPC(overrides: Partial<NPCEntity> = {}): NPCEntity {
  const id = (overrides.id as string) ?? "npc_01";
  const npc = createNPC(id, { name: "山贼", roomId: "room_01", ...overrides });
  npc.combatState.maxHp = npc.combatState.hp;
  return npc;
}

function makeCombatPlayer(overrides: Partial<PlayerEntity> = {}): PlayerEntity {
  const player = createPlayer("player_01", "冒险者", "room_01", undefined, undefined, [
    { name: "combat_skill", value: 20 },
    { name: "strength", value: 10 },
    { name: "endurance", value: 10 },
    { name: "agility", value: 10 },
  ]);
  if (overrides.combatState) {
    player.combatState = overrides.combatState;
  }
  player.combatState.maxHp = player.combatState.hp;
  return player;
}

// ── 公式推导 ──

describe("combat formulas", () => {
  it("deriveAtk: 从 traits 计算攻击值", () => {
    const npc = makeCombatNPC({
      traits: [
        { name: "combat_skill", value: 20 },
        { name: "strength", value: 10 },
      ],
    });
    const atk = deriveAtk(npc, config);
    // baseAtk(5) + skill(20)*0.4 + strength(10)*0.3 = 5 + 8 + 3 = 16
    expect(atk).toBe(16);
  });

  it("deriveDef: 从 traits 计算防御值", () => {
    const npc = makeCombatNPC({
      traits: [
        { name: "combat_skill", value: 20 },
        { name: "endurance", value: 10 },
      ],
    });
    const def = deriveDef(npc, config);
    // baseDef(3) + skill(20)*0.2 + endurance(10)*0.3 = 3 + 4 + 3 = 10
    expect(def).toBe(10);
  });

  it("deriveDef: 防守姿态 +5 DEF", () => {
    const npc = makeCombatNPC({
      traits: [
        { name: "combat_skill", value: 20 },
        { name: "endurance", value: 10 },
      ],
    });
    npc.combatState.isDefending = true;
    const def = deriveDef(npc, config);
    expect(def).toBe(15); // 10 + 5
  });

  it("deriveSpd: 从 traits 计算速度值", () => {
    const npc = makeCombatNPC({
      traits: [
        { name: "combat_skill", value: 20 },
        { name: "agility", value: 10 },
      ],
    });
    const spd = deriveSpd(npc, config);
    // baseSpd(5) + skill(20)*0.2 + agility(10)*0.3 = 5 + 4 + 3 = 12
    expect(spd).toBe(12);
  });

  it("无 traits 时返回基线值", () => {
    const npc = makeCombatNPC({ traits: [] });
    expect(deriveAtk(npc, config)).toBe(5); // baseAtk
    expect(deriveDef(npc, config)).toBe(3); // baseDef
    expect(deriveSpd(npc, config)).toBe(5); // baseSpd
  });

  it("getWeaponBonus: 无装备返回 0", () => {
    const player = makeCombatPlayer();
    expect(getWeaponBonus(player)).toBe(0);
  });

  it("getArmorBonus: 无装备返回 0", () => {
    const player = makeCombatPlayer();
    expect(getArmorBonus(player)).toBe(0);
  });
});

// ── 伤害计算 ──

describe("computeDamage", () => {
  it("基础伤害: atk=10 def=5", () => {
    // mock Math.random to avoid variance
    const spy = vi.spyOn(Math, "random");
    spy.mockReturnValueOnce(0.5); // variance: factor = 1.0
    spy.mockReturnValueOnce(0.5); // crit check: not crit

    const result = computeDamage(10, 5, config);
    // raw = 10*1.0 - 5*0.6 = 7.0
    expect(result.raw).toBe(7);
    expect(result.final).toBe(7);
    expect(result.isCrit).toBe(false);

    spy.mockRestore();
  });

  it("暴击时 final = raw * critMultiplier", () => {
    const spy = vi.spyOn(Math, "random");
    spy.mockReturnValueOnce(0.5); // variance
    spy.mockReturnValueOnce(0.01); // crit (低于 0.1)

    const result = computeDamage(10, 5, config);
    expect(result.isCrit).toBe(true);
    expect(result.final).toBe(Math.round(7 * 1.5)); // 10 or 11

    spy.mockRestore();
  });

  it("伤害不低于 minDamage", () => {
    const spy = vi.spyOn(Math, "random");
    spy.mockReturnValueOnce(0.5);
    spy.mockReturnValueOnce(0.5);

    const result = computeDamage(1, 100, config);
    expect(result.final).toBeGreaterThanOrEqual(config.minDamage);

    spy.mockRestore();
  });

  it("damageVariance 产生随机浮动", () => {
    // 不 mock random，测试多次计算有不同结果
    const results = new Set<number>();
    for (let i = 0; i < 20; i++) {
      results.add(computeDamage(10, 5, config).raw);
    }
    // 至少有 2 种不同结果（概率极高）
    expect(results.size).toBeGreaterThan(1);
  });
});

// ── 逃跑判定 ──

describe("checkFlee", () => {
  it("速度优势越大越容易逃跑", () => {
    const fleer = makeCombatNPC({
      id: "fleer",
      traits: [
        { name: "combat_skill", value: 50 },
        { name: "agility", value: 50 },
      ],
    });
    const opponent = makeCombatNPC({ id: "opponent", traits: [] });

    let successCount = 0;
    for (let i = 0; i < 100; i++) {
      if (checkFlee(fleer, opponent, config)) successCount++;
    }
    // 高速 vs 低速，成功率应该远高于 50%
    expect(successCount).toBeGreaterThan(60);
  });

  it("速度劣势时逃跑更困难", () => {
    const fleer = makeCombatNPC({ id: "fleer", traits: [] });
    const opponent = makeCombatNPC({
      id: "opponent",
      traits: [
        { name: "combat_skill", value: 50 },
        { name: "agility", value: 50 },
      ],
    });

    let successCount = 0;
    for (let i = 0; i < 100; i++) {
      if (checkFlee(fleer, opponent, config)) successCount++;
    }
    expect(successCount).toBeLessThan(40);
  });
});

// ── 攻击结算 ──

describe("resolveAttack", () => {
  it("返回正确的 AttackResult 结构", () => {
    const attacker = makeCombatNPC({
      id: "attacker",
      traits: [
        { name: "combat_skill", value: 20 },
        { name: "strength", value: 10 },
      ],
    });
    const defender = makeCombatNPC({
      id: "defender",
      traits: [
        { name: "combat_skill", value: 10 },
        { name: "endurance", value: 5 },
      ],
    });

    const result = resolveAttack(attacker, defender, config, combatTemplates);
    expect(result.damage).toBeGreaterThan(0);
    expect(result.hpChange.targetId).toBe("defender");
    expect(result.hpChange.delta).toBeLessThan(0);
    expect(result.needChange.targetId).toBe("attacker");
    expect(result.needChange.needType).toBe("rest");
    expect(result.event.type).toMatch(/^combat_(hit|crit)$/);
    expect(result.event.description).toContain("造成了");
  });

  it("防守姿态减伤 50%", () => {
    const attacker = makeCombatNPC({ id: "attacker", traits: [] });
    const defender = makeCombatNPC({ id: "defender", traits: [] });
    defender.combatState.isDefending = true;

    // mock random to get consistent results
    const spy = vi.spyOn(Math, "random");
    spy.mockReturnValue(0.5);

    const result = resolveAttack(attacker, defender, config, combatTemplates);
    const normalResult = resolveAttack(
      attacker,
      { ...defender, combatState: { ...defender.combatState, isDefending: false } },
      config,
      combatTemplates,
    );

    expect(result.damage).toBeLessThanOrEqual(normalResult.damage);
    spy.mockRestore();
  });
});

// ── 战斗脉搏 ──

describe("executeCombatPulse", () => {
  it("非 pulse tick 返回空结果", () => {
    const world = createWorld();
    world.tick = 1; // pulseInterval=3, 1%3≠0
    const result = executeCombatPulse(world, config);
    expect(result.deltas).toHaveLength(0);
    expect(result.events).toHaveLength(0);
  });

  it("pulse tick 时结算战斗", () => {
    const world = createWorld();
    world.tick = 3;
    const room = createRoom("room_01", "测试", "test", "");
    addRoom(world, room);

    const npc = makeCombatNPC({
      id: "npc_01",
      traits: [
        { name: "combat_skill", value: 20 },
        { name: "strength", value: 10 },
      ],
    });
    const player = makeCombatPlayer();
    player.combatState.combatTarget = "npc_01";
    npc.combatState.combatTarget = "player_01";
    npc.combatState.threatTable = { player_01: 10 };

    addEntity(world, npc);
    addEntity(world, player);

    const result = executeCombatPulse(world, config);
    expect(result.events.length).toBeGreaterThan(0);
    expect(result.deltas.length).toBeGreaterThan(0);
  });

  it("虚弱的 entity 不参与战斗结算", () => {
    const world = createWorld();
    world.tick = 3;
    addRoom(world, createRoom("room_01", "测试", "test", ""));

    const npc = makeCombatNPC();
    npc.combatState.isIncapacitated = true;
    npc.combatState.combatTarget = "player_01";

    const player = makeCombatPlayer();
    player.combatState.combatTarget = "npc_01";

    addEntity(world, npc);
    addEntity(world, player);

    const result = executeCombatPulse(world, config);
    // npc 虚弱不结算，player 的攻击目标是虚弱的 npc 也不结算
    expect(result.deltas).toHaveLength(0);
  });

  it("精力耗尽者被跳过 + 力竭虚弱", () => {
    const world = createWorld();
    world.tick = 3;
    addRoom(world, createRoom("room_01", "测试", "test", ""));

    const npc = makeCombatNPC();
    npc.needs = [{ type: "rest", value: 0, baseUrgency: 0, decayRate: 0 }];
    npc.combatState.combatTarget = "player_01";

    const player = makeCombatPlayer();
    player.combatState.combatTarget = "npc_01";

    addEntity(world, npc);
    addEntity(world, player);

    const result = executeCombatPulse(world, config);
    // NPC 精力耗尽，不应产出攻击 delta
    expect(result.deltas).toHaveLength(0);
    // NPC 应被力竭虚弱
    expect(npc.combatState.isIncapacitated).toBe(true);
    expect(npc.combatState.hp).toBe(0);
    expect(npc.combatState.combatTarget).toBeNull();
  });

  it("精力充足的 NPC 正常攻击", () => {
    const world = createWorld();
    world.tick = 3;
    addRoom(world, createRoom("room_01", "测试", "test", ""));

    const npc = makeCombatNPC({
      id: "npc_01",
      traits: [
        { name: "combat_skill", value: 20 },
        { name: "strength", value: 10 },
      ],
    });
    npc.needs = [{ type: "rest", value: 50, baseUrgency: 0, decayRate: 0 }];
    npc.combatState.combatTarget = "player_01";
    npc.combatState.threatTable = { player_01: 10 };

    const player = makeCombatPlayer();
    player.combatState.combatTarget = "npc_01";

    addEntity(world, npc);
    addEntity(world, player);

    const result = executeCombatPulse(world, config);
    expect(result.deltas.length).toBeGreaterThan(0);
  });
});

// ── resolveCombatConsequences ──

describe("resolveCombatConsequences", () => {
  it("HP ≤ 0 → 虚弱", () => {
    const world = createWorld();
    addRoom(world, createRoom("room_01", "测试", "test", ""));

    const npc = makeCombatNPC();
    npc.combatState.hp = 0;
    npc.combatState.maxHp = 50;
    addEntity(world, npc);

    // 模拟 HP 变化（rCC 检查的是 applyDelta 之后的 hp，此处直接设为 0）
    const result = resolveCombatConsequences(
      world,
      [{ targetId: "npc_01", delta: -10 }],
      [],
      config,
    );

    expect(npc.combatState.isIncapacitated).toBe(true);
    expect(result.events.length).toBeGreaterThanOrEqual(1);
  });

  it("rest ≤ 0 且战斗中 → 力竭虚弱", () => {
    const world = createWorld();
    addRoom(world, createRoom("room_01", "测试", "test", ""));

    const npc = makeCombatNPC();
    npc.needs = [{ type: "rest", value: 0, baseUrgency: 0, decayRate: 0 }];
    npc.combatState.combatTarget = "player_01";
    addEntity(world, npc);

    const result = resolveCombatConsequences(
      world,
      [],
      [{ targetId: "npc_01", needType: "rest", delta: -1 }],
      config,
    );

    expect(npc.combatState.isIncapacitated).toBe(true);
    expect(npc.combatState.hp).toBe(0);
    expect(npc.combatState.combatTarget).toBeNull();
    expect(result.events.length).toBeGreaterThanOrEqual(1);
  });

  it("已虚弱者不重复处理", () => {
    const world = createWorld();
    addRoom(world, createRoom("room_01", "测试", "test", ""));

    const npc = makeCombatNPC();
    npc.combatState.isIncapacitated = true;
    npc.combatState.hp = 0;
    addEntity(world, npc);

    const result = resolveCombatConsequences(
      world,
      [{ targetId: "npc_01", delta: -10 }],
      [],
      config,
    );

    // 已虚弱，不产出事件
    expect(result.events).toHaveLength(0);
  });

  it("NPC 虚弱后 HP ≤ 0 → 永久死亡", () => {
    const world = createWorld();
    const room = createRoom("room_01", "测试", "test", "");
    addRoom(world, room);

    const npc = makeCombatNPC();
    npc.combatState.hp = 0;
    npc.combatState.maxHp = 50;
    addEntity(world, npc);
    room.entities.add("npc_01");

    const result = resolveCombatConsequences(
      world,
      [{ targetId: "npc_01", delta: -10 }],
      [],
      config,
    );

    // NPC 应被移除
    expect(world.entities.has("npc_01")).toBe(false);
    expect(room.entities.has("npc_01")).toBe(false);
  });
});

// ── NPC AI ──

describe("NPC AI", () => {
  it("selectCombatTarget: 选最高仇恨目标", () => {
    const world = createWorld();
    const room = createRoom("room_01", "测试", "test", "");
    addRoom(world, room);

    const npc = makeCombatNPC();
    const player1 = createPlayer("p1", "A", "room_01");
    const player2 = createPlayer("p2", "B", "room_01");
    npc.combatState.threatTable = { p1: 5, p2: 20 };

    addEntity(world, npc);
    addEntity(world, player1);
    addEntity(world, player2);

    const target = selectCombatTarget(npc, world);
    expect(target).toBe("p2");
  });

  it("selectCombatTarget: 跳过虚弱目标", () => {
    const world = createWorld();
    const room = createRoom("room_01", "测试", "test", "");
    addRoom(world, room);

    const npc = makeCombatNPC();
    const player1 = createPlayer("p1", "A", "room_01");
    player1.combatState.isIncapacitated = true;
    const player2 = createPlayer("p2", "B", "room_01");
    npc.combatState.threatTable = { p1: 50, p2: 5 };

    addEntity(world, npc);
    addEntity(world, player1);
    addEntity(world, player2);

    const target = selectCombatTarget(npc, world);
    expect(target).toBe("p2");
  });

  it("selectCombatTarget: 无仇恨返回 null", () => {
    const world = createWorld();
    const npc = makeCombatNPC();
    npc.combatState.threatTable = {};
    const target = selectCombatTarget(npc, world);
    expect(target).toBeNull();
  });

  it("shouldFlee: 低血量 + 胆小 NPC 应逃跑", () => {
    const npc = makeCombatNPC({ traits: [{ name: "courage", value: -20 }] });
    npc.combatState.hp = 10; // 20% of maxHp(50)
    npc.combatState.maxHp = 50;

    let fleeCount = 0;
    for (let i = 0; i < 100; i++) {
      if (shouldFlee(npc, config)) fleeCount++;
    }
    expect(fleeCount).toBeGreaterThan(0);
  });

  it("shouldFlee: 高血量时不逃跑", () => {
    const npc = makeCombatNPC({ traits: [{ name: "courage", value: -20 }] });
    npc.combatState.hp = 40;
    npc.combatState.maxHp = 50;

    const result = shouldFlee(npc, config);
    expect(result).toBe(false);
  });

  it("shouldFlee: 勇敢 NPC 不逃跑", () => {
    const npc = makeCombatNPC({ traits: [{ name: "courage", value: 50 }] });
    npc.combatState.hp = 5;
    npc.combatState.maxHp = 50;

    const result = shouldFlee(npc, config);
    expect(result).toBe(false);
  });
});

// ── 虚弱/死亡 ──

describe("虚弱/死亡", () => {
  it("checkIncapacitation: hp ≤ 0 且未虚弱", () => {
    const npc = makeCombatNPC();
    npc.combatState.hp = 0;
    expect(checkIncapacitation(npc)).toBe(true);
  });

  it("checkIncapacitation: hp > 0 不虚弱", () => {
    const npc = makeCombatNPC();
    npc.combatState.hp = 10;
    expect(checkIncapacitation(npc)).toBe(false);
  });

  it("checkIncapacitation: 已虚弱不再触发", () => {
    const npc = makeCombatNPC();
    npc.combatState.hp = 0;
    npc.combatState.isIncapacitated = true;
    expect(checkIncapacitation(npc)).toBe(false);
  });

  it("applyIncapacitation 设置虚弱状态", () => {
    const world = createWorld();
    addRoom(world, createRoom("room_01", "测试", "test", ""));
    const npc = makeCombatNPC();
    npc.combatState.combatTarget = "player_01";
    addEntity(world, npc);

    applyIncapacitation(world, "npc_01", config);
    expect(npc.combatState.isIncapacitated).toBe(true);
    expect(npc.combatState.combatTarget).toBeNull();
    expect(npc.combatState.incapacitatedUntil).toBe(world.tick + config.incapacitatedDuration);
  });

  it("handleNpcDeath: 虚弱且 hp≤0 的 NPC 被永久移除", () => {
    const world = createWorld();
    addRoom(world, createRoom("room_01", "测试", "test", ""));
    const npc = makeCombatNPC();
    npc.combatState.isIncapacitated = true;
    npc.combatState.hp = 0;
    addEntity(world, npc);

    const dead = handleNpcDeath(world, "npc_01");
    expect(dead).toBe(true);
    expect(world.entities.has("npc_01")).toBe(false);
  });

  it("handleNpcDeath: 非虚弱 NPC 不死亡", () => {
    const world = createWorld();
    addRoom(world, createRoom("room_01", "测试", "test", ""));
    const npc = makeCombatNPC();
    npc.combatState.isIncapacitated = false;
    npc.combatState.hp = 0;
    addEntity(world, npc);

    const dead = handleNpcDeath(world, "npc_01");
    expect(dead).toBe(false);
  });

  it("checkRecovery: 到期可恢复", () => {
    const npc = makeCombatNPC();
    npc.combatState.isIncapacitated = true;
    npc.combatState.incapacitatedUntil = 100;
    expect(checkRecovery(npc, 100)).toBe(true);
    expect(checkRecovery(npc, 101)).toBe(true);
    expect(checkRecovery(npc, 99)).toBe(false);
  });

  it("applyRecovery: 恢复 30% hp", () => {
    const npc = makeCombatNPC();
    npc.combatState.maxHp = 100;
    npc.combatState.hp = 0;
    npc.combatState.isIncapacitated = true;
    npc.combatState.combatTarget = "someone";
    npc.combatState.threatTable = { someone: 10 };

    applyRecovery(npc);
    expect(npc.combatState.isIncapacitated).toBe(false);
    expect(npc.combatState.hp).toBe(30);
    expect(npc.combatState.combatTarget).toBeNull();
    expect(npc.combatState.threatTable).toEqual({});
  });
});

// ── shouldPulse ──

describe("shouldPulse", () => {
  it("tick % pulseInterval === 0 时触发", () => {
    const world = createWorld();
    world.tick = 3;
    expect(shouldPulse(world, config)).toBe(true);
    world.tick = 6;
    expect(shouldPulse(world, config)).toBe(true);
  });

  it("tick % pulseInterval !== 0 时不触发", () => {
    const world = createWorld();
    world.tick = 1;
    expect(shouldPulse(world, config)).toBe(false);
    world.tick = 2;
    expect(shouldPulse(world, config)).toBe(false);
  });

  it("tick = 0 不触发", () => {
    const world = createWorld();
    world.tick = 0;
    expect(shouldPulse(world, config)).toBe(false);
  });
});
